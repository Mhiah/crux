import { loadProject } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/research/[id]">) {
  const { id } = await ctx.params;
  try {
    const project = await loadProject(id);
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    return Response.json(project);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Could not load the project." }, { status: 500 });
  }
}
