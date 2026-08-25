# engineering-test

Eurocamp fullstack engineering test. Three independent applications:

- `apps/engineering/` — the supplied API. **Left exactly as delivered.** It
  injects failures on purpose; that behaviour is the exercise. Findings about
  its defects are recorded in `NOTES.md` rather than patched.
- `apps/bff/` — Nest BFF owning resilience, validation and caching.
- `apps/web/` — Next frontend.

Design decisions, the database review and the API findings live in `NOTES.md`.
Architecture diagrams live in `docs/architecture.md`.

## Agent skills

### Issue tracker

GitHub Issues via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context — `docs/adr/` at the repo root; no `CONTEXT.md` by design.
See `docs/agents/domain.md`.
