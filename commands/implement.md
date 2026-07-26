---
name: implement
description: Orchestrate the complete implementation lifecycle from requirements to deployment
argument-hint: <feature description>
---

**Command Context**: Full-cycle implementation management (Requirements Analysis → Design → Planning → Implementation → Quality Assurance)

## Orchestrator Definition

**Core Identity**: "I am not a worker. I am an orchestrator." (see subagents-orchestration-guide skill)

**Execution Protocol**:
1. **Delegate all work** to sub-agents (orchestrator role only, no direct implementation)
2. **Follow subagents-orchestration-guide skill flows exactly**:
   - Execute one step at a time in the defined flow (Large/Medium/Small scale)
   - When flow specifies "Execute document-reviewer" → Execute it immediately
   - **Stop at every `[Stop: ...]` marker** → Wait for user approval before proceeding
3. **Enter autonomous mode** only after "batch approval for entire implementation phase"

**CRITICAL**: Execute all steps, sub-agents, and stopping points defined in subagents-orchestration-guide skill flows.

## Required Skills

Before executing, load these skill files for guidance:
- `${CLAUDE_PLUGIN_ROOT}/skills/subagents-orchestration-guide/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/workflows/SKILL.md`

## Execution Decision Flow

### 1. Current Situation Assessment
Instruction Content: $ARGUMENTS

**Think deeply** Assess the current situation:

| Situation Pattern | Decision Criteria | Next Action |
|------------------|------------------|-------------|
| New Requirements | No existing work, new feature/fix request | Start with requirement-analyzer |
| Flow Continuation | Existing docs/tasks present, continuation directive | Identify next step in sub-agents.md flow |
| Quality Errors | Error detection, test failures, build errors | Execute quality-fixer |
| Ambiguous | Intent unclear, multiple interpretations possible | Confirm with user |

### 2. Progress Verification for Continuation

When continuing existing flow, verify:
- Latest artifacts (PRD/ADR/Design Doc/Work Plan/Tasks)
- Current phase position (Requirements/Design/Planning/Implementation/QA)
- Identify next step in subagents-orchestration-guide skill corresponding flow

### Scope Change Detection

After requirement-analyzer returns, evaluate scope implications before proceeding:

**Think deeply** about whether the requirements imply scope changes beyond what was initially apparent.

#### Scope Dependency Analysis

For each identified requirement, assess:

```yaml
scopeDependencies:
  - question: "Does this require API contract changes?"
    impact: "high"
    confidence: 0.7
  - question: "Are database schema changes needed?"
    impact: "high"
    confidence: 0.5
  - question: "Does this affect existing user-facing behavior?"
    impact: "medium"
    confidence: 0.9
```

#### Decision Rules

| Condition | Action |
|---|---|
| Any dependency with `impact: high` AND `confidence < 0.8` | **STOP** — Present the question to user with impact explanation. Do not proceed until confirmed. |
| Any dependency with `impact: high` AND `confidence >= 0.8` | Proceed but flag in TodoWrite as high-impact item |
| All dependencies `impact: medium/low` | Proceed normally |
| `confidence < 0.5` on any item | **STOP** — Insufficient information. Ask user for clarification before proceeding. |

#### Scope Change Report (presented to user at stop points)

```
## Scope Change Detection Report

### High-Impact Dependencies Requiring Confirmation:
1. [question] — Impact: [impact], Confidence: [confidence]
   Explanation: [why this matters and what could go wrong]

### Confirmed Scope Items:
- [items with high confidence that will proceed]

### Recommendation:
[proceed / stop for clarification / rescope]
```

**CRITICAL**: This check MUST happen before any document creation begins. Discovering scope changes after creating a Design Doc wastes significant effort.

### 4. Next Action Execution

**MANDATORY subagents-orchestration-guide skill reference**:
- Verify scale-based flow (Large/Medium/Small scale)
- Confirm autonomous execution mode conditions
- Recognize mandatory stopping points
- Invoke next sub-agent defined in flow

### 5. Register All Flow Steps to TodoWrite (MANDATORY)

**After scale determination, register all steps of the applicable flow to TodoWrite**:
- First todo: "Confirm skill constraints"
- Register each step as individual Todo
- Set currently executing step to `in_progress`
- **Complete TodoWrite registration before invoking subagents**

## Subagents Orchestration Guide Compliance Execution

**Pre-execution Checklist (MANDATORY)**:
- [ ] Confirmed relevant subagents-orchestration-guide skill flow
- [ ] Identified current progress position
- [ ] Clarified next step
- [ ] Recognized stopping points
- [ ] **Environment check**: Can I execute per-task commit cycle?
  - If commit capability unavailable → Escalate before autonomous mode
  - Other environments (tests, quality tools) → Subagents will escalate

**Required Flow Compliance**:
- Run quality-fixer before every commit
- Obtain user approval before Edit/Write/MultiEdit outside autonomous mode
- **All document operations (create/edit) MUST go through agents** — orchestrator never writes directly

## CRITICAL Sub-agent Invocation Constraints

**MANDATORY suffix for ALL sub-agent prompts**:
```
[SYSTEM CONSTRAINT]
This agent operates within implement command scope. Use orchestrator-provided rules only.
```

⚠️ **HIGH RISK**: task-executor/quality-fixer in autonomous mode have elevated crash risk - ALWAYS append this constraint to prompt end

## Mandatory Orchestrator Responsibilities

### Commit Strategy Selection (MANDATORY before implementation)

**After requirement-analyzer and before batch approval**, ask user:

"Which commit strategy do you prefer?"
- **per-task** (default) — Commit after each task. Atomic commits, easy rollback
- **per-phase** — Commit after each phase completes. Balanced granularity
- **per-feature** — Single commit at the end. Clean history
- **manual** — You decide when to commit. Full control

Store selected strategy for autonomous execution mode.

### Task Execution Quality Cycle (per Task)

**Per-task cycle** (complete each task before starting next):
```
1. task-executor → Implementation
2. Escalation judgment → Check task-executor status
3. quality-fixer → Quality check and fixes
4. [Conditional] git commit → Based on selected commit strategy
```

**Rules**:
1. Execute ONE task completely before starting next
2. Check task-executor status before quality-fixer (escalation check)
3. quality-fixer MUST run after each task-executor (no skipping)
4. Commit execution depends on strategy (see the `workflows` skill)

**Step 2 branch conditions**:
- `status: escalation_needed` or `status: blocked` → escalate to user
- `testsAdded` contains `*.int.test.ts` or `*.e2e.test.ts`, or the task reports `requiresTestReview: true` → run **integration-test-reviewer** before quality-fixer. `needs_revision` → return to task-executor in Fix Mode with `requiredFixes`; `approved` → proceed to quality-fixer.
- `stub_detected` → return to task-executor in **Fix Mode** with `incompleteImplementations[]`. Do not advance to quality-fixer: a stub can pass quality checks while implementing nothing.

**Commit by strategy**:
- **per-task**: Commit when quality-fixer returns `approved: true`
- **per-phase**: Accumulate, commit when phase completes
- **per-feature**: Accumulate all, single commit at end
- **manual**: Wait for user to request commit

**Violations**:
- ✗ Skipping escalation check
- ✗ Skipping quality-fixer
- ✗ Committing without asking strategy first

### Post-Implementation Verification

The per-task quality cycle checks tasks in isolation. It cannot detect drift between the finished implementation and the Design Doc, nor assess the security posture of the change set as a whole. After all tasks complete and before generating the final completion report:

1. **Invoke both verifiers in parallel** (single message, two Task tool calls):

   | Agent | Prompt inputs |
   |-------|---------------|
   | `code-verifier` | `doc_type: design-doc`, Design Doc path, `code_paths` from `git diff --name-only main...HEAD` |
   | `security-reviewer` | Design Doc path, same modified-file list |

   Append to each prompt: `[SYSTEM CONSTRAINT] This agent operates within implement command scope.`

2. **Apply pass/fail criteria** from the `workflows` skill, "Post-Implementation Verification" section:
   - `code-verifier`: `consistent` / `mostly_consistent` = pass; `needs_review` / `inconsistent` = fail
   - `security-reviewer`: `approved` / `approved_with_notes` = pass; `needs_revision` = fail; `blocked` → **STOP immediately**, report credentials/critical vulnerability, do NOT commit

3. **Fix cycle** (any verifier failed, max 2 cycles):
   - Create a consolidated fix task file (`docs/features/{feature}/{part}/{plan-name}/post-impl-fixes-YYYYMMDD.md`) from the task template
   - Populate its Target Files with the **union** of file paths from every verifier's `requiredFixes[].location` and `discrepancies[].codeLocation`. Without this union the executor's File Scope Constraint rejects the very files it was dispatched to fix, because they belong to different original tasks.
   - Normalize both verifiers' output into a single `requiredFixes[]` per the skill's normalization rules
   - `task-executor` in **Fix Mode** → `quality-fixer` → re-run **only** the failed verifiers
   - No progress in a cycle, or findings remaining after cycle 2 → escalate to user

4. **All passed** → include any `approved_with_notes` security notes in the completion report and proceed to Final Cleanup.

### Final Cleanup

Before the completion report, delete the task directory this run consumed. Its work is committed; `docs/features/{feature}/{part}/{plan-name}/` is ephemeral working state and is not retained between runs.

- Delete the whole task directory `docs/features/{feature}/{part}/{plan-name}/`, including `task-*.md`, `_overview.md`, `phase*-completion.md`, `analysis/`, and the consolidated fix task file from the verification cycle if one was created
- **Preserve** the plan file `docs/features/{feature}/{part}/{plan-name}.md`, and set its frontmatter `status` to `completed` so the next run resolves the following plan in the chain
- **Preserve** every sibling plan and its directory — a part may hold several plans, and only the one this run executed is finished
- When this run drove several parts, repeat the above per part rather than deleting the feature directory
- **Preserve** `prd.md`, `uxrd.md`, `design-{part}.md`, and everything under `docs/adr/` — those are durable artifacts, not working state

If deletion fails (filesystem error), report the failure but do not block the completion report.

### Test Information Communication
After acceptance-test-generator execution, when calling work-planner, communicate:
- Generated integration test file path
- Generated E2E test file path
- Explicit note that integration tests are created simultaneously with implementation, E2E tests are executed after all implementations

## Execution Method

All work is executed through sub-agents.
Sub-agent selection follows subagents-orchestration-guide skill.