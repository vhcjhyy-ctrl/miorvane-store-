"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { explainJobMatch, type CandidateProfile, type Job } from "@/lib/scoring";
import { buildCoverLetterDraft } from "@/lib/application-draft";
import { readShortlist, toggleShortlist } from "@/lib/shortlist";
import { readApplicationTracker, updateApplicationTracker, updateTrackedApplicationDetails, type ApplicationStatus, type TrackedApplication } from "@/lib/application-tracker";
import { filterApplicationsByStatus, summarizeApplications, type ApplicationStatusFilter } from "@/lib/application-dashboard";
import { applicationTrackerToCsv } from "@/lib/application-export";
import { extractResumeText } from "@/lib/cv-parser";
import { extractKnownSkills } from "@/lib/remotive";
import { filterAndSortMatches, type JobAgeFilter, type JobSortMode } from "@/lib/job-results";
import { clearJobAgentLocalData } from "@/lib/local-data";

const sampleJobs: Job[] = [
  { id: "demo-1", title: "Junior Python Developer", company: "Northstar Systems", location: "Remote — Worldwide", remote: true, skills: ["Python", "SQL", "Git"], level: "entry", description: "Support backend services, write Python code, and work with relational databases.", url: "https://example.com/jobs/demo-1" },
  { id: "demo-2", title: "Frontend Developer", company: "Bright Pixel", location: "Remote — EMEA", remote: true, skills: ["React", "TypeScript", "CSS"], level: "mid", description: "Build accessible web interfaces with React and TypeScript.", url: "https://example.com/jobs/demo-2" },
  { id: "demo-3", title: "IT Support Associate", company: "Example Global", location: "Hybrid — Cairo", remote: false, skills: ["Troubleshooting", "Networking", "Linux"], level: "entry", description: "Provide first-line technical support and troubleshoot workstation issues.", url: "https://example.com/jobs/demo-3" }
];

export default function HomePage() {
  const [cvName, setCvName] = useState("");
  const [cvInputKey, setCvInputKey] = useState(0);
  const [resumeText, setResumeText] = useState("");
  const [resumeInfo, setResumeInfo] = useState("");
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [skillsText, setSkillsText] = useState("Python, SQL, Git");
  const [rolesText, setRolesText] = useState("Junior Python Developer, Python Developer");
  const [level, setLevel] = useState<CandidateProfile["level"]>("entry");
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [minimumScore, setMinimumScore] = useState(60);
  const [jobCategoryFilter, setJobCategoryFilter] = useState("all");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [postedWithinFilter, setPostedWithinFilter] = useState<JobAgeFilter>("any");
  const [salaryOnlyFilter, setSalaryOnlyFilter] = useState(false);
  const [sortMode, setSortMode] = useState<JobSortMode>("match");
  const [notice, setNotice] = useState("");
  const [liveQuery, setLiveQuery] = useState("Python developer");
  const [jobSource, setJobSource] = useState<"all" | "remotive" | "arbeitnow">("all");
  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const [showLiveJobs, setShowLiveJobs] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveWarning, setLiveWarning] = useState("");
  const [liveFetchedAt, setLiveFetchedAt] = useState("");
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [showSavedJobs, setShowSavedJobs] = useState(false);
  const [trackedApplications, setTrackedApplications] = useState<TrackedApplication[]>([]);
  const [showApplications, setShowApplications] = useState(false);
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<ApplicationStatusFilter>("all");
  const [draftForJob, setDraftForJob] = useState<Job | null>(null);
  const [draftLanguage, setDraftLanguage] = useState<"en" | "ar">("en");
  const [draftText, setDraftText] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [isAiDrafting, setIsAiDrafting] = useState(false);
  const [aiDraftError, setAiDraftError] = useState("");

  useEffect(() => {
    try {
      setSavedJobs(readShortlist(window.localStorage.getItem("job-agent.shortlist.v1")));
      setTrackedApplications(readApplicationTracker(window.localStorage.getItem("job-agent.applications.v1")));
    } catch {
      // Storage may be disabled; individual save/load actions show user-facing errors.
    }
  }, []);

  function clearAllLocalJobAgentData() {
    if (!window.confirm("Clear this browser's saved Job Agent profile, shortlist, and application history? This cannot be undone.")) {
      return;
    }

    try {
      clearJobAgentLocalData(window.localStorage);
      setCandidateName("");
      setDraftLanguage("en");
      setSkillsText("");
      setRolesText("");
      setLevel("entry");
      setRemoteOnly(true);
      setMinimumScore(60);
      setJobCategoryFilter("all");
      setJobTypeFilter("all");
      setPostedWithinFilter("any");
      setSalaryOnlyFilter(false);
      setSortMode("match");
      setCvName("");
      setCvInputKey(current => current + 1);
      setResumeText("");
      setResumeInfo("");
      setIsParsingResume(false);
      setSavedJobs([]);
      setTrackedApplications([]);
      setShowSavedJobs(false);
      setShowApplications(false);
      setApplicationStatusFilter("all");
      setLiveJobs([]);
      setShowLiveJobs(false);
      setLiveError("");
      setLiveFetchedAt("");
      setDraftForJob(null);
      setDraftText("");
      setAiConsent(false);
      setIsAiDrafting(false);
      setAiDraftError("");
      setNotice("Job Agent profile, saved roles, and application history cleared from this browser. Previously exported files and server-side records, if any, are not affected.");
    } catch {
      setNotice("Could not clear the app's local data. Browser storage may be restricted; review this browser's site data settings.");
    }
  }

  function saveProfileSettings() {
    try {
      const settings = { schemaVersion: 3, candidateName, skillsText, rolesText, level, remoteOnly, minimumScore, draftLanguage };
      window.localStorage.setItem("job-agent.profile.v3", JSON.stringify(settings));
      setNotice("Profile preferences saved in this browser. Your CV file was not uploaded or saved.");
    } catch {
      setNotice("The browser could not save these settings. Check local storage availability.");
    }
  }

  function loadProfileSettings() {
    try {
      const raw = window.localStorage.getItem("job-agent.profile.v3") ?? window.localStorage.getItem("job-agent.profile.v2") ?? window.localStorage.getItem("job-agent.profile.v1");
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
        (settings.schemaVersion !== 1 && settings.schemaVersion !== 2 && settings.schemaVersion !== 3)
        || (settings.draftLanguage !== undefined && settings.draftLanguage !== "en" && settings.draftLanguage !== "ar")
        || typeof settings.skillsText !== "string"
        || typeof settings.rolesText !== "string"
        || !validLevel
        || typeof settings.remoteOnly !== "boolean"
        || !validScore
      ) {
        throw new Error("Invalid settings");
      }
      setCandidateName(typeof settings.candidateName === "string" ? settings.candidateName : "");
      setDraftLanguage(settings.draftLanguage === "ar" ? "ar" : "en");
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

  const applicationSummary = useMemo(
    () => summarizeApplications(trackedApplications, localDateStamp()),
    [trackedApplications]
  );
  const trackedApplicationsForView = useMemo(
    () => filterApplicationsByStatus(trackedApplications, applicationStatusFilter),
    [trackedApplications, applicationStatusFilter]
  );
  const activeJobs = showApplications ? trackedApplicationsForView.map(item => item.job) : showSavedJobs ? savedJobs : showLiveJobs ? liveJobs : sampleJobs;
  const availableCategories = useMemo(() => Array.from(new Set(activeJobs.map(job => job.category?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b)), [activeJobs]);
  const availableJobTypes = useMemo(() => Array.from(new Set(activeJobs.map(job => job.jobType?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b)), [activeJobs]);
  const scoredMatches = useMemo(() => activeJobs
    .filter(job => showApplications || !candidate.remoteOnly || job.remote)
    .map(job => ({ job, explanation: explainJobMatch(candidate, job) }))
    .filter(item => showApplications || item.explanation.score >= minimumScore),
  [activeJobs, candidate, minimumScore, showApplications]);
  const matches = useMemo(() => filterAndSortMatches(scoredMatches, {
    category: jobCategoryFilter,
    jobType: jobTypeFilter,
    postedWithin: postedWithinFilter,
    salaryOnly: salaryOnlyFilter,
    sortBy: sortMode
  }), [scoredMatches, jobCategoryFilter, jobTypeFilter, postedWithinFilter, salaryOnlyFilter, sortMode]);

  function resetJobFilters() {
    setJobCategoryFilter("all");
    setJobTypeFilter("all");
    setPostedWithinFilter("any");
    setSalaryOnlyFilter(false);
    setSortMode("match");
  }

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
      const response = await fetch(`/api/jobs?q=${encodeURIComponent(query)}&limit=40&source=${jobSource}`, {
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
      const warnings = "warnings" in payload && Array.isArray(payload.warnings)
        ? payload.warnings.filter((warning): warning is string => typeof warning === "string")
        : [];
      setLiveWarning(warnings.join(" "));
      setShowApplications(false);
      setShowSavedJobs(false);
      setShowLiveJobs(true);
      setLiveFetchedAt(new Date().toISOString());
      setNotice("");
    } catch (error) {
      setShowLiveJobs(true);
      setLiveWarning("");
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
    setLiveWarning("");
  }

  function loadSavedJobs() {
    try {
      const jobs = readShortlist(window.localStorage.getItem("job-agent.shortlist.v1"));
      setSavedJobs(jobs);
      setShowApplications(false);
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

  function exportTrackedApplicationsCsv() {
    if (trackedApplications.length === 0) {
      setNotice("There are no tracked applications to export yet.");
      return;
    }
    try {
      const csv = applicationTrackerToCsv(trackedApplications);
      const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "job-agent-applications-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Application tracker exported to a CSV file on your device. No data was uploaded.");
    } catch {
      setNotice("The CSV export could not be created in this browser.");
    }
  }

  function loadTrackedApplications() {
    try {
      const applications = readApplicationTracker(window.localStorage.getItem("job-agent.applications.v1"));
      setApplicationStatusFilter("all");
      resetJobFilters();
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

  function updateTrackedDetail(job: Job, field: "notes" | "followUpDate", value: string) {
    const updated = updateTrackedApplicationDetails(
      trackedApplications,
      job,
      field,
      value,
      new Date().toISOString()
    );
    if (updated === trackedApplications) return;
    setTrackedApplications(updated);
    try {
      window.localStorage.setItem("job-agent.applications.v1", JSON.stringify(updated));
    } catch {
      setNotice("The change is visible for this session, but the browser could not persist it.");
    }
  }

  function localDateStamp() {
    const now = new Date();
    return now.getFullYear() + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0");
  }

  function getFollowUpState(date: string) {
    const today = localDateStamp();
    if (date < today) return { label: "Follow-up overdue", className: "follow-up-overdue" };
    if (date === today) return { label: "Follow-up due today", className: "follow-up-today" };
    return { label: "Follow-up scheduled", className: "follow-up-planned" };
  }

  function createCoverLetterDraft(job: Job) {
    setDraftForJob(job);
    setAiConsent(false);
    setAiDraftError("");
    setDraftText(buildCoverLetterDraft({
      candidateName,
      targetRoles: candidate.targetRoles,
      skills: candidate.skills,
      jobSkills: job.skills,
      jobTitle: job.title,
      company: job.company,
      language: draftLanguage
    }));
    setNotice("A cover letter template was created locally. Review every line before using it; nothing was sent.");
  }

  async function generateAiCoverLetterDraft() {
    if (!draftForJob || !aiConsent || isAiDrafting) return;
    setIsAiDrafting(true);
    setAiDraftError("");
    try {
      const response = await fetch("/api/ai/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          consentConfirmed: aiConsent,
          candidateName,
          targetRoles: candidate.targetRoles.slice(0, 6),
          candidateSkills: candidate.skills.slice(0, 20),
          jobSkills: draftForJob.skills.slice(0, 30),
          jobTitle: draftForJob.title,
          company: draftForJob.company,
          jobDescription: draftForJob.description,
          language: "en"
        })
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error : "AI draft generation is unavailable.";
        throw new Error(message);
      }
      if (!payload || typeof payload !== "object" || !("draft" in payload) || typeof payload.draft !== "string" || !payload.draft.trim()) {
        throw new Error("The AI provider returned an unexpected response.");
      }
      setDraftText(payload.draft);
      setNotice("AI draft received. Review it carefully; no application or email was sent.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI draft generation failed.";
      setAiDraftError(message);
      setNotice("AI draft was not generated. The editable local template remains available.");
    } finally {
      setIsAiDrafting(false);
    }
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
      <span className="phase-pill">PHASE 12 · MULTI-SOURCE SEARCH</span>
    </header>
    <section className="hero">
      <div>
        <p className="eyebrow">YOUR PERSONAL JOB WORKSPACE</p>
        <h1>Find work that fits.<br/><span>Apply with intent.</span></h1>
        <p className="hero-copy">Search jobs from two public sources, compare them against your profile, and see why each role may fit.</p>
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
          ? <div className="notice"><strong>Live-source mode:</strong> results use {jobSource === "all" ? "Remotive and Arbeitnow" : jobSource === "remotive" ? "Remotive" : "Arbeitnow"} public listings with source-specific caching. Jobs may be stale or location-restricted; check the original listing and work-authorization requirements.</div>
          : <div className="notice"><strong>Demo mode:</strong> sample listings are examples. Choose a public source below for live results. No application is submitted and no email is sent.</div>}
    {notice && <p className="inline-notice" role="status">{notice}</p>}

    <div className="layout">
      <aside className="panel profile-panel">
        <div className="section-heading">
          <div><p className="eyebrow">01 / CANDIDATE</p><h2>Your profile</h2></div>
          <span className="step-icon">CV</span>
        </div>
        <label className="upload-box">
          <input key={cvInputKey} type="file" accept=".pdf,.docx,.txt" disabled={isParsingResume} onChange={e => { void selectCv(e.target.files?.[0]); }}/>
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
        <div className="privacy-controls">
          <p>Privacy controls</p>
          <small>Clear this app’s browser-local profile, saved roles, and application history. A confirmation is required.</small>
          <button className="danger-button" type="button" onClick={clearAllLocalJobAgentData}>Clear my local Job Agent data</button>
        </div>
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
            <label className="job-source-selector" htmlFor="job-source">Job source
              <select id="job-source" value={jobSource} onChange={event => setJobSource(event.target.value as "all" | "remotive" | "arbeitnow")}>
                <option value="all">Both sources</option>
                <option value="remotive">Remotive — remote jobs</option>
                <option value="arbeitnow">Arbeitnow — Germany & Europe</option>
              </select>
            </label>
            <p className="source-disclaimer">Sources: {jobSource !== "arbeitnow" && <><a href="https://remotive.com/remote-jobs/api" target="_blank" rel="noreferrer">Remotive API</a>{jobSource === "all" ? " · " : ""}</>}{jobSource !== "remotive" && <a href="https://www.arbeitnow.com" target="_blank" rel="noreferrer">Arbeitnow API</a>}. Results are cached server-side; listings link back to the original source.</p>
          </form>
          <div className="source-mode-actions">
            <button className="secondary-button" type="button" onClick={loadSavedJobs}>Saved roles ({savedJobs.length})</button>
            <button className="secondary-button" type="button" onClick={loadTrackedApplications}>Application tracker ({trackedApplications.length})</button>
            {showApplications && <button className="secondary-button export-csv-button" type="button" onClick={exportTrackedApplicationsCsv} disabled={trackedApplications.length === 0}>Export CSV</button>}
            <button className="secondary-button" type="button" onClick={showDemoJobs}>Show demo data</button>
          </div>
          {showApplications && <section className="application-dashboard" aria-label="Application tracker dashboard">
            <div className="application-dashboard-heading">
              <div><strong>Application overview</strong><small>Follow-up counts exclude rejected and withdrawn roles.</small></div>
              <label htmlFor="application-status-filter">Filter by status
                <select id="application-status-filter" value={applicationStatusFilter} onChange={event => setApplicationStatusFilter(event.target.value as ApplicationStatusFilter)}>
                  <option value="all">All statuses</option>
                  <option value="interested">Interested</option>
                  <option value="preparing">Preparing</option>
                  <option value="applied">Applied</option>
                  <option value="interview">Interview</option>
                  <option value="offer">Offer</option>
                  <option value="rejected">Rejected</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </label>
            </div>
            <div className="application-metrics">
              <div className="application-metric"><span>Tracked</span><strong>{applicationSummary.total}</strong></div>
              <div className="application-metric"><span>Applied</span><strong>{applicationSummary.applied}</strong></div>
              <div className="application-metric"><span>Interviews</span><strong>{applicationSummary.interviews}</strong></div>
              <div className="application-metric"><span>Offers</span><strong>{applicationSummary.offers}</strong></div>
              <div className={"application-metric metric-due" + (applicationSummary.followUpsDue > 0 ? " has-due" : "")}><span>Follow-ups due</span><strong>{applicationSummary.followUpsDue}</strong></div>
              <div className={"application-metric metric-overdue" + (applicationSummary.followUpsOverdue > 0 ? " has-overdue" : "")}><span>Overdue</span><strong>{applicationSummary.followUpsOverdue}</strong></div>
            </div>
          </section>}
          {liveError && <p className="inline-error" role="alert">{liveError}</p>}
          {liveWarning && <p className="inline-warning" role="status">{liveWarning}</p>}
          {showLiveJobs && liveFetchedAt && <p className="retrieved-note">Fetched by this session: {new Date(liveFetchedAt).toLocaleString()} · source data may be cached.</p>}
        </div>
        <p className="subheading">{showApplications ? "Your tracked applications ranked against your current candidate profile." : showSavedJobs ? "Your browser-local shortlist ranked against your current candidate profile." : showLiveJobs ? "Live-source results ranked against your current candidate profile." : "Sample listings scored against your current profile."}</p>
        <section className="job-filters" aria-label="Filter and sort job results">
          <div className="filter-heading">
            <div><strong>Refine results</strong><small>{matches.length} of {scoredMatches.length} matched roles shown</small></div>
            <button className="filter-reset" type="button" onClick={resetJobFilters}>Reset filters</button>
          </div>
          <div className="filter-grid">
            <label htmlFor="job-category-filter">Category
              <select id="job-category-filter" value={jobCategoryFilter} onChange={event => setJobCategoryFilter(event.target.value)}>
                <option value="all">All categories</option>
                {availableCategories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label htmlFor="job-type-filter">Employment type
              <select id="job-type-filter" value={jobTypeFilter} onChange={event => setJobTypeFilter(event.target.value)}>
                <option value="all">All types</option>
                {availableJobTypes.map(type => <option key={type} value={type}>{type.replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase())}</option>)}
              </select>
            </label>
            <label htmlFor="job-age-filter">Publication date
              <select id="job-age-filter" value={postedWithinFilter} onChange={event => setPostedWithinFilter(event.target.value as JobAgeFilter)}>
                <option value="any">Any date</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </label>
            <label htmlFor="job-sort-mode">Sort results
              <select id="job-sort-mode" value={sortMode} onChange={event => setSortMode(event.target.value as JobSortMode)}>
                <option value="match">Best match</option>
                <option value="newest">Newest first</option>
                <option value="company">Company A–Z</option>
              </select>
            </label>
          </div>
          <label className="salary-toggle"><input type="checkbox" checked={salaryOnlyFilter} onChange={event => setSalaryOnlyFilter(event.target.checked)}/> Only listings with published compensation</label>
        </section>
        {matches.length === 0 && <div className="empty-state">{showApplications ? (trackedApplications.length === 0 ? "No applications being tracked yet. Open live or demo listings and select a status." : "No tracked roles meet your current score threshold. Lower the threshold or change your profile.") : showSavedJobs ? (savedJobs.length === 0 ? "No roles saved yet. Switch to live or demo listings and choose Save role." : "No saved roles meet your current score threshold. Lower the threshold or change your profile.") : showLiveJobs && isSearching ? "Searching for matching roles…" : showLiveJobs ? "No live listings meet this search and score threshold. Try another keyword or lower the threshold." : "No sample jobs meet this score and preference combination. Lower the threshold or change your profile."}</div>}
        {matches.map(({job, explanation}) => {
          const trackedRecord = trackedApplications.find(item => item.job.id === job.id);
          return <article className="job-card" key={job.id}>
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
              value={trackedRecord?.status ?? ""}
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
            {trackedRecord && <small className="tracker-updated">Updated {new Date(trackedRecord.updatedAt).toLocaleString()}</small>}
          </div>
          {trackedRecord && <div className="application-details">
            <label className="field-label" htmlFor={"application-notes-" + job.id}>Private notes</label>
            <textarea
              id={"application-notes-" + job.id}
              value={trackedRecord.notes ?? ""}
              onChange={event => updateTrackedDetail(job, "notes", event.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Recruiter name, interview details, questions to ask…"
            />
            <label className="field-label" htmlFor={"follow-up-date-" + job.id}>Follow-up date</label>
            <input
              id={"follow-up-date-" + job.id}
              type="date"
              value={trackedRecord.followUpDate ?? ""}
              onChange={event => updateTrackedDetail(job, "followUpDate", event.target.value)}
            />
            {trackedRecord.followUpDate && <p className={"follow-up-indicator " + getFollowUpState(trackedRecord.followUpDate).className}>
              {getFollowUpState(trackedRecord.followUpDate).label} · {trackedRecord.followUpDate}
            </p>}
            <small className="follow-up-help">Notes and dates stay in this browser. They are included in the CSV export.</small>
          </div>}
          <div className="job-card-bottom">
            <span className={job.remote ? "remote-tag" : "onsite-tag"}>{job.remote ? "REMOTE" : "ON-SITE / HYBRID"}</span>
            <div className="job-card-actions">
              <button className="secondary-button save-role-button" type="button" onClick={() => toggleSavedJob(job)}>{savedJobs.some(item => item.id === job.id) ? "Remove saved" : "Save role"}</button>
              <button className="secondary-button draft-trigger" type="button" onClick={() => createCoverLetterDraft(job)}>Draft cover letter</button>
              <a href={job.url} target="_blank" rel="noreferrer">{job.source === "Remotive" ? "View on Remotive ↗" : job.source === "Arbeitnow" ? "View on Arbeitnow ↗" : "Example listing ↗"}</a>
            </div>
          </div>
        </article>;
        })}
        {draftForJob && <section className="panel draft-panel" aria-label="Cover letter draft editor">
          <div className="section-heading">
            <div><p className="eyebrow">03 / APPLICATION PREPARATION</p><h2>Cover letter draft</h2></div>
            <button className="secondary-button draft-close" type="button" onClick={() => { setDraftForJob(null); setDraftText(""); setAiConsent(false); setAiDraftError(""); }}>Close</button>
          </div>
          <p className="draft-help">Template for {draftForJob.title} at {draftForJob.company}. It uses only your entered name, target roles, and skills. It does not claim experience, credentials, or achievements you have not supplied.</p>
          <label className="field-label" htmlFor="draft-language">Language for generated drafts</label>
          <select id="draft-language" value={draftLanguage} onChange={event => setDraftLanguage(event.target.value as "en" | "ar")}>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
          <p className="draft-help">Changing the language affects the next local regeneration or AI generation. It does not overwrite your current edits.</p>
          <label className="field-label" htmlFor="cover-letter-text">Editable draft</label>
          <textarea id="cover-letter-text" rows={13} value={draftText} onChange={e => setDraftText(e.target.value)} />
          <div className="ai-consent-box">
            <label className="ai-consent-row">
              <input type="checkbox" checked={aiConsent} onChange={event => setAiConsent(event.target.checked)} disabled={isAiDrafting}/>
              <span>I agree to send my entered name, target roles, skills, and the selected job title, company, and description to OpenAI to generate this draft. My CV file and extracted CV text will not be sent.</span>
            </label>
            <button className="primary-button ai-generate-button" type="button" disabled={!aiConsent || isAiDrafting} onClick={() => { void generateAiCoverLetterDraft(); }}>
              {isAiDrafting ? "Generating AI draft…" : "Generate AI version"}
            </button>
            <p className="source-disclaimer">Optional integration; disabled until the app owner configures a server-side key and enables it. This sends only the listed draft fields, not the CV file/text.</p>
            {aiDraftError && <p className="inline-error" role="alert">{aiDraftError}</p>}
          </div>
          <div className="draft-actions">
            <button className="primary-button" type="button" onClick={copyCoverLetterDraft}>Copy draft</button>
            <button className="secondary-button" type="button" onClick={() => setDraftText(buildCoverLetterDraft({ candidateName, targetRoles: candidate.targetRoles, skills: candidate.skills, jobSkills: draftForJob.skills, jobTitle: draftForJob.title, company: draftForJob.company, language: draftLanguage }))}>Regenerate local template</button>
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
