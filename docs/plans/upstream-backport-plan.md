# Upstream Backport Plan

**Source**: `ai-coding-project-boilerplate` (`.claude/{agents,commands,skills}-en/`) — the upstream framework Overture derives from.
**Target**: this repository.
**Delivery**: single PR, decomposed into independent commits so review can proceed piecewise and any workstream can be dropped without unwinding the rest.

## Context

The upstream repo is a later generation of the same framework. Almost every gap identified is **wiring, not capability** — the agents we need (`code-verifier`, `security-reviewer`, `integration-test-reviewer`) already exist in `agents/`; they are simply never invoked at the points where upstream invokes them.

Four areas were researched: agents, commands, skills, tooling. Findings below are ordered by value-to-effort, not by research area.

### Explicitly out of scope

Not portable — solve problems specific to an npm-distributed project scaffolder:

- `bin/create-project.js`, `scripts/setup-project.js`, `scripts/post-setup.js` — project scaffolding
- `scripts/update-project.js` — pull-based update for scaffolded projects; Claude Code's marketplace already handles plugin updates
- `scripts/set-language.js` — en/ja language axis; we have no language axis
- `scripts/show-coverage.js`, `scripts/cleanup-test-processes.sh` — we have no test suite

### Preserve — areas where this repo already leads upstream

Do not overwrite these while porting adjacent sections:

- `commands/implement.md` — Scope Change Detection (`scopeDependencies` table with impact/confidence scoring); explicit commit-strategy selection block
- `skills/subagents-orchestration-guide` — quantitative Auto-Stop Triggers (5+ files, same error 3×, 5 cumulative edits); Error-Fixing Impulse Control Protocol; Session Initialization Protocol; File Ownership by Agent table
- `commands/task.md` — `rule-advisor` delegation (upstream uses a static checklist)
- `commands/refine-skill.md` — 3-pass review (addition → critical reduction → diff evaluation)
- `skills/implementation-approach` — per-phase completion-evidence/transition gates and Decision Gate Checklist
- Our own additions with no upstream equivalent: `cleanup-executor`, `codebase-scanner`, `expert-analyst`, `ux-designer`, `brand-system-guide`, `expert-analysis-guide`, `frontend-ai-guide`, `rule-editing-guide`, `type-safety-standards`

---

## Commit 1 — Correctness fixes

Five independent, locally-scoped defects. Highest value-to-effort in the PR; land first so the rest can be dropped without losing these.

### 1.1 Dangling ADR reference

`skills/typescript-testing/SKILL.md:24` — heading reads `### Coverage Requirements (ADR-0002 Compliant)`; line 142 lists `- ADR-0002 Co-location principle`. No ADR-0002 exists anywhere in this repository (verified: `grep -rn "ADR-0002"` returns only these two lines).

**Fix**: remove both citations. Keep the co-location guidance itself, restated as a rule rather than as compliance with a nonexistent document.

### 1.2 MSW v1 syntax

`skills/typescript-testing/SKILL.md:218-222`:

```ts
import { rest } from 'msw'
    return res(ctx.json({ id: '1', name: 'John' } satisfies User))
```

MSW v2 is a breaking API change: `rest` → `http`, `res(ctx.json(x))` → `HttpResponse.json(x)`. Any agent following this skill literally generates code against a removed API.

**Fix**: port upstream's `frontend-typescript-testing/SKILL.md` MSW v2 examples. Same file also uses `fireEvent` (lines 13, 200, 247, 254) where upstream uses `userEvent` + `findBy*` async queries — update together, and add upstream's `useEffect` race/cleanup guidance (AbortController or mounted-flag), which we have nothing on.

### 1.3 Coverage thresholds stated as mandates

`skills/typescript-testing/SKILL.md:19,25,27-31` and `skills/typescript-testing-backend/SKILL.md:20,27,30-34` state hard numbers as **Mandatory** (backend 70% with Services 80% / Controllers 70% / Repositories 60% / Utils 80%; frontend 60% with Atoms 70% / Organisms 60% / Utils 70%).

These are wrong for any consuming project whose CI is configured differently, and they contradict the coverage-as-signal principle stated elsewhere in the same files. Upstream's framing:

> a diagnostic signal for finding untested areas, not a target (a target gets gamed into trivial tests — Goodhart's Law)... any enforced numeric threshold is the project's CI/coverage config, not a goal in itself.

**Fix**: replace mandates with the diagnostic-signal framing; keep the layer breakdown as *where to look first*, not as thresholds to hit.

### 1.4 `update-doc.md` routes frontend docs to the backend designer

`commands/update-doc.md:52,54` route both `docs/design/*.md` and `docs/adr/*.md` to `technical-designer`; lines 71 and 83 hardcode `subagent_type: technical-designer`. A frontend Design Doc is therefore always updated by the backend designer agent.

**Fix**: port upstream's layer-detection step — read the target doc, check for React/component/UI signals, route to `technical-designer-frontend` when matched. Also port upstream's `code-verifier` pre-review step for Design Doc updates (checks literal identifier referential integrity in the updated sections); we currently skip `code-verifier` on updates entirely.

### 1.5 `build.md` picks a work plan without checking layer

`commands/build.md:38` — `ls -la docs/plans/*.md | grep -v template | tail -5`, with no layer check. A frontend build can silently pick up a backend plan.

**Fix**: port upstream's Work Plan Resolution — when `$ARGUMENTS` is empty, infer from task-file mtimes and verify layer via signal markers (target-file globs, Design Doc filename, UI Spec references) before falling back to most-recent. Apply to `commands/front-build.md` as well.

---

## Commit 2 — Post-implementation verification

The largest coverage gap. Quality is currently checked per-task only; neither Design Doc drift nor whole-implementation security posture is ever checked. **No new agents required** — `code-verifier` and `security-reviewer` both exist in `agents/`.

Port upstream's pass into `commands/build.md`, `commands/front-build.md`, `commands/implement.md`:

1. After all tasks commit, run `code-verifier` + `security-reviewer` **in parallel**
2. Normalize both outputs into a unified `requiredFixes[]`
3. Fix cycle, **capped at 2 iterations**; escalate if a cycle makes no progress
4. Pass/fail criteria table: `code-verifier` → `consistent | mostly_consistent` = pass; `security-reviewer` → `approved | approved_with_notes` = pass

Also port into `commands/implement.md` from upstream's version:

- **Security-review fix cycle file-scope union** — the fix task file must union `requiredFixes[].location` into its Target Files, or the executor's file-scope constraint blocks the very fix it was told to make (this becomes load-bearing once Commit 4 lands File Scope Constraint)
- **`requiresTestReview` wiring** — when a task reports `requiresTestReview: true`, run `integration-test-reviewer` between `task-executor` and `quality-fixer`, with a fix-mode loop back to the executor. `integration-test-reviewer` exists in `agents/` and is currently invoked from nowhere in `implement.md`
- **`stub_detected` handling** — explicit loop back to task-executor Fix Mode with `incompleteImplementations[]`

Record the pass/fail criteria and the 2-cycle cap in `skills/subagents-orchestration-guide` so all three commands reference one source.

---

## Commit 3 — Task file lifecycle

`docs/plans/tasks/` accumulates stale files across runs; nothing ever cleans it, and nothing scopes a run to the files it actually owns.

Port upstream's **Consumed Task Set** into `commands/build.md`, `commands/front-build.md`, `commands/implement.md`:

- Compute the exact set of task files this run owns, excluding by pattern: prep, overview (`_overview-*.md`), phase-completion, review-fix, integration-test files
- Use that set consistently for execution, decomposition-trigger logic, and cleanup
- **Final Cleanup** section deleting consumed files after commit, covering all layer-naming patterns (`{plan-name}-{backend,frontend}-task-*.md`, phase-completion files, `_overview-*.md`)

---

## Commit 4 — `task-executor` hardening

Single highest-value file. Upstream's is ~380 lines to our ~294. `CLAUDE.md` already commits to "Mandatory Escalation Triggers"; the current implementation is well short of that commitment.

Apply to `agents/task-executor.md` and `agents/task-executor-frontend.md`:

- **File Scope Constraint** — build an explicit allowed-file list (Target Files + task file + work plan + `Provides:` + Fix-Mode fix-item paths); escalate `out_of_scope_file` before any write outside it. We have no file-scope enforcement today. Must land together with Commit 2's file-scope union, or security fixes get blocked.
- **Fix Mode** (vs Fresh Implementation Mode) — accept `requiredFixes[]` / `incompleteImplementations[]` from an upstream reviewer for a targeted re-run without redoing the whole task or its checkbox loop. Prerequisite for Commit 2's fix cycles.
- **Core Mechanism Preservation Check** (upstream Step 4) — catch "tests pass but the required mechanism was replaced by a weaker substitute"; escalates as `design_compliance_violation`.
- **Exit Gate [BLOCKING]** — re-evaluate the Binding Decision / Reference Contract compliance table before emitting the JSON response, catching drift between planned approach and final implementation.
- **Adjacent Case Sweep** — for bug-fix / regression / state-change / boundary-change tasks only: check sibling cases sharing the same defect class, with 3-way disposition (fold in / escalate as out-of-scope sibling / record for downstream review).
- **Reference Representativeness** — replace "follow existing conventions" with upstream's numeric rule: 3+ files across different directories → adopt; 1-2 → investigate canonical vs legacy; 0 → local convention, requires justification.
- **Escalation contract table** — consolidate to upstream's ~9 types (`design_compliance_violation`, `similar_function_found`, `investigation_target_not_found`, `dependency_version_uncertain`, `binding_decision_violation`, `out_of_scope_file`, `test_environment_not_ready`, `task_file_not_found`, `task_already_completed`, `target_files_missing`) as a compact type → reason → fields → suggested_options table, replacing our 2 formally-defined types with verbose per-type JSON examples.

---

## Commit 5 — Agent output-quality mechanisms

Two mechanical, high-signal ports across many agent files.

### 5.1 `Self-Validation [BLOCKING]`

Present in 8 upstream agents, absent from all of ours (verified: 0 hits repo-wide). Distinct from our existing `Completion Criteria`, which asks "did I do the steps" — this asks "is the output actually correct", with explicit return-and-fix enforcement:

```
## Self-Validation [BLOCKING — before output]
Run each item below before producing the final JSON. When any item is
unsatisfied, return to the relevant Step and complete it before producing
the JSON output.
- [ ] Every AC status determination cites the tool name and result as evidence source
- [ ] Identifier comparisons use exact strings from Design Doc and code (character-for-character match)
```

Apply to: `code-reviewer`, `code-verifier`, `document-reviewer`, `verifier`, `investigator`, `scope-discoverer`, `solver`, `rule-advisor`. Checklist items must be written per-agent against that agent's actual output contract — a copy-pasted generic checklist is worthless.

### 5.2 Test-hollowing `substance` field

`substance: substantive | non_substantive` plus `substanceIssue` (naming exact cause and location) currently exists only in the `task-executor` pair. Upstream also carries it in `code-reviewer` and both `quality-fixer` variants — meaning our `code-reviewer` and `quality-fixer` can accept a fake-passing test as real coverage.

Add to `agents/code-reviewer.md`, `agents/quality-fixer.md`, `agents/quality-fixer-frontend.md`, with upstream's concrete non-substantive examples: `expect(true).toBe(true)`, 0-match test-runner reports, TODO-only bodies.

---

## Commit 6 — Document templates

Largest single content gap, and it strengthens the design → plan → task chain that `subagents-orchestration-guide` already assumes exists.

### `skills/documentation-criteria/references/design-template.md`

Add: **Fact Disposition Table** (one row per analyzer `focusAreas` entry — preserve/transform/remove/out-of-scope with evidence); **Minimal Surface Alternatives** (5-step: Fixed Requirements → Alternatives Compared with defined tiebreak priority → Selected + Rationale → Rejected Alternatives Log — a well-specified anti-overengineering mechanism we have no equivalent of); **Verification Strategy** (Correctness Proof Method, Early Verification Point, Output Comparison for replace/modify features); **Field Propagation Map** with serialized-boundary handling; **Test Boundaries** (Mock Boundary Decisions table + Data Layer Testing Strategy) replacing generic prose placeholders; **Security Considerations** as three prompted questions (authn/authz, input validation, sensitive data) replacing our one-line placeholder.

Keep our existing EARS-format ACs and Change Impact Map / Interface Change Matrix — comparable to upstream.

### `skills/documentation-criteria/references/plan-template.md`

Add: **Design-to-Plan Traceability** (every Design Doc item → covering task, gap-status enforced); **Reference Contract Values** (exact observable values copied verbatim, so tasks are checked against literal contract rather than paraphrase); **Failure Mode Checklist** (9 domain-independent categories — same-value, no-op, empty input, invalid option, missing config, unavailable boundary, shared-state dependency, rollback-only visibility, missing-sort-key ordering — each marked applies/not with covering task); **ADR Bindings**; **Connection Map**.

### `skills/documentation-criteria/references/task-template.md`

Currently a bare TDD Red/Green/Refactor skeleton. Add: **Binding Decisions** (per-task ADR compliance); **Reference Contracts** (verbatim values); **Decisions and Unresolved Items** (resolved-decision log + blocking items with escalation conditions); **Investigation Targets** (files to read before starting); **Change Category** (bug-fix/regression/state-change/boundary-change — this is what triggers Commit 4's Adjacent Case Sweep, so the two must land consistently); **Proof Obligations** (per claim: primary failure mode, boundary exercised, state assertion, mock-boundary rationale, residual).

### `skills/documentation-criteria/references/uxrd-template.md`

Upstream's `ui-spec-template.md` and our `uxrd-template.md` are **different documents, not a rename** — neither subsumes the other. Ours is stronger on microcopy, wireframes, animation. Pull in only upstream's two distinctly better mechanisms: **AC Traceability** (PRD acceptance criteria → screens/elements, with State × Display Matrix and Interaction Definition keyed to AC IDs) and **Existing Component Reuse Map** (reuse/extend/new decisions, preventing duplicate-component drift). Do not replace the document.

### `skills/documentation-criteria/SKILL.md`

Add per-step **Output evidence / Transition** gates to the 4-step Creation Process (upstream requires e.g. "confirmed scale with deciding axis... named source for each existing document" before transitioning). Update the decision matrix per Commit 7.

---

## Commit 7 — Risk-based scale routing

`skills/subagents-orchestration-guide` promises scale escalation on risk, but nothing upstream of it produces a risk signal — `task-analyzer` and `documentation-criteria` both key scale purely off file count (1-2 / 3-5 / 6+).

- **`skills/task-analyzer/SKILL.md`**: adopt upstream's 5-axis scale table (files / observable outcomes / contracts-data / boundaries / decision risk) and emit `scaleRationale.decidingAxis`. Add upstream's Process Gates (Intent / Scale / Selection) with escalation language. Expand task types from our 5 to upstream's 11 (adds migration, operations, security, skill, investigation, each with its own question-focus row).
- **`skills/documentation-criteria/SKILL.md`**: mirror the same axis table — "File count is one scale signal; contract, data, boundary, and decision risk can raise the scale."
- **`skills/subagents-orchestration-guide/SKILL.md`**: consume `decidingAxis` explicitly so the existing escalation language becomes operative.

---

## Commit 8 — Orchestration guide additions

Port into `skills/subagents-orchestration-guide/SKILL.md`, preserving everything listed under *Preserve* above:

- **Delegation Boundary: What vs How** — Bad/Good table (Bad: "Run these checks: 1. lint 2. test"; Good: "Execute all quality checks and fixes"), reducing orchestrator micromanagement
- **Decision precedence** when subagent outputs conflict: (1) user instructions, (2) task files / design artifacts, (3) objective repo state, (4) specialist judgment. We currently have no deterministic conflict-resolution rule.
- **Orchestrator's Permitted Tools** table — explicit allowlist (Agent, AskUserQuestion, TaskCreate/Update, Bash, Read) with all Edit/Write/MultiEdit routed through subagents. We assert this informally but never enumerate it.
- **Post-Implementation Verification pass/fail criteria + 2-cycle cap** (shared with Commit 2)

---

## Commit 9 — New skill: `llm-friendly-context`

Small, self-contained, cross-cutting. Governs clarity of LLM-facing output — prompts, handoffs, generated docs:

- Positive/executable instructions
- Vague-term rewrite table (`optional`, `as needed`, `per convention`, `TBD`, `appropriate`)
- Explicit output-shape specification
- Decomposition of complex asks into checkpointed steps
- Mandatory shape for blocking unresolved items: `Unresolved: <decision> — required input: <x> — escalation: <condition>`
- Handoff Checklist + Generated Artifact Checklist

Consumers: `prd-creator`, `technical-designer(-frontend)`, `work-planner`, `document-reviewer`, and orchestrator commands when constructing subagent prompts — this is what `subagents-orchestration-guide` currently restates informally as its Prompt Construction Rule.

Register in `skills/task-analyzer/references/skills-index.yaml` and the four affected `plugin.json` files.

---

## Commit 10 — New agents: `codebase-analyzer`, `ui-analyzer`

Read-only pre-design fact-gatherers feeding `technical-designer` / `technical-designer-frontend`, replacing today's ad-hoc investigation with a structured "facts you must not contradict" contract.

**`agents/codebase-analyzer.md`** — traces call chains, extracts schema/data-model detail with `file:line` evidence, builds `dataTransformationPipelines` (step-by-step input→output including external/master-table lookups), emits `focusAreas[]` — `fact_id`-anchored disposition targets the designer must explicitly address. Cardinality control: 5-15 entries, priority-ordered above 15. Cross-layer anchor rule: a shared schema referenced from multiple layers anchors to its canonical definition file, so parallel runs converge on the same `fact_id`.

Output contract: `focusAreas`, `dataModel`, `dataTransformationPipelines`, `qualityAssurance` — feeds Commit 6's Fact Disposition Table. **Commits 6 and 10 must land consistently**: the table is unusable without the analyzer, and the analyzer's output has nowhere to go without the table.

**`agents/ui-analyzer.md`** — frontend analog. Distinctive part is External Resource Discovery/Fetch: reads a `project-context` "External Resources > Frontend" section (Design Origin / Design System / Guidelines / Visual Verification Environment with declared access methods — MCP/URL/file/existing-impl-only), fetches each, records `fetch_status` (`fetched | mcp_unavailable | skipped | not_applicable`) per resource so downstream agents distinguish retrieved from assumed. Also emits `candidateWriteSet[]` with confidence levels.

Note: `ui-analyzer`'s external-resource step is only fully useful once `project-context` carries a real External Resources section — see Deferred below. Port the agent with graceful degradation when that section is absent.

Insert both into the orchestration flow before `technical-designer` in `skills/subagents-orchestration-guide` and the relevant commands. Register in the four `plugin.json` files and create symlinks per `CLAUDE.md`'s symlink procedure (`cmd //c "mklink ..."` via a generated `.bat` — Git Bash `ln -s` produces file copies on Windows).

---

## Commit 11 — Deterministic validation tooling

This repository has **zero** deterministic checks. `.github/workflows/claude-code-review.yml` currently asks an LLM to eyeball plugin structure on every PR — a probabilistic call doing what a small script does reliably and free.

Upstream's `scripts/check-skills-index.mjs` is the model: dependency-free Node, regex line-parsing rather than a YAML library, per-item pass/fail reporting, non-zero exit on any failure, and — importantly — **treats "zero items checked" as itself a failure**, guarding against a silently-broken parser producing a false green.

Add `scripts/validate-plugins.mjs` (ESM, `node:fs` only, no `package.json` dependency required):

1. **Registration ↔ disk** — every `agents/*.md`, `commands/*.md`, `skills/*/SKILL.md` is registered in at least one `*/.claude-plugin/plugin.json`; every registration points at a file that exists
2. **Symlink resolution** — every `{backend,frontend,fullstack,gamedev}/{agents,commands,skills}/*` entry resolves (`fs.lstatSync` + `fs.existsSync` on the resolved target), reported per plugin. Directly targets our documented Windows symlink fragility: `mklink` links dangle silently when a shared file is renamed.
3. **Frontmatter validity** — required fields present (agents: `name`, `description`; commands: `description`, `argument-hint`); fixed-field regex extraction, no YAML dependency
4. **Version bump consistency** — `.claude-plugin/marketplace.json` and each touched plugin's `plugin.json` bumped together and exactly once, diffed against `origin/main`. Turns `CLAUDE.md`'s honor-system rule into an enforced gate.
5. **Zero-checked guard** — non-zero exit if any category inspected nothing

Wire into a new `.github/workflows/validate.yml` on push/PR, running alongside (not replacing) the existing LLM review. Leave local hooks out of this PR — introducing husky requires deciding whether this non-npm repo should carry a `package.json` at all, which is a separate call.

---

## Commit 12 — Version bumps

Per `CLAUDE.md`: patch bump in `.claude-plugin/marketplace.json` (always) plus each affected plugin's `plugin.json`. One bump per PR.

| File | Current | New |
|---|---|---|
| `.claude-plugin/marketplace.json` | 0.21.2 | 0.21.3 |
| `backend/.claude-plugin/plugin.json` | 0.18.5 | 0.18.6 |
| `frontend/.claude-plugin/plugin.json` | 0.18.5 | 0.18.6 |
| `fullstack/.claude-plugin/plugin.json` | 0.18.5 | 0.18.6 |
| `gamedev/.claude-plugin/plugin.json` | 0.20.1 | 0.20.2 |

`strategy` and the five expert plugins do not contain the affected files (verified) — do not bump.

Also add `CHANGELOG.md` (Keep a Changelog format) at repo root — we have none, and consumers currently have no way to see what changed before updating.

---

## Deferred — not in this PR

Scope decisions taken during implementation are recorded inline below as **rejected** or **resolved**; the rest remain open.

**Skill-authoring commands moved out of the plugins.** `/create-skill` and `/refine-skill` now live in this repository's `.claude/commands/` rather than shipping in all four plugins. They are meta-work on the marketplace itself, not something a consuming project needs from `backend-overture`. Their `${CLAUDE_PLUGIN_ROOT}/skills/...` loads were rewritten to repo-relative paths, since that variable resolves only for plugin-scoped commands. `/sync-skills` stays in the plugins — a consuming project genuinely needs it. `skill-optimization` and `rule-editing-guide` stay registered: `rule-advisor` can select them for a project writing its own skills, independently of any command.

Each needs a prerequisite decision or a dependency that does not exist yet.

- **`project-context` external-resources hearing protocol** + **`/project-inject` command** — highest ceiling of anything found: our `project-context/SKILL.md` is a static generic placeholder, so every project consuming these plugins effectively skips real customization. But the skill content is inert without the command driving it, and the command is a full interview flow (per-section add/keep/update/remove decisions via AskUserQuestion, rejection of vague/subjective rules in favor of measurable restatement). Needs its own PR.
- **`/prepare-implementation` command** — plan-readiness gate (verifies 5 criteria: Verification Strategy references resolve, E2E preconditions addressed, Phase 1 observability, UI rendering surface exists, local-lane startup documented; generates Phase 0 prep tasks on gaps). Safe no-op design, no new agents, genuinely useful — deferred purely for PR size.
- ~~**`skill-creator` / `skill-reviewer` agent pair**~~ — **rejected, not deferred.** Skill authoring is meta-work on this repository, not something a project consuming `backend-overture` needs. It is also already covered by the separate `plugin-dev` plugin (`plugin-dev:skill-reviewer`, `plugin-dev:agent-creator`, and the `skill-development` / `agent-development` / `plugin-structure` skills). Porting these would mean maintaining two diverging implementations of the same capability.
- **`skill-optimization` upgrade** — upstream has unique finding-IDs, a rewrite-pattern table, a 3-gate flow with defined pass conditions split across `creation-guide.md` / `review-criteria.md`, and a Split Decision rule (>400 lines → extract to `references/`, SKILL.md <250 lines). Still worth doing on its own merits; it no longer depends on the rejected agent pair. Note it now serves the repo-local `/create-skill` and `/refine-skill` rather than any shipped plugin command.
- **Read-only agent tool allowlists** — our `disallowedTools: KillShell, Edit, Write, MultiEdit, NotebookEdit` vs upstream's `tools: Read, Grep, Glob, LS, Bash, ...` allowlist across `investigator`, `verifier`, `code-reviewer`, `security-reviewer`, `design-sync`, `code-verifier`, `scope-discoverer`, `solver`, `rule-advisor`. Note this is **not** a Bash-escape fix — Bash is in upstream's allowlist too, so `echo > file` works identically under both. The real argument is fail-closed behavior: a denylist silently permits any newly-introduced write-capable tool. Worth doing, but it is a cross-cutting frontmatter change across 9 agents and belongs in its own reviewable PR.
- **`review.md` Design-side vs Code-side fix routing** — when a finding reflects a stale Design Doc rather than wrong code, route to `technical-designer(update)` instead of `task-executor`, with a rule table (identifier renames, AC text drift) and an "accept all recommended routes" default. Real behavior change; deferred for size.
- **Multi-layer `add-integration-tests`** — our command declares `Scope: Backend only (acceptance-test-generator supports backend only)`. Verified: neither our nor upstream's `acceptance-test-generator` mentions frontend, yet upstream's command *does* support frontend by classifying Design Docs by filename and routing `task-executor` vs `task-executor-frontend`. So the generator is layer-agnostic enough and our restriction may be stricter than necessary — but confirm before changing.
- **`reverse-engineer` fullstack path** — upstream reuses Phase 1's `scope-discoverer` output in Phase 2 rather than re-running it (ours re-runs, risking drift from PRD unit boundaries) and supports sequential backend→frontend Design Doc generation. Upstream also deliberately **omits** `code_paths` from `code-verifier` calls to keep verification independent of `scope-discoverer`'s output; we pass it explicitly, weakening that independence.
- **`create-plan.md` work-plan review** — upstream adds a `document-reviewer` pass on the plan (traceability to Design Doc, early-verification placement, Failure Mode Checklist, Review Scope) with a revision loop before user approval. We go straight from `work-planner` to approval with no review pass — a real quality gate gap, but it depends on Commit 6's plan-template landing first to have anything to review against.
- **`investigator` / `verifier` path-tracing model** — upstream builds a `pathMap` (trigger → paths → nodes with hierarchical IDs) and requires checking every node on every mapped path; `verifier` then checks `pathMapCoverage` / `missingPaths` / `uncheckedNodes`. Our hypothesis-enumeration model ("minimum 2 hypotheses") can stop at the first plausible cause. Not strictly better — hypothesis enumeration is simpler to reason about — but node-exhaustiveness is a stronger guarantee against tunnel vision. Portable as an additional required section rather than a rewrite.
- ~~**`skills-index.yaml` duplication**~~ — **resolved.** `skills/skills-index.yaml` was an orphan: added in an earlier backport, never registered in a `plugin.json`, never symlinked into a plugin, and therefore never delivered to any consumer, while drifting to a different schema. Deleted; its four missing entries were merged into the shipped copy at `skills/task-analyzer/references/skills-index.yaml`, and the dangling reference in `setup-context.md` now points at the project-local path `/sync-skills` generates.
- **Prerequisite Detection pattern** — present in nearly every upstream implementation-facing skill, absent from all of ours: "inspect tsconfig/package.json/lockfile/CI before applying a rule; treat a tool/convention as observed only when repo evidence names it; label conclusions as inferred; stop and name the exact evidence needed when a competing convention affects a public contract." This is what lets a skill self-calibrate instead of asserting fixed conventions (Vitest, Biome, NestJS) that not every consuming project has. Since it is a repeated boilerplate block across ~8 files, extract it once as a named micro-pattern rather than copy-pasting — that design decision is why it is deferred rather than folded into Commit 1.
- **De-absolutize `typescript-rules`** — "Absolute Rule: any type is completely prohibited" and "Error suppression prohibited" vs upstream's graduated framing (`unknown` + type guards as default; assertions as documented last resort "only when a runtime/framework invariant proves the asserted type"; "every failure has one owning outcome" rather than blanket prohibition). Ours violates our own `skill-optimization` BP-001 (negative → positive rewrite) here.
- **RSC / server-client boundary rule** — upstream's `frontend-typescript-rules` scopes it explicitly ("default to server components for data fetching, isolate interactivity behind `"use client"` at smallest scope... N/A for client-only SPAs — skip when no server-component runtime"). We have nothing on RSC despite shipping a `nextjs-developer` plugin.
- **`sync-skills` plugin-vs-local merge** — upstream discovers skills from plugin-provided (read-only baseline) and project-local sources, merging with local-wins-on-collision and a `source: plugin|local` tag per index entry. Relevant in principle to our shared-vs-per-plugin skill structure, but the directory shape differs enough to need design work.
- **Local pre-commit hook** — gated on the `package.json` decision noted in Commit 11.

## Execution order

Commits 1, 3, 5, 9, 11 are independent — any can land or be dropped alone.

Dependencies:

- **2 → 4**: post-implementation fix cycles need `task-executor` Fix Mode; File Scope Constraint needs Commit 2's file-scope union, or security fixes get blocked by the constraint they triggered
- **6 ↔ 10**: Fact Disposition Table and `codebase-analyzer` are useless apart
- **6 → 4**: task-template's Change Category is what triggers Adjacent Case Sweep
- **7 → 8**: `decidingAxis` must be produced before the guide can consume it
- **12 last**: version bumps after all content changes

## Verification

No test suite exists, so verification is structural:

1. `node scripts/validate-plugins.mjs` (Commit 11) passes — registration, symlinks, frontmatter, version bumps
2. Every symlink in `{backend,frontend,fullstack,gamedev}/{agents,commands,skills}/` resolves after new files are added
3. `grep -rn "ADR-0002" skills/` returns nothing
4. `grep -rn "from 'msw'" skills/` shows no v1 `rest` import
5. New agents (`codebase-analyzer`, `ui-analyzer`) and skill (`llm-friendly-context`) appear in all four affected `plugin.json` files and in `skills/task-analyzer/references/skills-index.yaml`
6. Manual smoke: run `/implement` on a trivial change and confirm the post-implementation verification pass fires and task files are cleaned up
