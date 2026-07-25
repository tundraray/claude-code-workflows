# [Feature Name] Design Document

## Overview

[Explain the purpose and overview of this feature in 2-3 sentences]

## Design Summary (Meta)

```yaml
design_type: "new_feature|extension|refactoring"
risk_level: "low|medium|high"
complexity_level: "low|medium|high"
complexity_rationale: "[Required if medium/high: (1) which requirements/ACs necessitate this complexity, (2) which constraints/risks it addresses]"
main_constraints:
  - "[constraint 1]"
  - "[constraint 2]"
biggest_risks:
  - "[risk 1]"
  - "[risk 2]"
unknowns:
  - "[uncertainty 1]"
  - "[uncertainty 2]"
```

## Background and Context

### Prerequisite ADRs

- [ADR File Name]: [Related decision items]
- Reference common technical ADRs when applicable

### Agreement Checklist

#### Scope
- [ ] [Features/components to change]
- [ ] [Features to add]

#### Non-Scope (Explicitly not changing)
- [ ] [Features/components not to change]
- [ ] [Existing logic to preserve]

#### Constraints
- [ ] Parallel operation: [Yes/No]
- [ ] Backward compatibility: [Required/Not required]
- [ ] Performance measurement: [Required/Not required]

### Problem to Solve

[Specific problems or challenges this feature aims to address]

### Current Challenges

[Current system issues or limitations]

### Requirements

#### Functional Requirements

- [List mandatory functional requirements]

#### Non-Functional Requirements

- **Performance**: [Response time, throughput requirements]
- **Scalability**: [Requirements for handling increased load]
- **Reliability**: [Error rate, availability requirements]
- **Maintainability**: [Code readability and changeability]

## Acceptance Criteria (AC) - EARS Format

Each AC is written in EARS (Easy Approach to Requirements Syntax) format.
Keywords determine test type and reduce ambiguity.

**EARS Keywords**:
| Keyword | Usage | Test Type |
|---------|-------|-----------|
| **When** | Event-triggered behavior | Event-driven test |
| **While** | State-dependent behavior | State condition test |
| **If-then** | Conditional behavior | Branch coverage test |
| (none) | Ubiquitous behavior | Basic functionality test |

**Format**: `[Keyword] <trigger/condition>, the system shall <expected behavior>`

### [Functional Requirement 1]

- [ ] **When** user clicks login button with valid credentials, the system shall authenticate and redirect to dashboard
- [ ] **If** credentials are invalid, **then** the system shall display error message "Invalid credentials"
- [ ] **While** user is logged in, the system shall maintain the session for configured timeout period

### [Functional Requirement 2]

- [ ] The system shall display data list with pagination of 10 items per page
- [ ] **When** input is entered in search field, the system shall apply real-time filtering

## Existing Codebase Analysis

### Implementation Path Mapping
| Type | Path | Description |
|------|------|-------------|
| Existing | src/[actual-path] | [Current implementation] |
| New | src/[planned-path] | [Planned new creation] |

### Integration Points (Include even for new implementations)
- **Integration Target**: [What to connect with]
- **Invocation Method**: [How it will be invoked]

### Code Inspection Evidence
- [path:function] — [relevance: similar functionality / integration point / pattern reference]

### Fact Disposition Table

One row per `focusAreas` entry from codebase analysis. This table binds structural existing-behavior facts to the design; other sections referencing existing behavior cite the row by `fact_id` rather than restating it.

Prose about "the current implementation" is unauditable — a reviewer cannot tell whether an omission was deliberate. A row per fact with an explicit disposition makes deliberate removal distinguishable from oversight.

| Fact ID | Focus Area | Disposition | Rationale | Evidence | Related Files |
|---------|------------|-------------|-----------|----------|---------------|
| [fact_id from focusAreas] | [area name] | preserve / transform / remove / out-of-scope | [preserve: confirmation only ("retained without modification"); transform: the new observable outcome ("now returns 404 instead of 410"); remove: reason plus PRD/UXRD citation when policy-driven; out-of-scope: cite the scope-defining section] | [evidence value carried verbatim from focusAreas] | [comma-separated paths from focusAreas.relatedFiles] |

### Cross-Layer Assumptions (cross-layer flow only)

When this Design Doc depends on unverified claims from a prior-layer Design Doc, list each with justification and downstream verification target:

- [claim]: [justification]; verify at [step or artifact]

## Design

### Change Impact Map

```yaml
Change Target: [Component/feature to change]
Direct Impact:
  - [Files/functions requiring direct changes]
  - [Interface change points]
Indirect Impact:
  - [Data format changes]
  - [Processing time changes]
No Ripple Effect:
  - [Explicitly specify unaffected features]
```

### Minimal Surface Alternatives (When Introducing Maintenance-Surface Elements)

One entry per new in-scope element: persistent state, a public-contract element or cross-boundary field/prop, a behavioral mode/flag/variant, or a reusable abstraction / component split. Every such element is permanent maintenance surface, so the design must show the smaller option was considered and say why it was insufficient.

#### Element 1: [name of the new element]

**Step 1 — Fixed Requirements**
- [AC reference — AC ID, EARS clause, or constraint ID]: [requirement text]
- [AC reference]: [requirement text]

References may point to this Design Doc, the referenced PRD, or the referenced UXRD.

**Steps 2–3 — Alternatives Compared**

Adapt the column names to context: backend docs use "Crosses module/service boundary" and "New concept / mode / flag"; frontend docs use "Crosses component boundary" and "New props / modes / variants".

| Alternative | Requirements covered (AC ref) | New persistent state (count) | New concept / mode / flag / prop (count) | Crosses boundary (yes/no) | Breaking change or migration (yes/no) | Subjective cost notes |
|---|---|---|---|---|---|---|
| [The added element as proposed] | | | | | | |
| [Subtractive alternative — derive, compute on demand, keep at caller, reuse existing, introduce no new state] | | | | | | |
| [Optional third alternative] | | | | | | |

**Resolution priority for selecting "smallest"** (later rows break ties when earlier are equal):
1. New persistent state introduced (lower = smaller)
2. Crosses module/service or component boundary (no = smaller)
3. New concept / mode / flag / prop / variant (lower = smaller)
4. Breaking change or migration required (no = smaller)
5. Subjective cost notes

**Step 4 — Selected Alternative and Rationale**
- **Selected**: [alternative name]
- **Rationale**:
  - When the selected option *is* the smallest considered: state "smallest alternative considered; no further reduction available"
  - When it is larger: name the Step 1 requirement(s) the smaller alternatives fail to satisfy

**Step 5 — Rejected Alternatives Log**
- [Alternative name]: [1-2 lines on what it was and why rejected]

Repeat the Element block for each additional in-scope element. Mark the whole section N/A with brief rationale when the design introduces none.

### Architecture Overview

[How this feature is positioned within the overall system]

### Data Flow

```
[Express data flow using diagrams or pseudo-code]
```

### Integration Points List

| Integration Point | Location | Old Implementation | New Implementation | Switching Method |
|-------------------|----------|-------------------|-------------------|------------------|
| Integration Point 1 | [Class/Function] | [Existing Process] | [New Process] | [DI/Factory etc.] |
| Integration Point 2 | [Another Location] | [Existing] | [New] | [Method] |

### Main Components

#### Component 1

- **Responsibility**: [Scope of responsibility for this component]
- **Interface**: [APIs and contract definitions provided]
- **Dependencies**: [Relationships with other components]

#### Component 2

- **Responsibility**: [Scope of responsibility for this component]
- **Interface**: [APIs and contract definitions provided]
- **Dependencies**: [Relationships with other components]

### Contract Definitions

```
// Record major contract/interface definitions here
```

### Data Contract

#### Component 1

```yaml
Input:
  Type: [Type/interface definition]
  Preconditions: [Required items, format constraints]
  Validation: [Validation method]

Output:
  Type: [Type/interface definition]
  Guarantees: [Conditions that must always be met]
  On Error: [Exception/null/default value]

Invariants:
  - [Conditions that remain unchanged before and after processing]
```

### State Transitions and Invariants (When Applicable)

```yaml
State Definition:
  - Initial State: [Initial values and conditions]
  - Possible States: [List of states]

State Transitions:
  Current State → Event → Next State

System Invariants:
  - [Conditions that hold in any state]
```

### Error Handling

[Types of errors and how to handle them]

### Logging and Monitoring

[What to record in logs and how to monitor]

## Implementation Plan

### Implementation Approach

**Selected Approach**: [Approach name or combination]
**Selection Reason**: [Reason considering project constraints and technical dependencies]

### Technical Dependencies and Implementation Order

#### Required Implementation Order
1. **[Component/Feature A]**
   - Technical Reason: [Why this needs to be implemented first]
   - Dependent Elements: [Other components that depend on this]

2. **[Component/Feature B]**
   - Technical Reason: [Technical necessity to implement after A]
   - Prerequisites: [Required pre-implementations]

### Integration Points
Each integration point requires E2E verification:

**Integration Point 1: [Name]**
- Components: [Component A] → [Component B]
- Verification: [How to verify integration works]

**Integration Point 2: [Name]**
- Components: [Component B] → [Component C]
- Verification: [How to verify integration works]

### Migration Strategy

[Technical migration approach, ensuring backward compatibility]

## Test Strategy

### Basic Test Design Policy

Automatically derive test cases from acceptance criteria:
- Create at least one test case for each acceptance criterion
- Implement measurable standards from acceptance criteria as assertions

### Unit Tests

[Unit testing policy and coverage goals]
- Verify individual elements of functional acceptance criteria

### Integration Tests

[Integration testing policy and important test cases]
- Verify combined operations of functional acceptance criteria

### E2E Tests

[E2E testing policy]
- Verify entire scenarios of acceptance criteria
- Confirm functional operation from user perspective

### Performance Tests

[Performance testing methods and standards]
- Verify performance standards of non-functional acceptance criteria

## Security Considerations

Evaluate each of the following against this feature's trust boundaries and data flow. Mark an item N/A with a brief rationale when the feature has no relevant trust boundary — an unanswered question is not the same as an inapplicable one.

- **Authentication & Authorization**: What authentication is required for new entry points? What authorization checks protect resource access?
- **Input Validation**: Where does external input enter the system? How is it validated before processing?
- **Sensitive Data Handling**: What data requires protection (encryption, masking, access control)? What data is safe to include in logs and error responses?

## Test Boundaries

### Mock Boundary Decisions

| Component/Dependency | Mock? | Rationale |
|---------------------|-------|-----------|
| [External API / DB / file system / etc.] | [Yes/No] | [Why this boundary was chosen] |

### Data Layer Testing Strategy

- **Schema dependencies**: [tables/models this feature reads or writes, with paths to their definitions]
- **Test data approach**: [fixtures, factories, seed scripts, or real database]
- **Mock limitations acknowledged**: [what cannot be reliably tested with mocks alone for this feature]

Mark N/A with brief rationale when the feature has no data layer dependencies.

### Integration Verification Points

- [Critical integration points requiring testing beyond unit-level mocks]

## Verification Strategy

Defines what correctness *means* for this change and how it will be proven, at design time. This is distinct from the L1/L2/L3 tiers, which describe completion-verification granularity at task execution time.

### Correctness Proof Method

- **Correctness definition**: [what "correct" means here — e.g. "output matches existing behavior", "all ACs pass in a production-equivalent environment"]
- **Verification method**: [specific technique — e.g. "compare new implementation output against the existing one", "run against staging DB", "contract test against the real API"]
- **Verification timing**: [when — e.g. "after the first vertical slice", "per repository", "at integration phase"]

### Early Verification Point

What is verified first, to confirm the approach holds before scaling it?

- **First verification target**: [smallest unit proving the approach works — e.g. "first repository migration", "single API endpoint"]
- **Success criteria**: [observable outcome — e.g. "CSV download output is identical to legacy", "API returns 200 with the expected schema"]
- **Failure response**: [what to do if it fails — e.g. "reassess approach before proceeding", "escalate to user"]

### Output Comparison (When Replacing or Modifying Existing Behavior)

- **Comparison input**: [identical input used for both implementations — e.g. "same DB snapshot", "same request payload"]
- **Expected output fields**: [specific fields/columns compared]
- **Diff method**: [file-level diff, JSON field-by-field comparison, row count plus spot check]
- **Transformation pipeline coverage**: [each step from codebase analysis `dataTransformationPipelines` and what the comparison covers]

Mark N/A with brief rationale when the design introduces entirely new behavior with no existing equivalent.

## Future Extensibility

Capability-level items considered and excluded, not bound to a single element. (Element-level rejected alternatives belong in Minimal Surface Alternatives → Step 5.)

- **Deferred possibilities**: [capabilities considered and explicitly excluded from the current surface; each names the requirement it would have served]
- **Intentional limitations**: [what was deliberately kept small, and why]

## Alternative Solutions

### Alternative 1

- **Overview**: [Description of alternative solution]
- **Advantages**: [Advantages]
- **Disadvantages**: [Disadvantages]
- **Reason for Rejection**: [Why it wasn't adopted]

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| [Risk 1] | High/Medium/Low | High/Medium/Low | [Countermeasure] |

## References

- [Related documentation and links]

## Update History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| YYYY-MM-DD | 1.0 | Initial version | [Name] |
