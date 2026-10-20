export const MAX_RESUME_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_RESUME_TEXT_CHARS = 50_000;
export const MAX_PDF_PAGES_TO_READ = 30;

export type ResumeFileType = "pdf" | "docx" | "txt";

export interface ResumeFileLike {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

export interface ResumeExtraction {
  fileType: ResumeFileType;
  text: string;
  characterCount: number;
  truncated: boolean;
  pageCount?: number;
  warning?: string;
}

export function validateResumeFile(fileName: string, fileSize: number): ResumeFileType {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error("The selected CV file is empty or has an invalid size.");
  }
  if (fileSize > MAX_RESUME_FILE_SIZE) {
    throw new Error("The CV exceeds the 10 MB limit.");
  }

  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "pdf" || extension === "docx" || extension === "txt") return extension;
  throw new Error("Unsupported CV file type. Choose PDF, DOCX, or TXT.");
}

export function normalizeResumeText(rawText: string): string {
  return rawText
    .replace(/\u0000/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function prepareResumeText(rawText: string, maxCharacters = MAX_RESUME_TEXT_CHARS): {
  text: string;
  truncated: boolean;
} {
  const normalized = normalizeResumeText(rawText);
  const safeLimit = Math.max(0, Math.floor(maxCharacters));
  return {
    text: normalized.slice(0, safeLimit),
    truncated: normalized.length > safeLimit
  };
}

function makeResult(
  fileType: ResumeFileType,
  rawText: string,
  options: { pageCount?: number; extraWarnings?: string[] } = {}
): ResumeExtraction {
  const prepared = prepareResumeText(rawText);
  const warnings = [...(options.extraWarnings ?? [])];
  if (prepared.truncated) warnings.push("Text was capped at 50,000 characters to keep processing manageable.");
  if (!prepared.text) warnings.push("No selectable text was found. Scanned/image-only PDFs need OCR, which is not included.");
  return {
    fileType,
    text: prepared.text,
    characterCount: prepared.text.length,
    truncated: prepared.truncated || warnings.some(item => item.includes("first 30 pages")),
    ...(options.pageCount === undefined ? {} : { pageCount: options.pageCount }),
    ...(warnings.length ? { warning: warnings.join(" ") } : {})
  };
}

/**
 * Extracts text in the user's browser. File bytes are never sent to an API and this
 * function does not persist the file or extracted text.
 */
export async function extractResumeText(file: ResumeFileLike): Promise<ResumeExtraction> {
  const fileType = validateResumeFile(file.name, file.size);

  if (fileType === "txt") {
    return makeResult(fileType, await file.text());
  }

  if (fileType === "docx") {
    // Mammoth's raw-text API avoids rendering untrusted document HTML in the page.
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return makeResult(fileType, result.value);
  }

  const pdfjs = await import("pdfjs-dist/webpack.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false
  });
  const document = await loadingTask.promise;

  try {
    const pageCount = document.numPages;
    const pagesToRead = Math.min(pageCount, MAX_PDF_PAGES_TO_READ);
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map(item => "str" in item && typeof item.str === "string" ? item.str : "")
        .filter(Boolean)
        .join(" ");
      pageTexts.push(pageText);
    }

    const extraWarnings = pageCount > MAX_PDF_PAGES_TO_READ
      ? ["Only the first 30 pages were read."]
      : [];
    return makeResult(fileType, pageTexts.join("\n\n"), { pageCount, extraWarnings });
  } finally {
    await document.destroy();
  }
}
