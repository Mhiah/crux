# Crux

**AI research that stress tests its own conclusions.**

Using SERV Reasoning, Crux forms a thesis, stress tests it against the evidence and audits it. Ask a hard market or strategy question and Crux researches it, commits to a first answer, stress tests it like a skeptical investor would, and shows you exactly what changed and why, with every fact traceable to the exact words in its source.

```
Question → Research → Thesis → Stress test → Re-evaluate → Conclusion → What changed + Audit trail
```

## What it does

1. **Researches** the question on the web (Tavily). SERV plans two sets of searches: ones looking for evidence that the answer is yes, and ones hunting for evidence that it's no (failures, low adoption, critics, costs, regulation).
2. **Extracts facts with proof.** SERV pulls out specific, checkable facts, and each one must quote the exact words from its source. Crux checks every quote against the source text and drops facts it can't find.
3. **Forms a first answer** (the thesis) and names the assumptions it depends on.
4. **Stress tests it:** SERV looks for weak assumptions, contradicting evidence, alternative explanations, risks and missing evidence.
5. **Re-evaluates** each assumption: supported, weakened, contradicted or unresolved.
6. **Concludes** with the best-supported answer, its confidence, what remains uncertain, and cheap next steps to find out.
7. **Shows what changed** between the first answer and the final one, and why.

## Using it

- **Ask a question** on the home page. For a demo, the example question is shown faintly in the box: press **→** (or Tab) on a computer, or tap the box on a phone, to fill it in.
- **Read the report** in three views:
  - **Answer:** the conclusion, what changed and why, next steps, and what's still uncertain.
  - **Reasoning:** the first answer, the stress test (most serious challenges first), and every assumption with its verdict.
  - **Evidence:** every fact with its source quote, the fact-check summary, and the sources labelled by type.
- **Follow the proof:** anything backed by facts has an **Evidence** link that opens just those facts. Each fact's **Where it's used** button shows the audit trail.
- **Download** the report as a PDF, straight to your device.
- Switch **light / dark** with the toggle at the top right. The **Home** button at the bottom right returns to the start.

## Running it

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
cp .env.example .env.local   # then add SERV_API_KEY and TAVILY_API_KEY
npm run dev                  # open http://localhost:3000
```

**Mock mode** runs the whole app on built-in sample data, with no SERV or Tavily calls and no cost. It's used automatically when the keys are missing, or you can force it:

```bash
CRUX_MOCK=1 npm run dev                    # macOS / Linux
$env:CRUX_MOCK="1"; npm run dev            # Windows PowerShell
```

Mock runs always show the same sample report (about AI bookkeeping for Nigerian SMEs), whatever you ask, and are labelled as mock.

**Live mode** uses your keys. Each question makes about 6 SERV calls and 8 Tavily searches and takes 1 to 2 minutes. On Windows, clear mock mode first with `Remove-Item Env:CRUX_MOCK`, or open a new PowerShell window.

**On a phone:** keep the app running on your computer, connect the phone to the same Wi-Fi, and open the **Network** address that `npm run dev` prints (for example `http://192.168.0.3:3000`).

Other commands:

```bash
npm run research -- "Should we launch an AI bookkeeping SaaS for Nigerian SMEs?"   # run from the terminal
npm test            # unit tests
npm run typecheck
npm run lint
npm run build
```

## How it works

- **SERV Reasoning** (`src/lib/reasoning/serv.ts`) is OpenAI-compatible. Every reasoning step is a chat completion with a strict JSON schema and SERV's `serv_prompt_guard`, because the stages read untrusted web text. The guard sometimes blocks harmless requests, so a block (a refusal that used no tokens) is retried up to twice; a refusal from the model itself is not. `SERV_SHADOW_AGENT=1` adds SERV's shadow-agent check on each stage.
- **Balanced research** (`src/lib/research/collect.ts`): SERV writes 2 to 4 supporting and 3 to 4 challenging searches, which run interleaved. Sources are picked search by search in turn, so the challenging searches' results aren't crowded out, and weak sources only fill spare slots. If no evidence against the answer survives, the later stages are told it's a gap in the research, not confirmation, and the Evidence view says so.
- **Fact check** (`src/lib/research/verify.ts`, plain code, no extra calls): a source only backs a fact if the fact's quote is found in that source's text. Facts with no quote found are dropped, and figures a fact states that its quote doesn't contain are flagged and passed on as unverified.
- **Source quality** (`src/lib/research/sources.ts`): sources are labelled research, government / official, industry report, news, reference, company / blog, or social / forum. Known sites are recognised by address; for anything else, SERV labels the publisher while it extracts facts. Social posts and sources over three years old are flagged as weak.
- **Stages** (`src/lib/reasoning/stages.ts`) cite records by ID (sources `S1`, facts `C1`, assumptions `A1`, challenges `X1`). Every citation is checked and unknown IDs are removed, so an audit-trail link never dangles. The reading views hide the IDs and turn them into Evidence links (`src/lib/plain.ts`).
- **What changed** is assembled from the recorded stages, not generated, so each line is what the reasoning actually said.
- **API:** `POST /api/research` with `{ "question": "…" }` streams the pipeline as NDJSON; `GET /api/research/:id` returns a saved run. Runs are saved as JSON in `.data/projects/` on the machine running the app, and reopen at `/research/:id`.
- **PDF** (`src/components/report-pdf.tsx`) is built in the browser with react-pdf. Inter is embedded (SIL Open Font License) because the standard PDF fonts can't draw ₦.

## Project map

| Path | What's there |
|---|---|
| `src/app/` | Pages: landing and live results (`page.tsx`), saved reports (`research/[id]`), the API routes |
| `src/components/` | Report views (`workstation.tsx`), PDF (`report-pdf.tsx`), audit-trail panel (`refs.tsx`), logo (`brand.tsx`), header, theme toggle |
| `src/lib/pipeline.ts` | Runs the stages in order and records the audit trail |
| `src/lib/reasoning/` | SERV client, prompts, strict schemas, stages |
| `src/lib/research/` | Search, source selection, fact checking, source labels |
| `src/lib/mock/` | Sample data for mock mode |
| `tests/` | Unit tests (Vitest) |

## Status

| Phase | | Status |
|---|---|---|
| 1 | Reasoning engine: research, thesis, stress test, re-evaluation, conclusion | ✅ |
| 2 | Evidence layer: fact-checked claims, source quality, balanced research | ✅ |
| 3 | Product UI: landing page and results in Answer / Reasoning / Evidence views | ✅ |
| 4 | What changed: first answer vs final, with the reasons and evidence behind each change | ✅ |
| 5 | Audit trail: from the answer to the reasoning, facts, quotes and sources | ✅ |
| 6 | Demo polish: branding, light / dark, PDF download, mobile, one-tap demo question | ✅ |
