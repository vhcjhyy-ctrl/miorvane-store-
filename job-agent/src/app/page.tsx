"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { explainJobMatch, type CandidateProfile, type Job } from "@/lib/scoring";
import { buildCoverLetterDraft } from "@/lib/application-draft";
import { readShortlist, toggleShortlist } from "@/lib/shortlist";
import { readApplicationTracker, updateApplicationTracker, type ApplicationStatus, type TrackedApplication } from "@/lib/application-tracker";
import { extractResumeText } from "@/lib/cv-parser";
import { extractKnownSkills } from "@/lib/remotive";

const sampleJobs: Job[] = [
  { id: "demo-1", title: "Junior Python Developer", company: "Northstar Systems", location: "Remote — Worldwide", remote: true, skills: ["Python", "SQL", "Git"], level: "entry", description: "Support backend services, write Python code, and work with relational databases.", url: "https://example.com/jobs/demo-1" },
  { id: "demo-2", title: "Frontend Developer", company: "Bright Pixel", location: "Remote — EMEA", remote: true, skills: ["React", "TypeScript", "CSS"], level: "mid", description: "Build accessible web interfaces with React and TypeScript.", url: "https://example.com/jobs/demo-2" },
  { id: "demo-3", title: "IT Support Associate", company: "Example Global", location: "Hybrid — Cairo", remote: false, skills: ["Troubleshooting", "Networking", "Linux"], level: "entry", description: "Provide first-line technical support and troubleshoot workstation issues.", url: "https://example.com/jobs/demo-3" }
];

export default function HomePage() {
  const [cvName, setCvName] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeInfo, setResumeInfo] = useState("");
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [skillsText, setSkillsText] = useState("Python, SQL, Git");
  const [rolesText, setRolesText] = useState("Junior Python Developer, Python Developer");
  const [level, setLevel] = useState<CandidateProfile["level"]>("entry");
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [minimumScore, setMinimumScore] = useState(60);
  const [notice, setNotice] = useState("");
  const [liveQuery, setLiveQuery] = useState("Python developer");
  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const [showLiveJobs, setShowLiveJobs] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveFetchedAt, setLiveFetchedAt] = useState("");
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [showSavedJobs, setShowSavedJobs] = useState(false);
  const [trackedApplications, setTrackedApplications] = useState<TrackedApplication[]>([]);
  const [showApplications, setShowApplications] = useState(false);
  const [draftForJob, setDraftForJob] = useState<Job | null>(null);
  const [draftText, setDraftText] = useState("");

  useEffect(() => {
    try {
      setSavedJobs(readShortlist(window.localStorage.getItem("job-agent.shortlist.v1")));
      setTrackedApplications(readApplicationTracker(window.localStorage.getItem("job-agent.applications.v1")));
    } catch {
      // Storage may be disabled; individual save/load actions show user-facing errors.
    }
  }, []);

  function saveProfileSettings() {
    try {
      const settings = { schemaVersion: 2, candidateName, skillsText, rolesText, level, remoteOnly, minimumScore };
      window.localStorage.setItem("job-agent.profile.v2", JSON.stringify(settings));
      setNotice("Profile preferences saved in this browser. Your CV file was not uploaded or saved.");
    } catch {
      setNotice("The browser could not save these settings. Check local storage availability.");
    }
  }

  function loadProfileSettings() {
    try {
      const raw = window.localStorage.getItem("job-agent.profile.v2") ?? window.localStorage.getItem("job-agent.profile.v1");
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
        (settings.schemaVersion !== 1 && settings.schemaVersion !== 2)
        || typeof settings.skillsText !== "string"
        || typeof settings.rolesText !== "string"
        || !validLevel
        || typeof settings.remoteOnly !== "boolean"
        || !validScore
      ) {
        throw new Error("Invalid settings");
      }
      setCandidateName(typeof settings.candidateName === "string" ? settings.candidateName : "");
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
    level,
    remoteOnly
  }), [skillsText, rolesText, level, remoteOnly]);

  const activeJobs = showApplications ? trackedApplications.map(item => item.job) : showSavedJobs ? savedJobs : showLiveJobs ? liveJobs : sampleJobs;
  const matches = useMemo(() => activeJobs
    .filter(job => !candidate.remoteOnly || job.remote)
    .map(job => ({ job, explanation: explainJobMatch(candidate, job) }))
    .filter(item => item.explanation.score >= minimumScore)
    .sort((a, b) => b.explanation.score - a.explanation.score),
  [activeJobs, candidate, minimumScore]);

  async function handleLiveSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = liveQuery.trim().slice(0, 80);
    if (!query) {
      setLiveError("Enter a job title or keyword to search.");
      return;
    }
    setIsSearching(true);
    setLiveError("");
    try {
      const response = await fetch(`/api/jobs?q=${encodeURIComponent(query)}&limit=40`, {
        headers: { Accept: "application/json" }
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload
          && typeof payload.error === "string" ? payload.error : "Live job search is temporarily unavailable.";
        throw new Error(message);
      }
      if (!payload || typeof payload !== "object" || !("jobs" in payload) || !Array.isArray(payload.jobs)) {
        throw new Error("The job source returned an unexpected response.");
      }
      setLiveJobs(payload.jobs as Job[]);
      setShowApplications(false);
      setShowSavedJobs(false);
      setShowLiveJobs(true);
      setLiveFetchedAt(new Date().toISOString());
      setNotice("");
    } catch (error) {
      setShowLiveJobs(true);
      setLiveError(error instanceof Error ? error.message : "Could not load live jobs. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }

  async function selectCv(file?: File) {
    if (!file) return;
    setCvName(file.name);
    setResumeText("");
    setResumeInfo("");
    setIsParsingResume(true);
    setNotice("Reading the CV locally in this browser…");
    try {
      const result = await extractResumeText(file);
      setResumeText(result.text);
      setResumeInfo(
        "Extracted " + result.characterCount.toLocaleString() + " characters locally. " +
        (result.warning ? result.warning + " " : "") + "The file and extracted text are not uploaded or saved."
      );
      setNotice(result.warning
        ? "CV read in this browser; review the extraction warning before using the text."
        : "CV text extracted locally. You can review it and suggest skills for the profile.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read this CV file.";
      setResumeInfo(message);
      setNotice(message);
    } finally {
      setIsParsingResume(false);
    }
  }

  function suggestSkillsFromResume() {
    const detected = extractKnownSkills(resumeText);
    if (detected.length === 0) {
      setNotice("No skills from the current recognition list were found. Review the text and enter skills manually.");
      return;
    }
    const merged = new Map<string, string>();
    for (const skill of skillsText.split(",").map(item => item.trim()).filter(Boolean)) {
      const key = skill.toLowerCase();
      if (!merged.has(key)) merged.set(key, skill);
    }
    const beforeCount = merged.size;
    for (const skill of detected) {
      const key = skill.toLowerCase();
      if (!merged.has(key)) merged.set(key, skill);
    }
    setSkillsText(Array.from(merged.values()).join(", "));
    const added = merged.size - beforeCount;
    setNotice(added
      ? "Added " + added + " skill suggestions. Review them for accuracy before saving your profile."
      : "The recognized skills are already in your profile. Review them for accuracy.");
  }

  function clearExtractedResumeText() {
    setResumeText("");
    setResumeInfo("Extracted text cleared from page memory. The original file was not uploaded or saved.");
    setNotice("Extracted CV text cleared.");
  }

  function showDemoJobs() {
    setShowApplications(false);
    setShowSavedJobs(false);
    setShowLiveJobs(false);
    setLiveError("");
  }

  function loadSavedJobs() {
    try {
      const jobs = readShortlist(window.localStorage.getItem("job-agent.shortlist.v1"));
      setSavedJobs(jobs);
      setShowSavedJobs(true);
      setShowLiveJobs(false);
      setLiveError("");
      setNotice(jobs.length ? "Loaded " + jobs.length + " saved roles from this browser." : "No saved roles yet. Use Save role on a listing to add one.");
    } catch {
      setNotice("The browser could not access local storage. Saved roles are unavailable.");
    }
  }

  function toggleSavedJob(job: Job) {
    const wasSaved = savedJobs.some(item => item.id === job.id);
    const updated = toggleShortlist(savedJobs, job);
    setSavedJobs(updated);
    try {
      window.localStorage.setItem("job-agent.shortlist.v1", JSON.stringify(updated));
      setNotice(wasSaved ? "Role removed from your browser-local shortlist." : "Role saved in your browser-local shortlist.");
    } catch {
      setNotice("The shortlist changed for this session, but the browser could not persist it.");
    }
  }

  function loadTrackedApplications() {
    try {
      const applications = readApplicationTracker(window.localStorage.getItem("job-agent.applications.v1"));
      setTrackedApplications(applications);
      setShowApplications(true);
      setShowSavedJobs(false);
      setShowLiveJobs(false);
      setLiveError("");
      setNotice(applications.length
        ? "Loaded " + applications.length + " tracked applications from this browser."
        : "No tracked applications yet. Choose a status from a job listing to start tracking.");
    } catch {
      setNotice("The browser could not access local storage. Application tracking is unavailable.");
    }
  }

  function changeApplicationStatus(job: Job, status: string) {
    const isKnownStatus = status === "" || ["interested", "preparing", "applied", "interview", "offer", "rejected", "withdrawn"].includes(status);
    if (!isKnownStatus) {
      setNotice("Unknown application status; no changes were saved.");
      return;
    }
    const updated = updateApplicationTracker(
      trackedApplications,
      job,
      status as ApplicationStatus | "",
      new Date().toISOString()
    );
    setTrackedApplications(updated);
    try {
      window.localStorage.setItem("job-agent.applications.v1", JSON.stringify(updated));
      setNotice(status
        ? "Application status saved in this browser. No application was sent."
        : "Application tracking removed for this role.");
    } catch {
      setNotice("The status changed for this session, but the browser could not persist it.");
    }
  }

  function createCoverLetterDraft(job: Job) {
    setDraftForJob(job);
    setDraftText(buildCoverLetterDraft({
      candidateName,
      targetRoles: candidate.targetRoles,
      skills: candidate.skills,
      jobSkills: job.skills,
      jobTitle: job.title,
      company: job.company
    }));
    setNotice("A cover letter template was created locally. Review every line before using it; nothing was sent.");
  }

  async function copyCoverLetterDraft() {
    try {
      await navigator.clipboard.writeText(draftText);
      setNotice("Cover letter draft copied to your clipboard. It has not been sent.");
    } catch {
      setNotice("Clipboard access is unavailable. Select the draft text and copy it manually.");
    }
  }

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark">J</span> Job Agent</a>
      <span className="phase-pill">PHASE 5 · PRIVATE CV READING</span>
    </header>
    <section className="hero">
      <div>
        <p className="eyebrow">YOUR PERSONAL JOB WORKSPACE</p>
        <h1>Find work that fits.<br/><span>Apply with intent.</span></h1>
        <p className="hero-copy">Search public remote listings, compare them against your profile, and see why each role may fit.</p>
      </div>
      <div className="hero-stat">
        <span className="stat-number">{String(matches.length).padStart(2, "0")}</span>
        <span className="stat-label">{showApplications ? "tracked applications" : showSavedJobs ? "saved matches" : showLiveJobs ? "live matches" : "sample matches"}</span>
      </div>
    </section>

    {showApplications
      ? <div className="notice"><strong>Application tracker:</strong> statuses and role details are saved in this browser only. There is no account sync and nothing is submitted or emailed.</div>
      : showSavedJobs
        ? <div className="notice"><strong>Saved roles:</strong> these records are stored only in this browser. Nothing is uploaded or submitted.</div>
        : showLiveJobs
          ? <div className="notice"><strong>Live-source mode:</strong> listings are retrieved from Remotive and cached server-side for up to six hours. The source may delay listings by up to 24 hours. Matching is heuristic; always review the original listing.</div>
          : <div className="notice"><strong>Demo mode:</strong> sample listings are examples. Use the live search below to query the public Remotive feed. No application is submitted and no email is sent.</div>}
    {notice && <p className="inline-notice" role="status">{notice}</p>}

    <div className="layout">
      <aside className="panel profile-panel">
        <div className="section-heading">
          <div><p className="eyebrow">01 / CANDIDATE</p><h2>Your profile</h2></div>
          <span className="step-icon">CV</span>
        </div>
        <label className="upload-box">
          <input type="file" accept=".pdf,.docx,.txt" disabled={isParsingResume} onChange={e => { void selectCv(e.target.files?.[0]); }}/>
          <span className="upload-icon">↑</span>
          <strong>{cvName || "Choose your CV"}</strong>
          <small>PDF, DOCX, or TXT · max 10 MB</small>
          <small className="muted">Extracted in-browser only; never uploaded or saved</small>
        </label>
        {isParsingResume && <p className="cv-status" role="status">Extracting text locally… larger PDFs may take a little longer.</p>}
        {resumeInfo && <p className="cv-status" role="status">{resumeInfo}</p>}
        {resumeText && <section className="cv-extract-panel" aria-label="Extracted CV text">
          <div className="cv-extract-heading"><strong>Extracted CV text</strong><span>{resumeText.length.toLocaleString()} chars</span></div>
          <textarea aria-label="Extracted CV text preview" rows={7} readOnly value={resumeText.slice(0, 5000)} />
          {resumeText.length > 5000 && <small className="cv-status">Preview shows the first 5,000 characters; skill suggestions use the extracted text in page memory.</small>}
          <div className="cv-extract-actions">
            <button className="primary-button" type="button" onClick={suggestSkillsFromResume}>Suggest skills from CV</button>
            <button className="secondary-button" type="button" onClick={clearExtractedResumeText}>Clear extracted text</button>
          </div>
          <small className="cv-status">Suggestions come from a fixed skill list, are not proof of proficiency, and must be confirmed by you. Text stays in current page memory and is not saved.</small>
        </section>}
        <label className="field-label" htmlFor="candidate-name">Name for application drafts (optional)</label>
        <input id="candidate-name" value={candidateName} onChange={e => setCandidateName(e.target.value)} maxLength={80} placeholder="Your name"/>
        <label className="field-label" htmlFor="roles">Target roles</label>
        <input id="roles" value={rolesText} onChange={e => setRolesText(e.target.value)} placeholder="Python Developer, QA Engineer"/>
        <label className="field-label" htmlFor="skills">Skills (comma-separated)</label>
        <textarea id="skills" rows={3} value={skillsText} onChange={e => setSkillsText(e.target.value)} placeholder="Python, SQL, Git"/>
        <label className="field-label" htmlFor="level">Experience level</label>
        <select id="level" value={level} onChange={e => setLevel(e.target.value as CandidateProfile["level"])}>
          <option value="entry">Entry level</option><option value="mid">Mid level</option><option value="senior">Senior</option>
        </select>
        <label className="toggle-row">
          <span><strong>Remote positions only</strong><small>Exclude non-remote roles</small></span>
          <input type="checkbox" checked={remoteOnly} onChange={e => setRemoteOnly(e.target.checked)}/>
        </label>
        <div className="range-heading"><label htmlFor="score">Minimum match score</label><strong>{minimumScore}%</strong></div>
        <input id="score" className="range" type="range" min={30} max={95} step={5} value={minimumScore} onChange={e => setMinimumScore(Number(e.target.value))}/>
        <button className="primary-button" onClick={saveProfileSettings}>Save profile settings</button>
        <button className="secondary-button" onClick={loadProfileSettings}>Load saved profile</button>
      </aside>

      <section className="results">
        <div className="section-heading results-heading">
          <div><p className="eyebrow">02 / MATCHING</p><h2>Job opportunities</h2></div>
          <span className="count-pill">{matches.length} matches</span>
        </div>
        <div className="live-search-panel">
          <form className="live-search-form" onSubmit={handleLiveSearch}>
            <label htmlFor="live-query">Search public remote jobs</label>
            <div className="live-search-controls">
              <input id="live-query" value={liveQuery} onChange={e => setLiveQuery(e.target.value)} maxLength={80} placeholder="Python developer, data analyst, cybersecurity"/>
              <button className="primary-button live-submit" type="submit" disabled={isSearching}>{isSearching ? "Searching…" : "Search live jobs"}</button>
            </div>
            <p className="source-disclaimer">Source: <a href="https://remotive.com/remote-jobs/api" target="_blank" rel="noreferrer">Remotive public API</a>. Results are cached up to six hours; the source recommends no more than four upstream requests per day. Links credit and lead back to Remotive.</p>
          </form>
          <div className="source-mode-actions">
            <button className="secondary-button" type="button" onClick={loadSavedJobs}>Saved roles ({savedJobs.length})</button>
            <button className="secondary-button" type="button" onClick={loadTrackedApplications}>Application tracker ({trackedApplications.length})</button>
            <button className="secondary-button" type="button" onClick={showDemoJobs}>Show demo data</button>
          </div>
          {liveError && <p className="inline-error" role="alert">{liveError}</p>}
          {showLiveJobs && liveFetchedAt && <p className="retrieved-note">Fetched by this session: {new Date(liveFetchedAt).toLocaleString()} · source data may be cached.</p>}
        </div>
        <p className="subheading">{showApplications ? "Your tracked applications ranked against your current candidate profile." : showSavedJobs ? "Your browser-local shortlist ranked against your current candidate profile." : showLiveJobs ? "Live-source results ranked against your current candidate profile." : "Sample listings scored against your current profile."}</p>
        {matches.length === 0 && <div className="empty-state">{showApplications ? (trackedApplications.length === 0 ? "No applications being tracked yet. Open live or demo listings and select a status." : "No tracked roles meet your current score threshold. Lower the threshold or change your profile.") : showSavedJobs ? (savedJobs.length === 0 ? "No roles saved yet. Switch to live or demo listings and choose Save role." : "No saved roles meet your current score threshold. Lower the threshold or change your profile.") : showLiveJobs && isSearching ? "Searching for matching roles…" : showLiveJobs ? "No live listings meet this search and score threshold. Try another keyword or lower the threshold." : "No sample jobs meet this score and preference combination. Lower the threshold or change your profile."}</div>}
        {matches.map(({job, explanation}) => <article className="job-card" key={job.id}>
          <div className="job-card-top">
            <div className="company-avatar">{job.company.slice(0, 1) || "J"}</div>
            <div className="job-title-group"><h3>{job.title}</h3><p>{job.company} · {job.location}</p></div>
            <div className="score"><strong>{explanation.score}%</strong><small>match</small></div>
          </div>
          <p className="job-description">{job.description}</p>
          {job.salary && <p className="job-meta"><strong>Listed compensation:</strong> {job.salary}</p>}
          {job.publishedAt && <p className="job-meta"><strong>Published:</strong> {new Date(job.publishedAt).toLocaleDateString()}</p>}
          <div className="chips">{job.skills.length
            ? job.skills.map(skill => <span className="chip" key={skill}>{skill}</span>)
            : <span className="chip">No known skill tags extracted</span>}</div>
          <details className="match-details">
            <summary>Why this match?</summary>
            <div className="match-reasons">
              <p><strong>Role:</strong> {explanation.roleMatch ? "Your target role aligns with this title." : "This title does not directly match your target roles."}</p>
              <p><strong>Experience:</strong> {explanation.levelMatch === null ? "The listing does not specify a level; a neutral score was used." : explanation.levelMatch ? "Exact experience-level match." : "Experience level differs; this receives partial credit."}</p>
              <p><strong>Matched skills:</strong> {explanation.matchedSkills.length ? explanation.matchedSkills.join(", ") : "No listed skills matched yet."}</p>
              {explanation.missingSkills.length > 0 && <p><strong>Skills not listed in your profile:</strong> {explanation.missingSkills.join(", ")}</p>}
            </div>
          </details>
          <div className="tracker-control">
            <label className="field-label" htmlFor={"application-status-" + job.id}>Application status</label>
            <select
              id={"application-status-" + job.id}
              className="tracker-status"
              value={trackedApplications.find(item => item.job.id === job.id)?.status ?? ""}
              onChange={event => changeApplicationStatus(job, event.target.value)}
            >
              <option value="">Not tracking</option>
              <option value="interested">Interested</option>
              <option value="preparing">Preparing</option>
              <option value="applied">Applied</option>
              <option value="interview">Interview</option>
              <option value="offer">Offer</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
            {trackedApplications.some(item => item.job.id === job.id) && <small className="tracker-updated">Updated {new Date(trackedApplications.find(item => item.job.id === job.id)!.updatedAt).toLocaleString()}</small>}
          </div>
          <div className="job-card-bottom">
            <span className={job.remote ? "remote-tag" : "onsite-tag"}>{job.remote ? "REMOTE" : "ON-SITE / HYBRID"}</span>
            <div className="job-card-actions">
              <button className="secondary-button save-role-button" type="button" onClick={() => toggleSavedJob(job)}>{savedJobs.some(item => item.id === job.id) ? "Remove saved" : "Save role"}</button>
              <button className="secondary-button draft-trigger" type="button" onClick={() => createCoverLetterDraft(job)}>Draft cover letter</button>
              <a href={job.url} target="_blank" rel="noreferrer">{job.source === "Remotive" ? "View on Remotive ↗" : "Example listing ↗"}</a>
            </div>
          </div>
        </article>)}
        {draftForJob && <section className="panel draft-panel" aria-label="Cover letter draft editor">
          <div className="section-heading">
            <div><p className="eyebrow">03 / APPLICATION PREPARATION</p><h2>Cover letter draft</h2></div>
            <button className="secondary-button draft-close" type="button" onClick={() => { setDraftForJob(null); setDraftText(""); }}>Close</button>
          </div>
          <p className="draft-help">Template for {draftForJob.title} at {draftForJob.company}. It uses only your entered name, target roles, and skills. It does not claim experience, credentials, or achievements you have not supplied.</p>
          <label className="field-label" htmlFor="cover-letter-text">Editable draft</label>
          <textarea id="cover-letter-text" rows={13} value={draftText} onChange={e => setDraftText(e.target.value)} />
          <div className="draft-actions">
            <button className="primary-button" type="button" onClick={copyCoverLetterDraft}>Copy draft</button>
            <button className="secondary-button" type="button" onClick={() => setDraftText(buildCoverLetterDraft({ candidateName, targetRoles: candidate.targetRoles, skills: candidate.skills, jobSkills: draftForJob.skills, jobTitle: draftForJob.title, company: draftForJob.company }))}>Regenerate from profile</button>
          </div>
          <p className="source-disclaimer">Review and personalize the text before using it. Copying is the only export action; this app cannot send applications or emails.</p>
        </section>}
        <div className="next-step">
          <span className="next-step-icon">↗</span>
          <div><strong>Next: secure application preparation</strong><p>Live discovery is read-only. CV parsing, tailoring, persistence, Gmail, and any submission workflow remain disconnected pending a safe implementation and your explicit setup.</p></div>
        </div>
      </section>
    </div>
    <footer><span>JOB AGENT · PRIVATE BY DESIGN</span><span>Gmail sending: not connected</span></footer>
  </main>;
}
