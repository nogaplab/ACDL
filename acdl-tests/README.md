# ACDL Code Generation Tests

A comprehensive test suite with 5 scenarios for evaluating Claude Code's ability to generate Python from ACDL specifications.

## Test Scenarios

| # | Agent | Difficulty | Key Features |
|---|-------|------------|--------------|
| 1 | **SupportBot** | ⭐ Easy | History loop, conditionals, template functions |
| 2 | **DocBot** | ⭐⭐ Medium | List iteration, retrieval, named variables |
| 3 | **ReviewBot** | ⭐⭐⭐ Medium-Hard | Substeps `@T.I`, tool messages, partial turns |
| 4 | **ResearchBot** | ⭐⭐⭐⭐ Hard | Compaction, `@$C` deref, triple nesting |
| 5 | **OrchestratorBot** | ⭐⭐⭐⭐⭐ Expert | Multi-agent, Switch/Case, agent params |

## Scoring

| Test | Points |
|------|--------|
| 1-4 | 25 each |
| 5 (Bonus) | 25 |
| **Total** | **100** (125 with bonus) |

## How to Test

1. Open a **fresh Claude Code session** (separate window)
2. Attach the skill: `@acdl-skill.md`
3. Paste one ACDL spec from `test-cases.md`
4. Prompt:

```
Generate the Python implementation for this ACDL spec. Include:
1. All template constants and template functions
2. Appropriate data classes
3. Helper functions (stubbed with TODO)
4. The complete build_messages() function with ACDL line comments
5. A usage example
```

5. Score using the checklist in `test-cases.md`

## Files

- `acdl-skill.md` - The skill file to attach
- `test-cases.md` - All 5 test scenarios with ACDL, expected output, and rubrics

## What Each Test Covers

### Test 1: SupportBot (Easy)
- Basic `ForEach(@t: range(1, @T))` history loop
- Template function `CUSTOMER_INFO(name, tier)`
- Simple `If` conditional
- Index translation (1-indexed → 0-indexed)

### Test 2: DocBot (Medium)
- `ForEach(doc: list)` iteration over lists
- `Name docs := retrieve_documents(...)` variable assignment
- `$docs` variable reference
- Nested conditional with inner loop

### Test 3: ReviewBot (Medium-Hard)
- `@T.I` substep parameter
- `@t.@i` nested indexing
- Tool messages with `tool_call_id`
- `If @T.I > 0` partial turn handling

### Test 4: ResearchBot (Hard)
- `Name C := ...` and `@$C` dereference
- `range(@$C, @T)` dynamic loop bounds
- Mode-based conditional content
- Retrieval function in current turn

### Test 5: OrchestratorBot (Expert)
- `Specialist[@T](context, specialty)` parameterized agents
- `Switch/Case/Default` control flow
- Agent composition and invocation
- Context passing between agents
