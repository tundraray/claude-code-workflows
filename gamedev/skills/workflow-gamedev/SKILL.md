---
name: workflow-gamedev
description: This skill guides subagent coordination through game development workflows. Automatically loaded when orchestrating multiple agents, managing workflow phases, determining autonomous execution mode, or when "orchestration", "workflow phases", "scale determination", "stop points", or "autonomous mode" are mentioned.
---

# Subagents Gamedev Orchestration Guide

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
    RA --> Scale[Scale assessment + Development Mode detection]
    Scale --> Scenario{Scenario detection}
    Scenario -->|New project| A[Scenario A flow]
    Scenario -->|Existing project| B[Scenario B / Medium / Small flow]
```

**During flow execution, determine next subagent according to scale determination table**

### Requirement Change Detection During Flow

**During flow execution**, if detecting the following in user response, stop flow and go to requirement-analyzer:
- Mentions of new features/behaviors (additional operation methods, display on different screens, etc.)
- Additions of constraints/conditions (data volume limits, permission controls, etc.)
- Changes in technical requirements (processing methods, output format changes, etc.)
- Changes in game design direction (core loop changes, new mechanics, progression system overhaul)

**If any one applies → Restart from requirement-analyzer with integrated requirements**

## Available Subagents

### Shared Agents (from overture framework)

1. **requirement-analyzer**: Requirement analysis, work scale determination, Development Mode detection
2. **quality-fixer**: Self-contained processing for overall quality assurance and fixes until completion
3. **task-decomposer**: Appropriate task decomposition of work plans
4. **task-executor**: Individual task execution and structured response
5. **integration-test-reviewer**: Review integration/E2E tests for skeleton compliance and quality
6. **security-reviewer**: Security compliance review against Design Doc and coding-principles (read-only)
7. **technical-designer**: ADR/Design Doc creation
8. **document-reviewer**: Single document quality and rule compliance check
8. **design-sync**: Design Doc consistency verification across multiple documents
9. **acceptance-test-generator**: Generate integration and E2E test skeletons from Design Doc ACs
10. **expert-analyst**: Parallel multi-perspective analysis from expert viewpoint
11. **codebase-scanner**: Scans for dead code, orphan files, unused exports, and suspicious areas (read-only)
12. **cleanup-executor**: Safely removes confirmed dead code with git backup and build verification
13. **code-reviewer**: Code review for quality, patterns, and standards compliance
14. **code-verifier**: Verification of code correctness and completeness
15. **investigator**: Deep investigation of issues and root cause analysis
16. **rule-advisor**: Task strategy assessment and metacognitive guidance
17. **scope-discoverer**: Scope analysis and dependency discovery
18. **solver**: Problem-solving and solution design
19. **verifier**: Verification of task completion and acceptance criteria

### Gamedev-Specific Agents

1. **market-analyst**: Market analysis, competitor research, Go/No-Go recommendations
2. **producer-agent**: Project config, team selection, resource planning, timeline
3. **sr-game-designer**: GDD creation (vision, pillars, core loop, progression)
4. **mid-game-designer**: Feature specifications, user stories, acceptance criteria, balancing
5. **mechanics-developer**: Game mechanics architecture (state machines, physics, pooling, events)
6. **game-feel-developer**: Game feel specification (screen shake, particles, audio, tweens)
7. **sr-game-artist**: Art direction, style guide, color palette, reference sheets
8. **technical-artist**: Pipeline specs, atlas optimization, shader requirements
9. **ui-ux-agent**: Game UI/UX: HUD, menus, interaction patterns, accessibility
10. **data-scientist**: Analytics/telemetry design, KPIs, A/B tests, dashboards
11. **qa-agent**: Test plans, performance validation, playtesting protocols
12. **gamedev-work-planner**: Game-specific work planning with 6-phase structure
13. **game-researcher**: External game research, data collection, source code analysis (used by game-analyze command)

**Dropped agents** (replaced by gamedev agents): prd-creator (→ market-analyst + sr-game-designer), ux-designer (→ ui-ux-agent), work-planner (→ gamedev-work-planner)

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

### Orchestrator Never Writes Directly

**All document and code operations MUST go through agents.**

### File Ownership by Agent

| File Pattern | Owner Agent |
|--------------|-------------|
| `docs/game-design/*.md` (GDD) | sr-game-designer |
| `docs/game-design/features/*.md` | mid-game-designer |
| `docs/market-research/*.md` | market-analyst |
| `docs/art/*.md` | sr-game-artist |
| `docs/analytics/*.md` | data-scientist |
| `docs/handoffs/*.md` | producer-agent |
| `docs/adr/*.md` | technical-designer |
| `docs/features/*/design-*.md` | technical-designer |
| `docs/features/*/*/*.md` (work plans) | gamedev-work-planner |
| `docs/features/<feature>/<part>/<plan-name>/*.md` | task-decomposer |
| `src/**/*`, `tests/**/*` (code) | task-executor |
| `docs/game-research/**/*.md` | game-researcher |
| Any file (quality fixes) | quality-fixer |

**Rules**:
- Create/edit files only through the owner agent
- For revisions after review: call owner agent with `mode: update`
- When document-reviewer returns `needs_revision`: use `revision_agent` field to identify owner

## Explicit Stop Points

Autonomous execution MUST stop and wait for user input at these points.
**Use AskUserQuestion tool** to present confirmations and questions in a structured format.

| Phase | Stop Point | User Action Required |
|-------|------------|---------------------|
| Requirements | After requirement-analyzer completes | Confirm requirements + Development Mode selection |
| Market Analysis | After market-analyst completes (Scenario A only) | Go/No-Go decision |
| GDD | After document-reviewer completes GDD review | Approve GDD |
| ADR | After document-reviewer completes ADR review (if ADR created) | Approve ADR |
| Design | After design-sync completes consistency verification | Approve Design Doc |
| Work Plan | After gamedev-work-planner creates plan | Batch approval for implementation phase |

**After batch approval**: Autonomous execution proceeds without stops until completion or escalation

## Scale Determination and Document Requirements

| Scale | File Count | Market Analysis | GDD | ADR | Design Doc | Work Plan |
|-------|------------|----------------|-----|-----|------------|-----------|
| Small | 1-2 | Not needed | Not needed | Not needed | Not needed | Simplified |
| Medium | 3-5 | Not needed | Conditional※1 | Conditional※2 | **Required** | **Required** |
| Large | 6+ | **Required**※3 | **Required** | Conditional※2 | **Required** | **Required** |

※1: When new game mechanics or systems are involved
※2: Architecture changes, new technology, or data flow changes
※3: For new projects (Scenario A). Skip for features in existing projects (Scenario B)

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

### Shared Agent Responses
- **requirement-analyzer**: scale, confidence, fileCount, requiredDocuments (gdd, adr, designDoc, workPlan), scopeDependencies, questions, developmentMode, scenario
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

### Gamedev Agent Responses
- **market-analyst**: status, recommendation (go/no-go/conditional), marketSize, competitors, risks, targetAudience, monetizationPotential
- **sr-game-designer**: status, gddPath, coreMechanics, gamePillars, progressionSystems, contentSpecifications
- **mid-game-designer**: status, featureSpecs[], userStories[], acceptanceCriteria[], balancingParameters
- **mechanics-developer**: status, architecturePath, stateMachines[], physicsSystems[], eventSystem, objectPooling
- **game-feel-developer**: status, feedbackSystems[], screenShake, particles, audioCues, tweenDefinitions
- **sr-game-artist**: status, artDirectionPath, styleGuide, colorPalette, referenceSheets
- **technical-artist**: status, pipelineSpecs, atlasConfig, shaderRequirements, assetFormats
- **ui-ux-agent**: status, hudDesign, menuFlow, interactionPatterns, accessibilitySpecs
- **data-scientist**: status, eventSchema, kpiDefinitions, abTestDesigns, dashboardSpecs
- **qa-agent**: status, testPlan, performanceTargets, playtestProtocol, frameBudget
- **gamedev-work-planner**: status, planPath, phases[6], taskCount, dependencies
- **game-researcher**: status, mode (research/synthesis), gameName, gameSlug, depthLevel, sourcesCollected, dataQuality (verified/inferred/estimated/speculative counts), outputFiles, missingData, sourceCodeAnalyzed

## Scenario Detection Logic

### How requirement-analyzer detects scenario

```yaml
scenarioDetection:
  checkProjectConfig: "Does project-config.json exist in docs/?"
  checkGDD: "Does docs/game-design/*-gdd.md exist?"

  rules:
    - condition: "No project-config.json AND no GDD"
      scenario: "A (New Project)"
      flow: "Large Scale — Scenario A"
    - condition: "project-config.json exists AND GDD exists"
      scenario: "B (Existing Project)"
      flow: "Large Scale — Scenario B or Medium/Small based on file count"
    - condition: "project-config.json exists AND no GDD"
      scenario: "B (Existing Project, pre-GDD)"
      flow: "Consider creating GDD first"
```

## Development Mode Routing

Mode detected by requirement-analyzer based on user input:

| Mode | Description | Flow Modification |
|------|-------------|-------------------|
| **Full Development** | Standard scale-based flow | No modification |
| **Design Only** | Execute through art direction (steps 1-11 in Scenario A), stop | Deliver design package, no implementation |
| **Prototype** | requirement-analyzer → sr-game-designer (core loop only) → simplified plan → mechanics-focused execution | Skip market analysis, art, analytics |

## Handling Requirement Changes

### Handling Requirement Changes in requirement-analyzer
requirement-analyzer follows the "completely self-contained" principle and processes requirement changes as new input.

#### How to Integrate Requirements

**Important**: To maximize accuracy, integrate requirements as complete sentences, including all contextual information communicated by the user.

```yaml
Integration example:
  Initial: "I want to create a platformer game"
  Addition: "It should also have a level editor"
  Result: "I want to create a platformer game. It should also have a level editor.

          Initial requirement: I want to create a platformer game
          Additional requirement: It should also have a level editor"
```

### Update Mode for Document Generation Agents
Document generation agents (gamedev-work-planner, technical-designer, sr-game-designer, mid-game-designer, market-analyst) can update existing documents in `update` mode.

- **Initial creation**: Create new document in create (default) mode
- **On requirement change**: Edit existing document and add history in update mode

Criteria for timing when to call each agent:
- **gamedev-work-planner**: Request updates only before execution
- **technical-designer**: Request updates according to design changes → Execute document-reviewer for consistency check
- **sr-game-designer**: Request updates according to game design changes → Execute document-reviewer for consistency check
- **mid-game-designer**: Request updates according to feature specification changes
- **market-analyst**: Request updates according to market/scope changes
- **document-reviewer**: Always execute before user approval after GDD/ADR/Design Doc creation/update

## Basic Flow for Work Planning

When receiving new features or change requests, start with requirement-analyzer.
According to scale determination and scenario detection:

### Large Scale — Scenario A: New Project

1. requirement-analyzer → Requirements + project discovery **[Stop: Requirements + Development Mode selection]**
2. market-analyst → Market analysis, competitor research, Go/No-Go **[Stop: Market Analysis Go/No-Go]**
3. producer-agent → Project config, team selection, resource plan
4. sr-game-designer → GDD (vision, pillars, core loop, progression)
5. document-reviewer → GDD review **[Stop: GDD Approval]**
6. mid-game-designer → Feature specifications from GDD systems
7. mechanics-developer → Game mechanics architecture
8. game-feel-developer → Game feel specification
9. sr-game-artist → Art direction, style guide, color palette
   technical-artist → Pipeline specs, atlas optimization, shader requirements
10. ui-ux-agent → Game UI/UX: HUD, menus, interaction, accessibility
11. data-scientist → Analytics/telemetry design, KPIs, A/B tests
12. [Conditional] technical-designer → ADR (if architecture changes)
    → document-reviewer **[Stop: ADR Approval]**
13. technical-designer → Design Doc (integrates: GDD, mechanics, game feel, art, UI, analytics)
14. document-reviewer → Design Doc review
15. design-sync → Consistency across all documents **[Stop: Design Doc Approval]**
16. acceptance-test-generator → Test skeletons
17. gamedev-work-planner → Work plan with 6 game phases **[Stop: Batch approval for entire implementation phase]**
18. **Start autonomous execution mode**: task-decomposer → (task-executor → quality-fixer → commit) loop
19. security-reviewer → Security compliance review (if `blocked` → halt; if `needs_revision` → create fix tasks)
20. Completion report

### Large Scale — Scenario B: Large Feature (existing project/GDD)

1. requirement-analyzer → Requirements analysis **[Stop: Requirements confirmation]**
2. sr-game-designer → GDD update for new feature
3. document-reviewer → GDD review **[Stop: GDD Approval]**
4. mechanics-developer → Mechanics architecture for feature
5. [Conditional] game-feel-developer, sr-game-artist, ui-ux-agent, data-scientist (based on feature type)
6. [Conditional] technical-designer → ADR (if architecture changes)
7. technical-designer → Design Doc
8. document-reviewer → Design Doc review
9. design-sync → Consistency across all documents **[Stop: Design Doc Approval]**
10. acceptance-test-generator → Test skeletons
11. gamedev-work-planner → Work plan **[Stop: Batch approval for entire implementation phase]**
12. **Start autonomous execution mode**: task-decomposer → (task-executor → quality-fixer → commit) loop
13. security-reviewer → Security compliance review (if `blocked` → halt; if `needs_revision` → create fix tasks)
14. Completion report

### Medium Scale (3-5 Files)

1. requirement-analyzer → Requirement analysis **[Stop: Requirements confirmation]**
2. [Conditional] sr-game-designer → Game design spec (if new mechanics)
   mid-game-designer → Feature specification
3. mechanics-developer → Mechanics architecture (if new systems)
4. [Conditional] ui-ux-agent (if UI), game-feel-developer (if polish)
5. technical-designer → Design Doc
6. document-reviewer → Design Doc review
7. design-sync → Consistency across all documents **[Stop: Design Doc Approval]**
8. acceptance-test-generator → Test skeletons
9. gamedev-work-planner → Work plan **[Stop: Batch approval for entire implementation phase]**
10. **Start autonomous execution mode**: task-decomposer → (task-executor → quality-fixer → commit) loop
11. security-reviewer → Security compliance review (if `blocked` → halt; if `needs_revision` → create fix tasks)
12. Completion report

### Small Scale (1-2 Files)

1. Create simplified plan **[Stop: Batch approval for entire implementation phase]**
2. **Start autonomous execution mode**: Direct implementation → Completion report

## Gamedev Orchestration Principles

### Agent Hierarchy
- **producer-agent** has authority over project scope and timeline
- **sr-game-designer** owns game vision (GDD is first-class artifact)
- **mechanics-developer** and **game-feel-developer** coordinate on systems + feedback
- **sr-game-artist** + **technical-artist** own the art pipeline
- **data-scientist** provides data-driven insights to all agents

### GDD as First-Class Artifact
- GDD is the single source of truth for game design
- All agents must reference GDD for design decisions
- GDD changes require document-reviewer approval
- Feature specs (mid-game-designer) derive from GDD systems

### Art Pipeline Integration
- **sr-game-artist** defines what (style, concepts)
- **technical-artist** defines how (formats, atlases, shaders, optimization)
- Both must be consulted before art-related implementation tasks

## Autonomous Execution Mode

Everything after batch approval — entry conditions, the per-task cycle, commit strategies, post-implementation verification, final cleanup, auto-stop triggers, and the error-fixing protocol — is governed by the **`workflows`** skill.

Load `${CLAUDE_PLUGIN_ROOT}/skills/workflow-execution/SKILL.md` before entering autonomous mode.

This guide stops at the batch-approval gate: it decides which subagent runs when across the game development phases, and which documents gate each one. The `workflow-execution` skill decides how the loop behaves once no one is asked for permission any more.

**Game-specific note**: the 6 development phases (Core Mechanics, Game Feel, Art, UI, Analytics, QA) are phases *within* one plan, so `per-phase` commit strategy groups commits by those phases.

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

   #### *1 acceptance-test-generator → gamedev-work-planner

   **Purpose**: Prepare information for gamedev-work-planner to incorporate into work plan

   **Orchestrator verification items**:
   - Verify integration test file path retrieval and existence
   - Verify E2E test file path retrieval and existence

   **Pass to gamedev-work-planner**:
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
- **GDD authority**: GDD is the single source of truth for game design — all design decisions must reference it

## Required Dialogue Points with Humans

### Basic Principles
- **Stopping is mandatory**: Always wait for human response at the following timings
- **Confirmation → Agreement cycle**: After document generation, proceed to next step after agreement or fix instructions in update mode
- **Specific questions**: Make decisions easy with options (A/B/C) or comparison tables
- **Development Mode selection**: Present mode options (Full Development / Design Only / Prototype) at requirements stop point

## Action Checklist

When receiving a task, check the following:

- [ ] Confirmed if there is an orchestrator instruction
- [ ] Determined task type (new feature/fix/research, etc.)
- [ ] Detected scenario (A: New Project / B: Existing Project)
- [ ] Detected Development Mode (Full Development / Design Only / Prototype)
- [ ] Considered appropriate subagent utilization
- [ ] Decided next action according to decision flow
- [ ] Monitored requirement changes and errors during autonomous execution mode
