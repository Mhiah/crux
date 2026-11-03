# Crux S2 — Task tracker

**Scope:** SERV Reasoning V2 + Reppo; preserve the Season 1 dashboard, evidence, PDF export, and reasoning pipeline. No SERV V3 Graph Sharding.

**Development branch:** `feat/s2-reppo-review`. Merge to `main` only after validation.

## Milestones

- [x] **S2-01** Create a dedicated development branch without changing `main`.
- [x] **S2-02** Commit opt-in Reppo evaluation client, evidence trace, review panel and persistence support.
- [x] **S2-03** Require owner authorization for both evaluation submission and verdict lookup. Review feature remains opt-in and disabled by default.
- [x] **S2-04a** Confirm the Reppo submit, verdict lookup and pending-evaluation API paths against public Reppo documentation.
- [ ] **S2-04b** Execute automated tests: unit tests, type checking, lint, build, and 401/403 denial checks.
- [ ] **S2-05** Set up server-side preview environment: `REPPO_API_KEY`, `CRUX_REVIEW_ACCESS_TOKEN`, `REPPO_REVIEW_ENABLED=1`, and durable storage. Never commit secrets.
- [ ] **S2-06** Execute non-billable authenticated Reppo connection check (`npm run reppo:check`) and record HTTP status only.
- [ ] **S2-07** With the owner's approval, submit one non-sensitive live report, retrieve the settled verdict and verify persistence, error handling and rate limits.
- [ ] **S2-08** Implement SERV V2 feedback-driven corrections grounded in the affected claims, with immutable original reports.
- [ ] **S2-09** Version and audit the original verdict, external critique, additional evidence, and revised conclusion.
- [ ] **S2-10** Adjust tagline and integrate evaluation/revision output into the *existing* dashboard. No redesign.
- [ ] **S2-11** Complete regression, live end-to-end tests, demo, review and merge.

## Current task

**S2-04b** — Run security and API unit tests. The endpoint protection code has been committed, but these checks still need to pass.

## Next user-owned setup step

Configure credentials and storage privately in Vercel **Preview**, not here in chat. The auth key is a separate 24+ character random secret. `REPPO_API_KEY` stays server-side. Public submission must remain disabled until rate limiting, durable storage and per-user billing safeguards are added.

## Testing notes

`npm run reppo:check` performs only `GET /api/v1/agents/eval-requests/pending` and **never submits an evaluation or spends credits**. It uses `REPPO_API_KEY` locally (or through the deployment environment) and prints status-only diagnostics. Without an API key, it exits with an explanatory error and cannot verify authentication.

API documentation: https://www.reppofoundation.org/evaluation-api
