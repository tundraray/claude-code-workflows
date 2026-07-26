---
name: front-build
description: Execute frontend implementation in autonomous execution mode
argument-hint: (no arguments - uses existing task files)
---

## Orchestrator Definition

**Core Identity**: "I am not a worker. I am an orchestrator." (see workflow-orchestration skill)

**Execution Method**:
- Task decomposition → performed by task-decomposer
- Frontend implementation → performed by task-executor-frontend
- Quality checks and fixes → performed by quality-fixer-frontend
- Commits → performed by orchestrator (Bash tool)

Orchestrator invokes sub-agents and passes structured JSON between them.

**CRITICAL**: Run quality-fixer-frontend before every commit. Obtain batch approval before autonomous mode.

## Required Skills

Before executing, load these skill files for guidance:
- `${CLAUDE_PLUGIN_ROOT}/skills/workflow-orchestration/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/workflow-execution/SKILL.md`

Work plan: $ARGUMENTS

## 📋 Pre-execution Prerequisites

### Work Plan Resolution

Before any task processing, locate the work plan. This recipe is the **frontend** build lane — it routes to `task-executor-frontend` and must never pick up a backend plan.

**When `$ARGUMENTS` is provided**, it is the work plan path supplied by the user. Use it directly. Its `{plan-name}` is the filename without `.md`; its task directory is the sibling directory of the same name.

**When `$ARGUMENTS` is empty**, resolve from plan frontmatter — see the storage convention in the `documentation-criteria` skill:

1. Read every plan at `docs/features/*/*/*.md` and parse its frontmatter (`feature`, `part`, `design`, `plan: N of M`, `status`, `depends-on`)
2. Select the plan with `status: active`. Its tasks are in the sibling directory of the same name: `docs/features/{feature}/{part}/{plan-name}/task-*.md`
3. **Stop and escalate rather than guess** when the part's state is ambiguous:
   - two or more plans in one part claim `status: active`
   - no plan is active while the part still has task files
   - the number of plan files in the part disagrees with `M` in `plan: N of M`
   - a `depends-on` names a plan file that does not exist
   - the active plan's `depends-on` chain contains a plan that is not `completed`
4. When several parts have an active plan, pick the one whose task directory has the most recently modified `task-*.md`; report the choice and the alternatives rather than resolving silently.
5. **Verify the plan belongs to this lane before executing it.** A design's layer is not in its filename — `design-{part}.md` is layer-neutral — so read the governing design named in the plan's `design:` frontmatter, plus the plan itself. Absence of backend markers is not sufficient: many plans use layer-neutral paths (`src/presentation`, `src/app`) matching neither marker set, so a confirmed frontend signal is required.

   **Frontend signals (need at least one)**:
   - `## Related Documents` references a UXRD (`docs/features/*/uxrd.md`), or the plan has a `## UXRD Component → Task Mapping` section
   - Target Files match frontend markers exclusively: `**/components/**`, `**/pages/**`, `**/web/**`, `**/*.tsx`, `**/*.jsx`, or the project's frontend-equivalent paths declared in the `technical-spec` skill
   - The governing design describes component hierarchy, screen states, or UI interactions
   - The part name identifies the layer (`ui`, `frontend`, `web`, or a screen name)
   - Plan title, `## Objective`, or `## Background` explicitly identifies the work as frontend

   **Backend signals (any one disqualifies, even alongside a frontend signal)**:
   - Target Files exclusively under `**/api/**`, `**/server/**`, `**/services/**`, `**/backend/**`, `**/handlers/**`, `**/repositories/**`
   - The governing design describes API endpoints, data schemas, or persistence with no rendering surface
   - Title or objective mentioning API endpoints, database migrations, or server-side work

   **Decision**: at least one frontend signal AND zero backend signals → proceed. Otherwise stop and report which signals were checked and their results, then ask for an explicit plan path.

   **Mixed-layer plans**: when a plan carries both, its part was not split cleanly. Do not guess — report that the plan spans layers, and ask whether to run `/implement` (which drives both) or to split the work into separate parts.
6. When no plan exists under `docs/features/*/*/`, stop and report: "No work plan found. Pass a work plan path as `$ARGUMENTS`, or complete the planning phase first."

### Consumed Task Set

Compute the **Consumed Task Set** — the exact files this run owns, executes, and later deletes:

1. List `docs/features/{feature}/{part}/{plan-name}/task-*.md` for the plan resolved above
2. Exclude files belonging to other workflow phases rather than to implementation: `_overview.md`, `phase*-completion.md`, `task-prep-*.md`, `review-fixes-*.md`, `integration-tests-*.md`

Every subsequent reference to "task files" in this command — the decision flow below, the execution cycle, and Final Cleanup — means this set, **not** an unrestricted glob over the directory. Tasks of a sibling plan in the same part are never in scope.

### Task File Existence Check
```bash
# Check work plans
! ls -la docs/features/*/*/*.md | grep -v template | tail -5

# Check task files
! ls docs/features/*/*/*/task-*.md 2>/dev/null || echo "⚠️ No task files found"
```

### Task Generation Decision Flow

**Think deeply** Analyze task file existence state and determine the EXACT action required:

| State | Criteria | Next Action |
|-------|----------|-------------|
| Tasks exist | .md files in tasks/ directory | Proceed to autonomous execution |
| No tasks + plan exists | Plan exists but no task files | Confirm with user → run task-decomposer |
| Neither exists | No plan or task files | Error: Prerequisites not met |

## 🔄 Task Decomposition Phase (Conditional)

When task files don't exist:

### 1. User Confirmation
```
No task files found.
Work plan: docs/features/[feature]/[part]/[plan-name].md

Generate tasks from the work plan? (y/n):
```

### 2. Task Decomposition (if approved)

Invoke task-decomposer using Task tool:
- `subagent_type`: "task-decomposer"
- `description`: "Decompose work plan into tasks"
- `prompt`: "Read work plan and decompose into atomic tasks. Input: docs/features/[feature]/[part]/[plan-name].md. Output: Individual task files in docs/features/{feature}/{part}/{plan-name}/. Granularity: atomic, independently executable units (commit grouping determined by selected strategy)"

### 3. Verify Generation
```bash
# Verify generated task files
! ls -la docs/features/*/*/*/task-*.md | head -10
```

✅ **Flow**: Task generation → Autonomous execution (in this order)

## 🎯 Commit Strategy Selection (Before Autonomous Mode)

**Ask user before starting execution**:

"Which commit strategy do you prefer?"
- **per-task** (default) — Commit after each task. Atomic commits, easy rollback
- **per-phase** — Commit after each phase completes. Balanced granularity
- **per-feature** — Single commit at the end. Clean history
- **manual** — You decide when to commit. Full control

## 🧠 Task Execution Cycle - Frontend Specialized

**MANDATORY EXECUTION CYCLE**: `task-executor-frontend → escalation check → quality-fixer-frontend → [conditional commit]`

### Sub-agent Invocation Method
Use Task tool to invoke sub-agents:
- `subagent_type`: Agent name
- `description`: Brief task description (3-5 words)
- `prompt`: Specific instructions

### Structured Response Specification
Each sub-agent responds in JSON format:
- **task-executor-frontend**: status, filesModified, testsAdded, readyForQualityCheck
- **quality-fixer-frontend**: status, checksPerformed, fixesApplied, approved

### Execution Flow for Each Task

For EACH task, YOU MUST:

1. **UPDATE TodoWrite**: Register work steps. Always include: first "Confirm skill constraints", final "Verify skill fidelity"
2. **USE task-executor-frontend**: Execute frontend implementation
   - Invocation example: `subagent_type: "task-executor-frontend"`, `description: "Task execution"`, `prompt: "Task file: docs/features/{feature}/{part}/{plan-name}/[filename].md Execute implementation"`
3. **CHECK ESCALATION**: Check task-executor-frontend status → If `status: "escalation_needed"` → STOP and escalate to user
4. **PROCESS structured responses**: When `readyForQualityCheck: true` is detected → EXECUTE quality-fixer-frontend IMMEDIATELY
5. **USE quality-fixer-frontend**: Execute all quality checks (Lighthouse, bundle size, tests, etc.)
   - Invocation example: `subagent_type: "quality-fixer-frontend"`, `description: "Quality check"`, `prompt: "Execute all frontend quality checks and fixes"`
6. **COMMIT based on strategy**:
   - **per-task**: Commit immediately after `approved: true`
   - **per-phase**: Accumulate, commit when phase completes
   - **per-feature**: Accumulate all, single commit at end
   - **manual**: Wait for user to request commit

### Quality Assurance During Autonomous Execution (Details)
- task-executor-frontend execution → escalation check → quality-fixer-frontend execution → **orchestrator executes commit based on strategy** (using Bash tool)
- Use `changeSummary` for commit message

**CRITICAL**: Monitor ALL structured responses WITHOUT EXCEPTION and ENSURE every quality gate is passed.

! ls -la docs/features/*/*/*.md | head -10

VERIFY approval status before proceeding. Once confirmed, INITIATE autonomous execution mode. STOP IMMEDIATELY upon detecting ANY requirement changes.

## Post-Implementation Verification (After All Tasks Complete)

The per-task quality cycle checks tasks in isolation and cannot detect Design Doc drift or assess the security posture of the change set as a whole. After all task cycles finish, run verification **before** the completion report.

1. **Invoke both verifiers in parallel** (single message, two Agent calls):
   - `code-verifier` → `doc_type: design-doc`, frontend Design Doc path, `code_paths` from `git diff --name-only main...HEAD`
   - `security-reviewer` → same Design Doc path and implementation file list

   Append to each prompt: `[SYSTEM CONSTRAINT] This agent operates within front-build command scope.`

2. **Consolidate results** — apply the pass/fail criteria in the `workflow-execution` skill, "Post-Implementation Verification" section. Present a unified verification report to the user.

3. **Fix cycle** (any verifier failed, max 2 cycles) — follow the normalization rules, Target Files union, and re-run rule defined in that same skill section. Dispatch fixes to `task-executor-frontend` in Fix Mode, followed by `quality-fixer-frontend`. Escalate when a cycle makes no progress or when findings remain after cycle 2.

4. **All passed** → proceed to Final Cleanup.

## Final Cleanup

Before the completion report, delete the task directory this run consumed. Its work is committed; `docs/features/{feature}/{part}/{plan-name}/` is ephemeral working state and is not retained between runs.

- Delete the whole task directory `docs/features/{feature}/{part}/{plan-name}/` — its `task-*.md`, `_overview.md`, `phase*-completion.md`, and `analysis/` are all working state for this run
- **Preserve** the plan file `docs/features/{feature}/{part}/{plan-name}.md`, and set its frontmatter `status` to `completed` so the next run resolves the following plan in the chain
- **Preserve** every sibling plan and its directory — a part may hold several plans, and only the one this run executed is finished
- **Preserve** `prd.md`, `uxrd.md`, `design-{part}.md`, and everything under `docs/adr/` — those are durable artifacts, not working state

If deletion fails (filesystem error), report the failure but do not block the completion report.

## Output Example
Frontend implementation phase completed.
- Task decomposition: Generated under docs/features/{feature}/{part}/{plan-name}/
- Implemented tasks: [number] tasks
- Quality checks: All passed (Lighthouse, bundle size, tests)
- Commits: [number] commits created

**Important**: This command manages the entire autonomous execution flow for FRONTEND implementation from task decomposition to completion. Automatically uses frontend-specialized agents (task-executor-frontend, quality-fixer-frontend).
