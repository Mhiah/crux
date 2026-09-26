import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ProjectStore, ProjectSummary } from "./store";
import type { ResearchProject } from "./types";

/**
 * Projects in Supabase Postgres (table from supabase/migrations). The whole project is
 * stored as jsonb in `data`, with the fields the past-runs list needs as real columns.
 * Server-only: it uses the secret key, which bypasses row-level security.
 */

const TABLE = "projects";

// Pulled out of the jsonb by PostgREST so listing never downloads whole projects.
const SUMMARY_COLUMNS =
  "id, question, status, mode, created_at, confidence:data->conclusion->>confidence, verdict:data->reevaluation->>thesis_verdict";

const clients = new Map<string, SupabaseStore>();

export class SupabaseStore implements ProjectStore {
  constructor(private db: SupabaseClient) {}

  /** One client per URL+key, reused across requests. */
  static for(url: string, key: string): SupabaseStore {
    const cacheKey = `${url}\n${key}`;
    let store = clients.get(cacheKey);
    if (!store) {
      store = new SupabaseStore(createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
      clients.set(cacheKey, store);
    }
    return store;
  }

  async save(project: ResearchProject) {
    const { error } = await this.db.from(TABLE).upsert({
      id: project.id,
      question: project.question,
      status: project.status,
      mode: project.mode,
      created_at: project.created_at,
      updated_at: new Date().toISOString(),
      data: project,
    });
    if (error) throw new Error(`Supabase could not save project ${project.id}: ${error.message}`);
  }

  async load(id: string) {
    const { data, error } = await this.db.from(TABLE).select("data").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase could not load project ${id}: ${error.message}`);
    return (data?.data as ResearchProject | undefined) ?? null;
  }

  async list(limit: number) {
    const { data, error } = await this.db.from(TABLE).select(SUMMARY_COLUMNS).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(`Supabase could not list projects: ${error.message}`);
    // Postgres returns timestamptz as "…+00:00"; match the "…Z" form projects are saved with.
    return ((data ?? []) as unknown as ProjectSummary[]).map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
  }
}
