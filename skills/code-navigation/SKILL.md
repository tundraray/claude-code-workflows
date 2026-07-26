---
name: code-navigation
description: This skill governs how to locate code — using LSP for anything that follows a symbol through the codebase, and text search only to reach a first anchor or where no symbol exists. Automatically loaded when finding where a symbol is defined, finding usages or call sites, assessing rename impact, or when "navigate", "find usages", "call sites", "references", "where is X defined", or "impact of renaming" are mentioned.
---

# Code Navigation

Two kinds of question look alike and are not: *"where does this string appear?"* is a text question, and *"what uses this symbol?"* is a semantic one. Text search answers the first correctly and the second only by accident.

Grep matching `OrderService` returns the class, its imports, a comment mentioning it, a log string, a similarly-named symbol in an unrelated module, and a commented-out call. It misses the alias `import { OrderService as Svc }` and every use through `Svc`. A findReferences call returns exactly the uses the compiler resolves — no comments, no strings, no false neighbours, and it follows the alias.

**In scope**: choosing the tool for a lookup, the anchor-then-traverse sequence, when falling back to text search is legitimate.
**Out of scope**: editing code, reviewing it, judging what the code should be.

## The Rule

**Text search reaches a first anchor. LSP does everything after it.**

Every LSP operation requires a position — `filePath`, `line`, `character`, all 1-based — so a lookup starting from a bare name needs an anchor first. That entry step is what Grep and Glob are for. Once a `file:line` is in hand, following the symbol is LSP's job.

```
1. Anchor      Grep "class OrderService"  →  src/orders/service.ts:42
2. Traverse    LSP findReferences at 42:7 →  every resolved use
```

Reaching for Grep again at step 2 discards the compiler's answer in favour of string matching.

## Tool by Question

| Question | Tool | Operation |
|----------|------|-----------|
| Where is this symbol defined? | LSP | `goToDefinition` |
| What uses this symbol? | LSP | `findReferences` |
| What breaks if I rename or change this? | LSP | `findReferences`, then read each site |
| Who calls this function? | LSP | `prepareCallHierarchy` → `incomingCalls` |
| What does this function call? | LSP | `prepareCallHierarchy` → `outgoingCalls` |
| What implements this interface? | LSP | `goToImplementation` |
| What is this symbol's type or doc? | LSP | `hover` |
| What is declared in this file? | LSP | `documentSymbol` |
| Where is a symbol named roughly X? | LSP | `workspaceSymbol` with `query` |
| Which files match a name pattern? | Glob | — |
| Where does this literal string appear? | Grep | — |
| Where is this key used in config, docs, or templates? | Grep | — |
| Which files contain a pattern with no symbol behind it (a TODO, a log format, a regex)? | Grep | — |

`workspaceSymbol` still takes `filePath`, `line`, and `character` — pass any file of the target language as the anchor — and it returns nothing for an empty `query`, so always supply one.

## Legitimate Fallback

Fall back to text search for a symbol question only for a reason you can name, and record that reason where the finding is reported:

| Reason | What to record |
|--------|----------------|
| LSP returned zero results for a symbol that demonstrably exists | `"findReferences returned 0 for OrderService at service.ts:42"` |
| No language server is configured for this file type | `"no LSP server for .erb; text search used"` |
| The operation errored | The error text |
| The target is not a symbol at all — a config key, a template variable, a string in a migration | Nothing to record; text search is simply correct here |

**"Grep is faster" is not a reason.** Neither is "I already know where it is" — that belief is what the lookup exists to check.

When falling back on a symbol question, treat the result as a **candidate set, not an answer**: read each hit and discard comments, strings, and same-named symbols from other modules before acting on it.

## Worked Examples

**Assessing rename impact** — the case where text search is most often wrong:

```
✅ Grep "function calculateTax"        → src/billing/tax.ts:18   (anchor)
   LSP findReferences at 18:10        → 7 resolved call sites
   Read each site, then rename

❌ Grep "calculateTax"                 → 23 hits
   ...includes a doc comment, two log strings, a different
   calculateTax in src/legacy/, and misses `import { calculateTax as ct }`
```

**Checking for an existing implementation before writing a new one:**

```
✅ LSP workspaceSymbol query:"validateOrder" (anchor: any .ts file)
   → finds OrderValidator.validateOrder even though the name differs
   from what you searched for

❌ Grep "validateOrder"
   → misses it, because the method is defined on a class whose file
     never spells the bare name
```

**Where text search is correct:**

```
✅ Grep "FEATURE_FLAG_NEW_CHECKOUT"
   → a config key has no symbol behind it; LSP has nothing to resolve
```

## Sequencing Rules

1. **Anchor once, traverse many.** Having resolved a symbol's position, keep using it — do not re-grep for each follow-up question about the same symbol.
2. **Follow definitions before concluding.** A reference list shows where a symbol is used; `goToDefinition` from an unfamiliar call site shows what it actually resolves to, which may not be the symbol assumed.
3. **Prefer `incomingCalls` to reading imports.** Imports show what a file *could* use; the call hierarchy shows what it does use.
4. **Report counts with their source.** "7 call sites (findReferences)" and "23 matches (grep)" mean different things, and a reader cannot tell them apart unless told.

## Escalation

Stop and ask the user when:

- LSP reports no server for a file type central to the task, and the answer depends on resolution the text cannot provide — for example, assessing rename impact across a language the server does not cover
- LSP and text search disagree on whether a symbol is used, and the difference changes what you would do. Report both counts and the discrepancy rather than picking the convenient one.
- A symbol resolves into generated or vendored code, so the real definition lives in a generator or upstream package rather than in this repository

## Expert References (Reasoning Calibration)

When choosing between semantic and textual lookup, calibrate against these principles:

| Source | Key Principle | Apply When |
|--------|--------------|------------|
| Language Server Protocol | "The server resolves symbols; the editor renders them" | Deciding whether a question needs resolution or matching |
| Refactoring — Martin Fowler | "Rename is safe only when every reference is known" | Assessing the impact of a rename or signature change |
| Compiler design | "Names are scoped; strings are not" | A grep result and a reference list disagree |
