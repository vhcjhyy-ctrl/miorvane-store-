"use client";

import { useMemo, useState } from "react";
import { explainJobMatch, type CandidateProfile, type Job } from "@/lib/scoring";

const sampleJobs: Job[] = [
  { id: "demo-1", title: "Junior Python Developer", company: "Northstar Systems", location: "Remote — Worldwide", remote: true, skills: ["Python", "SQL", "Git"], level: "entry", description: "Support backend services, write Python code, and work with relational databases.", url: "https://example.com/jobs/demo-1" },
  { id: "demo-2", title: "Frontend Developer", company: "Bright Pixel", location: "Remote — EMEA", remote: true, skills: ["React", "TypeScript", "CSS"], level: "mid", description: "Build accessible web interfaces with React and TypeScript.", url: "https://example.com/jobs/demo-2" },
  { id: "demo-3", title: "IT Support Associate", company: "Example Global", location: "Hybrid — Cairo", remote: false, skills: ["Troubleshooting", "Networking", "Linux"], level: "entry", description: "Provide first-line technical support and troubleshoot workstation issues.", url: "https://example.com/jobs/demo-3" }
];

export default function HomePage() {
  const [cvName, setCvName] = useState("");
  const [skillsText, setSkillsText] = useState("Python, SQL, Git");
  const [rolesText, setRolesText] = useState("Junior Python Developer, Python Developer");
  const [level, setLevel] = useState<CandidateProfile["level"]>("entry");
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [minimumScore, setMinimumScore] = useState(60);
  const [notice, setNotice] = useState("");

  function saveProfileSettings() {
    try {
      const settings = { schemaVersion: 1, skillsText, rolesText, level, remoteOnly, minimumScore };
      window.localStorage.setItem("job-agent.profile.v1", JSON.stringify(settings));
      setNotice("Profile preferences saved in this browser. Your CV file was not uploaded or saved.");
    } catch {
      setNotice("The browser could not save these settings. Check local storage availability.");
    }
  }

  function loadProfileSettings() {
    try {
      const raw = window.localStorage.getItem("job-agent.profile.v1");
      if (!raw) {
        setNotice("No saved profile was found in this browser yet.");
        return;
      }
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object") throw new Error("Invalid settings");
      const settings = value as Record<string, unknown>;
      const validLevel = settings.level === "entry" || settings.level === "mid" || settings.level === "senior";
      const validScore = typeof settings.minimumScore === "number"
        && settings.minimumScore >= 30
        && settings.minimumScore <= 95
        && settings.minimumScore % 5 === 0;
      if (
        settings.schemaVersion !== 1
        || typeof settings.skillsText !== "string"
        || typeof settings.rolesText !== "string"
        || !validLevel
        || typeof settings.remoteOnly !== "boolean"
        || !validScore
      ) {
        throw new Error("Invalid settings");
      }
      setSkillsText(settings.skillsText);
      setRolesText(settings.rolesText);
      setLevel(settings.level as CandidateProfile["level"]);
      setRemoteOnly(settings.remoteOnly);
      setMinimumScore(settings.minimumScore as number);
      setNotice("Saved profile preferences loaded from this browser. Your CV file is not stored.");
    } catch {
      setNotice("Saved settings could not be read because they are invalid or browser storage is unavailable.");
    }
  }

  const candidate = useMemo<CandidateProfile>(() => ({
    skills: skillsText.split(",").map(s => s.trim()).filter(Boolean),
    targetRoles: rolesText.split(",").map(s => s.trim()).filter(Boolean),
    level, remoteOnly
  }), [skillsText, rolesText, level, remoteOnly]);

  const matches = useMemo(() => sampleJobs
    .filter(job => !candidate.remoteOnly || job.remote)
    .map(job => ({ job, explanation: explainJobMatch(candidate, job) }))
    .filter(item => item.explanation.score >= minimumScore)
    .sort((a, b) => b.explanation.score - a.explanation.score), [candidate, minimumScore]);

  function selectCv(file?: File) {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (![".pdf", ".docx", ".txt"].includes(ext)) {
      setNotice("Unsupported file type. Choose PDF, DOCX, or TXT."); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotice("File exceeds the 10 MB limit."); return;
    }
    setCvName(file.name);
    setNotice("Selected locally only. The file has not been uploaded or parsed.");
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">J</span> Job Agent</a><span className="phase-pill">PHASE 1 · LOCAL DEMO</span></header>
    <section className="hero"><div><p className="eyebrow">YOUR PERSONAL JOB WORKSPACE</p><h1>Find work that fits.<br/><span>Apply with intent.</span></h1><p className="hero-copy">A foundation for global job discovery, explainable matching, tailored applications, and secure Gmail automation.</p></div><div className="hero-stat"><span className="stat-number">{String(matches.length).padStart(2, "0")}</span><span className="stat-label">sample matches</span></div></section>
    <div className="notice"><strong>Demo mode:</strong> listings are examples, no live job search is connected, and nothing is emailed.</div>
    {notice && <p className="inline-notice" role="status">{notice}</p>}
    <div className="layout">
      <aside className="panel profile-panel">
        <div className="section-heading"><div><p className="eyebrow">01 / CANDIDATE</p><h2>Your profile</h2></div><span className="step-icon">CV</span></div>
        <label className="upload-box"><input type="file" accept=".pdf,.docx,.txt" onChange={e => selectCv(e.target.files?.[0])}/><span className="upload-icon">↑</span><strong>{cvName || "Choose your CV"}</strong><small>PDF, DOCX, or TXT · max 10 MB</small><small className="muted">Local selection only in this phase</small></label>
        <label className="field-label" htmlFor="roles">Target roles</label><input id="roles" value={rolesText} onChange={e => setRolesText(e.target.value)} placeholder="Python Developer, QA Engineer"/>
        <label className="field-label" htmlFor="skills">Skills (comma-separated)</label><textarea id="skills" rows={3} value={skillsText} onChange={e => setSkillsText(e.target.value)} placeholder="Python, SQL, Git"/>
        <label className="field-label" htmlFor="level">Experience level</label><select id="level" value={level} onChange={e => setLevel(e.target.value as CandidateProfile["level"])}><option value="entry">Entry level</option><option value="mid">Mid level</option><option value="senior">Senior</option></select>
        <label className="toggle-row"><span><strong>Remote positions only</strong><small>Exclude non-remote roles</small></span><input type="checkbox" checked={remoteOnly} onChange={e => setRemoteOnly(e.target.checked)}/></label>
        <div className="range-heading"><label htmlFor="score">Minimum match score</label><strong>{minimumScore}%</strong></div><input id="score" className="range" type="range" min={30} max={95} step={5} value={minimumScore} onChange={e => setMinimumScore(Number(e.target.value))}/>
        <button className="primary-button" onClick={saveProfileSettings}>Save profile settings</button><button className="secondary-button" onClick={loadProfileSettings}>Load saved profile</button>
      </aside>
      <section className="results"><div className="section-heading results-heading"><div><p className="eyebrow">02 / MATCHING</p><h2>Job opportunities</h2></div><span className="count-pill">{matches.length} matches</span></div><p className="subheading">Sample listings scored against your current profile.</p>
        {matches.length === 0 && <div className="empty-state">No sample jobs meet this score and preference combination. Lower the threshold or change your profile.</div>}
        {matches.map(({job, explanation}) => <article className="job-card" key={job.id}><div className="job-card-top"><div className="company-avatar">{job.company.slice(0,1)}</div><div className="job-title-group"><h3>{job.title}</h3><p>{job.company} · {job.location}</p></div><div className="score"><strong>{explanation.score}%</strong><small>match</small></div></div><p className="job-description">{job.description}</p><div className="chips">{job.skills.map(skill => <span className="chip" key={skill}>{skill}</span>)}</div>
          <details className="match-details"><summary>Why this match?</summary><div className="match-reasons"><p><strong>Role:</strong> {explanation.roleMatch ? "Your target role aligns with this title." : "This title does not directly match your target roles."}</p><p><strong>Experience:</strong> {explanation.levelMatch ? "Exact experience-level match." : "Experience level differs; this receives partial credit."}</p><p><strong>Matched skills:</strong> {explanation.matchedSkills.length ? explanation.matchedSkills.join(", ") : "No listed skills matched yet."}</p>{explanation.missingSkills.length > 0 && <p><strong>Skills not listed in your profile:</strong> {explanation.missingSkills.join(", ")}</p>}</div></details><div className="job-card-bottom"><span className={job.remote ? "remote-tag" : "onsite-tag"}>{job.remote ? "REMOTE" : "ON-SITE / HYBRID"}</span><a href={job.url} target="_blank" rel="noreferrer">Example listing ↗</a></div></article>)}
        <div className="next-step"><span className="next-step-icon">↗</span><div><strong>Next integration: live job sources</strong><p>Replace demo data with authorized APIs and feeds, then persist normalized listings in Supabase.</p></div></div>
      </section>
    </div>
    <footer><span>JOB AGENT · PRIVATE BY DESIGN</span><span>Gmail sending: not connected</span></footer>
  </main>;
}
