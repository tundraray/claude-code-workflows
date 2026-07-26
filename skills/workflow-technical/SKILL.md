---
name: workflow-technical
description: This skill governs the technical design phase — codebase fact gathering, Design Doc, consistency verification, a conditional ADR, and test skeletons, ending at Design Doc approval. Automatically loaded when creating a Design Doc or ADR, or when "technical design", "architecture decision", "design doc", or "fact gathering" are mentioned.
---

# Technical Design Phase

The technical phase answers **how to build it**. It begins with agreed requirements and ends when the design is approved — before anyone schedules the work.

Mechanics common to every phase — how to invoke subagents, response contracts, delegation boundaries, file ownership, TodoWrite — live in `workflow-orchestration`. Requirements arrive from `workflow-product`. Planning, decomposition, and everything after belong to `workflow-execution`.

## Domain Independence

This phase is identical for every domain — a game feature and a service endpoint need the same fact gathering, the same design rigour, and the same consistency verification. Planning is where the domain difference appears, and planning belongs to `workflow-execution`.

Layer selection between `technical-designer` and `technical-designer-frontend`, and between `codebase-analyzer` and `ui-analyzer`, follows the work itself, not the domain.

## Flow

### Large and medium scale

1. *[Optional]* **expert-analyst** ×3-5 **in parallel** per the `expert-analysis-guide` heuristics, then synthesize. Skip for straightforward work or a pure bug fix.
2. **codebase-analyzer** (and **ui-analyzer** when the work has a UI surface) → read-only fact gathering → `focusAreas[]`
3. **technical-designer(-frontend)** → Design Doc, consuming `focusAreas` into the **Fact Disposition Table** and including the expert synthesis when one was produced
4. **document-reviewer** → Design Doc review
5. **design-sync** → consistency across PRD, UXRD, existing ADRs, and the Design Doc
   **[Stop: Design Doc approval]**
6. *[Conditional]* **technical-designer(-frontend)** → ADR, when a decision the design made passes the three-part test in `documentation-criteria`
7. **document-reviewer** → ADR review
   **[Stop: ADR approval]** — only when an ADR was written
8. **acceptance-test-generator** → integration and E2E test skeletons

→ hand off to `workflow-execution`, which plans and decomposes the work

### Small scale

No technical documents. → `workflow-execution`.

## Why the ADR Comes After the Design

Writing the ADR first means deciding before understanding. Which choices are genuinely architecture-binding — costly to reverse, constraining work beyond this feature, taken against real alternatives — is only visible once the design exists.

So the design surfaces the decision and the ADR **extracts** it, so it outlives the feature that produced it. The Design Doc records the full reasoning; the ADR records the part future unrelated work must comply with.

This means the Design Doc references **existing** ADRs as prerequisites, and any ADR written in step 6 records a decision this design made. The plan's ADR Bindings table then binds tasks to both.

**Most features produce no ADR.** A decision record written for every change stops being read.

## Why Fact Gathering Precedes Design

`codebase-analyzer` and `ui-analyzer` are read-only and produce `focusAreas[]` — `fact_id`-anchored statements about existing behavior that the design must explicitly dispose of.

Without them, a designer investigates ad hoc and the Design Doc records conclusions but not what was considered. A reviewer then cannot distinguish a deliberate omission from an oversight. The Fact Disposition Table makes each fact's treatment explicit: preserve, transform, remove, or out-of-scope, each with evidence.

Run them **after** any expert analysis and **before** the designer, so the designer receives both the outside perspective and the ground truth.

## Document Requirements by Scale

| Scale | Design Doc | ADR |
|-------|------------|-----|
| Small | Not needed | Not needed |
| Medium | **Required** | Rare※ |
| Large | **Required** | Rare※ |

※ Only when a decision the design made passes all three parts of the test in `documentation-criteria`: costly to reverse, binding beyond this feature, and taken against real alternatives. Most features produce none.

Scale comes from `task-analyzer`'s five-axis assessment, not file count alone. Work plans are produced in `workflow-execution`.

## Stop Points

| Stop | After | What the user decides |
|------|-------|----------------------|
| Design Doc approval | design-sync completes consistency verification | Whether the technical approach is right |
| ADR approval | document-reviewer completes ADR review | Whether the decision and its rejected alternatives are right — only when an ADR was written |

Batch approval, the authority boundary into autonomous work, belongs to `workflow-execution` — it gates the plan, and the plan is produced there.

## Revision Loop

When `document-reviewer` returns `needs_revision`:

1. Extract the issues from the reviewer output
2. Call the agent named in `revision_agent` with `mode: update` — `technical-designer(-frontend)` for an ADR or Design Doc
3. Re-run `document-reviewer`
4. Repeat, maximum 2 iterations; still failing → stop and present the issues to the user

The orchestrator never edits a document itself.

## Cross-Layer Sequencing

When a feature spans layers, run the backend design to approval **before** the frontend design begins. The frontend designer then reads a verified backend contract instead of a proposed one, and can flag any part of it that is still unstable.

Parts are the mechanism: a backend part and a frontend part each get their own `design-{part}.md` and their own plan, sequenced by that dependency. See `documentation-criteria` for the layout.

## Handoff to Execution

Planning needs, as concrete paths rather than a summary:

- The approved Design Doc (`docs/features/{feature}/design-{part}.md`)
- Any ADR written in step 6, plus the existing ADRs the design treats as prerequisites — the plan binds tasks to them
- Generated test skeleton paths, so the plan schedules extending them rather than recreating them
- The approved PRD and UXRD, for traceability

A design item omitted from the handoff cannot appear in the plan's traceability table, and a requirement that reaches neither is how work silently disappears between phases.
