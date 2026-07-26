---
name: workflow-technical
description: This skill governs the technical design phase — ADR, codebase fact gathering, Design Doc, consistency verification, test skeletons, and the work plan, ending at batch approval. Automatically loaded when creating an ADR or Design Doc, planning implementation, or when "technical design", "architecture decision", "design doc", "work plan", or "batch approval" are mentioned.
---

# Technical Design Phase

The technical phase answers **how to build it**. It begins with agreed requirements and ends at batch approval, where authority passes to autonomous execution.

Mechanics common to every phase — how to invoke subagents, response contracts, delegation boundaries, file ownership, TodoWrite — live in `workflow-orchestration`. Requirements arrive from `workflow-product`. Once batch approval is granted, `workflow-execution` takes over.

This phase is identical for every domain. Only the planner agent varies.

## Planner Parameter

| Domain | Planner |
|--------|---------|
| Default (backend, frontend, fullstack) | `work-planner` |
| Game development | `gamedev-work-planner` |

Everywhere this skill says **`{planner}`**, substitute the agent for the active domain. Nothing else in the phase changes by domain — a game feature and a service endpoint need the same design rigour, the same fact gathering, and the same verification.

Layer selection between `technical-designer` and `technical-designer-frontend`, and between `codebase-analyzer` and `ui-analyzer`, follows the work itself, not the domain.

## Flow

### Large scale

1. **technical-designer(-frontend)** → ADR (when there are architecture changes, new technology, or data flow changes)
2. **document-reviewer** → ADR review
   **[Stop: ADR approval]** — only when an ADR was created
3. *[Optional]* **expert-analyst** ×3-5 **in parallel** per the `expert-analysis-guide` heuristics, then synthesize. Skip for straightforward work or a pure bug fix.
4. **codebase-analyzer** (and **ui-analyzer** when the work has a UI surface) → read-only fact gathering → `focusAreas[]`
5. **technical-designer(-frontend)** → Design Doc, consuming `focusAreas` into the **Fact Disposition Table** and including the expert synthesis when one was produced
6. **document-reviewer** → Design Doc review
7. **design-sync** → consistency across PRD, ADR, UXRD, Design Doc
   **[Stop: Design Doc approval]**
8. **acceptance-test-generator** → integration and E2E test skeletons
   → orchestrator verifies generation, then passes the paths to `{planner}`
9. **`{planner}`** → work plan, including the generated test information
10. **document-reviewer** → work plan review: traceability to the Design Doc, Failure Mode Checklist coverage, Verification Strategy carried across, Reference Contract Values recorded verbatim
    **[Stop: batch approval for the entire implementation phase]**

→ hand off to `workflow-execution`

### Medium scale

Same as above without the ADR steps, unless an ADR condition applies. Steps 3-10 run unchanged.

### Small scale

Create a simplified plan. **[Stop: batch approval]** → `workflow-execution`.

## Why Fact Gathering Precedes Design

`codebase-analyzer` and `ui-analyzer` are read-only and produce `focusAreas[]` — `fact_id`-anchored statements about existing behavior that the design must explicitly dispose of.

Without them, a designer investigates ad hoc and the Design Doc records conclusions but not what was considered. A reviewer then cannot distinguish a deliberate omission from an oversight. The Fact Disposition Table makes each fact's treatment explicit: preserve, transform, remove, or out-of-scope, each with evidence.

Run them **after** any expert analysis and **before** the designer, so the designer receives both the outside perspective and the ground truth.

## Document Requirements by Scale

| Scale | ADR | Design Doc | Work Plan |
|-------|-----|------------|-----------|
| Small | Not needed | Not needed | Simplified |
| Medium | Conditional※ | **Required** | **Required** |
| Large | Conditional※ | **Required** | **Required** |

※ When there are architecture changes, new technology introduction, or data flow changes — see the ADR creation conditions in `documentation-criteria`.

Scale comes from `task-analyzer`'s five-axis assessment, not file count alone.

## Stop Points

| Stop | After | What the user decides |
|------|-------|----------------------|
| ADR approval | document-reviewer completes ADR review | Whether the decision and its rejected alternatives are right |
| Design Doc approval | design-sync completes consistency verification | Whether the technical approach is right |
| Batch approval | document-reviewer completes work plan review | Whether to delegate implementation authority |

**Batch approval is the authority boundary.** Everything before it is reviewed by a human; everything after runs autonomously until completion or escalation. Do not reach it with an unresolved question — after it, no one is asked again.

## Revision Loop

When `document-reviewer` returns `needs_revision`:

1. Extract the issues from the reviewer output
2. Call the agent named in `revision_agent` with `mode: update` — `technical-designer(-frontend)` for an ADR or Design Doc, `{planner}` for a work plan
3. Re-run `document-reviewer`
4. Repeat, maximum 2 iterations; still failing → stop and present the issues to the user

The orchestrator never edits a document itself.

## Cross-Layer Sequencing

When a feature spans layers, run the backend design to approval **before** the frontend design begins. The frontend designer then reads a verified backend contract instead of a proposed one, and can flag any part of it that is still unstable.

Parts are the mechanism: a backend part and a frontend part each get their own `design-{part}.md` and their own plan, sequenced by that dependency. See `documentation-criteria` for the layout.

## Handoff to Execution

Autonomous execution needs:

- The approved work plan path, with `status: active` in its frontmatter
- The Design Doc path it traces to
- The selected commit strategy (asked before implementation begins — see `workflow-execution`)
- Generated test skeleton paths, so the executor extends rather than recreates them
