import { NextResponse } from "next/server";
import { readBoundedRequestBody } from "../../../../lib/bounded-request-body";
import {
  AI_COVER_LETTER_INSTRUCTIONS,
  buildAiCoverLetterInput,
  extractResponsesText,
  parseAiCoverLetterRequest
} from "../../../../lib/ai-cover-letter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 20_000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 4;

// Best-effort per-process guard only. This is not a substitute for authentication
// and a shared rate limiter before enabling the route on a public deployment.
const requestCounts = new Map<string, { windowStartedAt: number; count: number }>();

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function clientKey(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (realIp || forwarded || "unknown").slice(0, 100);
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  if (requestCounts.size > 1000) {
    for (const [storedKey, value] of requestCounts) {
      if (now - value.windowStartedAt >= WINDOW_MS) requestCounts.delete(storedKey);
    }
  }

  const current = requestCounts.get(key);
  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    requestCounts.set(key, { windowStartedAt: now, count: 1 });
    return false;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return true;
  current.count += 1;
  return false;
}

export async function POST(request: Request) {
  if (process.env.AI_COVER_LETTER_ENABLED !== "true" || !process.env.OPENAI_API_KEY) {
    return jsonError(
      "AI cover-letter generation is not enabled by the app owner. No request was sent to the AI provider.",
      503
    );
  }
  const configuredModel = process.env.OPENAI_MODEL?.trim();
  if (!configuredModel) {
    return jsonError(
      "The app owner must configure OPENAI_MODEL before AI cover-letter generation can be used. No request was sent.",
      503
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonError("Request body is too large.", 413);
  }

  let rawBody: string;
  try {
    const boundedBody = await readBoundedRequestBody(request, MAX_REQUEST_BYTES);
    if (boundedBody.tooLarge) return jsonError("Request body is too large.", 413);
    rawBody = boundedBody.body;
  } catch {
    return jsonError("Could not read a valid UTF-8 request body.", 400);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const input = parseAiCoverLetterRequest(payload);
  if (!input) {
    return jsonError("Valid draft fields and explicit AI-data consent are required.", 400);
  }

  if (isRateLimited(clientKey(request))) {
    return jsonError("AI draft limit reached for this browser/network. Try again later.", 429);
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: configuredModel,
        instructions: AI_COVER_LETTER_INSTRUCTIONS,
        input: buildAiCoverLetterInput(input),
        max_output_tokens: 1200,
        store: false
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!upstream.ok) {
      return jsonError("The AI provider could not generate this draft. Check the server-side model/key configuration and provider quota.", 502);
    }

    const responsePayload: unknown = await upstream.json();
    const draft = extractResponsesText(responsePayload).slice(0, 6000);
    if (!draft) return jsonError("The AI provider returned no cover-letter text. Try again or use the local template.", 502);

    return NextResponse.json({
      draft,
      model: configuredModel,
      notice: "AI-generated text may be inaccurate; review it before use. No application or email was sent."
    });
  } catch {
    return jsonError("The AI provider did not respond in time. Use the local template or retry later.", 502);
  }
}
