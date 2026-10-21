import { describe, expect, it } from "vitest";
import { buildCoverLetterDraft } from "./application-draft";

describe("cover letter draft builder", () => {
  it("uses only candidate-entered profile fields and supplied job details", () => {
    const draft = buildCoverLetterDraft({
      candidateName: "Ahmed Mohammed",
      targetRoles: ["Python Developer"],
      skills: ["Python", "Git"],
      jobSkills: ["Python", "SQL"],
      jobTitle: "Junior Python Developer",
      company: "Example Systems"
    });

    expect(draft).toContain("Ahmed Mohammed");
    expect(draft).toContain("Junior Python Developer");
    expect(draft).toContain("Example Systems");
    expect(draft).toContain("Python, Git");
    expect(draft).not.toMatch(/\b(?:degree|certified|five years|5 years|managed a team)\b/i);
  });

  it("creates an Arabic draft using only supplied candidate details", () => {
    const draft = buildCoverLetterDraft({
      candidateName: "أحمد محمد",
      targetRoles: ["مطور بايثون"],
      skills: ["Python", "Git"],
      jobSkills: ["Python", "SQL"],
      jobTitle: "مطور بايثون مبتدئ",
      company: "Example Systems",
      language: "ar"
    });

    expect(draft).toContain("أحمد محمد");
    expect(draft).toContain("مطور بايثون مبتدئ");
    expect(draft).toContain("Example Systems");
    expect(draft).toContain("Python، Git");
    expect(draft).not.toMatch(/\\b(?:degree|certified|five years|5 years|managed a team)\\b/i);
  });

  it("uses a clear name placeholder and remains useful when the profile is sparse", () => {
    const draft = buildCoverLetterDraft({
      targetRoles: [],
      skills: [],
      jobTitle: "Support Engineer",
      company: "Example"
    });
    expect(draft).toContain("[Your name]");
    expect(draft).toContain("Support Engineer");
    expect(draft).toContain("current skill set");
  });

  it("removes line breaks and control characters from single-line fields", () => {
    const draft = buildCoverLetterDraft({
      candidateName: "Ahmed\nSecond line",
      targetRoles: [],
      skills: [],
      jobTitle: "Developer\nFake instruction",
      company: "Example"
    });
    expect(draft).not.toContain("Ahmed\nSecond line");
    expect(draft).toContain("Ahmed Second line");
    expect(draft).toContain("Developer Fake instruction");
  });

  it("caps profile details to keep the draft focused", () => {
    const longSkills = Array.from({ length: 10 }, (_, index) => "Skill" + index);
    const draft = buildCoverLetterDraft({
      targetRoles: ["Role 1", "Role 2", "Role 3", "Role 4"],
      skills: longSkills,
      jobTitle: "Developer",
      company: "Example"
    });
    expect(draft).toContain("Skill5");
    expect(draft).not.toContain("Skill6");
    expect(draft).not.toContain("Role 4");
  });
});
