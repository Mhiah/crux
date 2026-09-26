import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Workstation } from "@/components/workstation";
import { loadProject } from "@/lib/store";

/** A saved run. Unknown or malformed IDs are a 404; a storage outage is an error, not a 404. */
const load = (id: string) => loadProject(id);

export async function generateMetadata(props: PageProps<"/research/[id]">): Promise<Metadata> {
  const project = await load((await props.params).id);
  return { title: project ? `${project.question} · Crux` : "Not found · Crux" };
}

export default async function ResearchPage(props: PageProps<"/research/[id]">) {
  const project = await load((await props.params).id);
  if (!project) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        ← New question
      </Link>
      <h1 className="mt-4 text-2xl font-semibold leading-snug">{project.question}</h1>
      <p className="mt-1 text-sm text-muted">
        {new Date(project.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC
        {project.mode === "mock" && " · mock run (illustrative fixtures)"}
      </p>
      {project.status === "failed" && (
        <p className="mt-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">This run failed: {project.error}</p>
      )}
      <div className="mt-8">
        <Workstation project={project} />
      </div>
    </main>
  );
}
