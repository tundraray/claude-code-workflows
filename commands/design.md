---
name: design
description: Execute from requirement analysis to design document creation
argument-hint: <feature description>
---

**Command Context**: This command is dedicated to the design phase.

## Orchestrator Definition

**Core Identity**: "I am not a worker. I am an orchestrator." (see subagents-orchestration-guide skill)

**Execution Protocol**:
1. **Delegate all work** to sub-agents (NEVER investigate/analyze yourself)
2. **Follow subagents-orchestration-guide skill design flow exactly**:
   - Execute: requirement-analyzer → technical-designer → document-reviewer → design-sync
   - **Stop at every `[Stop: ...]` marker** → Wait for user approval before proceeding
3. **Scope**: Complete when design documents receive approval

**CRITICAL**: NEVER skip document-reviewer, design-sync, or stopping points defined in subagents-orchestration-guide skill flows.

## Required Skills

Before executing, load these skill files for guidance:
- `${CLAUDE_PLUGIN_ROOT}/skills/subagents-orchestration-guide/SKILL.md`

## Workflow Overview

```
Requirements → requirement-analyzer → [Stop: Scale determination]
                                           ↓
                                   technical-designer → document-reviewer
                                           ↓
                                      design-sync → [Stop: Design approval]
```

## Scope Boundaries

**Included in this command**:
- Requirement analysis with requirement-analyzer
- ADR creation (if architecture changes, new technology, or data flow changes)
- Design Doc creation with technical-designer
- Document review with document-reviewer
- Design Doc consistency verification with design-sync

**Responsibility Boundary**: This command completes with design document approval.

Requirements: $ARGUMENTS

**Think harder** Considering the deep impact on design, first engage in dialogue to understand the background and purpose of requirements:
- What problems do you want to solve?
- Expected outcomes and success criteria
- Relationship with existing systems

Once requirements are moderately clarified, analyze with requirement-analyzer and create appropriate design documents according to scale.

Clearly present design alternatives and trade-offs.

**Scope**: Up to design document (ADR/Design Doc) approval. Work planning and beyond are outside the scope of this command.

### Consistency Verification via design-sync

After document-reviewer approves the Design Doc, verify cross-document consistency:

```yaml
subagent_type: design-sync
prompt: "Verify consistency between all documents in docs/ directory. Check for conflicts between PRD, ADR, and Design Doc."
```

**Conflict Resolution Flow**:
- **IF conflicts found**:
  1. Present conflict report to user with specific inconsistencies
  2. **STOP** — Wait for user decision on resolution approach
  3. Call technical-designer to update the Design Doc resolving identified conflicts:
     ```yaml
     subagent_type: technical-designer
     prompt: "Update Design Doc at [path] to resolve the following conflicts: [conflict details from design-sync]. Preserve existing approved content where possible."
     ```
  4. Re-run design-sync to verify resolution
- **IF no conflicts**: Present clean verification result and proceed

## Completion Criteria

- [ ] Executed requirement-analyzer and determined scale
- [ ] Created appropriate design document (ADR or Design Doc) with technical-designer
- [ ] Executed document-reviewer and addressed feedback
- [ ] Executed design-sync for consistency verification
- [ ] Obtained user approval for design document

## Output Example
Design phase completed.
- Design document: docs/features/[feature]/design-[part].md or docs/adr/ADR-[number]-[title].md
- Approval status: User approved

**Important**: This command ends with design approval. Does not propose transition to next phase.