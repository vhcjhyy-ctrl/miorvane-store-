import type { ApplicationStatus, TrackedApplication } from "./application-tracker";

export type ApplicationStatusFilter = ApplicationStatus | "all";

export interface ApplicationDashboardSummary {
  total: number;
  interested: number;
  preparing: number;
  applied: number;
  interviews: number;
  offers: number;
  rejected: number;
  withdrawn: number;
  followUpsDue: number;
  followUpsOverdue: number;
}

export function filterApplicationsByStatus(
  applications: TrackedApplication[],
  status: ApplicationStatusFilter
): TrackedApplication[] {
  return status === "all"
    ? [...applications]
    : applications.filter(application => application.status === status);
}

/** Build dashboard counts using an ISO calendar-date stamp, avoiding timezone parsing of date-only values. */
export function summarizeApplications(
  applications: TrackedApplication[],
  today: string
): ApplicationDashboardSummary {
  const active = applications.filter(application =>
    application.status !== "rejected" && application.status !== "withdrawn"
  );
  return {
    total: applications.length,
    interested: applications.filter(application => application.status === "interested").length,
    preparing: applications.filter(application => application.status === "preparing").length,
    applied: applications.filter(application => application.status === "applied").length,
    interviews: applications.filter(application => application.status === "interview").length,
    offers: applications.filter(application => application.status === "offer").length,
    rejected: applications.filter(application => application.status === "rejected").length,
    withdrawn: applications.filter(application => application.status === "withdrawn").length,
    followUpsDue: active.filter(application =>
      typeof application.followUpDate === "string" && application.followUpDate <= today
    ).length,
    followUpsOverdue: active.filter(application =>
      typeof application.followUpDate === "string" && application.followUpDate < today
    ).length
  };
}
