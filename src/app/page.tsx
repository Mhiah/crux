import { connection } from "next/server";
import { PastRuns } from "@/components/past-runs";
import { Runner } from "@/components/runner";
import { listProjects, type ProjectSummary } from "@/lib/store";

export default async function Home() {
  await connection(); // the past-runs list is read per request, never baked in at build time
  let runs: ProjectSummary[] = [];
  let error: string | undefined;
  try {
    runs = await listProjects(20);
  } catch (err) {
    console.error(err);
    error = "Couldn't load past runs. Check the storage settings (SUPABASE_URL / SUPABASE_SECRET_KEY).";
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Crux</h1>
      <p className="mt-1 text-sm text-muted">Forms a thesis, stress-tests it with SERV Reasoning, and shows what changed.</p>
      <Runner>
        <PastRuns runs={runs} error={error} />
      </Runner>
    </main>
  );
}
