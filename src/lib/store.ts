import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResearchProject } from "./types";

/**
 * File-backed project store for Phase 1. Swapped for Supabase/Postgres in Phase 2;
 * callers only depend on saveProject/loadProject.
 */
const DATA_DIR = process.env.CRUX_DATA_DIR || path.join(process.cwd(), ".data", "projects");

const fileFor = (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid project id.");
  return path.join(DATA_DIR, `${id}.json`);
};

export async function saveProject(project: ResearchProject): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(fileFor(project.id), JSON.stringify(project, null, 2));
}

export async function loadProject(id: string): Promise<ResearchProject | null> {
  try {
    return JSON.parse(await readFile(fileFor(id), "utf8")) as ResearchProject;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
