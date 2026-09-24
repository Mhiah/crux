# Crux

An AI research engine that forms a thesis, stress-tests it with **SERV Reasoning**, re-evaluates the evidence, and shows exactly how it reached its conclusion.

```
Question → Research → Thesis → Stress Test → Re-evaluate → Conclusion → What Changed? + Audit Trail
```

## Status

**Phase 1: reasoning engine.** The full pipeline runs end to end, with each stage streamed and recorded in an audit trail. The UI at `/` is a bare harness that shows raw stage output. The research workstation comes in Phase 3.

| Phase | | Status |
|---|---|---|
| 1 | Reasoning engine: research → thesis → stress test → re-evaluation → conclusion | ✅ |
| 2 | Evidence layer: Supabase storage, richer claim extraction and source metadata | — |
| 3 | Product UI: research workstation with stage panels and streaming | — |
| 4 | What Changed: initial-vs-final comparison linked to evidence | data ✅, UI — |
| 5 | Audit trail: conclusion → reasoning → claim → evidence → source | data ✅, UI — |
| 6 | Demo polish | — |

## Running it

```bash
npm install
cp .env.example .env.local   # add SERV_API_KEY and TAVILY_API_KEY for live runs
npm run dev                  # http://localhost:3000
npm run research -- "Should we launch an AI bookkeeping SaaS for Nigerian SMEs?"   # CLI
npm test
npm run typecheck
```

Without API keys, everything runs on **mock fixtures** built around the plan's example question. Mock runs are labelled as such in the UI and CLI, and every mock source lives on `example.org`.

## How it works

- **SERV Reasoning** (`src/lib/reasoning/serv.ts`) is OpenAI-compatible. Every reasoning step is a chat completion with a strict JSON schema and SERV's server-side `serv_prompt_guard` (the stages read untrusted web excerpts). `SERV_SHADOW_AGENT=1` adds SERV's shadow-agent check on each stage.
- **Research** (`src/lib/research/collect.ts`): SERV plans the search queries, including ones aimed at evidence *against* the obvious answer. Tavily runs them, results are deduped into sources `S1…`, and SERV extracts claims `C1…`, each tied to its sources.
- **Stages** (`src/lib/reasoning/stages.ts`): each stage cites records by ID: assumptions `A1…`, challenges `X1…`. The pipeline checks every citation, strips IDs that don't exist and logs a warning, so an audit-trail link can never dangle. Re-evaluation must judge every assumption; any it skips are marked `unresolved`.
- **What Changed?** is *assembled* from the recorded stages, not generated, so each line is what the reasoning actually said, linked to its claims and challenges.
- **API**: `POST /api/research` `{ question }` streams `PipelineEvent`s as NDJSON. `GET /api/research/:id` returns a saved project. Phase 1 stores projects as JSON in `.data/projects/`.

Code map: `src/lib/types.ts` (data model) · `src/lib/pipeline.ts` (orchestration) · `src/lib/reasoning/{prompts,schemas}.ts` (stage contracts) · `src/lib/mock/` (fixtures).
