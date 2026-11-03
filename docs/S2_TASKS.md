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
- [ ] **S2-07** A live report was saved and its no-charge preflight succeeded. First submission returned HTTP 400 (missing `criteria`); Reppo console showed no evaluations at the time checked. Fixed request shape to include 5 review criteria (string array) in the S2 branch. **Next: check CI and Preview deployment, rerun preflight and confirm 5 criteria before any new paid submission.**
- [ ] **S2-08** Implement SERV V2 feedback-driven corrections grounded in the affected claims, with immutable original reports.
- [ ] **S2-09** Version and audit the original verdict, external critique, additional evidence, and revised conclusion.
- [ ] **S2-10** Adjust tagline and integrate evaluation/revision output into the *existing* dashboard. No redesign.
- [ ] **S2-11** Complete regression, live end-to-end tests, demo, review and merge.

## Current task

**S2-07.3 preflight — passed:** Owner reports the fresh Preview page displays `Criteria included: 5`. This is local validation only; no Reppo evaluation was submitted by the check. **Next: S2-07.4 — one consented real submission and confirmation of evaluation ID/pending status; may consume a credit.**

**S2-07: Fix Reppo submission validation.** The latest Reppo error was `HTTP 400: criteria: Required`. The initial payload omitted the `criteria` field; the deployed gateway expects it as an array of 1–10 strings. We added five Crux-specific criteria (citation support, counter-evidence, reasoning consistency, calibrated confidence, validation steps) to the request builder, with unit tests. The existing no-charge preflight now displays the criteria count. No live Reppo submission was performed by this code change.

**Next:** Check green CI and Ready Preview for the latest commit. Open the *existing saved report*, enter the owner review key, click **Check request (no charge)** and confirm **Criteria included: 5**. Only then attempt one consented review after reviewing the potential credit charge. Do not create another research report solely to test the request shape.

## Next user-owned setup step

Reppo authentication and Redis PING passed in S2 Preview. The owner configured the evaluation flag and personally initiated a test submission, which returned HTTP 400: criteria missing. Validate the new criteria-bearing payload using no-charge preflight before retrying. Never paste keys into chat; use the existing saved report.

## Testing notes

`npm run reppo:check` performs only `GET /api/v1/agents/eval-requests/pending` and **never submits an evaluation or spends credits**. It uses `REPPO_API_KEY` locally (or through the deployment environment) and prints status-only diagnostics. Without an API key, it exits with an explanatory error and cannot verify authentication.

API documentation: https://www.reppofoundation.org/evaluation-api
