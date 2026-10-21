export type JobSearchSource = "all" | "remotive" | "arbeitnow";

export interface SavedJobSearch {
  id: string;
  name: string;
  query: string;
  source: JobSearchSource;
  createdAt: string;
}

export const MAX_SAVED_JOB_SEARCHES = 20;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || value.length > maxLength) return null;
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isSource(value: unknown): value is JobSearchSource {
  return value === "all" || value === "remotive" || value === "arbeitnow";
}

function normalizeQuery(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function parseSearch(value: unknown): SavedJobSearch | null {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, 100);
  const name = cleanText(value.name, 60);
  const query = cleanText(value.query, 80);
  if (!id || !name || !query || !isSource(value.source)) return null;
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return null;

  return {
    id,
    name,
    query,
    source: value.source,
    createdAt: new Date(value.createdAt).toISOString()
  };
}

/** Parse saved-search storage defensively and discard malformed or duplicate records. */
export function readSavedJobSearches(raw: string | null): SavedJobSearch[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const searches: SavedJobSearch[] = [];
    const seenIds = new Set<string>();
    const seenSearches = new Set<string>();

    for (const candidate of parsed) {
      const search = parseSearch(candidate);
      if (!search) continue;

      const idKey = search.id.toLowerCase();
      const searchKey = search.source + "|" + normalizeQuery(search.query);
      if (seenIds.has(idKey) || seenSearches.has(searchKey)) continue;

      seenIds.add(idKey);
      seenSearches.add(searchKey);
      searches.push(search);
      if (searches.length === MAX_SAVED_JOB_SEARCHES) break;
    }

    return searches;
  } catch {
    return [];
  }
}

/** Save or update a query/source pair without duplicating the same search. */
export function upsertSavedJobSearch(
  current: SavedJobSearch[],
  candidate: SavedJobSearch
): SavedJobSearch[] {
  const existing = readSavedJobSearches(JSON.stringify(current));
  const parsed = parseSearch(candidate);
  if (!parsed) return existing;

  const searchKey = parsed.source + "|" + normalizeQuery(parsed.query);
  const duplicate = existing.find(item => item.source + "|" + normalizeQuery(item.query) === searchKey);
  const next: SavedJobSearch = duplicate
    ? { ...parsed, id: duplicate.id, createdAt: duplicate.createdAt }
    : parsed;

  return [
    next,
    ...existing.filter(item => item.id !== duplicate?.id && item.id !== next.id)
  ].slice(0, MAX_SAVED_JOB_SEARCHES);
}

export function removeSavedJobSearch(
  current: SavedJobSearch[],
  id: string
): SavedJobSearch[] {
  return current.filter(item => item.id !== id);
}
