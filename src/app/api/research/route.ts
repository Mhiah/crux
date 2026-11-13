import { runResearch } from "@/lib/pipeline";
import { MockReasoning, MockSearch } from "@/lib/mock/providers";
import { getProviders } from "@/lib/providers";
import { takeAllowance } from "@/lib/reppo/limits";
import { saveProject, storageAvailable } from "@/lib/store";

// A full run makes six SERV calls plus searches; allow well over the default limit.
export const maxDuration = 300;

/** Runs the pipeline and streams PipelineEvents as NDJSON, one event per line. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (question.length < 10 || question.length > 500) {
    return Response.json({ error: "Ask a research question between 10 and 500 characters." }, { status: 400 });
  }
  const providers = getProviders();
  // Live runs spend SERV and Tavily credits, so they count against the daily allowances.
  if (providers.reasoning.mode === "live" || providers.search.mode === "live") {
    const limited = await takeAllowance(req, "research");
    if (limited) return Response.json({ error: limited }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runResearch(question, {
          ...providers,
          save: storageAvailable ? saveProject : undefined,
          fallback: { reasoning: new MockReasoning(), search: new MockSearch() },
          onEvent: (event) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
