---
name: task-analyzer
description: This skill should be used when the user asks to "analyze this task", "determine task complexity", "select skills for task", "estimate work scale", or needs guidance on metacognitive task analysis. Returns skills with confidence scores and metadata.
---

# Task Analyzer

Provides metacognitive task analysis and skill selection guidance.

## Skills Index

### Skills Index Reference

Load skills metadata from the project-local `skills-index.yaml` for tag-based matching. Use the `tags` field to match against task keywords and the `typical_use` field to validate relevance.

The skills-index.yaml is a **project-local file** maintained by the `/sync-skills` command at `.claude/skills/task-analyzer/references/skills-index.yaml`. It is NOT inside the plugin — each project maintains its own copy.

A default template is bundled with the plugin at **[skills-index.yaml](${CLAUDE_PLUGIN_ROOT}/skills/task-analyzer/references/skills-index.yaml)** as a starting point. Run `/sync-skills` to generate or update the local version.

## Task Analysis Process

### 1. Understand Task Essence

Identify the fundamental purpose beyond surface-level work:

| Surface Work | Fundamental Purpose |
|--------------|---------------------|
| "Fix this bug" | Problem solving, root cause analysis |
| "Implement this feature" | Feature addition, value delivery |
| "Refactor this code" | Quality improvement, maintainability |
| "Update this file" | Change management, consistency |

**Key Questions:**
- What problem are we really solving?
- What is the expected outcome?
- What could go wrong if we approach this superficially?

### 2. Estimate Task Scale

File count is one signal, not the deciding rule — a two-file change that breaks a public contract carries more risk than a six-file rename. Evaluate every axis and select the **highest** scale triggered by any observed axis.

| Axis | Small | Medium | Large |
|------|-------|--------|-------|
| Estimated files | 1-2 | 3-5 | 6+ |
| Observable outcomes | One behavior | Multiple related behaviors | Multiple independently verifiable outcomes |
| Contracts/data | No public contract or persisted-data change | Backward-compatible contract change | Breaking contract, schema migration, or persisted-data migration |
| Boundaries | One local module/component | Multiple modules in one layer | Cross-layer, cross-service, or external-system boundary |
| Decision risk | Existing pattern applies directly | One bounded technical decision | Architecture, security, compliance, or irreversible operational decision |

Record which axis determined the final scale in `scaleRationale.decidingAxis`. A high file count caused only by mechanical generated-file updates may be reduced when repository evidence proves the change has one behavior and one verification path — record that evidence.

**Scale affects skill priority:**
- Larger scale → process/documentation skills more important
- Smaller scale → implementation skills more focused

### 3. Identify Task Type

| Type | Characteristics | Key Skills |
|------|-----------------|------------|
| implementation | New code or user-visible behavior | coding-principles, testing-principles |
| fix | Defect or regression resolution | ai-development-guide, testing-principles |
| refactoring | Behavior-preserving structure improvement | coding-principles, ai-development-guide |
| design | Architecture or contract decisions | documentation-criteria, implementation-approach |
| quality | Testing, review, verification | testing-principles, integration-e2e-testing |
| documentation | PRD, ADR, Design Doc, UXRD, plan, or instruction content | documentation-criteria |
| investigation | Evidence gathering without implementation | project-context plus the domain skill from the index |
| migration | Data, schema, API, dependency, or runtime transition | implementation-approach, documentation-criteria |
| operations | Environment, deployment, or runtime operation | technical-spec plus the domain skill from the index |
| security | Security design or review | security-checks plus the implementation-domain skill |
| skill | Skill creation, prompt-quality review, or skill metadata change | skill-optimization, llm-friendly-context |

When multiple types apply, return the primary type that owns the requested outcome and list the rest in `secondaryTypes`.

### 4. Tag-Based Skill Matching

Extract relevant tags from task description and match against the project-local `skills-index.yaml`:

```yaml
Task: "Implement user authentication with tests"
Extracted tags: [implementation, testing, security]
Matched skills:
  - coding-principles (implementation, security)
  - testing-principles (testing)
  - ai-development-guide (implementation)
```

### 5. Implicit Relationships

Consider hidden dependencies:

| Task Involves | Also Include |
|---------------|--------------|
| Error handling | debugging, testing |
| New features | design, implementation, documentation |
| Performance | profiling, optimization, testing |
| Frontend | typescript-rules, typescript-testing |
| API/Integration | integration-e2e-testing |

## Output Format

Return structured analysis with skill metadata from the project-local `skills-index.yaml`:

```yaml
taskAnalysis:
  essence: <string>  # Fundamental purpose identified
  type: <implementation|fix|refactoring|design|quality|documentation|investigation|migration|operations|security|skill>
  secondaryTypes: [<type>, ...]  # Other applicable types; empty when only one applies
  scale: <small|medium|large>
  estimatedFiles: <number>
  scaleRationale:
    decidingAxis: <files|outcomes|contracts-data|boundaries|decision-risk>
    evidence: <string>  # What was observed that set this scale
  tags: [<string>, ...]  # Extracted from task description

selectedSkills:
  - skill: <skill-name>  # From skills-index.yaml
    priority: <high|medium|low>
    reason: <string>  # Why this skill was selected
    # Pass through metadata from skills-index.yaml
    tags: [...]
    typical-use: <string>
    size: <small|medium|large>
    sections: [...]  # All sections from yaml, unfiltered
```

**Note**: Section selection (choosing which sections are relevant) is done after reading the actual SKILL.md files.

## Process Gates

1. **Intent gate**: proceed to scale estimation once `essence`, primary `type`, and any `secondaryTypes` are recorded. When the requested outcome is ambiguous, record the exact outcome decision required rather than guessing.
2. **Scale gate**: proceed to skill matching once every scale axis has observed, inferred, or `unknown` evidence and `scaleRationale.decidingAxis` is set.
3. **Selection gate**: finalize once every selected skill exists in `skills-index.yaml`, has a reason tied to this task, and its metadata is copied rather than invented.

When estimated file count or a material contract/boundary decision is unknown, classify it as `unknown` and use the highest scale supported by observed evidence. When an unknown could raise the scale **and** would change the required workflow, stop and request the exact repository evidence or user decision needed — silently assuming the lower scale skips the documents that the higher scale requires.

## Skill Selection Priority

1. **Essential** - Directly related to task type
2. **Quality** - Testing and quality assurance
3. **Process** - Workflow and documentation
4. **Supplementary** - Reference and best practices

## Metacognitive Question Design

Generate 3-5 questions according to task nature:

| Task Type | Question Focus |
|-----------|----------------|
| implementation | Design validity, edge cases, performance |
| fix | Root cause (5 Whys), impact scope, regression testing |
| refactoring | Current problems, target state, phased plan |
| design | Requirement clarity, future extensibility, trade-offs |
| quality | Coverage gaps, what a passing suite would still miss |
| documentation | Audience, decisions the reader must be able to make, staleness risk |
| investigation | What evidence would settle the question, what would falsify the leading hypothesis |
| migration | Rollback path, dual-running window, data-loss and ordering risk |
| operations | Blast radius, observability during the change, recovery procedure |
| security | Trust boundaries, input sources, what an attacker gains from each failure |
| skill | Whether the knowledge is project-specific or general, and what triggers it at runtime |

## Warning Patterns

Detect and flag these patterns:

| Pattern | Warning | Mitigation |
|---------|---------|------------|
| Large change at once | High risk | Split into phases |
| Implementation without tests | Quality risk | Follow TDD |
| Immediate fix on error | Root cause missed | Pause, analyze |
| Coding without plan | Scope creep | Plan first |