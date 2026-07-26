---
name: workflow-product
description: This skill governs the product phase of a workflow — turning a request into agreed requirements, a PRD, and a UXRD before any technical design begins. Automatically loaded when analyzing requirements, creating or updating a PRD or UXRD, or when "requirements", "product scope", "user value", "PRD", or "UXRD" are mentioned.
---

# Product Phase

The product phase answers **what to build and why**. It ends when the requirements, business value, and user experience are agreed — before anyone decides how to build it.

Mechanics common to every phase — how to invoke subagents, response contracts, delegation boundaries, file ownership, TodoWrite — live in the `workflow-orchestration` skill. Technical design picks up where this phase stops: see `workflow-technical`.

Keeping the phases separate is what stops a solution from being chosen before the problem is agreed. A Design Doc written while requirements are still moving encodes assumptions nobody signed off on.

## Scope

**In scope**: requirement analysis and scale determination, PRD creation and review, UXRD creation and review, and the stop points that gate each.

**Out of scope**: architecture decisions, interface definitions, data models, implementation planning — all `workflow-technical`. When a product question can only be settled by a technical fact ("is this even feasible?"), record it as an open question and resolve it in the technical phase rather than pre-deciding the design here.

## Flow

### Large scale

1. **requirement-analyzer** → requirement analysis + check for an existing PRD
   **[Stop: requirement confirmation / question handling]**
2. **prd-creator** → PRD creation (update when one exists; new creation with thorough investigation when not)
3. **document-reviewer** → PRD review
   **[Stop: PRD approval]**
4. **ux-designer** → UXRD creation (when the work has a UI surface) → **document-reviewer**
   **[Stop: UXRD approval]**

→ hand off to `workflow-technical`

### Medium scale

1. **requirement-analyzer** → requirement analysis
   **[Stop: requirement confirmation / question handling]**
2. **ux-designer** → UXRD creation (when the work has a UI surface) → **document-reviewer**
   **[Stop: UXRD approval]**

No PRD: at medium scale the requirement analysis carries the product intent. Update an existing PRD if one covers the feature.

→ hand off to `workflow-technical`

### Small scale

Requirement analysis only. No product documents — go straight to a simplified plan.

## Document Requirements by Scale

| Scale | PRD | UXRD |
|-------|-----|------|
| Small | Update if one exists | Not needed |
| Medium | Update if one exists | When frontend/UI work is involved |
| Large | **Required** (new, updated, or reverse-engineered) | When frontend/UI work is involved |

Scale comes from `task-analyzer`'s five-axis assessment, not from file count alone — see `workflow-orchestration`, "Scale Determination".

## Stop Points

Every stop in this phase is a genuine decision gate, not a status update. Use `AskUserQuestion` so the choice is structured.

| Stop | After | What the user decides |
|------|-------|----------------------|
| Requirement confirmation | requirement-analyzer | Whether the understood scope matches intent; answers to open questions |
| PRD approval | document-reviewer completes PRD review | Whether the business requirements and success metrics are right |
| UXRD approval | document-reviewer completes UXRD review | Whether the flows, states, and accessibility posture are right |

When `requirement-analyzer` reports a `decidingAxis` other than `files`, state it at the confirmation stop: "6 files but routed as Large because this is a breaking contract change" is information the user needs in order to approve or override the routing.

## Requirement Changes

Requirements change mid-flow. Detecting that early is cheaper than discovering it during implementation.

**Stop the flow and return to requirement-analyzer** when a user response contains:
- Mentions of new features or behaviors (additional operations, display on a different screen)
- Added constraints or conditions (data volume limits, permission controls)
- Changed technical requirements (processing method, output format)

Restart from `requirement-analyzer` with the integrated requirements rather than patching the current document. Once `task-decomposer` has started, a requirement change requires overall redesign — restart the whole flow.

## Revision Loop

When `document-reviewer` returns `needs_revision`:

1. Extract the issues from the reviewer output
2. Call the owning agent named in `revision_agent` (`prd-creator` for a PRD, `ux-designer` for a UXRD) with `mode: update`
3. Re-run `document-reviewer`
4. Repeat, maximum 2 iterations; still failing → stop and present the issues to the user

The orchestrator never edits a document itself — see `workflow-orchestration`, "File Ownership by Agent".

## Handoff to Technical

The technical phase needs, as concrete paths rather than a summary:

- The approved PRD (`docs/features/{feature}/prd.md`) when one exists
- The approved UXRD (`docs/features/{feature}/uxrd.md`) when one exists
- The confirmed scale and its `decidingAxis`
- Any open question recorded during requirement analysis, with the decision it blocks

A question left implicit at handoff becomes an assumption in the Design Doc.
