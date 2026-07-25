---
name: setup-context
description: Inject project-specific context into project-context skill SKILL.md
argument-hint: (no arguments - interactive setup)
---

**Command Context**: When using the boilerplate, collect project-specific context and update `skills/project-context/SKILL.md`.

## Why This Matters

Project context directly affects AI execution accuracy. When `project-context/SKILL.md` contains precise, measurable constraints, every agent in the system makes better decisions — from requirement analysis to code review. Vague context leads to generic output; specific context leads to targeted, high-quality results.

## Execution Process

### 1. Current State Detection

Check whether project context has already been configured:

```bash
cat skills/project-context/SKILL.md
```

**If the file contains `<!-- configured: false -->`** (default template state):
- Proceed with fresh setup (Round 1 → 2 → 3)

**If the file does NOT contain `<!-- configured: false -->`** (already configured):
- Show the user the current project context summary
- Ask: "Project context is already configured. Would you like to **overwrite** (start fresh) or **update** (modify specific sections)?"
  - **Overwrite**: Proceed with full setup (Round 1 → 2 → 3)
  - **Update**: Ask which sections to modify, then update only those sections

Also gather initial signals:

```bash
cat package.json 2>/dev/null | grep -E '"name":|"description":'
ls -la src/ 2>/dev/null | head -10
```

### 2. Project Context Collection (3 Staged Rounds)

Collect information through **3 focused rounds** using AskUserQuestion. Do NOT present all questions at once.

---

**Round 1: Project Essence**

Focus: What the project IS and WHO it's for.

Ask the user:
1. **What problem does your project solve?**
   - Examples: "Manual time tracking is inefficient" / "Inventory management is person-dependent"
2. **Who is the system for?**
   - Examples: "50-member sales team" / "E-commerce site operators" / "Internal development team"
3. **In what situations will it be used?**
   - Examples: "Field staff entering daily reports" / "Month-end aggregation tasks"

**Think deeply** about the responses before proceeding. Identify the core domain and primary value proposition.

---

**Round 2: Domain Constraints**

Focus: Business rules and non-negotiable requirements.

Ask the user:
1. **Critical business constraints** (maximum 3)
   - Examples: "7-year audit log retention" / "Mandatory approval workflow" / "Real-time synchronization" / "HIPAA compliance"
2. **Key performance requirements** (if any)
   - Examples: "API response under 200ms" / "Support 1000 concurrent users" / "Page load under 3 seconds"
3. **External system integrations** (if any)
   - Examples: "Connects to Salesforce API" / "Reads from PostgreSQL" / "Publishes to AWS SNS"

---

**Round 3: Development Context**

Focus: Team and process constraints.

Ask the user:
1. **Team composition**: Individual development / Team development (how many members?)
2. **Development phase**: Prototype / Production development / In operation
3. **Any conventions or patterns already established?**
   - Examples: "Using hexagonal architecture" / "Monorepo with Turborepo" / "REST API with OpenAPI spec"

---

### 3. Generate SKILL.md

**Think deeply** From the collected information, understand the project's essence and construct context focused on single responsibility.

## AI Execution Accuracy Maximization Criteria

Generated `skills/project-context/SKILL.md` must follow these criteria:

### Principles of Description

1. **Minimal yet maximally efficient**: Essential information only, eliminate redundancy
2. **AI-decidable**: Use only measurable and verifiable criteria ("quickly" → "within 5 seconds")
3. **Eliminate ambiguity**: Include specific numbers, conditions, and examples
4. **Preferred format**: Describe in "do this" form rather than "don't do that"

### Responsibility Boundaries

SKILL.md's single responsibility is "project-specific contextual information" only:

- Include: Project objectives, target users, business constraints, team structure, development phase
- Exclude: Tech stack (→technical-spec.md), implementation principles (→coding-principles), architecture (→technical-spec.md)

### Structure

```markdown
---
name: project-context
description: [Project-specific description — update this]
---

<!-- configured: true -->

# Project Context

## Project Overview

- **Problem being solved**: [Specific challenge with measurable impact]
- **Target users**: [Include number and attributes]
- **Usage scenarios**: [Specific situations with frequency]

## Development Structure

- **Team composition**: [Number and roles]
- **Development phase**: [Current stage]
- **Established conventions**: [Key patterns already in use]

## Business Constraints

1. [Measurable constraint with specific threshold]
2. [Verifiable requirement with acceptance criteria]

## Performance Requirements

- [Specific metric with target value]

## External Integrations

- [System name]: [Integration type and purpose]
```

### Verification Checklist

Before saving, verify the generated SKILL.md:

- [ ] No placeholder text remains (no `[brackets]` in final output)
- [ ] All constraints are measurable (specific numbers, thresholds, or conditions)
- [ ] No tech stack details leaked in (belongs in technical-spec)
- [ ] Project description would distinguish this project from any other
- [ ] Business constraints are verifiable (could write a test or check for compliance)

### 4. Update skills-index.yaml

Update the `typical-use` in the `project-context` section of the **project-local** index at `.claude/skills/task-analyzer/references/skills-index.yaml` to match the project.

If that file does not exist yet, run `/sync-skills` first — it generates the project-local copy from the template bundled with the plugin. Do not edit the bundled template directly; `/sync-skills` regenerates the local copy from it.

**Scope**: Update `skills/project-context/SKILL.md` only. Technology choices are the responsibility of other skills.
