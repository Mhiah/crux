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
  - [ ] Enable `REPPO_REVIEW_ENABLED=1` only when secure evaluation testing is ready.
- [x] **S2-06** Executed the non-billable owner-authenticated S2 Preview connection check: Reppo HTTP 200 and Redis PING succeeded (owner-supplied browser result). No evaluation submitted.
- [ ] **S2-07** With the owner's approval, submit one non-sensitive live report, retrieve the settled verdict and verify persistence, error handling and rate limits.
- [ ] **S2-08** Implement SERV V2 feedback-driven corrections grounded in the affected claims, with immutable original reports.
- [ ] **S2-09** Version and audit the original verdict, external critique, additional evidence, and revised conclusion.
- [ ] **S2-10** Adjust tagline and integrate evaluation/revision output into the *existing* dashboard. No redesign.
- [ ] **S2-11** Complete regression, live end-to-end tests, demo, review and merge.

## Current task

**S2-05 / S2-07 preparation** — Connection verified. Next, confirm the evaluation submission protections and enable `REPPO_REVIEW_ENABLED=1` on the S2 Preview branch only; redeploy, then run one explicitly approved non-sensitive evaluation to validate the full submit/settle/read flow.

## Next user-owned setup step

Credentials and Redis connectivity have been verified on S2 Preview without exposing secrets. The remaining flag `REPPO_REVIEW_ENABLED=1` is **not yet confirmed**. Keep evaluation submissions disabled until a controlled test is approved. In Vercel, scope the flag to Preview and branch `feat/s2-reppo-review`; new environment variables take effect with a new deployment. Never paste secret values into chat.

## Testing notes

`npm run reppo:check` performs only `GET /api/v1/agents/eval-requests/pending` and **never submits an evaluation or spends credits**. It uses `REPPO_API_KEY` locally (or through the deployment environment) and prints status-only diagnostics. Without an API key, it exits with an explanatory error and cannot verify authentication.

API documentation: https://www.reppofoundation.org/evaluation-api
