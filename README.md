# Crux

An AI research engine that forms a thesis, stress-tests it with **SERV Reasoning**, re-evaluates the evidence, and shows exactly how it reached its conclusion.

```
Question → Research → Thesis → Stress Test → Re-evaluate → Conclusion → What Changed? + Audit Trail
```

## Status

**Phases 1 and 3: reasoning engine and research workstation.** The full pipeline runs end to end. At `/` you ask a question and the report fills in stage by stage; `/research/:id` reopens a saved run. Every record ID in the report (S3, C7, A2, X1), including IDs SERV cites inline, opens its audit trail: what it rests on and what relies on it.

| Phase | | Status |
|---|---|---|
| 1 | Reasoning engine: research → thesis → stress test → re-evaluation → conclusion | ✅ |
| 2 | Evidence layer: Supabase storage, richer claim extraction and source metadata | — |
| 3 | Product UI: research workstation with stage panels and streaming | ✅ |
| 4 | What Changed: initial-vs-final comparison linked to evidence | ✅ |
| 5 | Audit trail: conclusion → reasoning → claim → evidence → source | ✅ |
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

- **SERV Reasoning** (`src/lib/reasoning/serv.ts`) is OpenAI-compatible. Every reasoning step is a chat completion with a strict JSON schema and SERV's server-side `serv_prompt_guard` (the stages read untrusted web excerpts). `SERV_SHADOW_AGENT=1` adds SERV's shadow-agent check on each stage. The guard intermittently blocks harmless requests, so a block (a refusal that used no tokens) is retried up to twice; a refusal from the model itself is not.
- **Research** (`src/lib/research/collect.ts`): SERV plans the search queries, including ones aimed at evidence *against* the obvious answer. Tavily runs them, results are deduped into sources `S1…`, and SERV extracts claims `C1…`, each tied to its sources.
- **Stages** (`src/lib/reasoning/stages.ts`): each stage cites records by ID: assumptions `A1…`, challenges `X1…`. The pipeline checks every citation, strips IDs that don't exist and logs a warning, so an audit-trail link can never dangle. Re-evaluation must judge every assumption; any it skips are marked `unresolved`.
- **What Changed?** is *assembled* from the recorded stages, not generated, so each line is what the reasoning actually said, linked to its claims and challenges.
- **API**: `POST /api/research` `{ question }` streams `PipelineEvent`s as NDJSON. `GET /api/research/:id` returns a saved project. Phase 1 stores projects as JSON in `.data/projects/`.

Code map: `src/components/workstation.tsx` (report UI) · `src/components/refs.tsx` (ID chips and audit-trail panel) · `src/lib/types.ts` (data model) · `src/lib/pipeline.ts` (orchestration) · `src/lib/reasoning/{prompts,schemas}.ts` (stage contracts) · `src/lib/mock/` (fixtures).
