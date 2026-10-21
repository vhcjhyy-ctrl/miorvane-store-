import { describe, expect, it } from "vitest";
import { filterRemotiveJobs } from "./remotive";

const fixture = {
  id: 123,
  title: "Senior Python Engineer",
  company_name: "Example Systems",
  url: "https://remotive.com/remote-jobs/product/senior-python-engineer-123",
  category: "Software Development",
  description: "<p>Build APIs with Python, SQL, and Docker.</p><script>alert('not a job skill');</script>",
  candidate_required_location: "Worldwide",
  salary: "$80,000 - $100,000",
  publication_date: "2026-01-15T10:00:00",
  job_type: "full_time"
};

describe("Remotive job normalization", () => {
  it("converts source fields and strips HTML before rendering", () => {
    const [job] = filterRemotiveJobs([fixture], "python", 10);
    expect(job.source).toBe("Remotive");
    expect(job.title).toBe("Senior Python Engineer");
    expect(job.description).not.toContain("<script");
    expect(job.description).not.toContain("alert");
    expect(job.skills).toEqual(expect.arrayContaining(["Python", "SQL", "Docker"]));
    expect(job.salary).toBe("$80,000 - $100,000");
    expect(job.url).toBe(fixture.url);
    expect(job.level).toBe("senior");
  });

  it("rejects non-Remotive URLs instead of linking to arbitrary sites", () => {
    expect(filterRemotiveJobs([{ ...fixture, url: "https://attacker.example/remote-jobs/fake" }], "", 10)).toHaveLength(0);
    expect(filterRemotiveJobs([{ ...fixture, url: "javascript:alert(1)" }], "", 10)).toHaveLength(0);
  });

  it("filters every search token across listing fields, case-insensitively", () => {
    expect(filterRemotiveJobs([fixture], "PYTHON worldwide", 10)).toHaveLength(1);
    expect(filterRemotiveJobs([fixture], "python nowhere", 10)).toHaveLength(0);
  });

  it("does not invent a seniority level when the title does not name one", () => {
    const [job] = filterRemotiveJobs([{ ...fixture, title: "Software Engineer" }], "", 10);
    expect(job.level).toBeUndefined();
  });

  it("bounds result counts to at most fifty", () => {
    const many = Array.from({ length: 70 }, (_, index) => ({ ...fixture, id: index + 1 }));
    expect(filterRemotiveJobs(many, "", 100)).toHaveLength(50);
  });
});
