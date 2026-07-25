# Changelog

All notable changes to this marketplace are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the plugins adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions below are the marketplace version; affected plugin versions are noted
per entry.

## [0.21.2] — 2026-07-26

Backport of patterns from the upstream `ai-coding-project-boilerplate` framework,
plus removal of the sequential-thinking MCP. Affects `backend-overture` 0.18.5,
`frontend-overture` 0.18.5, `fullstack-overture` 0.18.5, `gamedev-overture`
0.20.1, `strategy-overture` 0.20.2.

### Removed

- `sequential-thinking` MCP server from all plugins: dropped from every `.mcp.json`, from plugin descriptions, and from the agent prompts that referenced it (`task-executor`, `task-executor-frontend`, `ux-designer`, and the four strategy agents). `strategy/.mcp.json` is removed entirely, having held no other server.

### Fixed

- `typescript-testing`: removed citations of ADR-0002, which does not exist in this repository
- `typescript-testing`: migrated MSW v1 syntax (`rest` / `res(ctx.json)`) to v2 (`http` / `HttpResponse.json`); the v1 API was removed upstream, so agents following the skill generated code against a deleted API
- `typescript-testing`: replaced `fireEvent` with `userEvent` and `findBy*` async queries
- `typescript-testing`, `typescript-testing-backend`: coverage thresholds were stated as mandates (70%/80%/60%), which is wrong for projects whose CI differs and contradicted the coverage-as-signal principle stated in the same files
- `update-doc`: frontend Design Docs and ADRs were always routed to `technical-designer`; now layer-detected and routed to `technical-designer-frontend`
- `build`, `front-build`: work-plan auto-resolution had no layer check, so a frontend build could silently consume a backend plan
- `skills/rule-editing-guide` was registered in no `plugin.json` despite being referenced by `create-skill` and `refine-skill`, so it could never load
- `backend/skills/typescript-rules-backend`, `backend/skills/typescript-testing-backend`, and `create-plan.md` in three plugins were file copies rather than symlinks, silently blocking propagation of shared-file edits

### Added

- **Post-implementation verification**: `code-verifier` and `security-reviewer` now run in parallel after all tasks complete, with unified `requiredFixes[]` normalization and a 2-cycle fix cap. Quality was previously checked per-task only, so Design Doc drift and whole-changeset security posture were never verified.
- **Consumed Task Set and Final Cleanup**: runs are scoped to the task files they own and delete them after commit; `docs/plans/tasks/` previously accumulated stale files
- **`task-executor` hardening**: File Scope Constraint, Fix Mode, Core Mechanism Preservation Check, Adjacent Case Sweep, Binding Decision and Reference Contract checks with a blocking Exit Gate, Reference Representativeness file-count rule, and an escalation contract table covering 9 types
- **`Self-Validation [BLOCKING]`** sections in `code-reviewer`, `code-verifier`, `document-reviewer`, `verifier`, `investigator`, `scope-discoverer`, `solver`, `rule-advisor`
- **Test-substance assessment** in `code-reviewer`, `quality-fixer`, `quality-fixer-frontend`, and the task executors: a green run with no substantive assertion is no longer creditable as coverage
- **Document templates**: Fact Disposition Table, Minimal Surface Alternatives, Verification Strategy, and Test Boundaries in the design template; Design-to-Plan Traceability, Reference Contract Values, Failure Mode Checklist, ADR Bindings, and Connection Map in the plan template; Binding Decisions, Change Category, Proof Obligations, and Investigation Targets in the task template; AC Traceability and Existing Component Reuse Map in the UXRD template
- **Risk-based scale routing**: `task-analyzer` evaluates five axes (files, observable outcomes, contracts/data, boundaries, decision risk) and reports `scaleRationale.decidingAxis`; scale no longer keys off file count alone
- **`llm-friendly-context` skill**: clarity rules for LLM-facing prompts, handoffs, and generated artifacts
- **`codebase-analyzer` and `ui-analyzer` agents**: read-only pre-design fact gathering producing `fact_id`-anchored focus areas; `ui-analyzer` records per-resource `fetch_status` so assumed facts stay distinguishable from fetched ones
- **Work-plan review**: `create-plan` runs `document-reviewer` on the plan with a revision loop before user approval
- **Orchestration guide**: delegation boundary (what vs how), decision precedence for conflicting subagent outputs, and an explicit orchestrator tool allowlist
- **`scripts/validate-plugins.mjs` and CI**: deterministic checks for registration, symlink resolution, frontmatter validity, and paired version bumps; a check that inspects zero items fails rather than reporting green
