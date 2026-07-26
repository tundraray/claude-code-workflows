---
name: documentation-criteria
description: This skill should be used when the user asks to "create a PRD", "write an ADR", "create a design doc", "make a work plan", "create task files", or needs guidance on document templates, creation criteria, or determining which documents are required for a given change scope.
---

# Documentation Creation Criteria

## Templates

- **[prd-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/prd-template.md)** - Product Requirements Document template
- **[adr-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/adr-template.md)** - Architecture Decision Record template
- **[design-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/design-template.md)** - Technical Design Document template
- **[plan-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/plan-template.md)** - Work Plan template
- **[task-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/task-template.md)** - Task file template for implementation tasks
- **[uxrd-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/uxrd-template.md)** - UX Requirements Document template
- **[gdd-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/gdd-template.md)** - Game Design Document template
- **[market-analysis-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/market-analysis-template.md)** - Market Analysis template
- **[feature-spec-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/feature-spec-template.md)** - Feature Specification template
- **[analytics-setup-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/analytics-setup-template.md)** - Analytics Setup template
- **[engine-setup-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/engine-setup-template.md)** - Engine Setup template
- **[handoff-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/handoff-template.md)** - Handoff Document template

## Creation Decision Matrix

| Condition | Required Documents | Creation Order |
|-----------|-------------------|----------------|
| New Feature Addition | PRD → [UXRD] → Design Doc → [ADR] → Work Plan | After PRD approval |
| Large scale | PRD → Design Doc → [ADR] → Work Plan | Start immediately |
| Medium scale | Design Doc → [ADR] → Work Plan | Start immediately |
| Small scale | None | Direct implementation |

**The ADR follows the Design Doc**, and is written only when a decision the design made passes all three parts of the test below. Most features produce none. Documents in `[brackets]` are conditional.
| New Game Project | GDD → Market Analysis → [ADR] → Design Doc → Work Plan | After GDD approval |
| New Game Feature | Feature Spec → [GDD Update] → Design Doc → Work Plan | After Feature Spec approval |
| Art/Visual Change | Art Direction → Design Doc | After Art Direction approval |

## ADR Creation Conditions

**An ADR is written after the Design Doc, not before it**, and only when a decision the design made passes all three parts of the test:

1. **Costly to reverse** — undoing it later means migrating data, breaking consumers, or coordinated changes across repositories
2. **Binds beyond this feature** — future unrelated work must comply with it
3. **Had real alternatives** — a genuine choice existed and one was taken

Fail any one → no ADR; record the reasoning in the Design Doc.

Game-specific decisions that commonly meet all three: save-file format, netcode authority model, the engine or renderer target, and the analytics event schema other tools consume. Ordinary mechanics tuning, adding a state to an existing machine, or picking a tween library do not.

## Detailed Document Definitions

### PRD (Product Requirements Document)

**Purpose**: Define business requirements and user value

**Includes**:
- Business requirements and user value
- Success metrics and KPIs (measurable format)
- User stories and use cases
- MoSCoW prioritization (Must/Should/Could/Won't)
- MVP and Future phase separation
- User journey diagram (required)
- Scope boundary diagram (required)

**Excludes**:
- Technical implementation details (→Design Doc)
- Technical selection rationale (→ADR)
- **Implementation phases** (→Work Plan)
- **Task breakdown** (→Work Plan)

### ADR (Architecture Decision Record)

**Purpose**: Record technical decision rationale and background

**Includes**:
- Decision (what was selected)
- Rationale (why that selection was made)
- Option comparison (minimum 3 options) and trade-offs
- Architecture impact
- Principled implementation guidelines (e.g., "Use dependency injection")

**Excludes**:
- Implementation schedule, duration (→Work Plan)
- Detailed implementation procedures (→Design Doc)
- Specific code examples (→Design Doc)
- Resource assignments (→Work Plan)

### Design Document

**Purpose**: Define technical implementation methods in detail

**Includes**:
- **Existing codebase analysis** (required)
  - Implementation path mapping (both existing and new)
  - Integration point clarification (connection points with existing code even for new implementations)
- Technical implementation approach (vertical/horizontal/hybrid)
- **Technical dependencies and implementation constraints** (required implementation order)
- Interface and contract definitions
- Data flow and component design
- **E2E verification procedures at integration points**
- **Acceptance criteria (measurable format)**
- Change impact map (clearly specify direct impact/indirect impact/no ripple effect)
- Complete enumeration of integration points
- Data contract clarification
- **Agreement checklist** (agreements with stakeholders)
- **Prerequisite ADRs** (including common ADRs)

**Required Structural Elements**:
```yaml
Change Impact Map:
  Change Target: [Component/Feature]
  Direct Impact: [Files/Functions]
  Indirect Impact: [Data format/Processing time]
  No Ripple Effect: [Unaffected features]

Interface Change Matrix:
  Existing: [Function/method/operation name]
  New: [Function/method/operation name]
  Conversion Required: [Yes/No]
  Compatibility Method: [Approach]
```

**Excludes**:
- Why that technology was chosen (→Reference ADR)
- When to implement, duration (→Work Plan)
- Who will implement (→Work Plan)

### GDD (Game Design Document)

**Purpose**: Define game vision, core mechanics, progression, and systems

**Includes**:
- Core loop
- Game pillars
- Progression systems
- Balancing parameters
- Content specifications

**Excludes**:
- Technical implementation (→Design Doc)
- Market analysis (→Market Analysis)
- Art specifications (→Art Direction)

### Market Analysis

**Purpose**: Validate market opportunity and competitive positioning

**Includes**:
- Competitor analysis
- Market sizing
- Target audience
- Monetization potential
- Risk assessment
- Go/No-Go recommendation

**Excludes**:
- Game design details (→GDD)
- Technical specs (→Design Doc)

### Feature Specification

**Purpose**: Detailed specification of a single game feature or system

**Includes**:
- User stories
- Acceptance criteria
- Balancing parameters
- Edge cases

**Excludes**:
- Full game vision (→GDD)
- Implementation plan (→Work Plan)

### Work Plan

**Purpose**: Implementation task management and progress tracking

**Includes**:
- Task breakdown and dependencies (maximum 2 levels)
- Schedule and duration estimates
- **Copy E2E verification procedures from Design Doc** (cannot delete, can add)
- **Phase 4 Quality Assurance Phase (required)**
- Progress records (checkbox format)

**Excludes**:
- Technical rationale (→ADR)
- Design details (→Design Doc)

**Phase Division Criteria**:
1. **Phase 1: Foundation Implementation** - Contract definitions, interfaces/signatures, test preparation
2. **Phase 2: Core Feature Implementation** - Business logic, unit tests
3. **Phase 3: Integration Implementation** - External connections, presentation layer
4. **Phase 4: Quality Assurance (Required)** - Acceptance criteria achievement, all tests passing, quality checks

**Three Elements of Task Completion Definition**:
1. **Implementation Complete**: Code is functional
2. **Quality Complete**: Tests, static checks, linting pass
3. **Integration Complete**: Verified connection with other components

## Scale Axes

**File count is one scale signal, not the deciding rule.** Contract, data, boundary, and decision risk can each raise the scale on their own — a two-file change that breaks a save-file format or a networked contract is not a small-scale change. Take the scale and its `decidingAxis` from `task-analyzer`'s assessment; where none is available, evaluate directly:

| Axis | Small | Medium | Large |
|------|-------|--------|-------|
| Estimated files | 1-2 | 3-5 | 6+ |
| Observable outcomes | One behavior | Multiple related behaviors | Multiple independently verifiable outcomes |
| Contracts/data | No public contract or persisted-data change | Backward-compatible contract change | Breaking contract, save-format migration, or persisted-data migration |
| Boundaries | One local module/component | Multiple modules in one layer | Cross-layer, cross-service, or external-system boundary |
| Decision risk | Existing pattern applies directly | One bounded technical decision | Architecture, security, compliance, or irreversible operational decision |

Select the highest scale triggered by any observed axis.

## Creation Process

Each step names the evidence that must exist before the next step starts. A step without its output evidence has not completed, regardless of elapsed effort.

**1. Problem Analysis** — change scale assessment, ADR condition check
- *Output evidence*: confirmed scale with its deciding axis named; a named source for each existing document consulted
- *Transition*: proceed when the scale and every applicable ADR condition have an explicit yes/no

**2. ADR Option Consideration** (ADR only) — compare 3+ options, specify trade-offs
- *Output evidence*: at least 3 options with trade-offs stated as concrete costs, not generic caveats
- *Transition*: proceed when the selected option names what the rejected options fail to satisfy

**3. Creation** — use templates, include measurable conditions
- *Output evidence*: every required template section either filled or explicitly marked N/A with rationale; every acceptance criterion measurable
- *Transition*: proceed when no section is silently empty

**4. Approval** — "Accepted" after review enables implementation
- *Output evidence*: reviewer verdict recorded; every blocking issue resolved or explicitly deferred with justification
- *Transition*: implementation begins only on an approved verdict

## Storage Locations

Documents are grouped **by feature**, not by document type. Game-wide documents (GDD, market analysis) stay global, as do ADRs — a decision usually outlives and spans features.

```
docs/
├── adr/ADR-0007-save-format.md
├── game-design/{project}-gdd.md
└── features/{feature}/
    ├── prd.md
    ├── uxrd.md
    ├── design-{part}.md
    └── {part}/
        ├── {plan-name}.md
        └── {plan-name}/{_overview,task-01,phase1-completion}.md
```

| Document | Path | Naming Convention | Template |
|----------|------|------------------|----------|
| PRD | `docs/features/{feature}/` | `prd.md` | [prd-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/prd-template.md) |
| ADR | `docs/adr/` | `ADR-[4-digits]-[title].md` | [adr-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/adr-template.md) |
| Design Doc | `docs/features/{feature}/` | `design-{part}.md` | [design-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/design-template.md) |
| Work Plan | `docs/features/{feature}/{part}/` | `YYYYMMDD-{type}-{description}.md` | [plan-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/plan-template.md) |
| Task File | `docs/features/{feature}/{part}/{plan-name}/` | `task-{number}.md` | [task-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/task-template.md) |
| UXRD | `docs/features/{feature}/` | `uxrd.md` | [uxrd-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/uxrd-template.md) |
| GDD | `docs/game-design/` | `[project-name]-gdd.md` | [gdd-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/gdd-template.md) |
| Market Analysis | `docs/market-research/` | `[project-name]-market-analysis.md` | [market-analysis-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/market-analysis-template.md) |
| Feature Spec | `docs/game-design/features/` | `[feature-name]-spec.md` | [feature-spec-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/feature-spec-template.md) |
| Art Direction | `docs/art/` | `[project-name]-art-direction.md` | N/A |
| Analytics Setup | `docs/analytics/` | `[project-name]-analytics.md` | [analytics-setup-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/analytics-setup-template.md) |
| Handoff | `docs/handoffs/` | `[handoff-name]-handoff.md` | [handoff-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/handoff-template.md) |


### Parts and plans

A **part** is one independently designable slice of a feature — `core`, `combat`, `hud`, `save-migration`. Every feature has at least one, so every agent resolves paths with a single glob. `design-{part}.md` and the directory `{part}/` share the part name and are read as a pair.

A part may hold several plans, each paired with a directory of the same name holding its decomposition. Each plan declares its position in frontmatter:

```yaml
---
feature: combat-rework
part: core
design: design-core.md
plan: 1 of 2
status: active                # draft | active | completed
depends-on:                   # previous plan filename; omit for the first
---
```

Exactly one plan per part may be `active`. Escalate rather than guess when two claim it, when the file count disagrees with `M`, or when a `depends-on` names a missing file.

The 6 game phases (Core Mechanics, Game Feel, Art, UI, Analytics, QA) are phases *within* one plan, not separate plans. Reach for a second plan when a later pass is genuinely deferred — a post-playtest tuning round — not to model the phase sequence.

*Note: Work plans are excluded by `.gitignore`

## ADR Status
`Proposed` → `Accepted` → `Deprecated`/`Superseded`/`Rejected`

## AI Automation Rules
- 5+ files: Suggest ADR creation
- Contract/data flow change detected: ADR mandatory
- Check existing ADRs before implementation

## Diagram Requirements

Required diagrams for each document (using mermaid notation):

| Document | Required Diagrams | Purpose |
|----------|------------------|---------|
| PRD | User journey diagram, Scope boundary diagram | Clarify user experience and scope |
| ADR | Option comparison diagram (when needed) | Visualize trade-offs |
| Design Doc | Architecture diagram, Data flow diagram | Understand technical structure |
| Work Plan | Phase structure diagram, Task dependency diagram | Clarify implementation order |

## Common ADR Relationships
1. **At creation**: Identify common technical areas (logging, error handling, async processing, etc.), reference existing common ADRs
2. **When missing**: Consider creating necessary common ADRs
3. **Design Doc**: Specify common ADRs in "Prerequisite ADRs" section
4. **Compliance check**: Verify design aligns with common ADR decisions