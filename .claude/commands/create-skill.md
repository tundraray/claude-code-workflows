---
name: create-skill
description: Create a new skill through guided interactive dialog with quality review
argument-hint: <skill topic or domain>
---

**Command Context**: Skill creation lifecycle management (Knowledge Collection → Composition → Quality Review → Approval)

## Orchestrator Definition

**Core Identity**: "I am not a worker. I am an orchestrator."

**First Action**: Register Steps 0-7 to TodoWrite before any execution.

## Execution Method

- Knowledge collection → performed by orchestrator via interactive dialog
- Skill composition → performed by orchestrator applying rule-editing-guide and skill-optimization principles
- Quality review → performed by orchestrator applying skill-optimization grading

Orchestrator manages the entire lifecycle with user approval gates.

## Required Skills

Before executing, load these skill files for guidance:
- `skills/rule-editing-guide/SKILL.md`
- `skills/skill-optimization/SKILL.md`

Skill topic: $ARGUMENTS

## Execution Flow

### Step 0: Pre-flight Check

```bash
# Check for name conflicts
ls skills/ | grep -i "[proposed-name]"
```

Verify:
- Skill name doesn't conflict with existing skills
- No duplicate coverage (check skills-index.yaml for overlapping tags)
- If conflict found → Present to user and ask for alternative name or confirmation to extend existing skill

### Step 1: Round 1 — Domain and Purpose **[Stop]**

Ask user using AskUserQuestion:

```
To create this skill, I need to understand its domain:

1. **What problem does this skill solve?** (What decisions will agents make better with this skill?)
2. **Target agents**: Which agents should load this skill? (e.g., task-executor, code-reviewer, all)
3. **Primary use cases**: List 3-5 scenarios where this skill applies
4. **Scope boundaries**: What is explicitly OUT of scope?
```

Wait for user response before proceeding.

### Step 2: Round 2 — Content Structure **[Stop]**

Based on Round 1 answers, ask user:

```
Now let's define the content structure:

1. **Key sections** (proposed based on your input):
   - [Section 1]: [description]
   - [Section 2]: [description]
   - [Section 3]: [description]
   Does this structure work? Any additions/changes?

2. **Decision criteria**: What specific rules should agents follow? (measurable yes/no criteria preferred)
3. **Output format**: Does this skill define an output format for agents? If so, describe the structure.
4. **Code examples**: Any specific good/bad patterns to include?
```

Wait for user response before proceeding.

### Step 3: Round 3 — Integration and Escalation **[Stop]**

```
Final details for integration:

1. **Related skills**: Which existing skills does this complement? (I'll add cross-references)
2. **Escalation patterns**: When should agents STOP and ask the user instead of following this skill?
3. **Expert references**: Any domain experts or authoritative sources to calibrate reasoning?
4. **Tags for discovery**: Suggest 5-10 tags for skills-index.yaml
```

Wait for user response before proceeding.

### Step 4: Compose Skill Content

Apply the following principles from rule-editing-guide and skill-optimization:

**Composition rules**:
1. Start with frontmatter (name, description with "Automatically loaded when..." clause)
2. Opening paragraph: scope statement (what IS and IS NOT covered)
3. Organize sections general → specific (BP-4)
4. Convert all negatives to positives (BP-1)
5. Make all criteria specific and measurable (BP-2)
6. Include output format if applicable (BP-3)
7. Provide context for when/why rules apply (BP-5)
8. Decompose complex rules (BP-6)
9. Include success AND failure examples (BP-7)
10. Define escalation criteria (BP-8)
11. End with Expert References (Reasoning Calibration) table
12. Cross-reference related skills by name, never duplicate content

**Size guidelines**:
- Target: 100-300 lines for SKILL.md
- If content exceeds 400 lines: split into SKILL.md + references/ subdirectory
- Each reference file should be a self-contained topic

### Step 5: Quality Grading **[Stop]**

Apply skill-optimization grading system:

```
## Skill Quality Assessment

**Grade**: [A/B/C]

### BP Pattern Compliance:
- BP-1 (Negative→Positive): [Pass/Fail] — [details]
- BP-2 (Vague→Specific): [Pass/Fail] — [details]
- BP-3 (Output Format): [Pass/Fail/N/A] — [details]
- BP-4 (Organization): [Pass/Fail] — [details]
- BP-5 (Context): [Pass/Fail] — [details]
- BP-6 (Decomposition): [Pass/Fail] — [details]
- BP-7 (Examples): [Pass/Fail] — [details]
- BP-8 (Escalation): [Pass/Fail] — [details]

### Recommendations:
- [any improvements before finalizing]
```

Present grade and assessment to user. If grade C → revise before proceeding.

### Step 6: User Approval **[Stop]**

Present the complete skill content to user for final approval:
- Show full SKILL.md content
- Show proposed skills-index.yaml entry
- Show which plugin.json files will be updated

Wait for user approval or revision requests.

### Step 7: Write and Register

1. Write `skills/[skill-name]/SKILL.md`
2. Suggest running `/sync-skills` to update skills-index.yaml

**Output**: "Skill created at skills/[skill-name]/SKILL.md. Run `/sync-skills` to update the skills index."

## Important Constraints

- **No duplication**: Check existing skills for overlapping content before writing
- **Measurable criteria only**: Every rule must be verifiable as yes/no from code
- **Positive form**: Convert all "don't" rules to "do" rules
- **Size awareness**: Flag if skill exceeds 400 lines and suggest splitting
