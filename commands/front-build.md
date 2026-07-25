---
name: front-build
description: Execute frontend implementation in autonomous execution mode
argument-hint: (no arguments - uses existing task files)
---

## Orchestrator Definition

**Core Identity**: "I am not a worker. I am an orchestrator." (see subagents-orchestration-guide skill)

**Execution Method**:
- Task decomposition → performed by task-decomposer
- Frontend implementation → performed by task-executor-frontend
- Quality checks and fixes → performed by quality-fixer-frontend
- Commits → performed by orchestrator (Bash tool)

Orchestrator invokes sub-agents and passes structured JSON between them.

**CRITICAL**: Run quality-fixer-frontend before every commit. Obtain batch approval before autonomous mode.

## Required Skills

Before executing, load these skill files for guidance:
- `${CLAUDE_PLUGIN_ROOT}/skills/subagents-orchestration-guide/SKILL.md`

Work plan: $ARGUMENTS

## 📋 Pre-execution Prerequisites

### Work Plan Resolution

Before any task processing, locate the work plan. This recipe is the **frontend** build lane — it routes to `task-executor-frontend` and must never pick up a backend plan.

**When `$ARGUMENTS` is provided**, it is the work plan path supplied by the user. Use it directly without auto-resolution. Extract `{plan-name}` from the filename by stripping the `.md` extension (and any trailing `-plan` suffix when present).

**When `$ARGUMENTS` is empty**, auto-resolve from task files:

1. List task files in `docs/plans/tasks/` matching this recipe's consumable pattern:
   - `{plan-name}-frontend-task-*.md` (frontend portion of a plan)
   - `{plan-name}-task-*.md` and `{plan-name}-backend-task-*.md` are **not** consumable here — the unqualified form is reserved for backend by the routing table, and both route to `task-executor`
2. Exclude files originating from other workflow phases: `*-task-prep-*.md`, `_overview-*.md`, `*-phase*-completion.md`, `review-fixes-*.md`, `integration-tests-*-task-*.md`
3. For each remaining file, extract `{plan-name}` by stripping the trailing `-frontend-task-{NN}.md` suffix
4. When at least one task file matches, the work plan is `docs/plans/{plan-name}.md` for the prefix with the most recent task-file mtime; ties broken by the lexicographically last `{plan-name}`
5. **When no frontend task files exist but `*-task-*.md` or `*-backend-task-*.md` files do**: stop and report — "Only backend-named task files were found. If you intended the backend build, run `/build`. If the plan is frontend, re-run task-decomposer so it emits frontend-named task files, or pass the work plan path as `$ARGUMENTS`."
6. When neither matches, fall back to the most-recent-mtime non-template `.md` in `docs/plans/` **only after positively verifying the plan is a frontend plan**. Absence of backend markers is not sufficient — many plan templates use layer-neutral paths (`src/presentation`, `src/app`) matching neither marker set, so a confirmed frontend signal is required.

   **Frontend signals (need at least one)**:
   - `## Related Documents` references a UI Spec / UXRD (`docs/ui-spec/*`, `docs/uxrd/*`) or a Design Doc whose filename identifies it as frontend (`*-frontend-design.md`, `frontend-*-design.md`)
   - A `## UI Spec Component → Task Mapping` section is present
   - Target Files under `## Impact Scope > ### Target Files` match frontend markers exclusively: `**/components/**`, `**/pages/**`, `**/web/**`, `**/*.tsx`, `**/*.jsx`, or the project's frontend-equivalent paths declared in the `technical-spec` skill
   - Plan title, `## Objective`, or `## Background` explicitly identifies the work as frontend ("React component", "screen", "UI")

   **Backend signals (any one disqualifies, even alongside a frontend signal)**:
   - Target Files exclusively under `**/api/**`, `**/server/**`, `**/services/**`, `**/backend/**`, `**/handlers/**`, `**/repositories/**`
   - `## Related Documents` pointing to a backend-named Design Doc
   - Title or objective mentioning API endpoints, database migrations, or server-side work

   **Decision**: at least one frontend signal AND zero backend signals → proceed. Otherwise stop and report which signals were checked and their results, then ask for an explicit plan path.
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
   - Invocation example: `subagent_type: "task-executor-frontend"`, `description: "Task execution"`, `prompt: "Task file: docs/plans/tasks/[filename].md Execute implementation"`
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

! ls -la docs/plans/*.md | head -10

VERIFY approval status before proceeding. Once confirmed, INITIATE autonomous execution mode. STOP IMMEDIATELY upon detecting ANY requirement changes.

## Output Example
Frontend implementation phase completed.
- Task decomposition: Generated under docs/plans/tasks/
- Implemented tasks: [number] tasks
- Quality checks: All passed (Lighthouse, bundle size, tests)
- Commits: [number] commits created

**Important**: This command manages the entire autonomous execution flow for FRONTEND implementation from task decomposition to completion. Automatically uses frontend-specialized agents (task-executor-frontend, quality-fixer-frontend).
