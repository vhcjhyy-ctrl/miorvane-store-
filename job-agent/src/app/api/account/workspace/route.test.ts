import { afterEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PUT } from "./route";
import { createServerSupabaseClient } from "../../../../lib/supabase/server";

vi.mock("../../../../lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn()
}));

const profile = {
  schemaVersion: 3,
  candidateName: "Candidate",
  skillsText: "Python, SQL",
  rolesText: "Backend Developer",
  level: "entry",
  remoteOnly: true,
  minimumScore: 60,
  draftLanguage: "en"
};

const validWorkspace = {
  profile,
  savedJobs: [{
    id: "remotive-1",
    title: "Python Developer",
    company: "Example",
    location: "Worldwide",
    remote: true,
    skills: ["Python"],
    description: "Build APIs.",
    url: "https://remotive.com/remote-jobs/software-dev/python-1",
    source: "Remotive"
  }],
  applications: [],
  savedSearches: [{
    id: "search-1",
    name: "Python",
    query: "Python Developer",
    source: "all",
    createdAt: "2026-10-21T10:00:00.000Z"
  }]
};

type Row = {
  user_id: string;
  version: number;
  profile: unknown;
  saved_jobs: unknown;
  applications: unknown;
  saved_searches: unknown;
  updated_at: string;
};

function createSupabaseMock(options: {
  userId?: string | null;
  row?: Row | null;
} = {}) {
  let row = options.row ?? null;
  let operation: "select" | "insert" | "update" | "delete" = "select";
  let writePayload: Partial<Row> | null = null;
  let filters: Record<string, unknown> = {};
  type MockBuilder = {
    select: (columns?: string) => MockBuilder;
    eq: (column: string, value: unknown) => MockBuilder;
    maybeSingle: () => Promise<{ data: Row | null; error: { code?: string } | null }>;
    insert: (payload: Partial<Row>) => MockBuilder;
    update: (payload: Partial<Row>) => MockBuilder;
    delete: () => MockBuilder;
  };
  const builder = {} as MockBuilder;

  builder.select = vi.fn((columns?: string) => {
    void columns;
    if (operation === "delete") {
      const deleted = row && filters.user_id === row.user_id ? [{ user_id: row.user_id }] : [];
      if (deleted.length) row = null;
      return Promise.resolve({ data: deleted, error: null }) as unknown as MockBuilder;
    }
    return builder;
  });
  builder.eq = vi.fn((column: string, value: unknown) => {
    filters[column] = value;
    return builder;
  });
  builder.maybeSingle = vi.fn(async () => {
    if (operation === "select") return { data: row, error: null };
    if (operation === "insert") {
      if (row) return { data: null, error: { code: "23505" } };
      row = writePayload as Row;
      return { data: row, error: null };
    }
    if (operation === "update") {
      if (!row || filters.user_id !== row.user_id || filters.version !== row.version) {
        return { data: null, error: null };
      }
      row = { ...row, ...(writePayload ?? {}) } as Row;
      return { data: row, error: null };
    }
    return { data: null, error: null };
  });
  builder.insert = vi.fn((payload: Partial<Row>) => {
    operation = "insert";
    writePayload = payload;
    filters = {};
    return builder;
  });
  builder.update = vi.fn((payload: Partial<Row>) => {
    operation = "update";
    writePayload = payload;
    filters = {};
    return builder;
  });
  builder.delete = vi.fn(() => {
    operation = "delete";
    filters = {};
    return builder;
  });

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: options.userId ? { id: options.userId } : null },
        error: null
      })
    },
    from: vi.fn(() => {
      operation = "select";
      writePayload = null;
      filters = {};
      return builder;
    })
  };
  return { client, builder, getRow: () => row };
}

function setSupabaseMock(mock: ReturnType<typeof createSupabaseMock> | null) {
  vi.mocked(createServerSupabaseClient).mockResolvedValue(mock ? mock.client as never : null);
}

function requestWithBody(payload: unknown) {
  return new Request("http://localhost/api/account/workspace", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("authenticated cloud workspace API", () => {
  it("fails closed when Supabase is not configured", async () => {
    setSupabaseMock(null);
    const response = await GET();
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("not configured");
  });

  it("requires a verified authenticated account", async () => {
    const mock = createSupabaseMock({ userId: null });
    setSupabaseMock(mock);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mock.client.from).not.toHaveBeenCalled();
  });

  it("returns an empty version-zero workspace for a new account", async () => {
    const mock = createSupabaseMock({ userId: "user-1" });
    setSupabaseMock(mock);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ version: 0, workspace: null });
  });

  it("inserts the first snapshot with version one", async () => {
    const mock = createSupabaseMock({ userId: "user-1" });
    setSupabaseMock(mock);
    const response = await PUT(requestWithBody({ expectedVersion: 0, workspace: validWorkspace }));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.version).toBe(1);
    expect(payload.workspace.profile.candidateName).toBe("Candidate");
    expect(payload.workspace.savedJobs).toHaveLength(1);
    expect(mock.getRow()?.user_id).toBe("user-1");
  });

  it("updates only when the caller's expected version is current", async () => {
    const initial: Row = {
      user_id: "user-1",
      version: 1,
      profile,
      saved_jobs: [],
      applications: [],
      saved_searches: [],
      updated_at: "2026-10-21T10:00:00.000Z"
    };
    const mock = createSupabaseMock({ userId: "user-1", row: initial });
    setSupabaseMock(mock);
    const response = await PUT(requestWithBody({ expectedVersion: 1, workspace: validWorkspace }));
    expect(response.status).toBe(200);
    expect((await response.json()).version).toBe(2);
  });

  it("rejects a stale update instead of overwriting changes from another session", async () => {
    const initial: Row = {
      user_id: "user-1",
      version: 2,
      profile,
      saved_jobs: [],
      applications: [],
      saved_searches: [],
      updated_at: "2026-10-21T10:00:00.000Z"
    };
    const mock = createSupabaseMock({ userId: "user-1", row: initial });
    setSupabaseMock(mock);
    const response = await PUT(requestWithBody({ expectedVersion: 1, workspace: validWorkspace }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("changed in another session");
  });

  it("rejects invalid workspace records before writing to the database", async () => {
    const mock = createSupabaseMock({ userId: "user-1" });
    setSupabaseMock(mock);
    const response = await PUT(requestWithBody({
      expectedVersion: 0,
      workspace: { ...validWorkspace, savedJobs: [{ ...validWorkspace.savedJobs[0], url: "javascript:alert(1)" }] }
    }));
    expect(response.status).toBe(400);
    expect(mock.client.from).not.toHaveBeenCalled();
  });

  it("rejects an oversized body before decoding and parsing it", async () => {
    const mock = createSupabaseMock({ userId: "user-1" });
    setSupabaseMock(mock);
    const request = new Request("http://localhost/api/account/workspace", {
      method: "PUT",
      headers: { "content-type": "application/json", "content-length": String(2 * 1024 * 1024 + 1) },
      body: "{}"
    });
    const response = await PUT(request);
    expect(response.status).toBe(413);
    expect(mock.client.from).not.toHaveBeenCalled();
  });

  it("allows the signed-in owner to delete the cloud snapshot only", async () => {
    const initial: Row = {
      user_id: "user-1",
      version: 1,
      profile,
      saved_jobs: [],
      applications: [],
      saved_searches: [],
      updated_at: "2026-10-21T10:00:00.000Z"
    };
    const mock = createSupabaseMock({ userId: "user-1", row: initial });
    setSupabaseMock(mock);
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(mock.getRow()).toBeNull();
  });
});
