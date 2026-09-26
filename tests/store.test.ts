import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileStore, getStore, loadProject, summarize } from "../src/lib/store";
import { SupabaseStore } from "../src/lib/supabase-store";
import type { ResearchProject } from "../src/lib/types";

const project = (id: string, created_at: string, extra: Partial<ResearchProject> = {}): ResearchProject => ({
  id,
  question: `Question ${id.slice(0, 4)}`,
  status: "complete",
  created_at,
  mode: "mock",
  research: null,
  thesis: null,
  stress_test: null,
  reevaluation: null,
  conclusion: null,
  what_changed: null,
  audit: [],
  error: null,
  ...extra,
});

const OLD = project("11111111-1111-4111-8111-111111111111", "2026-09-01T10:00:00.000Z");
const NEW = project("22222222-2222-4222-8222-222222222222", "2026-09-20T10:00:00.000Z", {
  reevaluation: { thesis_verdict: "weakened" } as ResearchProject["reevaluation"],
  conclusion: { confidence: "medium" } as ResearchProject["conclusion"],
});

describe("FileStore", () => {
  let dir: string;
  beforeEach(async () => (dir = await mkdtemp(path.join(tmpdir(), "crux-store-"))));
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("saves, loads, and lists newest first with summary fields", async () => {
    const store = new FileStore(dir);
    await store.save(OLD);
    await store.save(NEW);
    expect(await store.load(NEW.id)).toEqual(NEW);
    expect(await store.list(10)).toEqual([summarize(NEW), summarize(OLD)]);
    expect(summarize(NEW)).toMatchObject({ confidence: "medium", verdict: "weakened" });
    expect(await store.list(1)).toHaveLength(1);
  });

  it("returns null or an empty list when nothing is saved, and skips unreadable files", async () => {
    const store = new FileStore(path.join(dir, "missing"));
    expect(await store.load(OLD.id)).toBeNull();
    expect(await store.list(10)).toEqual([]);

    await writeFile(path.join(dir, "33333333-3333-4333-8333-333333333333.json"), "{ not json");
    await new FileStore(dir).save(OLD);
    expect((await new FileStore(dir).list(10)).map((r) => r.id)).toEqual([OLD.id]);
  });
});

describe("store selection", () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  afterEach(() => {
    process.env.SUPABASE_URL = saved.url ?? "";
    process.env.SUPABASE_SECRET_KEY = saved.key ?? "";
  });

  it("uses local files without Supabase settings and Supabase with both", () => {
    process.env.SUPABASE_URL = "";
    process.env.SUPABASE_SECRET_KEY = "";
    expect(getStore()).toBeInstanceOf(FileStore);
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    expect(getStore()).toBeInstanceOf(SupabaseStore);
  });

  it("refuses half a Supabase configuration instead of silently using files", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "";
    expect(() => getStore()).toThrow("Set both SUPABASE_URL and SUPABASE_SECRET_KEY");
  });

  it("treats a malformed ID as not found without touching storage", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "";
    await expect(loadProject("../../etc/passwd")).resolves.toBeNull();
  });
});

/** A stand-in for the Supabase client: records each query chain and answers with `result`. */
function fakeDb(result: { data: unknown; error: { message: string } | null }) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (r: typeof result) => unknown) => resolve(result),
  };
  for (const m of ["upsert", "select", "eq", "maybeSingle", "order", "limit"]) {
    builder[m] = (...args: unknown[]) => (calls.push([m, args]), builder);
  }
  const db = { from: (table: string) => (calls.push(["from", [table]]), builder) };
  return { calls, store: new SupabaseStore(db as never) };
}

describe("SupabaseStore", () => {
  it("upserts the project with its summary columns and the full project as data", async () => {
    const { calls, store } = fakeDb({ data: null, error: null });
    await store.save(NEW);
    expect(calls[0]).toEqual(["from", ["projects"]]);
    expect(calls[1][0]).toBe("upsert");
    expect(calls[1][1][0]).toMatchObject({ id: NEW.id, question: NEW.question, status: "complete", mode: "mock", created_at: NEW.created_at, data: NEW });
  });

  it("loads a project by ID, and returns null when there is no row", async () => {
    const found = fakeDb({ data: { data: NEW }, error: null });
    expect(await found.store.load(NEW.id)).toEqual(NEW);
    expect(found.calls).toContainEqual(["eq", ["id", NEW.id]]);
    expect(await fakeDb({ data: null, error: null }).store.load(NEW.id)).toBeNull();
  });

  it("lists newest first, pulling summary fields out of the jsonb", async () => {
    const { calls, store } = fakeDb({ data: [summarize(NEW)], error: null });
    expect(await store.list(5)).toEqual([summarize(NEW)]);
    const select = calls.find(([m]) => m === "select")![1][0] as string;
    expect(select).toContain("confidence:data->conclusion->>confidence");
    expect(select).toContain("verdict:data->reevaluation->>thesis_verdict");
    expect(calls).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(calls).toContainEqual(["limit", [5]]);
  });

  it("normalises Postgres timestamps to the ISO form projects are saved with", async () => {
    const { store } = fakeDb({ data: [{ ...summarize(NEW), created_at: "2026-09-20T10:00:00+00:00" }], error: null });
    expect((await store.list(5))[0].created_at).toBe(NEW.created_at);
  });

  it("surfaces database errors instead of treating them as empty", async () => {
    const { store } = fakeDb({ data: null, error: { message: "permission denied for table projects" } });
    await expect(store.load(NEW.id)).rejects.toThrow("permission denied");
    await expect(store.list(5)).rejects.toThrow("permission denied");
    await expect(store.save(NEW)).rejects.toThrow("permission denied");
  });
});
