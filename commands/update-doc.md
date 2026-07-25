---
name: update-doc
description: Update existing design documents (Design Doc, PRD, ADR) with review workflow
argument-hint: <document-path-or-type>
---

# /update-doc Command

## Orchestrator Definition

### Core Identity
This command orchestrates the update of existing design documents. It NEVER edits documents directly — all modifications are delegated to specialized agents.

### First Action
Register execution steps to TodoWrite before any execution:
1. Target document identification
2. Document type and layer determination
3. Change clarification (STOP for user input)
4. Document update via layer-appropriate agent
5. Code verification via code-verifier (Design Doc only)
6. Review via document-reviewer (STOP for approval)
7. Consistency verification via design-sync (STOP if Design Doc)

## Requirements

- `$ARGUMENTS`: Document path or type (e.g., "docs/features/user-auth/design-core.md" or "Design Doc" or "PRD")
- If not provided, search `docs/` directory for existing documents and present list to user

## Workflow

### Step 1: Target Document Identification

**Think deeply** about which document the user wants to update.

If `$ARGUMENTS` is a file path → verify it exists
If `$ARGUMENTS` is a type name → search for matching documents:
```bash
# Search patterns by type
Design Doc: docs/features/*/design-*.md
PRD: docs/features/*/prd.md
ADR: docs/adr/*.md
```

If multiple documents found → present list and **STOP** for user selection.
If no documents found → report and exit.

### Step 2: Document Type and Layer Determination

Determine the document type from path or content, then determine the layer to select the correct update agent:

| Path Pattern | Document Type | Update Agent | Review Required |
|---|---|---|---|
| `docs/features/*/design-*.md` | Design Doc | technical-designer or technical-designer-frontend | document-reviewer + design-sync |
| `docs/features/*/prd.md` | PRD | prd-creator | document-reviewer |
| `docs/adr/*.md` | ADR | technical-designer or technical-designer-frontend | document-reviewer |

**Layer detection** (Design Doc and ADR only):

Read the document and determine its layer from content signals:
- **Frontend** (→ `technical-designer-frontend`): title/scope mentions React, components, UI, or frontend; or the file contains a component hierarchy, state management, or UI interaction sections
- **Backend** (→ `technical-designer`): all other cases (API, data layer, business logic, infrastructure)

Record the resolved agent as `$UPDATE_AGENT` and use it in Step 4.

### Step 3: Change Clarification

**STOP** — Present current document summary and ask user:
- What specific changes are needed?
- Is this a minor update or a significant revision?
- Are there new requirements driving this change?

Record the user's response for the update agent.

### Step 4: Document Update

Call the appropriate agent based on document type:

**For Design Doc:**
```yaml
subagent_type: $UPDATE_AGENT   # technical-designer or technical-designer-frontend, resolved in Step 2
prompt: "Update the Design Doc at [path]. Required changes: [user's changes from Step 3]. Preserve existing approved content. Only modify sections affected by the changes. [SYSTEM CONSTRAINT] This agent operates within update-doc command scope. Do not create new documents or modify requirements."
```

**For PRD:**
```yaml
subagent_type: prd-creator
prompt: "Update the PRD at [path]. Required changes: [user's changes from Step 3]. Preserve existing structure and approved sections. [SYSTEM CONSTRAINT] This agent operates within update-doc command scope."
```

**For ADR:**
```yaml
subagent_type: $UPDATE_AGENT   # technical-designer or technical-designer-frontend, resolved in Step 2
prompt: "Update the ADR at [path]. For minor changes: update relevant sections. For major changes: consider creating a new ADR that supersedes this one. Required changes: [user's changes from Step 3]. [SYSTEM CONSTRAINT] This agent operates within update-doc command scope."
```

### ADR-Specific Guidance

| Change Type | Action |
|---|---|
| Minor (typo, clarification) | Edit existing ADR in place |
| Moderate (new considerations) | Add new sections to existing ADR |
| Major (decision reversal) | Create new ADR with status "Supersedes ADR-XXX" |

### Step 5: Document Review

**For Design Doc updates only** — before `document-reviewer`, invoke `code-verifier`:

```yaml
subagent_type: code-verifier
prompt: |
  doc_type: design-doc
  document_path: [path from Step 1]
  Verify the updated Design Doc against the current codebase.

  Verification focus: literal identifier referential integrity in the updated
  sections (paths, endpoints, type names, config keys).
  [SYSTEM CONSTRAINT] This agent operates within update-doc command scope.
```

Store output as `$CODE_VERIFICATION_OUTPUT` and pass it to `document-reviewer` below.

**STOP** — Submit updated document for review:

```yaml
subagent_type: document-reviewer
prompt: "Review the updated document at [path]. This is an UPDATE review — focus on: 1) Changes are consistent with existing approved content, 2) No regressions in quality, 3) New content meets documentation criteria. [SYSTEM CONSTRAINT] This agent operates within update-doc command scope."
```

If `needs_revision` → call the update agent again with reviewer feedback (max 2 iterations).
If still `needs_revision` after 2 iterations → **STOP** and present issues to user.

### Step 6: Consistency Verification (Design Doc only)

For Design Doc updates only:

```yaml
subagent_type: design-sync
prompt: "Verify consistency between the updated Design Doc at [path] and all related documents (PRD, ADR). Check for conflicts introduced by the update."
```

**IF conflicts found** → Present to user and **STOP**
**IF clean** → Report success

## Error Handling

| Error | Action |
|---|---|
| Document not found | Report and exit |
| Document type unrecognized | Ask user to specify type |
| Agent reports blocked status | Present blocker to user |
| Review fails after 2 iterations | Present unresolved issues to user |

## Completion Criteria

**REQUIRED** completion response:
```
Updated: [document path]
Type: [Design Doc / PRD / ADR]
Changes: [summary of changes made]
Review: [approved / approved with notes]
Consistency: [verified / N/A]
```

## Scope

**Scope**: Update existing documents only. This command does NOT create new documents — use `/design`, `/create-plan`, or `/implement` for document creation.

**Important**: This command does not propose transition to implementation phase. After update, the user decides next steps.
