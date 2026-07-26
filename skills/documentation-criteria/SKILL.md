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

## Creation Decision Matrix

| Condition | Required Documents | Creation Order |
|-----------|-------------------|----------------|
| New Feature Addition | PRD → [UXRD] → Design Doc → [ADR] → Work Plan | After PRD approval |
| Large scale | PRD → Design Doc → [ADR] → Work Plan | Start immediately |
| Medium scale | Design Doc → [ADR] → Work Plan | Start immediately |
| Small scale | None | Direct implementation |

**The ADR follows the Design Doc**, and is written only when a decision the design made passes all three parts of the test below. Most features produce none. Documents in `[brackets]` are conditional.

**File count is one scale signal, not the deciding rule.** Contract, data, boundary, and decision risk can each raise the scale on their own — a two-file change that breaks a public contract or migrates persisted data is not a small-scale change. Take the scale and its `decidingAxis` from `task-analyzer`'s 5-axis assessment; where no analysis is available, evaluate the axes directly:

| Axis | Small | Medium | Large |
|------|-------|--------|-------|
| Estimated files | 1-2 | 3-5 | 6+ |
| Observable outcomes | One behavior | Multiple related behaviors | Multiple independently verifiable outcomes |
| Contracts/data | No public contract or persisted-data change | Backward-compatible contract change | Breaking contract, schema migration, or persisted-data migration |
| Boundaries | One local module/component | Multiple modules in one layer | Cross-layer, cross-service, or external-system boundary |
| Decision risk | Existing pattern applies directly | One bounded technical decision | Architecture, security, compliance, or irreversible operational decision |

Select the highest scale triggered by any observed axis.

## ADR Creation Conditions

**An ADR is written after the Design Doc, not before it.** Which decisions are genuinely architecture-binding is only visible once the design exists; writing the ADR first means committing before understanding. The ADR extracts a decision the design made, so it outlives the feature that produced it.

**ADRs are rare by design.** A record that gets written for every change stops being read — and a decision log nobody reads is worse than none, because it looks like governance while providing none.

### The test

Write an ADR only when **all three** hold:

1. **Costly to reverse** — undoing it later means migrating data, breaking consumers, or coordinated changes across repositories. If a future developer can simply change it, it belongs in the Design Doc.
2. **Binds beyond this feature** — future unrelated work must comply with it. A choice that constrains only the code in this change is a design detail, not an architecture decision.
3. **Had real alternatives** — a genuine choice existed and one was taken. When only one option was viable, there is no decision to record; state the constraint in the Design Doc instead.

Fail any one → no ADR. Record the reasoning in the Design Doc, where it belongs.

### Signals worth applying the test to

These commonly — not always — meet all three. Treat them as prompts to run the test, not as automatic triggers:

- **Persistence and data flow**: storage medium changes, a new persisted format, a change in where the system of record lives
- **Contract shape crossing a boundary**: a schema or API shape other teams or services consume
- **Dependency direction**: a new layer, an inverted dependency, a module boundary moved
- **Foundational external dependency**: a framework or platform choice future code will be written against — *not* every library addition
- **Security or compliance posture**: an authentication model, a data residency or retention decision

### Signals that usually fail the test

Deep nesting, a function used in several places, adding a state to an existing machine, coordinating a few async calls, or adopting a utility library are ordinary design work. They belong in the Design Doc's Minimal Surface Alternatives, which already records what was compared and why.

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
- *Transition*: proceed when no section is silently empty — an unanswered question is not the same as an inapplicable one

**4. Approval** — "Accepted" after review enables implementation
- *Output evidence*: reviewer verdict recorded; every blocking issue resolved or explicitly deferred with justification
- *Transition*: implementation begins only on an approved verdict

## Storage Locations

Documents are grouped **by feature**, not by document type. Everything a feature produces lives under one directory, so the whole record of a change is readable in one place. ADRs are the exception: a decision usually outlives and spans features, so they stay global.

```
docs/
├── adr/
│   └── ADR-0007-token-storage.md
└── features/
    └── {feature}/
        ├── prd.md
        ├── uxrd.md
        ├── design-{part}.md
        └── {part}/
            ├── {plan-name}.md          # e.g. 20260726-feature-auth.md
            └── {plan-name}/            # same name as its plan file
                ├── _overview.md
                ├── task-01.md
                ├── phase1-completion.md
                └── analysis/
                    └── {topic}.md
```

| Document | Path | Naming Convention | Template |
|----------|------|------------------|----------|
| PRD | `docs/features/{feature}/` | `prd.md` | [prd-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/prd-template.md) |
| UXRD | `docs/features/{feature}/` | `uxrd.md` | [uxrd-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/uxrd-template.md) |
| ADR | `docs/adr/` | `ADR-[4-digits]-[title].md` | [adr-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/adr-template.md) |
| Design Doc | `docs/features/{feature}/` | `design-{part}.md` | [design-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/design-template.md) |
| Work Plan | `docs/features/{feature}/{part}/` | `YYYYMMDD-{type}-{description}.md` | [plan-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/plan-template.md) |
| Task File | `docs/features/{feature}/{part}/{plan-name}/` | `task-{number}.md` | [task-template.md](${CLAUDE_PLUGIN_ROOT}/skills/documentation-criteria/references/task-template.md) |
| Analysis deliverable | `docs/features/{feature}/{part}/{plan-name}/analysis/` | `{topic}.md` | — |

### Parts

A **part** is one independently designable slice of a feature — a short name such as `core`, `api`, `checkout-ui`, or `migration`. Every feature has at least one, even when it is the only one: a uniform depth lets every agent resolve paths with a single glob instead of two.

`design-{part}.md` and the directory `{part}/` share the part name and are read as a pair — the design states what to build, the directory holds the plans that build it.

- **One design per part.** When a change needs materially different designs — a service contract and the screen consuming it — those are separate parts, not two documents in one.
- PRD and UXRD sit at feature level: they describe the feature as a whole, and splitting into parts is an implementation decision rather than a product or UX one.

### Plans within a part

A part may need more than one work plan — a first pass and a hardening pass, for example. Each plan file is paired with a directory of the **same name** holding its decomposition, so two plans never contend for one task directory.

Each plan declares its own position and state in frontmatter:

```yaml
---
feature: user-auth              # required
part: core                      # required
design: design-core.md          # required — back-reference to the governing design
plan: 2 of 3                    # required — position and expected total
status: active                  # draft | active | completed
depends-on: 20260726-auth.md    # omitted for the first plan
---
```

The frontmatter is the single source of truth for plan sequencing — there is no separate index file to drift out of sync with the directory.

| Question | Answer |
|----------|--------|
| How many plans should this part have? | the `M` in `plan: N of M` |
| Which plan runs now? | the one with `status: active` |
| What order? | the `depends-on` chain, not filename sort |
| Is the part done? | every plan `completed`, and the file count matches `M` |

**Escalate rather than guess** when: two plans claim `status: active`; no plan is active while the part has unfinished work; the number of plan files disagrees with `M`; or a `depends-on` names a file that does not exist. Each of these means the part's state is ambiguous, and picking one reading silently produces work against the wrong plan.

### Resolution globs

| To find | Glob |
|---------|------|
| Every PRD | `docs/features/*/prd.md` |
| Every UXRD | `docs/features/*/uxrd.md` |
| Every Design Doc | `docs/features/*/design-*.md` |
| Design for one part | `docs/features/{feature}/design-{part}.md` |
| Every work plan | `docs/features/*/*/*.md` |
| Plans of one part | `docs/features/{feature}/{part}/*.md` |
| Tasks of one plan | `docs/features/{feature}/{part}/{plan-name}/task-*.md` |
| Every ADR | `docs/adr/ADR-*.md` |

**Layer determination**: a design's layer is not encoded in its filename. Read the document (React/component/UI signals versus API/data/infrastructure signals) or take it from the part name where the part is layer-defined.

*Note: work plans and task files are ephemeral working state and are excluded by `.gitignore`.*

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