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

### Changed

- **Explicit gates between phases.** Each phase now opens with an Entry Gate and closes with an Exit Gate, both `[BLOCKING]`, matching the `Exit Gate [BLOCKING]` convention already used by `task-executor`. Every handoff is checked from both sides: the producing phase confirms it produced the payload, the consuming phase confirms it arrived. Checking once from one side is how a missing artifact gets noticed three steps later, by which point it is already encoded in a design or in committed code.

  Each exit gate carries a **handoff payload table** listing concrete paths rather than a summary — a PRD path or an explicit "not required at this scale", never silence. A gate failure stops the flow and names the unmet item and the phase that produces it; substituting a plausible assumption for a missing input is explicitly not allowed. Gates are distinct from stop points: a stop point asks the user to decide, a gate checks that work is complete, and a phase can pass every stop point while still failing its exit gate.

- **The ADR now follows the Design Doc, and is rare.** Which decisions are genuinely architecture-binding is only visible once the design exists; writing the ADR first meant committing before understanding. The design now surfaces the decision and the ADR extracts it, so it outlives the feature that produced it.

  The trigger conditions were also replaced. The old list — nested contracts three levels deep, a function used in three places, three states, five async calls, any library introduction — fired on almost every change, and a decision log written for every change stops being read. An ADR now requires all three of: costly to reverse, binding beyond this feature, and taken against real alternatives. Fail any one and the reasoning belongs in the Design Doc, whose Minimal Surface Alternatives section already records what was compared and why.

- **Planning moved from the technical phase to execution.** `workflow-technical` now ends at Design Doc approval; `workflow-execution` owns work plan creation, plan review, commit-strategy selection, batch approval, and task decomposition before entering the loop. A plan is a schedule for doing the work rather than a statement of what the work is, and batch approval — the authority boundary — gates the plan, so both belong with execution. This also moves the one remaining domain difference (the planner agent) out of the technical phase, leaving it identical for every domain. Decomposition runs after batch approval: it produces working state rather than a document under review, and re-decomposing is cheap where re-approving is not.

- **The ADR now follows the Design Doc, and is rare.** Which decisions are genuinely architecture-binding is only visible once the design exists; writing the ADR first meant committing before understanding. The design now surfaces the decision and the ADR extracts it, so it outlives the feature that produced it.

  The trigger conditions were also replaced. The old list — nested contracts three levels deep, a function used in three places, three states, five async calls, any library introduction — fired on almost every change, and a decision log written for every change stops being read. An ADR now requires all three of: costly to reverse, binding beyond this feature, and taken against real alternatives. Fail any one and the reasoning belongs in the Design Doc, whose Minimal Surface Alternatives section already records what was compared and why.

- **Planning moved from the technical phase to execution.** `workflow-technical` now ends at Design Doc approval; `workflow-execution` owns work plan creation, plan review, commit-strategy selection, batch approval, and task decomposition before entering the loop. A plan is a schedule for doing the work rather than a statement of what the work is, and batch approval — the authority boundary — gates the plan, so both belong with execution. This also moves the one remaining domain difference (the planner agent) out of the technical phase, leaving it identical for every domain. Decomposition runs after batch approval: it produces working state rather than a document under review, and re-decomposing is cheap where re-approving is not.

- **Workflow split into phases, and gamedev brought back onto the shared technical phase.** `workflow-orchestration` now holds only the mechanics every phase needs — agent invocation, response contracts, delegation boundary, conflict precedence, file ownership, TodoWrite. The flows moved into `workflow-product` (requirements → PRD → UXRD) and `workflow-technical` (ADR → fact gathering → Design Doc → test skeletons → work plan → batch approval), with `workflow-execution` continuing to own the autonomous loop.

  Comparing gamedev against the shared guide showed its technical half had not diverged by design — it had fallen behind. It lacked `codebase-analyzer` and therefore had no `focusAreas` to fill the Fact Disposition Table it already contained, and it was missing the ADR review stop, the expert-analyst step, the work plan review, `code-verifier` in post-implementation verification, the 2-cycle fix cap, and Final Cleanup. Only three of seventeen sections matched the shared guide verbatim, and four more matched at 88-91%, which is drift rather than specialization. The one genuine difference was the planner agent.

  `workflow-technical` is therefore parameterized by planner (`work-planner` or `gamedev-work-planner`) and used unchanged by both, and `workflow-gamedev` keeps only what is actually game-specific: scenario detection, development modes, the game agent roster, and the design disciplines preceding technical design. It shrank from 651 to 135 lines and now loads the shared mechanics it previously duplicated.

- **Workflow skills renamed to one scheme.** `subagents-orchestration-guide` → `workflow-orchestration`, `subagents-gamedev-orchestration` → `workflow-gamedev`, and the new execution skill → `workflow-execution`. The old names disagreed on word order and on whether to carry a `-guide` suffix; the new ones share a prefix and follow the repository's existing base/variant convention (`typescript-rules` / `typescript-rules-backend`).

- **Autonomous execution extracted into a new `workflow-execution` skill.** `workflow-orchestration` had grown to 616 lines covering two different concerns: which subagent runs when (coordination, up to the batch-approval gate) and how the loop behaves once no one is asked for permission (execution). The second half now lives in `workflows` — entry conditions, commit strategies, the per-task cycle, post-implementation verification, final cleanup, auto-stop triggers, and the error-fixing protocol — leaving the guide at 418 lines. This also corrects a structural defect: commit strategy, the task cycle, and post-implementation verification were nested under "Metacognitive TodoWrite Integration", which has nothing to do with any of them. `gamedev`'s orchestration override carried a duplicate of the same content and now points at the shared skill too.

- **Documents are now grouped by feature instead of by document type.** Everything a feature produces lives under one directory, so the whole record of a change is readable in one place. ADRs stay global — a decision usually outlives and spans features.

  ```
  docs/
  ├── adr/ADR-0007-token-storage.md
  └── features/{feature}/
      ├── prd.md
      ├── uxrd.md
      ├── design-{part}.md
      └── {part}/
          ├── {plan-name}.md
          └── {plan-name}/
              ├── _overview.md
              ├── task-01.md
              └── analysis/
  ```

  A **part** is one independently designable slice of a feature, always present even when there is only one, so every agent resolves paths with a single glob. One design per part: when a change needs materially different designs, those are separate parts rather than two documents in one. PRD and UXRD stay at feature level — splitting into parts is an implementation decision, not a product or UX one.

  A part may hold several plans (a first pass and a hardening pass, say). Each plan file pairs with a directory of the same name holding its decomposition, so two plans never contend for one task directory.

- **Work plans now carry frontmatter** (`feature`, `part`, `design`, `plan: N of M`, `status`, `depends-on`) as the single source of truth for plan sequencing — how many plans a part expects, which one runs now, and in what order. There is no separate index file to drift out of sync with the directory. Ambiguous states (two active plans, a file count disagreeing with `M`, a dangling `depends-on`) are escalated rather than guessed, since each silently produces work against the wrong plan.

- **Layer routing no longer reads a filename.** Design docs were `*-backend-design.md` / `*-frontend-design.md`; they are now the layer-neutral `design-{part}.md`. `/build`, `/front-build`, and `/update-doc` determine the layer from the design's content and the part name, and require a positive same-layer signal before proceeding rather than inferring from the absence of the other layer's markers.

- **`validate-plugins.mjs` gained a feature-layout check** covering part/design pairing, plan frontmatter, `N of M` agreement with the file count, and `depends-on` and `design` resolution. It skips in repositories with no `docs/features/` — this marketplace has none, but consuming projects can run the same script.

### Removed

- `sequential-thinking` MCP server from all plugins: dropped from every `.mcp.json`, from plugin descriptions, and from the agent prompts that referenced it (`task-executor`, `task-executor-frontend`, `ux-designer`, and the four strategy agents). `strategy/.mcp.json` is removed entirely, having held no other server.
- **`/create-skill` and `/refine-skill` no longer ship in the plugins.** Skill authoring is meta-work on this marketplace, not a capability a consuming project needs, and it is already covered by the separate `plugin-dev` plugin. Both commands moved to this repository's `.claude/commands/`. `/sync-skills` is unaffected and still ships. If you relied on these commands from an Overture plugin, install `plugin-dev` or copy them into your own project's `.claude/commands/`.
- **`ui-spec-designer` agent removed** from `frontend-overture`, `fullstack-overture`, and `gamedev-overture`. It was invoked by no command and no orchestration flow, wrote to a document type (`docs/ui-spec/`) with no template in this repository, and was absent from the agent documentation. Its role is covered by `ux-designer` (authors the UXRD) plus the new `ui-analyzer` (gathers the UI facts). References to "UI Spec" in the build layer-detection markers and `task-executor-frontend` are normalized to UXRD.
- **`skills/skills-index.yaml` deleted.** It was an orphan — registered in no `plugin.json`, symlinked into no plugin, and therefore never delivered to any consumer, while having drifted to a different schema than the copy that does ship. Its four missing entries (`expert-analysis-guide`, `security-checks`, `skill-optimization`, `type-safety-standards`) were merged into the shipped index at `skills/task-analyzer/references/skills-index.yaml`, which now matches the skills on disk exactly. `setup-context` pointed at the dead file and now points at the project-local path `/sync-skills` generates.

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

- **Corrected: subagents can spawn subagents.** `workflow-orchestration` stated "Subagents cannot directly call other subagents", which is wrong. Claude Code supports nesting up to three layers below the main conversation by default, configurable via `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`; at the limit the `Agent` tool is removed so the deepest agent finishes and returns. The claim has been replaced with the depth budget for these flows and a policy for using it.

  A second consequence had gone unnoticed: agents here declare only `disallowedTools:`, so they **inherit** `Agent` unless it is explicitly denied. Every agent already had the capability, unaudited and undocumented.

  The 18 code-touching agents now carry an explicit rule: spawn `code-explorer` when a lookup exceeds their own scope, and spawn nothing else — any other agent routes back through the orchestrator, which owns sequencing and the stop points. `code-explorer` denies `Agent`, making it a leaf, which bounds the chain regardless of the configured depth.

- **Every code-touching agent now navigates LSP-first.** All 18 agents that read or write code load `code-navigation` — the 6 that previously carried ad-hoc LSP bullet lists plus 12 that had no guidance at all (`technical-designer`, `code-verifier`, `verifier`, `quality-fixer`, `codebase-analyzer`, `ui-analyzer`, and the rest).

  Subagents cannot invoke subagents, so an agent cannot call `code-explorer` itself. Where an agent needs a sweep wider than its own scope, the orchestration guide documents the framework-native alternative: the orchestrator pre-runs `code-explorer` and passes its JSON in as an `exploration` input — the JSON rather than a summary, since rewriting it drops the `resolvedBy` and `confidence` fields and a receiving agent that cannot tell an LSP-resolved reference from a grep match treats both as facts.

- **`code-explorer` agent**: a read-only search agent that answers where code is and what touches it. Modelled on a broad fan-out explorer: it takes a `breadth` parameter (`focused` / `medium` / `thorough`) and returns locations, counts, and minimum excerpts rather than file contents — loading the searched files into the caller's context is the cost the delegation exists to avoid.

  It applies `code-navigation`: anchor with text search, then resolve with LSP. Its output separates `lsp` from `text` resolution in the counts, because seven resolved references and seven grep matches are different claims. Every text-resolved hit on a symbol question must carry a recorded reason why LSP could not resolve it, and `coverage.notSearched` is required at anything below `thorough` breadth — an unsearched area reported as "nothing found" is a false negative.

  Registered as a proactive delegation target: the orchestration guide now routes *where is X*, *what uses X*, and any change whose blast radius is not established to it. A boundary table separates it from `codebase-analyzer` (pre-design facts), `scope-discoverer` (unit boundaries), and `codebase-scanner` (dead code).

- **`code-navigation` skill**: chooses between semantic and textual lookup. Text search reaches a first anchor — every LSP operation needs a `file:line:character` position, so a lookup starting from a bare name has to get one — and LSP does everything after it. Falling back to text search on a symbol question requires a reason that can be named and recorded; "grep is faster" is explicitly not one. Grep matching a class name returns comments, log strings, and same-named symbols from other modules while missing every use through an import alias, which is why it is wrong for rename-impact and call-site questions specifically.

  This also removes duplication: six agents (`task-executor`, `code-reviewer`, `investigator`, `scope-discoverer`, `security-reviewer`, `solver`) each carried their own "LSP MCP (if available)" bullet list with no shared source. Each now references the skill and keeps only its agent-specific instruction — where the finding goes in that agent's output contract.

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
