---
name: workflow-gamedev
description: This skill governs the product phase for game development — scenario detection, development modes, market analysis, GDD, and the game design disciplines that precede technical design. Automatically loaded when orchestrating game development work, or when "GDD", "game design", "core loop", "game feel", "art direction", or "prototype mode" are mentioned.
---

# Game Development Product Phase

This skill replaces `workflow-product` for game development. Everything after it is unchanged: the technical phase is `workflow-technical` (substituting `gamedev-work-planner` for the planner), and autonomous execution is `workflow-execution`. Shared mechanics — invoking agents, response contracts, delegation boundaries, file ownership, TodoWrite — are in `workflow-orchestration`.

A game feature and a service endpoint need the same design rigour, the same codebase fact gathering, and the same verification. What differs is upstream: what "the product" is, who defines it, and how a project starts.

## Scope

**In scope**: scenario detection, development-mode routing, market analysis, GDD, feature specs, mechanics and game-feel specification, art direction, game UI/UX, analytics design, and the stop points gating each.

**Out of scope**: ADR, Design Doc, codebase fact gathering, test skeletons, work plan, batch approval — all `workflow-technical`, used unchanged.

## Gamedev Agents

| Agent | Owns |
|-------|------|
| **producer-agent** | Project scope and timeline; project config, team selection, resource plan |
| **market-analyst** | Market analysis, competitor research, Go/No-Go |
| **sr-game-designer** | Game vision — GDD (pillars, core loop, progression) |
| **mid-game-designer** | Feature specifications derived from GDD systems |
| **mechanics-developer** | Game mechanics architecture |
| **game-feel-developer** | Game feel specification (juice, feedback, responsiveness) |
| **sr-game-artist** | Art direction, style guide, colour palette — *what* |
| **technical-artist** | Pipeline specs, atlas optimization, shaders — *how* |
| **ui-ux-agent** | Game UI/UX — HUD, menus, interaction, accessibility |
| **data-scientist** | Analytics and telemetry design, KPIs, A/B tests |

### Principles

- **GDD is a first-class artifact** and the single source of truth for game design. Every agent references it for design decisions; changes to it require `document-reviewer` approval. Feature specs derive from GDD systems rather than restating them.
- **Art has two owners.** `sr-game-artist` defines what it looks like; `technical-artist` defines how it ships. Consult both before any art-related implementation task — a style decision with no pipeline behind it produces assets the build cannot use.
- **producer-agent holds scope authority.** When a design decision expands scope or timeline, it routes there rather than being absorbed silently.

## Scenario Detection

`requirement-analyzer` selects the flow from what already exists in the repository:

```yaml
scenarioDetection:
  checkProjectConfig: "Does docs/project-config.json exist?"
  checkGDD: "Does docs/game-design/*-gdd.md exist?"

  rules:
    - condition: "No project-config.json AND no GDD"
      scenario: "A (New Project)"
    - condition: "project-config.json exists AND GDD exists"
      scenario: "B (Existing Project)"
    - condition: "project-config.json exists AND no GDD"
      scenario: "B (Existing Project, pre-GDD)"
      note: "Consider creating the GDD first — feature specs derive from it"
```

## Development Mode Routing

Detected by `requirement-analyzer` from the user's request. Confirm the detected mode at the first stop rather than assuming it.

| Mode | Description | Flow modification |
|------|-------------|-------------------|
| **Full Development** | Standard scale-based flow | None |
| **Design Only** | Run the product phase to completion, stop before technical design | Deliver the design package; no implementation |
| **Prototype** | requirement-analyzer → sr-game-designer (core loop only) → simplified plan | Skip market analysis, art direction, and analytics |

## Flow

### Scenario A — New Project

1. **requirement-analyzer** → requirements + project discovery
   **[Stop: requirements + development mode selection]**
2. **market-analyst** → market analysis, competitor research, Go/No-Go
   **[Stop: Go/No-Go]**
3. **producer-agent** → project config, team selection, resource plan
4. **sr-game-designer** → GDD (vision, pillars, core loop, progression)
5. **document-reviewer** → GDD review
   **[Stop: GDD approval]**
6. **mid-game-designer** → feature specifications from GDD systems
7. **mechanics-developer** → game mechanics architecture
8. **game-feel-developer** → game feel specification
9. **sr-game-artist** → art direction, style guide, palette
   **technical-artist** → pipeline specs, atlas optimization, shader requirements
10. **ui-ux-agent** → game UI/UX: HUD, menus, interaction, accessibility
11. **data-scientist** → analytics and telemetry design, KPIs, A/B tests

**Design Only mode stops here** — deliver the design package.

→ hand off to `workflow-technical` (planner: `gamedev-work-planner`)

### Scenario B — Large Feature in an existing project

1. **requirement-analyzer** → requirements analysis
   **[Stop: requirements confirmation]**
2. **sr-game-designer** → GDD update for the new feature
3. **document-reviewer** → GDD review
   **[Stop: GDD approval]**
4. **mechanics-developer** → mechanics architecture for the feature
5. *[Conditional, by feature type]* **game-feel-developer**, **sr-game-artist**, **ui-ux-agent**, **data-scientist**

→ hand off to `workflow-technical` (planner: `gamedev-work-planner`)

### Medium scale

1. **requirement-analyzer** → requirement analysis
   **[Stop: requirements confirmation]**
2. *[Conditional]* **sr-game-designer** → game design spec (when new mechanics are involved);
   **mid-game-designer** → feature specification
3. **mechanics-developer** → mechanics architecture (when new systems are involved)
4. *[Conditional]* **ui-ux-agent** (UI work), **game-feel-developer** (polish work)

→ hand off to `workflow-technical` (planner: `gamedev-work-planner`)

### Small scale

Requirement analysis only, then a simplified plan → `workflow-execution`.

## Stop Points

| Stop | After | What the user decides |
|------|-------|----------------------|
| Requirements + mode | requirement-analyzer | Scope, and which development mode applies |
| Go/No-Go | market-analyst | Whether the project proceeds at all (Scenario A) |
| GDD approval | document-reviewer completes GDD review | Whether the vision, pillars, and core loop are right |

The technical phase adds its own stops — ADR approval, Design Doc approval, and batch approval — see `workflow-technical`.

## Phase Note for Execution

The 6 game development phases (Core Mechanics, Game Feel, Art, UI, Analytics, QA) are phases **within one work plan**, not separate plans. The `per-phase` commit strategy in `workflow-execution` groups commits by them. Reach for a second plan only when a later pass is genuinely deferred — a post-playtest tuning round — rather than to model the phase sequence.
