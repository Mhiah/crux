# Crux S2 — Task tracker

**Scope:** SERV Reasoning V2 + Reppo; preserve the Season 1 dashboard, evidence, PDF export, and reasoning pipeline. No SERV V3 Graph Sharding.

**Development branch:** `feat/s2-reppo-review`. Merge to `main` only after validation.

## Milestones

- [x] **S2-01** Create a dedicated development branch without changing `main`.
- [x] **S2-02** Commit opt-in Reppo evaluation client, evidence trace, review panel and persistence support.
- [x] **S2-03** Require owner authorization for both evaluation submission and verdict lookup. Review feature remains opt-in and disabled by default.
- [x] **S2-04a** Confirm the Reppo submit, verdict lookup and pending-evaluation API paths against public Reppo documentation.
- [x] **S2-04b** GitHub Actions validation passed on commit `62b36a1`: 85 unit tests (including owner-auth denial), typecheck, lint and build. [View checks](https://github.com/Mhiah/crux/actions/runs/41642783506).
- [ ] **S2-05** Set up server-side preview environment: `REPPO_API_KEY`, `CRUX_REVIEW_ACCESS_TOKEN`, `REPPO_REVIEW_ENABLED=1`, and durable storage. Never commit secrets.
  - [x] Owner confirmed `CRUX_REVIEW_ACCESS_TOKEN` saved for S2 Preview (value not verified).
  - [x] Owner installed Redis integration; Vercel screenshot shows `KV_REST_API_URL` and `KV_REST_API_TOKEN` in Preview.
  - [x] Added support for this native Vercel KV REST variable pair in Crux.
  - [x] Screenshot of S2 Preview `/reppo-connect`: Reppo authenticated (HTTP 200); Redis PING succeeded. No evaluation submitted.
  - [x] Owner reports `REPPO_REVIEW_ENABLED=1` saved on the S2 Preview branch; deployment behavior still needs a live verification.
- [x] **S2-06** Executed the non-billable owner-authenticated S2 Preview connection check: Reppo HTTP 200 and Redis PING succeeded (owner-supplied browser result). No evaluation submitted.
- [ ] **S2-07** First live report created and saved. Owner tried submitting an independent review; UI returned generic `Unable to submit to Reppo. Check API access, credits, and logs.` **BLOCKED pending Vercel runtime log inspection and confirmation in Reppo console whether an evaluation was accepted. Do not retry until duplicate/credit risk is resolved.**
- [ ] **S2-08** Implement SERV V2 feedback-driven corrections grounded in the affected claims, with immutable original reports.
- [ ] **S2-09** Version and audit the original verdict, external critique, additional evidence, and revised conclusion.
- [ ] **S2-10** Adjust tagline and integrate evaluation/revision output into the *existing* dashboard. No redesign.
- [ ] **S2-11** Complete regression, live end-to-end tests, demo, review and merge.

## Current task

**S2-07 diagnostic** — In Vercel Preview deployment runtime Logs, locate the `Reppo submission failed:` error for `POST /api/research/[id]/review`. Note the HTTP status or stage, not secret values. Also check Reppo console's evaluation history to avoid duplicate charges. Existing S2 review route hides backend error detail behind 502. Do not re-submit until classified.

**S2-07 controlled test** — Owner reports the Preview-only evaluation flag is configured. Verify the latest Preview deployment, generate one non-sensitive **live** research report, then explicitly opt in before sending it to Reppo. Do not use mock reports or publish private information. Check the returned evaluation ID, settlement and persisted result.

## Next user-owned setup step

Credentials and Redis connectivity have been verified on S2 Preview without exposing secrets. The remaining flag `REPPO_REVIEW_ENABLED=1` is **not yet confirmed**. Keep evaluation submissions disabled until a controlled test is approved. In Vercel, scope the flag to Preview and branch `feat/s2-reppo-review`; new environment variables take effect with a new deployment. Never paste secret values into chat.

## Testing notes

`npm run reppo:check` performs only `GET /api/v1/agents/eval-requests/pending` and **never submits an evaluation or spends credits**. It uses `REPPO_API_KEY` locally (or through the deployment environment) and prints status-only diagnostics. Without an API key, it exits with an explanatory error and cannot verify authentication.

API documentation: https://www.reppofoundation.org/evaluation-api
