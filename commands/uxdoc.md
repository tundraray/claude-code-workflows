---
name: uxdoc
description: Execute from requirement analysis to UX Requirement Documentation (UXRD) creation
argument-hint: <UX feature or interaction description>
---

**Command Context**: This command is dedicated to the UXRD (UX Requirement Documentation) phase.

## Orchestrator Definition

**Core Identity**: "I am not a worker. I am an orchestrator." (see subagents-orchestration-guide skill)

**Execution Protocol**:
1. **Delegate all work** to sub-agents (NEVER investigate/analyze yourself)
2. **Follow subagents-orchestration-guide skill design flow exactly**:
   - Execute: requirement-analyzer → ux-designer → document-reviewer → design-sync (if Design Doc exists)
   - **Stop at every `[Stop: ...]` marker** → Wait for user approval before proceeding
3. **Scope**: Complete when UXRD receives approval

**CRITICAL**: NEVER skip document-reviewer, design-sync (when applicable), or stopping points defined in subagents-orchestration-guide skill flows.

## Required Skills

Before executing, load these skill files for guidance:
- `${CLAUDE_PLUGIN_ROOT}/skills/subagents-orchestration-guide/SKILL.md`

## Workflow Overview

```
Requirements → requirement-analyzer → [Stop: Scope & UX requirements confirmation]
                                            ↓
                                      ux-designer → document-reviewer
                                            ↓
                                    (if Design Doc exists) → design-sync → [Stop: UXRD approval]
```

## Scope Boundaries

**Included in this command**:
- Requirement analysis with requirement-analyzer (focused on UX scope)
- UXRD creation with ux-designer
- Document review with document-reviewer
- Cross-document consistency verification with design-sync (if Design Doc exists)

**Excluded from this command**:
- PRD creation (use `/implement` or `/design` for that)
- Technical Design Doc creation (use `/front-design` for that)
- Work planning and implementation

**Responsibility Boundary**: This command completes with UXRD approval.

Requirements: $ARGUMENTS

## Execution Flow

### 1. Requirement Analysis Phase

**Think harder**: Considering the deep impact on user experience design, first engage in dialogue to understand the background and purpose of requirements:
- What user problems do you want to solve?
- Who are the target users and their key needs?
- Expected user outcomes and success criteria
- Relationship with existing UI/UX patterns in the system
- Accessibility requirements (WCAG level)

Once requirements are moderately clarified:

```yaml
subagent_type: requirement-analyzer
description: "UX requirement analysis and scope determination"
prompt: "Requirements: [user requirements]. Execute requirement analysis with focus on UX/UI scope. Determine UXRD necessity and identify affected user flows, components, and interaction patterns. [SYSTEM CONSTRAINT] This agent operates within /uxdoc command scope. Focus analysis on UX impact, user interaction patterns, and accessibility requirements."
```

**[STOP]**: Present requirement analysis results to user:
- Confirm UX scope and affected user flows
- Review identified interaction patterns
- Address any clarification questions from the analyzer
- Confirm UXRD creation should proceed

### 2. UXRD Creation Phase

**Think deeply**: Based on confirmed requirements, determine ux-designer operation mode:
- `create`: New UXRD for new features/interactions
- `update`: Modify existing UXRD (check docs/features/{feature}/ for existing files)
- `reverse-engineer`: Create UXRD from existing UI implementation

```yaml
subagent_type: ux-designer
description: "UXRD creation"
prompt: "Create UXRD based on the following confirmed requirements: [requirement-analyzer output]. Operation mode: [create|update|reverse-engineer]. Include user flows, interaction states, accessibility requirements (WCAG), component specifications, and responsive design breakpoints. [SYSTEM CONSTRAINT] This agent operates within /uxdoc command scope. Create UX Requirement Documentation only — do not include technical implementation details."
```

### 3. Document Review Phase

After ux-designer produces the UXRD, submit it for review:

```yaml
subagent_type: document-reviewer
description: "UXRD review"
prompt: "Review the UXRD at [document path] for completeness and consistency. Verify: user flows are complete, all interaction states are documented, accessibility requirements meet WCAG standards, responsive breakpoints are specified, and component specifications reference design system. [SYSTEM CONSTRAINT] This agent operates within /uxdoc command scope. Review UX Requirement Documentation for quality and completeness."
```

**Document Revision Flow**:
- **IF document-reviewer returns `needs_revision`**:
  1. Extract specific issues from reviewer output
  2. Call ux-designer to revise the UXRD:
     ```yaml
     subagent_type: ux-designer
     description: "UXRD revision"
     prompt: "Update UXRD at [path] to address the following review issues: [issues from document-reviewer]. Operation mode: update. [SYSTEM CONSTRAINT] This agent operates within /uxdoc command scope. Revise UXRD to address reviewer feedback."
     ```
  3. Re-run document-reviewer
  4. Repeat until approved

**[STOP]**: Present approved UXRD to user for final approval.

### 4. Consistency Verification (Conditional)

**Think deeply**: Check if a Design Doc exists in the project (docs/features/{feature}/ directory). If one exists, cross-document consistency verification is mandatory.

**IF Design Doc exists**:

```yaml
subagent_type: design-sync
description: "UXRD and Design Doc consistency verification"
prompt: "Verify consistency between the UXRD at [uxrd path] and Design Doc at [design doc path]. Check for conflicts between UX specifications and technical design decisions. Verify component references align, interaction patterns are technically feasible, and accessibility requirements are addressed in the technical design. [SYSTEM CONSTRAINT] This agent operates within /uxdoc command scope. Verify cross-document consistency between UXRD and Design Doc."
```

**Conflict Resolution Flow**:
- **IF conflicts found**:
  1. Present conflict report to user with specific inconsistencies
  2. **STOP** — Wait for user decision on resolution approach
  3. Call ux-designer to update the UXRD resolving identified conflicts:
     ```yaml
     subagent_type: ux-designer
     description: "UXRD conflict resolution"
     prompt: "Update UXRD at [path] to resolve the following conflicts with Design Doc: [conflict details from design-sync]. Preserve existing approved UX patterns where possible. [SYSTEM CONSTRAINT] This agent operates within /uxdoc command scope. Resolve conflicts between UXRD and Design Doc."
     ```
  4. Re-run design-sync to verify resolution
- **IF no conflicts**: Present clean verification result and proceed

## Completion Criteria

- [ ] Executed requirement-analyzer and confirmed UX scope
- [ ] Created UXRD with ux-designer (appropriate operation mode)
- [ ] Executed document-reviewer and addressed all feedback
- [ ] Executed design-sync for consistency verification (if Design Doc exists)
- [ ] Obtained user approval for UXRD

## Output Example

UXRD phase completed.

- UX Requirement Document: docs/features/[feature]/uxrd.md
- Approval status: User approved
- Consistency check: Passed (or N/A if no Design Doc)

**Important**: This command ends with UXRD approval. Does not propose transition to next phase.
