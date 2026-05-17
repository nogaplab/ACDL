# ACDL Code Generation Tests

Multiple test scenarios for evaluating Claude Code's ability to generate Python from ACDL specifications. Each scenario tells a story and tests specific language features.

---

# Test 1: Customer Support Bot (Basic)

**Difficulty:** ⭐ Easy

## Story

You're building **SupportBot**, a customer service agent for an e-commerce company. It needs to:
- Maintain conversation history
- Access customer information
- Personalize responses based on customer tier

## ACDL Specification

```acdl
// SupportBot: Customer service agent with personalization
SupportBot[@T]: {
    S: {
        SUPPORT_GUIDELINES
        COMPANY_POLICIES
        CUSTOMER_INFO(env.customer_name[@1], env.customer_tier[@1])
    }

    // Conversation history
    ForEach(@t: range(1, @T)) {
        U: env.message[@t]
        A: resp.reply[@t]
    }

    // Current message with tier-specific instructions
    U: env.message[@T]

    If env.customer_tier[@T] == "premium" {
        S: PREMIUM_PRIORITY_NOTICE
    }
}
```

## What This Tests

| Feature | ACDL Construct | Expected Python |
|---------|----------------|-----------------|
| Basic history loop | `ForEach(@t: range(1, @T))` | `for t in range(1, turn):` |
| Template function | `CUSTOMER_INFO(...)` | `def CUSTOMER_INFO(...) -> str` |
| String equality | `== "premium"` | Python comparison |
| Conditional system message | `If ... { S: ... }` | `if ...: messages.append(...)` |
| Index translation | `@t` → history access | `history[t-1]` |

## Expected Output

```python
SUPPORT_GUIDELINES = """..."""
COMPANY_POLICIES = """..."""
PREMIUM_PRIORITY_NOTICE = """..."""

def CUSTOMER_INFO(name: str, tier: str) -> str:
    return f"Customer: {name}\nTier: {tier}"

@dataclass
class TurnHistory:
    message: str
    reply: Optional[str] = None

@dataclass
class AgentState:
    history: List[TurnHistory]
    customer_name: str
    customer_tier: str

def build_messages(turn: int, state: AgentState, current_message: str) -> List[dict]:
    messages = []

    # S: { SUPPORT_GUIDELINES, COMPANY_POLICIES, CUSTOMER_INFO(...) }
    messages.append({
        "role": "system",
        "content": SUPPORT_GUIDELINES + "\n\n" + COMPANY_POLICIES + "\n\n" +
                   CUSTOMER_INFO(state.customer_name, state.customer_tier)
    })

    # ForEach(@t: range(1, @T))
    for t in range(1, turn):
        messages.append({"role": "user", "content": state.history[t-1].message})
        messages.append({"role": "assistant", "content": state.history[t-1].reply})

    # U: env.message[@T]
    messages.append({"role": "user", "content": current_message})

    # If env.customer_tier[@T] == "premium"
    if state.customer_tier == "premium":
        messages.append({"role": "system", "content": PREMIUM_PRIORITY_NOTICE})

    return messages
```

## Scoring (25 points)

- [ ] (5) History loop with correct index translation
- [ ] (5) Template function defined and called
- [ ] (5) Conditional system message
- [ ] (5) Multi-part system message concatenation
- [ ] (5) Clean data structures

---

# Test 2: Document Q&A Agent (Medium)

**Difficulty:** ⭐⭐ Medium

## Story

You're building **DocBot**, a RAG-based document Q&A system. It needs to:
- Retrieve relevant documents for each query
- Format citations properly
- Track which documents have been referenced
- Support follow-up questions

## ACDL Specification

```acdl
// DocBot: RAG agent with document retrieval and citation tracking
DocBot[@T]: {
    S: {
        QA_INSTRUCTIONS
        CITATION_FORMAT
    }

    // Previous Q&A turns
    ForEach(@t: range(1, @T)) {
        U: {
            CONTEXT_HEADER
            ForEach(doc: sys.retrieved_docs[@t]) {
                DOCUMENT_BLOCK(doc.id, doc.title, doc.snippet)
            }
            QUESTION_HEADER
            env.question[@t]
        }
        A: resp.answer[@t]
    }

    // Current turn with fresh retrieval
    U: {
        CONTEXT_HEADER
        Name docs := retrieve_documents(env.question[@T], 5)
        ForEach(doc: $docs) {
            DOCUMENT_BLOCK(doc.id, doc.title, doc.snippet)
        }

        If sys.cited_doc_count[@T] > 0 {
            PREVIOUS_CITATIONS_HEADER
            ForEach(cite: sys.cited_documents[@T]) {
                cite.id
            }
        }

        QUESTION_HEADER
        env.question[@T]
    }
}
```

## What This Tests

| Feature | ACDL Construct | Expected Python |
|---------|----------------|-----------------|
| List iteration | `ForEach(doc: sys.retrieved_docs[@t])` | `for doc in retrieved_docs[t]:` |
| Retrieval function | `retrieve_documents(...)` | Stub function with TODO |
| Named variable | `Name docs := ...` | Variable assignment |
| Variable iteration | `ForEach(doc: $docs)` | `for doc in docs:` |
| Nested conditionals | `If ... { ForEach ... }` | Nested control flow |
| Template with 3 args | `DOCUMENT_BLOCK(id, title, snippet)` | Function with 3 params |
| Content building | Multiple elements in `U:` | String concatenation |

## Expected Output Structure

```python
QA_INSTRUCTIONS = """..."""
CITATION_FORMAT = """..."""
CONTEXT_HEADER = """..."""
QUESTION_HEADER = """..."""
PREVIOUS_CITATIONS_HEADER = """..."""

def DOCUMENT_BLOCK(id: str, title: str, snippet: str) -> str:
    return f"[{id}] {title}\n{snippet}"

def retrieve_documents(query: str, k: int) -> List[dict]:
    # TODO: Implement retrieval
    pass

@dataclass
class Document:
    id: str
    title: str
    snippet: str

@dataclass
class TurnHistory:
    question: str
    answer: Optional[str] = None
    retrieved_docs: List[Document] = None

@dataclass
class AgentState:
    history: List[TurnHistory]
    cited_documents: List[Document] = None
    cited_doc_count: int = 0

def build_messages(turn: int, state: AgentState, current_question: str) -> List[dict]:
    # ... implementation
    pass
```

## Scoring (25 points)

- [ ] (5) List iteration over documents
- [ ] (5) Retrieval function stubbed with TODO
- [ ] (5) Name assignment and `$docs` usage
- [ ] (5) Nested conditional with inner loop
- [ ] (5) User message content properly concatenated

---

# Test 3: Code Review Agent (Medium-Hard)

**Difficulty:** ⭐⭐⭐ Medium-Hard

## Story

You're building **ReviewBot**, a code review agent that uses tools to analyze code. It needs to:
- Run multiple analysis tools per review cycle
- Track findings across iterations
- Handle tool calls with proper message structure
- Support iterative refinement

## ACDL Specification

```acdl
// ReviewBot: Code review agent with iterative tool use
ReviewBot[@T.I]: {
    S: {
        REVIEW_GUIDELINES
        ANALYSIS_TOOLS
        OUTPUT_FORMAT
    }

    // Initial code submission
    U: {
        CODE_REVIEW_REQUEST
        env.code_diff[@1]
        If env.has_context[@1] {
            CONTEXT_HEADER
            env.pr_description[@1]
        }
    }

    // Review iterations
    ForEach(@t: range(1, @T)) {
        // Tool usage within this iteration
        ForEach(@i: range(1, @t.substeps)) {
            A: {
                resp.analysis[@t.@i]
                ForEach(tool: sys.tool_calls[@t.@i]) {
                    tool.invocation
                }
            }
            ForEach(tool: sys.tool_calls[@t.@i]) {
                T: {
                    tool.call_id
                    tool.result
                }
            }
        }

        // Iteration summary
        A: resp.review_summary[@t]

        // User feedback if any
        If sys.has_feedback[@t] {
            U: env.feedback[@t]
        }
    }

    // Current iteration - partial progress
    If @T.I > 0 {
        ForEach(@i: range(1, @T.I)) {
            A: {
                resp.analysis[@T.@i]
                ForEach(tool: sys.tool_calls[@T.@i]) {
                    tool.invocation
                }
            }
            ForEach(tool: sys.tool_calls[@T.@i]) {
                T: {
                    tool.call_id
                    tool.result
                }
            }
        }
    }
}
```

## What This Tests

| Feature | ACDL Construct | Expected Python |
|---------|----------------|-----------------|
| Substep parameter | `@T.I` | Second parameter to function |
| Substep indexing | `@t.@i` | Nested access `history[t].substeps[i]` |
| Nested iteration | Loop inside loop | Nested `for` loops |
| Tool messages | `T: { tool.call_id, tool.result }` | `{"role": "tool", "tool_call_id": ...}` |
| Partial turn | `If @T.I > 0` | `if substep > 0:` |
| Conditional user msg | `If sys.has_feedback[@t] { U: ... }` | Conditional message append |

## Expected Output Structure

```python
@dataclass
class ToolCall:
    call_id: str
    invocation: str
    result: Optional[str] = None

@dataclass
class SubStep:
    analysis: str
    tool_calls: List[ToolCall]

@dataclass
class TurnHistory:
    substeps: List[SubStep]
    review_summary: Optional[str] = None
    has_feedback: bool = False
    feedback: Optional[str] = None

def build_messages(
    turn: int,
    substep: int,
    state: AgentState,
    code_diff: str,
    pr_description: Optional[str] = None
) -> List[dict]:
    messages = []

    # ... system message

    # Initial user message with optional context
    user_content = CODE_REVIEW_REQUEST + "\n" + code_diff
    if pr_description:
        user_content += "\n" + CONTEXT_HEADER + "\n" + pr_description
    messages.append({"role": "user", "content": user_content})

    # ForEach(@t: range(1, @T))
    for t in range(1, turn):
        # ForEach(@i: range(1, @t.substeps))
        for i in range(len(state.history[t-1].substeps)):
            substep_data = state.history[t-1].substeps[i]

            # A: { resp.analysis[@t.@i], tool calls }
            messages.append({
                "role": "assistant",
                "content": substep_data.analysis,
                "tool_calls": [{"id": tc.call_id, ...} for tc in substep_data.tool_calls]
            })

            # T: for each tool
            for tool in substep_data.tool_calls:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool.call_id,
                    "content": tool.result
                })

        # A: resp.review_summary[@t]
        messages.append({"role": "assistant", "content": state.history[t-1].review_summary})

        # If sys.has_feedback[@t]
        if state.history[t-1].has_feedback:
            messages.append({"role": "user", "content": state.history[t-1].feedback})

    # Partial current turn
    if substep > 0:
        # ... similar structure for partial
        pass

    return messages
```

## Scoring (25 points)

- [ ] (5) Substep parameter in function signature
- [ ] (5) Nested loops for turns → substeps → tools
- [ ] (5) Tool messages with correct structure
- [ ] (5) Partial turn handling (`@T.I > 0`)
- [ ] (5) Conditional feedback message

---

# Test 4: Research Assistant (Hard)

**Difficulty:** ⭐⭐⭐⭐ Hard

## Story

You're building **ResearchBot**, a multi-turn research assistant with:
- Conversation compaction for long sessions
- Multiple search tools per query
- Research mode switching (exploratory vs focused)
- Source tracking and citation

## ACDL Specification

```acdl
// ResearchBot: Research assistant with memory compaction and mode switching
ResearchBot[@T.I]: {
    S: {
        SYSTEM_PROMPT
        RESEARCH_GUIDELINES
        AVAILABLE_TOOLS
        ENV_INFO(env.date[@1], env.user_expertise[@1])
    }

    // Handle conversation compaction for long sessions
    Name C := sys.last_compaction_turn[@T]
    If @$C > 1 {
        U: CONVERSATION_SUMMARY_HEADER
        A: sys.conversation_summary[@$C]
    }

    // Main conversation loop (from compaction point to current turn)
    ForEach(@t: range(@$C, @T)) {
        U: {
            env.user_query[@t]
            If sys.mode_changed[@t] {
                MODE_CHANGE_NOTICE(sys.research_mode[@t])
            }
        }

        // Tool interaction substeps
        ForEach(@i: range(1, @t.substeps)) {
            A: {
                resp.reasoning[@t.i]
                ForEach(tool: sys.tool_requests[@t.i]) {
                    tool.name_and_args
                }
            }
            ForEach(tool: sys.tool_requests[@t.i]) {
                T: {
                    tool.id
                    tool.response
                }
            }
        }

        A: resp.answer[@t]
    }

    // Current turn's user input
    U: {
        env.user_query[@T]
        If sys.research_mode[@T] == "focused" {
            FOCUSED_MODE_REMINDER
            Name relevant := get_relevant_sources(sys.source_history[@T], 3)
            ForEach(src: $relevant) {
                SOURCE_CITATION(src.id, src.title)
            }
        }
    }

    // Partial current turn
    If @T.I > 0 {
        ForEach(@i: range(1, @T.I)) {
            A: {
                resp.reasoning[@T.i]
                ForEach(tool: sys.tool_requests[@T.i]) {
                    tool.name_and_args
                }
            }
            ForEach(tool: sys.tool_requests[@T.i]) {
                T: {
                    tool.id
                    tool.response
                }
            }
        }
    }
}
```

## What This Tests

| Feature | ACDL Construct | Expected Python |
|---------|----------------|-----------------|
| Named variable | `Name C := sys.last_compaction_turn[@T]` | `C = state.last_compaction_turn` |
| Variable dereference | `@$C` | Using `C` as loop bound |
| Dynamic loop start | `range(@$C, @T)` | `range(C, turn)` |
| Triple nesting | turns → substeps → tools | Three nested loops |
| Conditional in loop | `If sys.mode_changed[@t]` | `if history[t].mode_changed:` |
| Retrieval in current turn | `get_relevant_sources(...)` | Function call at message build time |
| Mode-based content | `If sys.research_mode[@T] == "focused"` | Conditional content injection |

## Scoring (25 points)

- [ ] (5) Compaction variable and dereference (`@$C`)
- [ ] (5) Loop starting from `C` not `1`
- [ ] (5) Mode change conditional in history loop
- [ ] (5) Retrieval function for current turn
- [ ] (5) Full partial turn handling

---

# Bonus Test: Multi-Agent Orchestrator (Expert)

**Difficulty:** ⭐⭐⭐⭐⭐ Expert

## Story

You're building **OrchestratorBot**, a system that coordinates multiple specialist agents. The orchestrator decides which specialist to invoke based on the task.

## ACDL Specification

```acdl
// Orchestrator: Routes to specialist agents
Orchestrator[@T]: {
    S: {
        ORCHESTRATOR_ROLE
        SPECIALIST_DESCRIPTIONS
    }
    U: env.task[@T]
}

// Specialist with injected context from orchestrator
Specialist[@T,context, specialty]: {
    S: {
        SPECIALIST_ROLE(specialty)
        context
    }
    ForEach(@t: range(1, @T)) {
        U: env.subtask[@t]
        A: resp.result[@t]
    }
    U: env.subtask[@T]
}

// Full workflow
Workflow[@T.I]: {
    // Orchestrator decides
    Orchestrator[@1]

    // Execute specialist
    Switch resp.chosen_specialist[@1] {
        Case "analyst": {
            Specialist[@T.I](sys.analysis_context[@1], "data analysis")
        }
        Case "writer": {
            Specialist[@T.I](sys.writing_context[@1], "content writing")
        }
        Default: {
            Specialist[@T.I](sys.general_context[@1], "general assistance")
        }
    }
}
```

## What This Tests

| Feature | ACDL Construct | Expected Python |
|---------|----------------|-----------------|
| Agent parameters | `Specialist[@T](context, specialty)` | Function with extra params |
| Agent composition | `Orchestrator[@1]` then `Specialist[@T]` | Sequential message building |
| Switch/Case | `Switch ... { Case "x": ... }` | `if/elif/else` chain |
| Dynamic context | `sys.analysis_context[@1]` passed as param | Context injection |
| Multi-agent messages | Combining outputs | Concatenated or phased messages |

## Scoring (Bonus: 25 points)

- [ ] (5) Agent parameterization
- [ ] (5) Switch/Case translation
- [ ] (5) Context passing between agents
- [ ] (5) Proper agent composition
- [ ] (5) Clean separation of concerns

---

# Summary

| Test | Difficulty | Key Features | Points |
|------|-----------|--------------|--------|
| 1. SupportBot | Easy | History loop, conditionals, template function | 25 |
| 2. DocBot | Medium | List iteration, retrieval, named variables | 25 |
| 3. ReviewBot | Medium-Hard | Substeps, tool messages, partial turns | 25 |
| 4. ResearchBot | Hard | Compaction, variable deref, triple nesting | 25 |
| 5. OrchestratorBot | Expert (Bonus) | Multi-agent, Switch, agent params | 25 |

**Total: 100 points** (125 with bonus)

---

# Test Instructions

For each test:

1. Open a fresh Claude Code session
2. Attach `@acdl-skill.md`
3. Paste the ACDL spec for that test
4. Use this prompt:

```
Generate the Python implementation for this ACDL spec. Include:
1. All template constants and template functions
2. Appropriate data classes
3. Helper functions (stubbed with TODO)
4. The complete build_messages() function with ACDL line comments
5. A usage example
```

5. Score using the checklist for that test
