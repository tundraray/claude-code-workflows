# Work Plan: [Feature Name] Implementation

Created Date: YYYY-MM-DD
Type: feature|fix|refactor
Estimated Duration: X days
Estimated Impact: X files
Related Issue/PR: #XXX (if any)

## Related Documents
- Design Doc: [docs/design/XXX.md]
- ADR: [docs/adr/ADR-XXXX.md] (if any)
- PRD: [docs/prd/XXX.md] (if any)

## Verification Strategy (from Design Doc)

### Correctness Proof Method
- **Correctness definition**: [extracted from Design Doc]
- **Verification method**: [extracted from Design Doc]
- **Verification timing**: [extracted from Design Doc]

### Early Verification Point
- **First verification target**: [extracted from Design Doc]
- **Success criteria**: [extracted from Design Doc]
- **Failure response**: [extracted from Design Doc]

### Proof Strategy
- **Proof obligation source**: test skeleton annotations (primary failure mode, proof obligation) when skeletons exist; otherwise each AC's primary failure mode, plus any applicable Failure Mode Checklist categories mapped to tasks
- **Per-task propagation**: every task implementing a claim or covering an applicable Failure Mode category records Proof Obligations (see task template), so downstream review can judge whether the tests *prove* the claim rather than merely run

## Quality Assurance Mechanisms (from Design Doc)

Adopted quality gates for the change area. Each task in this plan must satisfy these mechanisms.

| Mechanism | Enforces | Config/Source | Covered Files | Type |
|-----------|----------|---------------|---------------|------|
| [Tool/check name] | [What quality aspect it enforces] | [path/to/config] | [literal paths, directory prefixes, or "project-wide"] | executable_check |
| [Domain constraint] | [What it enforces] | [path/to/source] | [literal paths, directory prefixes, or "project-wide"] | passive_constraint |

## Design-to-Plan Traceability

Maps each Design Doc technical requirement to its covering task(s). One row per extracted item. Every row needs at least one covering task **or** an explicit gap justification — an item that appears in neither is how a requirement silently disappears between design and implementation.

| Design Doc | DD Section | DD Item | Category | Covered By Task(s) | Gap Status | Notes |
|---|---|---|---|---|---|---|
| [docs/design/XXX.md] | [Section name] | [Specific item] | impl-target / connection-switching / contract-change / verification / prerequisite | [Phase X Task Y] | covered | |
| docs/design/XXX.md | Security Considerations | Input validation for API | prerequisite | — | gap | Deferred to Phase 2 per user decision |

**Category values**: `impl-target` (implementation target), `connection-switching` (connection/switching/registration), `contract-change` (contract change and propagation), `verification` (verification requirement), `prerequisite` (prerequisite work)

**Gap Status values**: `covered` (task exists), `gap` (no task — requires justification in Notes and user confirmation before plan approval)

## Reference Contract Values

Include when the Design Doc specifies a **binding observable value** the implementation must reproduce exactly: a column/label set and its order, a derived-display rule, or a state-lifecycle negative. Extract these from the Design Doc directly, not from the Traceability table's summarized DD Item.

The Traceability table records *that* a row is covered; this table carries the value **verbatim**, so the covering task is checked against the exact contract rather than a re-derived summary. Serialized boundaries belong to the Connection Map below; ADR-derived structural decisions to ADR Bindings. Omit when none apply.

| Design Doc (§ Section) | Contract Type | Required Observable Value (verbatim) | Covered By Task(s) |
|---|---|---|---|
| [docs/design/XXX.md (§ Section)] | structure-order / derived-display / state-lifecycle-negative | [exact value copied from the Design Doc — e.g. "the listed fields in the specified order"; "the label shows the looked-up name in place of the raw code"; "persisted state is applied only when an explicit restore signal is present"] | [Phase X Task Y] |

## Failure Mode Checklist

Domain-independent failure categories this implementation must guard against. Enumerate all nine, mark each yes/no, and list a covering task for each that applies. Keep entries free of project-specific names — these categories are what test suites most often omit precisely because they are unglamorous.

| Category | Applies? | Covered By Task(s) |
|---|---|---|
| same-value | yes/no | [Phase X Task Y] |
| no-op | yes/no | |
| empty input | yes/no | |
| invalid option | yes/no | |
| missing config | yes/no | |
| unavailable boundary | yes/no | |
| shared-state dependency | yes/no | |
| rollback-only visibility | yes/no | |
| missing-sort-key ordering | yes/no | |

## UXRD Component → Task Mapping

Include when a UXRD is among the inputs. Maps each documented component to the task(s) implementing it. Downstream steps read this table to populate each task's Investigation Targets with the corresponding UXRD section. Omit when no UXRD exists.

| UXRD Component (section heading) | States to Cover | Covered By Task(s) | Gap Status | Notes |
|---|---|---|---|---|
| [UXRD heading exactly as written, e.g. "§ Component: AlertCard"] | [default / loading / empty / error / partial] | [Phase X Task Y] | covered | |

**Reference key rule**: column 1 is the UXRD section heading verbatim. Headings are unique, so the reference resolves to exactly one section.

**Gap Status values**: `covered`, `gap` (requires justification in Notes and user confirmation before plan approval)

## ADR Bindings

Include when ADRs are provided as input or listed in the Design Doc's Prerequisite ADRs. Omit when no ADR applies.

A decision is **implementation-binding** when it constrains code placement, dependency direction, contract/schema shape, data flow, or persistence. Acceptance criteria and required behaviors live in the Design Doc; this table covers only structural constraints from ADRs.

| ADR | Source Section | Axis | Binding Decision | Covered By Task(s) |
|---|---|---|---|---|
| [docs/adr/ADR-XXXX.md] | Decision / Implementation Guidance | placement \| dependency_direction \| contract_schema \| data_flow \| persistence | [one binding decision sentence, copied or condensed from the named section] | [Phase X Task Y] |

One row per binding decision. A single ADR can contribute multiple rows; a single task can appear in multiple rows.

## Connection Map

Include when the implementation crosses a package, service, or process boundary — **or when a value is serialized and re-parsed across a boundary even within one runtime**: query strings, route/CLI arguments, environment variables, config entries, message payloads, storage keys, files. Producer and consumer must agree on the exact representation, and that agreement is invisible to the type system.

Record each Owner as concrete file path(s), not a bare module name, so it resolves as an Investigation Target the executor can read. Omit when no such boundary exists.

| Boundary | Owner (left side) | Owner (right side) | Serialized Format | Consumer Parse Rule | Expected Signal | Covered By Task(s) |
|---|---|---|---|---|---|---|
| [producing side → consuming side] | [file path(s)] | [file path(s)] | [exact representation the producer emits; "—" if not serialized] | [how the consumer decodes/validates it; "—" if not serialized] | [observable evidence the boundary works] | [Phase X Task Y on each side] |

## Objective
[Why this change is necessary, what problem it solves]

## Background
[Current state and why changes are needed]

## Risks and Countermeasures

### Technical Risks
- **Risk**: [Risk description]
  - **Impact**: [Impact assessment]
  - **Countermeasure**: [How to address it]

### Schedule Risks
- **Risk**: [Risk description]
  - **Impact**: [Impact assessment]
  - **Countermeasure**: [How to address it]

## Implementation Phases

(Note: Phase structure is determined based on Design Doc technical dependencies and implementation approach)

### Phase 1: [Phase Name] (Estimated commits: X)
**Purpose**: [What this phase aims to achieve]

#### Tasks
- [ ] Task 1: Specific work content
- [ ] Task 2: Specific work content
- [ ] Quality check: Implement staged quality checks (refer to ai-development-guide skill)
- [ ] Unit tests: All related tests pass

#### Phase Completion Criteria
- [ ] [Functional completion criteria]
- [ ] [Quality completion criteria]

#### Operational Verification Procedures
1. [Operation verification steps]
2. [Expected result verification]
3. [Performance verification (when applicable)]

### Phase 2: [Phase Name] (Estimated commits: X)
**Purpose**: [What this phase aims to achieve]

#### Tasks
- [ ] Task 1: Specific work content
- [ ] Task 2: Specific work content
- [ ] Quality check: Implement staged quality checks (refer to ai-development-guide skill)
- [ ] Integration tests: Verify overall feature functionality

#### Phase Completion Criteria
- [ ] [Functional completion criteria]
- [ ] [Quality completion criteria]

#### Operational Verification Procedures
1. [Operation verification steps]
2. [Expected result verification]
3. [Performance verification (when applicable)]

### Phase 3: [Phase Name] (Estimated commits: X)
**Purpose**: [What this phase aims to achieve]

#### Tasks
- [ ] Task 1: Specific work content
- [ ] Task 2: Specific work content
- [ ] Quality check: Implement staged quality checks (refer to ai-development-guide skill)
- [ ] Integration tests: Verify component coordination

#### Phase Completion Criteria
- [ ] [Functional completion criteria]
- [ ] [Quality completion criteria]

#### Operational Verification Procedures
[Copy relevant integration point operational verification from Design Doc]

### Final Phase: Quality Assurance (Required) (Estimated commits: 1)
**Purpose**: Overall quality assurance and Design Doc consistency verification

#### Tasks
- [ ] Verify all Design Doc acceptance criteria achieved
- [ ] Quality checks (types, lint, format)
- [ ] Execute all tests
- [ ] Coverage 70%+
- [ ] Document updates

#### Operational Verification Procedures
[Copy operational verification procedures from Design Doc]

### Quality Assurance
- [ ] Implement staged quality checks (details: refer to ai-development-guide skill)
- [ ] All tests pass
- [ ] Static check pass
- [ ] Lint check pass
- [ ] Build success

## Completion Criteria
- [ ] All phases completed
- [ ] Each phase's operational verification procedures executed
- [ ] Design Doc acceptance criteria satisfied
- [ ] Staged quality checks completed (zero errors)
- [ ] All tests pass
- [ ] Necessary documentation updated
- [ ] User review approval obtained

## Progress Tracking
### Phase 1
- Start: YYYY-MM-DD HH:MM
- Complete: YYYY-MM-DD HH:MM
- Notes: [Any special remarks]

### Phase 2
- Start: YYYY-MM-DD HH:MM
- Complete: YYYY-MM-DD HH:MM
- Notes: [Any special remarks]

## Notes
[Special notes, reference information, important points, etc.]
