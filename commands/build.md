---
name: build
description: Execute decomposed tasks in autonomous execution mode
argument-hint: (no arguments - uses existing task files)
---

## Orchestrator Definition

**Core Identity**: "I am not a worker. I am an orchestrator." (see subagents-orchestration-guide skill)

**First Action**: Register execution steps to TodoWrite before any execution:
- Step 1: Prerequisites check
- Step 2: Task decomposition (if needed)
- Step 3: Commit strategy selection
- Step 4-N: Task execution cycles

**Execution Protocol**:
1. **Delegate all work** to sub-agents (orchestrator role only)
2. **Follow subagents-orchestration-guide skill autonomous execution mode exactly**:
   - Execute: task-decomposer → (task-executor → quality-fixer → commit) loop
   - **Stop immediately** upon detecting requirement changes
3. **Scope**: Complete when all tasks are committed or escalation occurs

**CRITICAL**: Run quality-fixer before every commit. Obtain batch approval before autonomous mode.

## Required Skills

Before executing, load these skill files for guidance:
- `${CLAUDE_PLUGIN_ROOT}/skills/subagents-orchestration-guide/SKILL.md`

Work plan: $ARGUMENTS

## 📋 Pre-execution Prerequisites

### Work Plan Resolution

Before any task processing, locate the work plan. This recipe is the **backend** build lane — it routes to `task-executor` and must never pick up a frontend plan.

**When `$ARGUMENTS` is provided**, it is the work plan path supplied by the user. Use it directly without auto-resolution. Extract `{plan-name}` from the filename by stripping the `.md` extension (and any trailing `-plan` suffix when present).

**When `$ARGUMENTS` is empty**, auto-resolve from task files:

1. List task files in `docs/plans/tasks/` matching this recipe's consumable patterns:
   - `{plan-name}-task-*.md` (single-layer; reserved for backend by the routing table)
   - `{plan-name}-backend-task-*.md` (backend portion of a multi-layer plan)
   - `{plan-name}-frontend-task-*.md` is **not** consumable here — it routes to `task-executor-frontend` and is owned by `/front-build`
2. Exclude files originating from other workflow phases: `*-task-prep-*.md`, `_overview-*.md`, `*-phase*-completion.md`, `review-fixes-*.md`, `integration-tests-*-task-*.md`
3. For each remaining file, extract `{plan-name}` by stripping the trailing `-task-{NN}.md` or `-backend-task-{NN}.md` suffix
4. When at least one task file matches, the work plan is `docs/plans/{plan-name}.md` for the prefix with the most recent task-file mtime; ties broken by the lexicographically last `{plan-name}`
5. **When consumable patterns find no matches but `*-frontend-task-*.md` files exist**: stop and report — "Only frontend-named task files were found. If you intended the frontend build, run `/front-build`. If the plan is backend, re-run task-decomposer so it emits backend-named task files, or pass the work plan path as `$ARGUMENTS`."
6. When neither matches, fall back to the most-recent-mtime non-template `.md` in `docs/plans/` **only after positively verifying the plan is a backend plan**. Absence of frontend markers is not sufficient — many plan templates use layer-neutral paths (`src/presentation`, `src/app`) matching neither marker set, so a confirmed backend signal is required.

   **Backend signals (need at least one)**:
   - Target Files under `## Impact Scope > ### Target Files` match backend markers exclusively: `**/api/**`, `**/server/**`, `**/services/**`, `**/backend/**`, `**/handlers/**`, `**/repositories/**`, or the project's backend-equivalent paths declared in the `technical-spec` skill
   - `## Related Documents` references a Design Doc whose filename identifies it as backend (`*-backend-design.md`, `backend-*-design.md`)
   - Plan title, `## Objective`, or `## Background` explicitly identifies the work as backend ("API endpoint", "database migration", "server-side")

   **Frontend signals (any one disqualifies, even alongside a backend signal)**:
   - `## Related Documents` pointing to `docs/ui-spec/*` or `docs/uxrd/*`
   - A `## UI Spec Component → Task Mapping` section
   - Target Files exclusively under `**/components/**`, `**/pages/**`, `**/web/**`, `**/*.tsx`, `**/*.jsx`
   - Title or objective mentioning React, UI components, screens, or frontend

   **Decision**: at least one backend signal AND zero frontend signals → proceed. Otherwise stop and report which signals were checked and their results, then ask for an explicit plan path.
7. When no plan exists in `docs/plans/` at all, stop and report: "No work plan found. Pass a work plan path as `$ARGUMENTS`, or complete the planning phase first."

### Task File Existence Check
```bash
# Check work plans
! ls -la docs/plans/*.md | grep -v template | tail -5

# Check task files
! ls docs/plans/tasks/*.md 2>/dev/null || echo "⚠️ No task files found"
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
Work plan: docs/plans/[plan-name].md

Generate tasks from the work plan? (y/n): 
```

### 2. Task Decomposition (if approved)

Invoke task-decomposer using Task tool:
- `subagent_type`: "task-decomposer"
- `description`: "Decompose work plan into tasks"
- `prompt`: "Read work plan and decompose into atomic tasks. Input: docs/plans/[plan-name].md. Output: Individual task files in docs/plans/tasks/. Granularity: atomic, independently executable units (commit grouping determined by selected strategy)"

### 3. Verify Generation
```bash
# Verify generated task files
! ls -la docs/plans/tasks/*.md | head -10
```

✅ **Flow**: Task generation → Autonomous execution (in this order)

## 🎯 Commit Strategy Selection (Before Autonomous Mode)

**Ask user before starting execution**:

"Which commit strategy do you prefer?"
- **per-task** (default) — Commit after each task. Atomic commits, easy rollback
- **per-phase** — Commit after each phase completes. Balanced granularity
- **per-feature** — Single commit at the end. Clean history
- **manual** — You decide when to commit. Full control

## 🧠 Task Execution Cycle
**MANDATORY EXECUTION CYCLE**: `task-executor → escalation check → quality-fixer → [conditional commit]`

For EACH task, YOU MUST:
1. **UPDATE TodoWrite**: Register work steps. Always include: first "Confirm skill constraints", final "Verify skill fidelity"
2. **INVOKE task-executor**: Execute the task implementation
3. **CHECK ESCALATION**: Check task-executor status → If `status: "escalation_needed"` → STOP and escalate to user
4. **PROCESS structured responses**: When `readyForQualityCheck: true` is detected → EXECUTE quality-fixer IMMEDIATELY
5. **COMMIT based on strategy**:
   - **per-task**: Commit immediately after `approved: true`
   - **per-phase**: Accumulate, commit when phase completes
   - **per-feature**: Accumulate all, single commit at end
   - **manual**: Wait for user to request commit

**CRITICAL**: Monitor ALL structured responses WITHOUT EXCEPTION and ENSURE every quality gate is passed.

! ls -la docs/plans/*.md | head -10

VERIFY approval status before proceeding. Once confirmed, INITIATE autonomous execution mode. STOP IMMEDIATELY upon detecting ANY requirement changes.

## Post-Implementation Verification (After All Tasks Complete)

The per-task quality cycle checks tasks in isolation and cannot detect Design Doc drift or assess the security posture of the change set as a whole. After all task cycles finish, run verification **before** the completion report.

1. **Invoke both verifiers in parallel** (single message, two Agent calls):
   - `code-verifier` → `doc_type: design-doc`, Design Doc path, `code_paths` from `git diff --name-only main...HEAD`
   - `security-reviewer` → Design Doc path, same implementation file list

   Append to each prompt: `[SYSTEM CONSTRAINT] This agent operates within build command scope.`

2. **Consolidate results** — apply the pass/fail criteria in the `subagents-orchestration-guide` skill, "Post-Implementation Verification" section. Present a unified verification report to the user.

3. **Fix cycle** (any verifier failed, max 2 cycles) — follow the normalization rules, Target Files union, and re-run rule defined in that same skill section. Escalate to the user when a cycle makes no progress or when findings remain after cycle 2.

4. **All passed** → proceed to the completion report.

## Responsibility Boundary

### IN SCOPE
- Reading and executing tasks from existing work plan
- Running post-implementation verification (code-verifier + security-reviewer)
- Calling task-executor / task-executor-frontend for each task
- Running quality-fixer / quality-fixer-frontend after each task
- Executing commits according to selected commit strategy
- Reporting progress and completion status
- Escalating blockers and design deviations

### OUT OF SCOPE
- Creating new design documents (use `/design` instead)
- Modifying requirements or PRD (use `/update-doc` instead)
- Changing work plan structure (use `/create-plan` instead)
- Deployment or release operations
- Changing project configuration or dependencies not specified in tasks

## Output Example
Implementation phase completed.
- Task decomposition: Generated under docs/plans/tasks/
- Implemented tasks: [number] tasks
- Quality checks: All passed
- Commits: [number] commits created

**Important**: This command manages the entire autonomous execution flow from task decomposition to implementation completion. Automatically stops when requirement changes are detected.