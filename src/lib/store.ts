import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SupabaseStore } from "./supabase-store";
import type { Confidence, Reevaluation, ResearchProject } from "./types";

/**
 * Where projects live. Supabase (Postgres) when SUPABASE_URL and SUPABASE_SECRET_KEY are
 * set, JSON files in .data/projects otherwise, so local dev needs no database. Callers only
 * use saveProject / loadProject / listProjects.
 */

/** One row of the past-runs list: enough to show and link to a run without loading it. */
export type ProjectSummary = Pick<ResearchProject, "id" | "question" | "status" | "mode" | "created_at"> & {
  confidence: Confidence | null;
  verdict: Reevaluation["thesis_verdict"] | null;
};

export interface ProjectStore {
  save(project: ResearchProject): Promise<void>;
  load(id: string): Promise<ResearchProject | null>;
  list(limit: number): Promise<ProjectSummary[]>;
}

const isProjectId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

export function summarize(p: ResearchProject): ProjectSummary {
  return {
    id: p.id,
    question: p.question,
    status: p.status,
    mode: p.mode,
    created_at: p.created_at,
    confidence: p.conclusion?.confidence ?? null,
    verdict: p.reevaluation?.thesis_verdict ?? null,
  };
}

export class FileStore implements ProjectStore {
  constructor(private dir = process.env.CRUX_DATA_DIR || path.join(process.cwd(), ".data", "projects")) {}

  private file(id: string) {
    if (!isProjectId(id)) throw new Error("Invalid project id.");
    return path.join(this.dir, `${id}.json`);
  }

  async save(project: ResearchProject) {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.file(project.id), JSON.stringify(project, null, 2));
  }

  async load(id: string) {
    try {
      return JSON.parse(await readFile(this.file(id), "utf8")) as ResearchProject;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async list(limit: number) {
    let names: string[];
    try {
      names = (await readdir(this.dir)).filter((n) => n.endsWith(".json"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const projects = await Promise.all(names.map((n) => this.load(n.slice(0, -5)).catch(() => null)));
    return projects
      .filter((p): p is ResearchProject => p !== null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map(summarize);
  }
}

/** Chosen per call, not at import, so env changes (and tests) take effect. */
export function getStore(): ProjectStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (url && key) return SupabaseStore.for(url, key);
  if (url || key) throw new Error("Set both SUPABASE_URL and SUPABASE_SECRET_KEY to use Supabase, or neither to store projects in local files.");
  return new FileStore();
}

export const saveProject = (project: ResearchProject) => getStore().save(project);

/** Null for an unknown or malformed ID; storage failures still throw. */
export const loadProject = async (id: string) => (isProjectId(id) ? getStore().load(id) : null);

export const listProjects = (limit = 20) => getStore().list(limit);
