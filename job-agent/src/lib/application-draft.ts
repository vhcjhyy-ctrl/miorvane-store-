export interface CoverLetterDraftInput {
  candidateName?: string;
  targetRoles: string[];
  skills: string[];
  jobSkills?: string[];
  jobTitle: string;
  company: string;
}

function cleanLine(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Creates an editable, deterministic cover-letter template using only candidate-entered
 * profile fields and the job title/company. It deliberately does not infer experience,
 * qualifications, employers, or achievements from the listing.
 */
export function buildCoverLetterDraft(input: CoverLetterDraftInput): string {
  const name = cleanLine(input.candidateName, 80) || "[Your name]";
  const title = cleanLine(input.jobTitle, 160) || "the advertised position";
  const company = cleanLine(input.company, 120) || "your team";
  const targetRoles = [...new Set(input.targetRoles.map(role => cleanLine(role, 80)).filter(Boolean))].slice(0, 3);
  const skills = [...new Set(input.skills.map(skill => cleanLine(skill, 60)).filter(Boolean))].slice(0, 6);
  const jobSkillKeys = new Set((input.jobSkills ?? []).map(skill => cleanLine(skill, 60).toLowerCase()).filter(Boolean));
  const matchingSkills = skills.filter(skill => jobSkillKeys.has(skill.toLowerCase()));

  const paragraphs = [
    "Dear Hiring Team at " + company + ",",
    "I am writing to express my interest in the " + title + " position at " + company + "."
  ];

  if (targetRoles.length > 0) {
    paragraphs.push("I am exploring opportunities focused on " + targetRoles.join(", ") + ", and this role is aligned with those interests.");
  }

  if (skills.length > 0) {
    paragraphs.push("The skills I have listed in my profile include " + skills.join(", ") + ".");
  } else {
    paragraphs.push("I would welcome the opportunity to discuss my current skill set and how it may align with the position.");
  }

  if (matchingSkills.length > 0) {
    paragraphs.push("Skills from my profile that also appear in the listing include " + matchingSkills.join(", ") + ".");
  }

  paragraphs.push(
    "I would welcome the chance to learn more about your team's priorities and discuss whether my current skills are a fit.",
    "Thank you for your time and consideration.",
    "Kind regards,\n" + name
  );

  return paragraphs.join("\n\n");
}
