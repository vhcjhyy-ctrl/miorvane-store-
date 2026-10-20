import { describe, expect, it } from "vitest";
import {
  extractResumeText,
  MAX_RESUME_FILE_SIZE,
  normalizeResumeText,
  prepareResumeText,
  validateResumeFile,
  type ResumeFileLike
} from "./cv-parser";

function textFile(name: string, text: string, declaredSize = new TextEncoder().encode(text).byteLength): ResumeFileLike {
  const data = new TextEncoder().encode(text);
  return {
    name,
    size: declaredSize,
    text: async () => text,
    arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  };
}

describe("local CV text extraction helpers", () => {
  it("accepts only supported extensions and enforces the 10 MB limit", () => {
    expect(validateResumeFile("resume.PDF", 1024)).toBe("pdf");
    expect(validateResumeFile("resume.docx", 1024)).toBe("docx");
    expect(validateResumeFile("resume.txt", 1024)).toBe("txt");
    expect(() => validateResumeFile("resume.exe", 1024)).toThrow("Unsupported");
    expect(() => validateResumeFile("resume.pdf", MAX_RESUME_FILE_SIZE + 1)).toThrow("10 MB");
    expect(() => validateResumeFile("resume.txt", 0)).toThrow("empty");
  });

  it("normalizes whitespace without merging lines or changing ordinary text", () => {
    expect(normalizeResumeText("  Ahmed\\r\\n  Python   Developer \\n\\n\\n SQL  "))
      .toBe("Ahmed\\nPython Developer\\n\\nSQL");
  });

  it("caps text to a caller-provided safe length", () => {
    expect(prepareResumeText("0123456789", 5)).toEqual({ text: "01234", truncated: true });
    expect(prepareResumeText("short", 10)).toEqual({ text: "short", truncated: false });
  });

  it("reads TXT files locally and reports a useful empty-text warning", async () => {
    const result = await extractResumeText(textFile("resume.txt", "  Python  \\nSQL\\n"));
    expect(result.fileType).toBe("txt");
    expect(result.text).toBe("Python\\nSQL");
    expect(result.characterCount).toBe(result.text.length);
    expect(result.warning).toBeUndefined();

    const empty = await extractResumeText(textFile("blank.txt", "  \\n\\n "));
    expect(empty.text).toBe("");
    expect(empty.warning).toContain("No selectable text");
  });

  it("rejects oversized files before attempting to read their contents", async () => {
    let readAttempted = false;
    const file: ResumeFileLike = {
      name: "resume.txt",
      size: MAX_RESUME_FILE_SIZE + 1,
      text: async () => { readAttempted = true; return ""; },
      arrayBuffer: async () => { readAttempted = true; return new ArrayBuffer(0); }
    };
    await expect(extractResumeText(file)).rejects.toThrow("10 MB");
    expect(readAttempted).toBe(false);
  });
});
