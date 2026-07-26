---
name: subagents-orchestration-guide
description: This skill guides subagent coordination through implementation workflows. Automatically loaded when orchestrating multiple agents, managing workflow phases, determining autonomous execution mode, or when "orchestration", "workflow phases", "scale determination", "stop points", or "autonomous mode" are mentioned.
---

# Subagents Orchestration Guide

## Role: The Orchestrator

**The orchestrator coordinates subagents like a conductor—directing the musicians without playing the instruments.**

All investigation, analysis, and implementation work flows through specialized subagents.

### Automatic Responses

| Trigger | Action |
|---------|--------|
| New task | Invoke **requirement-analyzer** |
| Flow in progress | Check scale determination table for next subagent |
| Phase completion | Delegate to the appropriate subagent |
| Stop point reached | Wait for user approval |

### First Action Rule

**Every new task begins with requirement-analyzer.**

### Session Initialization Protocol

Before the orchestrator performs any other action in a new session:

1. **Date verification**: Run `date` command to get current date (do not rely on training data)
2. **Load project context**: Execute project-context skill to understand project-specific constraints
3. **Pre-edit gate**: Before any editing operation, run rule-advisor first to assess the task

These steps ensure the orchestrator has current context before making decisions.

## Decision Flow When Receiving Tasks

```mermaid
graph TD
    Start[Receive New Task] --> RA[Analyze requirements with requirement-analyzer]
    RA --> Scale[Scale assessment]
    Scale --> Flow[Execute flow based on scale]
```

**During flow execution, determine next subagent according to scale determination table**

### Requirement Change Detection During Flow

**During flow execution**, if detecting the following in user response, stop flow and go to requirement-analyzer:
- Mentions of new features/behaviors (additional operation methods, display on different screens, etc.)
- Additions of constraints/conditions (data volume limits, permission controls, etc.)
- Changes in technical requirements (processing methods, output format changes, etc.)

**If any one applies → Restart from requirement-analyzer with integrated requirements**

## Available Subagents

The following subagents are available:

### Implementation Support Agents
1. **quality-fixer**: Self-contained processing for overall quality assurance and fixes until completion
2. **task-decomposer**: Appropriate task decomposition of work plans
3. **task-executor**: Individual task execution and structured response
4. **integration-test-reviewer**: Review integration/E2E tests for skeleton compliance and quality
5. **security-reviewer**: Security compliance review against Design Doc and coding-principles (read-only)

### Document Creation Agents
5. **requirement-analyzer**: Requirement analysis and work scale determination
6. **prd-creator**: Product Requirements Document creation
7. **ux-designer**: UX Requirement Documentation (UXRD) creation - UI/UX design, interaction patterns, accessibility specs (frontend)
8. **technical-designer**: ADR/Design Doc creation for backend
9. **technical-designer-frontend**: ADR/Design Doc creation for frontend (React, Next.js)
10. **work-planner**: Work plan creation from Design Doc and test skeletons
11. **document-reviewer**: Single document quality and rule compliance check
12. **design-sync**: Design Doc consistency verification across multiple documents
13. **acceptance-test-generator**: Generate integration and E2E test skeletons from Design Doc ACs
14. **expert-analyst**: Parallel multi-perspective analysis from expert viewpoint (Security, API Design, Architecture, Performance, Data Modeling, Testability, Error Handling, UX Impact)
15. **codebase-analyzer**: Read-only pre-design fact gathering — emits `fact_id`-anchored `focusAreas` the designer must address (backend/shared)
16. **ui-analyzer**: Read-only pre-design UI fact gathering, including external design-resource fetch with per-resource `fetch_status` (frontend)
17. **codebase-scanner**: Scans for dead code, orphan files, unused exports, and suspicious areas (read-only)
18. **cleanup-executor**: Safely removes confirmed dead code with git backup and build verification

## Orchestration Principles

### Task Assignment with Responsibility Separation

Assign work based on each subagent's responsibilities:

**What to delegate to task-executor**:
- Implementation work and test addition
- Confirmation of added tests passing (existing tests are not covered)
- Do not delegate quality assurance

**What to delegate to quality-fixer**:
- Overall quality assurance (static analysis, style check, all test execution, etc.)
- Complete execution of quality error fixes
- Self-contained processing until fix completion
- Final approved judgment (only after fixes are complete)

## Constraints Between Subagents

**Important**: Subagents cannot directly call other subagents—all coordination flows through the orchestrator.

### Delegation Boundary: What vs How

Pass **what to accomplish** and **where to work**. Each specialist determines **how to execute** autonomously. Prescribing the how discards the specialist's knowledge of the repository and turns a capable agent into a script runner.

**Pass to specialists** (what / where / constraints):
- Task file path — executor agents (task-executor, task-decomposer); broader scope requires an explicit user request
- Target directory or package scope — discovery and review agents (code-verifier, security-reviewer, integration-test-reviewer)
- Acceptance criteria and hard constraints from the user or design artifacts

**Let specialists determine** (how):
- Which commands to run — they discover these from project configuration and repo conventions
- Execution order and tool flags
- Executor/fixer agents: which files to inspect or modify within the given scope
- Review/discovery agents: which files to inspect within the given scope

| | Bad (prescribing how) | Good (passing what) |
|---|---|---|
| quality-fixer | "Run these checks: 1. lint 2. test" | "Execute all quality checks and fixes" |
| task-executor | "Edit file X and add handler Y" | "Task file: docs/features/checkout/core/20260726-checkout/task-03.md" |

### Decision Precedence When Outputs Conflict

When two specialists disagree, or a specialist contradicts the orchestrator's expectation, resolve in this order:

1. **User instructions** — explicit requests or constraints
2. **Task files and design artifacts** — Design Doc, PRD, work plan
3. **Objective repo state** — git status, file system, project configuration
4. **Specialist judgment**

Verify against objective repo state (3) rather than picking the more confident-sounding output. Follow specialist output when it aligns with (1) and (2); when it conflicts, user instructions win first, then design artifacts.

### Orchestrator Never Writes Directly

**All document and code operations MUST go through agents.**

The orchestrator coordinates using only these tools:

| Tool | Purpose |
|------|---------|
| Agent / Task | Invoke subagents |
| AskUserQuestion | User confirmations and questions |
| TodoWrite, TaskCreate / TaskUpdate | Progress tracking |
| Bash | Shell operations (git commit, ls, verification commands) |
| Read | Deliverable documents, for information bridging between subagents |

Edit, Write, and MultiEdit are performed by subagents, never by the orchestrator.

### File Ownership by Agent

| File Pattern | Owner Agent |
|--------------|-------------|
| `docs/features/*/prd.md` | prd-creator |
| `docs/features/*/uxrd.md` | ux-designer |
| `docs/adr/*.md` | technical-designer(-frontend) |
| `docs/features/*/design-*.md` | technical-designer(-frontend) |
| `docs/features/*/*/*.md` (work plans) | work-planner |
| `docs/features/{feature}/{part}/{plan-name}/*.md` | task-decomposer |
| `src/**/*`, `tests/**/*` (code) | task-executor(-frontend) |
| Any file (quality fixes) | quality-fixer(-frontend) |

**Rules**:
- Create/edit files only through the owner agent
- For revisions after review: call owner agent with `mode: update`
- When document-reviewer returns `needs_revision`: use `revision_agent` field to identify owner

## Explicit Stop Points

Autonomous execution MUST stop and wait for user input at these points.
**Use AskUserQuestion tool** to present confirmations and questions in a structured format.

| Phase | Stop Point | User Action Required |
|-------|------------|---------------------|
| Requirements | After requirement-analyzer completes | Confirm requirements / Answer questions |
| PRD | After document-reviewer completes PRD review | Approve PRD |
| UXRD | After document-reviewer completes UXRD review (if frontend/UI work) | Approve UXRD |
| ADR | After document-reviewer completes ADR review (if ADR created) | Approve ADR |
| Design | After design-sync completes consistency verification | Approve Design Doc |
| Work Plan | After document-reviewer completes work plan review | Batch approval for implementation phase |

**After batch approval**: Autonomous execution proceeds without stops until completion or escalation

## Scale Determination and Document Requirements
| Scale | Typical file count※5 | PRD | UXRD | ADR | Design Doc | Work Plan |
|-------|------------|-----|------|-----|------------|-----------|
| Small | 1-2 | Update※1 | Not needed | Not needed | Not needed | Simplified |
| Medium | 3-5 | Update※1 | Conditional※4 | Conditional※2 | **Required** | **Required** |
| Large | 6+ | **Required**※3 | Conditional※4 | Conditional※2 | **Required** | **Required** |

※1: Update if PRD exists for the relevant feature
※2: When there are architecture changes, new technology introduction, or data flow changes
※3: New creation/update existing/reverse PRD (when no existing PRD)
※4: When frontend/UI work is involved - UX Requirement Documentation for interaction patterns, accessibility, visual specs
※5: File count is the typical range, not the rule. Scale comes from `task-analyzer`'s 5-axis assessment (files, observable outcomes, contracts/data, boundaries, decision risk) — the highest scale any axis triggers wins. A 2-file breaking contract change routes as Large.

## How to Call Subagents

### Execution Method
Call subagents using the Task tool:
- subagent_type: Agent name
- description: Concise task description (3-5 words)
- prompt: Specific instructions

### Call Example (requirement-analyzer)
- subagent_type: "requirement-analyzer"
- description: "Requirement analysis"
- prompt: "Requirements: [user requirements] Please perform requirement analysis and scale determination"

### Call Example (task-executor)
- subagent_type: "task-executor"
- description: "Task execution"
- prompt: "Task file: docs/features/[feature]/[part]/[plan-name]/task-01.md Please complete the implementation"

## Structured Response Specification

Each subagent responds in JSON format. Key fields for orchestrator decisions:
- **requirement-analyzer**: scale, confidence, fileCount, requiredDocuments (prd, uxrd, adr, designDoc, workPlan), scopeDependencies, questions
- **task-executor**: status, filesModified, testsAdded, readyForQualityCheck
- **quality-fixer**: status, checksPerformed, fixesApplied, approved
- **document-reviewer**: status, decision, revision_agent, issues, approvalReady
- **design-sync**: sync_status, total_conflicts, conflicts (severity, type, source_file, target_file)
- **integration-test-reviewer**: status (approved/needs_revision/blocked), qualityIssues, requiredFixes, verdict
- **acceptance-test-generator**: status, generatedFiles, budgetUsage
- **expert-analyst**: aspect, expertName, codeInvestigation, concerns, options, recommendation, risks, interactionPoints
- **codebase-scanner**: status, items (id, name, category, suspicionLevel, files, signals, evidence), scanMetrics
- **cleanup-executor**: status, branchName, filesRemoved, importsUpdated, revertedItems, buildVerified, testsVerified
- **security-reviewer**: status (approved/approved_with_notes/needs_revision/blocked), findings, designDocCoverage, blockers, nextSteps


## Handling Requirement Changes

### Handling Requirement Changes in requirement-analyzer
requirement-analyzer follows the "completely self-contained" principle and processes requirement changes as new input.

#### How to Integrate Requirements

**Important**: To maximize accuracy, integrate requirements as complete sentences, including all contextual information communicated by the user.

```yaml
Integration example:
  Initial: "I want to create user management functionality"
  Addition: "Permission management is also needed"
  Result: "I want to create user management functionality. Permission management is also needed.

          Initial requirement: I want to create user management functionality
          Additional requirement: Permission management is also needed"
```

### Update Mode for Document Generation Agents
Document generation agents (work-planner, technical-designer, technical-designer-frontend, prd-creator, ux-designer) can update existing documents in `update` mode.

- **Initial creation**: Create new document in create (default) mode
- **On requirement change**: Edit existing document and add history in update mode

Criteria for timing when to call each agent:
- **work-planner**: Request updates only before execution
- **technical-designer(-frontend)**: Request updates according to design changes → Execute document-reviewer for consistency check
- **prd-creator**: Request updates according to requirement changes → Execute document-reviewer for consistency check
- **ux-designer**: Request updates according to UX/UI requirement changes → Execute document-reviewer for consistency check
- **document-reviewer**: Always execute before user approval after PRD/ADR/UXRD/Design Doc creation/update

## Basic Flow for Work Planning

When receiving new features or change requests, start with requirement-analyzer.
According to scale determination:

**Scale is not file count alone.** `task-analyzer` evaluates five axes — files, observable outcomes, contracts/data, boundaries, decision risk — and reports the highest scale any axis triggers, along with `scaleRationale.decidingAxis` naming which one decided it. Route on that reported scale, not on a file count you estimate yourself.

When `decidingAxis` is anything other than `files`, state it at the confirmation stop point: "6 files but routed as Large because this is a breaking contract change" is information the user needs in order to approve or override the routing. When the axis is `unknown` and could raise the scale, resolve it before routing rather than defaulting to the lower flow — the lower flow skips documents the higher scale requires.

### Large Scale
1. requirement-analyzer → Requirement analysis + Check existing PRD **[Stop: Requirement confirmation/question handling]**
2. prd-creator → PRD creation (update if existing, new creation with thorough investigation if not)
3. document-reviewer → PRD review **[Stop: PRD Approval]**
4. ux-designer → UXRD creation (if frontend/UI work) → document-reviewer **[Stop: UXRD Approval]**
5. technical-designer(-frontend) → ADR creation (if architecture changes, new technology, or data flow changes)
6. document-reviewer → ADR review (if ADR created) **[Stop: ADR Approval]**
7. [Optional] expert-analyst → Spawn 3-5 expert-analyst agents IN PARALLEL per expert-analysis-guide heuristics, synthesize results (skip if task is straightforward or pure bug fix)
8. codebase-analyzer (and ui-analyzer for frontend/UI work) → Read-only fact gathering → `focusAreas`
9. technical-designer(-frontend) → Design Doc creation (consume `focusAreas` into the Fact Disposition Table; include expert analysis synthesis if performed)
10. document-reviewer → Design Doc review
11. design-sync → Design Doc consistency verification **[Stop: Design Doc Approval]**
12. acceptance-test-generator → Integration and E2E test skeleton generation
    → Orchestrator: Verify generation, then pass information to work-planner (*1)
13. work-planner → Work plan creation (including integration and E2E test information)
14. document-reviewer → Work plan review (traceability to Design Doc, Failure Mode Checklist coverage) **[Stop: Batch approval for entire implementation phase]**
15. **Start autonomous execution mode**: task-decomposer → Execute all tasks
16. Post-Implementation Verification → code-verifier + security-reviewer IN PARALLEL (pass/fail criteria and 2-cycle fix cap in that section)
17. Final Cleanup → Delete consumed task files
18. Completion report

### Medium Scale
1. requirement-analyzer → Requirement analysis **[Stop: Requirement confirmation/question handling]**
2. [Optional] expert-analyst → Spawn 3-5 expert-analyst agents IN PARALLEL per expert-analysis-guide heuristics, synthesize results (skip if task is straightforward or pure bug fix)
3. ux-designer → UXRD creation (if frontend/UI work) → document-reviewer **[Stop: UXRD Approval]**
4. codebase-analyzer (and ui-analyzer for frontend/UI work) → Read-only fact gathering → `focusAreas`
5. technical-designer(-frontend) → Design Doc creation (consume `focusAreas` into the Fact Disposition Table; include expert analysis synthesis if performed)
6. document-reviewer → Design Doc review
7. design-sync → Design Doc consistency verification **[Stop: Design Doc Approval]**
8. acceptance-test-generator → Integration and E2E test skeleton generation
   → Orchestrator: Verify generation, then pass information to work-planner (*1)
9. work-planner → Work plan creation (including integration and E2E test information)
10. document-reviewer → Work plan review (traceability to Design Doc, Failure Mode Checklist coverage) **[Stop: Batch approval for entire implementation phase]**
11. **Start autonomous execution mode**: task-decomposer → Execute all tasks
12. Post-Implementation Verification → code-verifier + security-reviewer IN PARALLEL (pass/fail criteria and 2-cycle fix cap in that section)
13. Final Cleanup → Delete consumed task files
14. Completion report

### Small Scale
1. Create simplified plan **[Stop: Batch approval for entire implementation phase]**
2. **Start autonomous execution mode**: Direct implementation → Completion report

## Autonomous Execution Mode

### Pre-Execution Environment Check

**Principle**: Verify subagents can complete their responsibilities

**Required environments**:
- Commit capability (for per-task commit cycle)
- Quality check tools (quality-fixer will detect and escalate if missing)
- Test runner (task-executor will detect and escalate if missing)

**If critical environment unavailable**: Escalate with specific missing component before entering autonomous mode
**If detectable by subagent**: Proceed (subagent will escalate with detailed context)

### Authority Delegation

**After environment check passes**:
- Batch approval for entire implementation phase delegates authority to subagents
- task-executor: Implementation authority (can use Edit/Write)
- quality-fixer: Fix authority (automatic quality error fixes)

### Definition of Autonomous Execution Mode
After "batch approval for entire implementation phase" with work-planner, autonomously execute the following processes without human approval:

```mermaid
graph TD
    START[Batch approval for entire implementation phase] --> AUTO[Start autonomous execution mode]
    AUTO --> TD[task-decomposer: Task decomposition]
    TD --> LOOP[Task execution loop]
    LOOP --> TE[task-executor: Implementation]
    TE --> ESCJUDGE{Escalation judgment}
    ESCJUDGE -->|escalation_needed/blocked| USERESC[Escalate to user]
    ESCJUDGE -->|testsAdded has int/e2e| ITR[integration-test-reviewer]
    ESCJUDGE -->|No issues| QF
    ITR -->|needs_revision| TE
    ITR -->|approved| QF
    QF[quality-fixer: Quality check and fixes] --> COMMIT[Orchestrator: Execute git commit]
    COMMIT --> CHECK{Any remaining tasks?}
    CHECK -->|Yes| LOOP
    CHECK -->|No| REPORT[Completion report]

    LOOP --> INTERRUPT{User input?}
    INTERRUPT -->|None| TE
    INTERRUPT -->|Yes| REQCHECK{Requirement change check}
    REQCHECK -->|No change| TE
    REQCHECK -->|Change| STOP[Stop autonomous execution]
    STOP --> RA[Re-analyze with requirement-analyzer]
```

### Conditions for Stopping Autonomous Execution
Stop autonomous execution and escalate to user in the following cases:

1. **Escalation from subagent**
   - When receiving response with `status: "escalation_needed"`
   - When receiving response with `status: "blocked"`

2. **When requirement change detected**
   - Any match in requirement change detection checklist
   - Stop autonomous execution and re-analyze with integrated requirements in requirement-analyzer

3. **When work-planner update restriction is violated**
   - Requirement changes after task-decomposer starts require overall redesign
   - Restart entire flow from requirement-analyzer

4. **When user explicitly stops**
   - Direct stop instruction or interruption

## Quantitative Auto-Stop Triggers

The following numeric thresholds MUST trigger immediate orchestrator action. These are non-negotiable safety boundaries:

| Trigger Condition | Required Action |
|---|---|
| **5+ files changed** in a single task | STOP immediately. Create impact report listing all changed files and affected modules. Present to user before continuing. |
| **Same error occurs 3 times** | STOP. Mandatory root cause analysis using 5 Whys technique. Do NOT attempt another fix without completing analysis. |
| **3 files edited** without TodoWrite update | Force TodoWrite status update. Cannot proceed with next Edit until TodoWrite reflects current progress. |
| **2nd consecutive error fix attempt** | Auto re-execute rule-advisor. Previous approach has failed — reassess task essence and strategy before continuing. |
| **5 cumulative Edit tool uses** | Force creation of impact report. Document: files changed, modules affected, tests impacted. |
| **3 edits to the same file** | STOP. Consider whether refactoring is needed instead of incremental patches. Present refactoring proposal to user. |

### Auto-Stop Enforcement Rules

1. Counters reset at the start of each new task
2. Orchestrator MUST track edit counts per-file and cumulative
3. Auto-stop triggers take priority over autonomous execution mode
4. After any auto-stop, the orchestrator MUST present a status report before resuming
5. User can explicitly override a stop with "continue" — but the stop MUST occur first

## Error-Fixing Impulse Control Protocol

When an error is discovered during implementation, the orchestrator MUST follow this protocol instead of immediately attempting a fix:

### Protocol Steps

1. **PAUSE** — Do NOT attempt to fix the error immediately
2. **Re-execute rule-advisor** — Reassess the task with the error context:
   ```yaml
   subagent_type: rule-advisor
   prompt: "Re-analyze task considering this error: [error details]. Determine if the original approach is still valid or if a different strategy is needed."
   ```
3. **Root Cause Analysis** — Apply 5 Whys technique:
   ```
   Error: [observed error]
   Why 1: [immediate cause]
   Why 2: [cause of Why 1]
   Why 3: [cause of Why 2]
   Why 4: [cause of Why 3]
   Why 5: [root cause]
   ```
4. **Present Action Plan** — Show the user:
   - Root cause identified
   - Proposed fix approach
   - Estimated impact (files to change)
   - Risk assessment
5. **Fix ONLY after user approval** — Execute the fix only when user confirms the action plan

### When This Protocol Applies

- Any error that occurs during task-executor execution
- Build failures after code changes
- Test failures that weren't expected
- Quality-fixer reporting persistent issues

### When This Protocol Does NOT Apply

- Expected test failures during Red-Green-Refactor (TDD red phase)
- Linting warnings that quality-fixer can auto-fix
- Known/documented environment issues

## Metacognitive TodoWrite Integration

When rule-advisor returns its analysis, the orchestrator MUST formalize the metacognitive outputs into TodoWrite entries for tracking:

### Mapping Rule-Advisor Output → TodoWrite

| Rule-Advisor Output Field | TodoWrite Usage |
|---|---|
| `metaCognitiveGuidance.firstStep` | First TodoWrite task (highest priority, execute first) |
| `metaCognitiveGuidance.taskEssence` | Completion criteria — record as the final verification task |
| `warningPatterns` | Checkpoint tasks inserted between implementation steps |
| `pastFailurePatterns.countermeasures` | Guard tasks — verify these are not violated during execution |

### TodoWrite Structure After Rule-Advisor

```
1. [in_progress] {firstStep from rule-advisor}
2. [pending] Checkpoint: Verify {warningPattern[0]} not triggered
3. [pending] Implementation step 1
4. [pending] Checkpoint: Verify {warningPattern[1]} not triggered
5. [pending] Implementation step 2
...
N-1. [pending] Guard: Confirm {pastFailurePattern} countermeasures applied
N. [pending] Verify task essence: {taskEssence}
```

### Rules

1. Checkpoints are inserted between every 2-3 implementation steps
2. Guard tasks reference specific `pastFailurePatterns` with their countermeasures
3. The final task ALWAYS verifies `taskEssence` from rule-advisor
4. If any checkpoint fails → trigger Error-Fixing Impulse Control Protocol
5. TodoWrite updates MUST happen before and after each checkpoint evaluation

### Commit Strategy Selection

**Ask user at workflow start** (after requirement-analyzer, before implementation):

| Strategy | When to Commit | Best For |
|----------|----------------|----------|
| **per-task** | After each task completes | Atomic commits, easy rollback, CI-friendly |
| **per-phase** | After each phase (Design, Implementation, etc.) | Balanced granularity |
| **per-feature** | Single commit at feature completion | Clean history, squash-like |
| **manual** | User explicitly requests | Full control, interactive workflow |

**Default**: `per-task` (recommended for autonomous mode)

**Strategy affects**:
- When `git commit` is executed
- How quality-fixer cycles are grouped
- Commit message granularity

### Task Management: 3-Step Cycle

**Per-task cycle**:
```
1. task-executor → Implementation
2. Escalation judgment/Follow-up → Check task-executor status
3. quality-fixer → Quality check and fixes
4. [Conditional] git commit → Based on commit strategy
```

**Step 2 Execution Details**:
- `status: escalation_needed` or `status: blocked` → Escalate to user
- `testsAdded` contains `*.int.test.ts` or `*.e2e.test.ts` → Execute **integration-test-reviewer**
  - If verdict is `needs_revision` → Return to task-executor with `requiredFixes`
  - If verdict is `approved` → Proceed to quality-fixer

**Commit execution by strategy**:

| Strategy | Commit Trigger |
|----------|----------------|
| **per-task** | quality-fixer returns `approved: true` → Commit immediately |
| **per-phase** | All tasks in phase complete + quality-fixer `approved: true` → Commit |
| **per-feature** | All phases complete + final quality-fixer `approved: true` → Single commit |
| **manual** | User says "commit" or "save progress" → Commit staged changes |

**Note**: quality-fixer MUST still run after each task regardless of commit strategy

### Post-Implementation Verification

The per-task cycle checks each task in isolation. It cannot detect drift between the finished implementation and the Design Doc, nor assess the security posture of the change set as a whole. After **all** task cycles finish — before the completion report — run a whole-implementation verification pass.

**Invoke both verifiers in parallel** (single message, two Agent calls):

| Verifier | Inputs |
|----------|--------|
| `code-verifier` | `doc_type: design-doc`, Design Doc path, `code_paths` from `git diff --name-only main...HEAD` |
| `security-reviewer` | Design Doc path, same implementation file list |

**Pass/fail criteria**:

| Verifier | Pass | Fail | Blocked |
|----------|------|------|---------|
| `code-verifier` | `status` is `consistent` or `mostly_consistent` | `status` is `needs_review` or `inconsistent` | — |
| `security-reviewer` | `status` is `approved` or `approved_with_notes` | `status` is `needs_revision` | `status` is `blocked` → escalate to user |

**Normalizing verifier output into a unified `requiredFixes[]`** — the two verifiers emit different shapes and must be reconciled before invoking task-executor:

- `security-reviewer.requiredFixes[]` is already `{location, issue, fix}` → pass through unchanged
- `code-verifier.discrepancies[]` → convert each actionable entry (status `drift`, `gap`, or `conflict`) to `{location: discrepancy.codeLocation, issue: discrepancy.claim, fix: "<correction needed to restore Design Doc consistency, derived from classification and evidence>"}`
- When `discrepancy.codeLocation` is `null` (the claim is unimplemented), set `location` to the planned target file path. If no target file can be determined, escalate to the user rather than invoking Fix Mode with an unresolvable location.

**Fix cycle** (when any verifier failed, maximum 2 cycles):

1. Create a consolidated fix task file (`docs/features/{feature}/{part}/{plan-name}/post-impl-fixes-YYYYMMDD.md`) from the task template
2. Populate its Target Files with the **union** of file paths from every verifier's `requiredFixes[].location` and `discrepancies[].codeLocation` (parse `file[:line]`, keep the file part). Without this union the executor's File Scope Constraint rejects the very files it was dispatched to fix, since they belong to different original tasks.
3. Invoke `task-executor` in **Fix Mode** with `task_file` set to the consolidated path and `requiredFixes` set to the normalized array
4. Run `quality-fixer`, then re-run **only the verifiers that failed**, retaining recorded evidence from those that passed

**Re-run rule**: a cycle makes progress only when a previously failing verifier reaches a pass status, or its count of named remaining findings decreases. Escalate immediately when a cycle makes no progress or requires external input. After cycle 2, escalate every remaining failure with its findings.

### 2-Stage TodoWrite Management

**Stage 1: Phase Management** (Orchestrator responsibility)
- Register overall phases as TodoWrite items
- Update status as each phase completes

**Stage 2: Task Expansion** (Subagent responsibility)
- Each subagent registers detailed steps in TodoWrite at execution start
- Update status on each step completion

## Main Orchestrator Roles

1. **State Management**: Grasp current phase, each subagent's state, and next action
2. **Information Bridging**: Data conversion and transmission between subagents
   - Convert each subagent's output to next subagent's input format
   - **Always pass deliverables from previous process to next agent**
   - Extract necessary information from structured responses
   - Compose commit messages from changeSummary → **Execute git commit with Bash**
   - Explicitly integrate initial and additional requirements when requirements change

   #### *1 acceptance-test-generator → work-planner

   **Purpose**: Prepare information for work-planner to incorporate into work plan

   **Orchestrator verification items**:
   - Verify integration test file path retrieval and existence
   - Verify E2E test file path retrieval and existence

   **Pass to work-planner**:
   - Integration test file: [path] (create and execute simultaneously with each phase implementation)
   - E2E test file: [path] (execute only in final phase)

   **On error**: Escalate to user if files are not generated

3. **Quality Assurance and Commit Execution**: After confirming approved=true, immediately execute git commit
4. **Autonomous Execution Mode Management**: Start/stop autonomous execution after approval, escalation decisions
5. **ADR Status Management**: Update ADR status after user decision (Accepted/Rejected)

## Important Constraints

- **Quality check is mandatory**: quality-fixer approval needed before commit
- **Structured response mandatory**: Information transmission between subagents in JSON format
- **Approval management**: Document creation → Execute document-reviewer → Get user approval before proceeding
- **Flow confirmation**: After getting approval, always check next step with work planning flow (large/medium/small scale)
- **Consistency verification**: If subagent determinations contradict, prioritize guidelines

## Required Dialogue Points with Humans

### Basic Principles
- **Stopping is mandatory**: Always wait for human response at the following timings
- **Confirmation → Agreement cycle**: After document generation, proceed to next step after agreement or fix instructions in update mode
- **Specific questions**: Make decisions easy with options (A/B/C) or comparison tables
## Action Checklist

When receiving a task, check the following:

- [ ] Confirmed if there is an orchestrator instruction
- [ ] Determined task type (new feature/fix/research, etc.)
- [ ] Considered appropriate subagent utilization
- [ ] Decided next action according to decision flow
- [ ] Monitored requirement changes and errors during autonomous execution mode