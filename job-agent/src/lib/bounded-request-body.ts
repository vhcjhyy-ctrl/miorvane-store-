export interface BoundedBodyResult {
  body: string;
  tooLarge: boolean;
}

/**
 * Read a request stream with a hard byte ceiling instead of calling request.text()
 * before validating the limit. This helps prevent oversized body allocation.
 */
export async function readBoundedRequestBody(request: Request, maxBytes: number): Promise<BoundedBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer");
  }

  const reader = request.body?.getReader();
  if (!reader) return { body: "", tooLarge: false };

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let exceededLimit = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        exceededLimit = true;
        try {
          await reader.cancel("Request body exceeds configured byte limit");
        } catch {
          // Cancellation is best effort; do not continue buffering the body.
        }
        break;
      }
      chunks.push(value);
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Preserve the original read error.
    }
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A stream that already errored or was cancelled may not release normally.
    }
  }

  if (exceededLimit) return { body: "", tooLarge: true };

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    body: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    tooLarge: false
  };
}
