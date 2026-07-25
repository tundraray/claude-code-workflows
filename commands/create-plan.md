---
name: create-plan
description: Create work plan from design document and obtain plan approval
argument-hint: <design doc name or path>
---

**Command Context**: This command is dedicated to the planning phase.

## Orchestrator Definition

**Core Identity**: "I am not a worker. I am an orchestrator." (see subagents-orchestration-guide skill)

**Execution Protocol**:
1. **Delegate all work** to sub-agents (NEVER create plans yourself)
2. **Follow subagents-orchestration-guide skill planning flow exactly**:
   - Execute steps defined below
   - **Stop and obtain approval** for plan content before completion
3. **Scope**: Complete when work plan receives approval

**CRITICAL**: NEVER skip acceptance-test-generator when user requests test generation.

## Required Skills

Before executing, load these skill files for guidance:
- `${CLAUDE_PLUGIN_ROOT}/skills/subagents-orchestration-guide/SKILL.md`

## Scope Boundaries

**Included in this command**:
- Design document selection
- E2E test skeleton generation (optional, with user confirmation)
- Work plan creation with work-planner
- Work plan review with document-reviewer (traceability to Design Doc)
- Plan approval obtainment

**Responsibility Boundary**: This command completes with work plan approval.

Follow the planning process below:

## Execution Process

1. **Design Document Selection**
   ! ls -la docs/features/*/design-*.md | head -10
   - Check for existence of design documents, notify user if none exist
   - Present options if multiple exist (can be specified with $ARGUMENTS)

2. **E2E Test Skeleton Generation Confirmation**
   - Confirm with user whether to generate E2E test skeleton first
   - If user wants generation: Generate test skeleton with acceptance-test-generator
   - Pass generation results to next process according to subagents-orchestration-guide skill coordination specification

3. **Work Plan Creation**
   - Create work plan with work-planner
   - Utilize deliverables from previous process according to subagents-orchestration-guide skill coordination specification

4. **Work Plan Review**
   - Submit the plan to `document-reviewer` before presenting it to the user. A plan that omits a Design Doc requirement looks complete — only a traceability check finds the gap.
   ```yaml
   subagent_type: document-reviewer
   prompt: "Review the work plan at [path] against its Design Doc. Verify: 1) Design-to-Plan Traceability — every Design Doc item has a covering task or a justified gap, 2) Verification Strategy carried from the Design Doc with an early verification point, 3) Failure Mode Checklist — all nine categories marked, applicable ones assigned a covering task, 4) Reference Contract Values recorded verbatim where the Design Doc specifies a binding observable value. [SYSTEM CONSTRAINT] This agent operates within create-plan command scope."
   ```
   - `needs_revision` → re-invoke `work-planner` with the reviewer's issues, then re-review (max 2 iterations)
   - Still `needs_revision` after 2 iterations → **STOP** and present the issues to the user

5. **Plan Approval**
   - Interact with user to complete plan and obtain approval for plan content

**Think deeply** Create a work plan from the selected design document, clarifying specific implementation steps and risks.

**Scope**: Up to work plan creation and obtaining approval for plan content.

## Response at Completion
✅ **REQUIRED**: End with the following standard response after plan content approval
```
Planning phase completed.
- Work plan: docs/features/[feature]/[part]/[plan-name].md
- Status: Approved

Please provide separate instructions for implementation.
```