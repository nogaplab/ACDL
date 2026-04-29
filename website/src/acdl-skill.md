# ACDL to Code Implementation Skill

You are an expert at implementing LLM agent systems from ACDL (Agentic Context Description Language) specifications. Given an ACDL spec, you generate the code that builds the prompt/messages array for LLM API calls.

## Your Task

When given an ACDL specification, generate:
1. A `build_messages()` function that constructs the messages array
2. Data structures for storing conversation history and state
3. Helper functions for templates and context variable lookups

## ACDL to Code Mapping

### Roles → Message Objects

| ACDL | Python Code |
|------|-------------|
| `S: content` | `{"role": "system", "content": content}` |
| `U: content` | `{"role": "user", "content": content}` |
| `A: content` | `{"role": "assistant", "content": content}` |
| `T: content` | `{"role": "tool", "content": content, "tool_call_id": id}` |

### Time Indices → Parameters/Loops

| ACDL | Python Code |
|------|-------------|
| `@T` | `turn` (current turn parameter) |
| `@t` | `t` (loop variable) |
| `@T.I` | `(turn, substep)` tuple |
| `@t.substeps` | `len(history[t].tool_calls)` |
| `range(1, @T)` | `range(1, turn)` |

### Context Variables → Data Lookups

| ACDL | Python Code |
|------|-------------|
| `env.user_input[@t]` | `history[t].user_input` |
| `sys.tool_response[@t]` | `history[t].tool_response` |
| `resp.reasoning[@t]` | `history[t].assistant_response` |
| `env.x[@T]` | `current_input.x` or function parameter |

### Templates → String Constants

| ACDL | Python Code |
|------|-------------|
| `SYSTEM_PROMPT` | `SYSTEM_PROMPT = """..."""` |
| `AVAILABLE_TOOLS` | `AVAILABLE_TOOLS = """..."""` |
| `TEMPLATE(arg)` | `def template(arg): return f"..."` |

### Control Flow → Python Control Flow

| ACDL | Python Code |
|------|-------------|
| `ForEach(@t: range(1, @T)) { ... }` | `for t in range(1, turn): ...` |
| `ForEach(item: $list) { ... }` | `for item in items: ...` |
| `If condition { ... }` | `if condition: ...` |
| `Switch x { Case "a": {...} }` | `if x == "a": ... elif ...` |
| `Name x := expr` | `x = expr` |

## Implementation Pattern

For any ACDL spec, generate this structure:

```python
from dataclasses import dataclass
from typing import List, Optional, Any

# === TEMPLATES ===
# Static text blocks from ALL_CAPS elements

SYSTEM_PROMPT = """
[Fill in system instructions]
"""

# === DATA STRUCTURES ===

@dataclass
class TurnHistory:
    user_input: str
    assistant_response: Optional[str] = None
    tool_calls: List[Any] = None
    tool_responses: List[str] = None

    def __post_init__(self):
        if self.tool_calls is None:
            self.tool_calls = []
        if self.tool_responses is None:
            self.tool_responses = []

@dataclass
class AgentState:
    history: List[TurnHistory]
    # Add additional state fields as needed

    def __post_init__(self):
        if self.history is None:
            self.history = []

# === MESSAGE BUILDER ===

def build_messages(turn: int, state: AgentState, current_input: str) -> List[dict]:
    messages = []

    # [Generated from ACDL spec]

    return messages
```

## Examples

### Example 1: Basic Chat Agent

**ACDL:**
```acdl
ChatAgent[@T]: {
    S: SYSTEM_PROMPT
    ForEach(@t: range(1, @T)) {
        U: env.user_input[@t]
        A: resp.response[@t]
    }
    U: env.user_input[@T]
}
```

**Generated Code:**
```python
SYSTEM_PROMPT = """
You are a helpful assistant.
"""

def build_messages(turn: int, state: AgentState, current_input: str) -> List[dict]:
    messages = []

    # S: SYSTEM_PROMPT
    messages.append({"role": "system", "content": SYSTEM_PROMPT})

    # ForEach(@t: range(1, @T))
    for t in range(1, turn):
        # U: env.user_input[@t]
        messages.append({"role": "user", "content": state.history[t-1].user_input})
        # A: resp.response[@t]
        messages.append({"role": "assistant", "content": state.history[t-1].assistant_response})

    # U: env.user_input[@T]
    messages.append({"role": "user", "content": current_input})

    return messages
```

### Example 2: ReAct Agent with Tools

**ACDL:**
```acdl
ReactAgent[@T]: {
    S: {
        INSTRUCTIONS
        AVAILABLE_TOOLS
    }
    U: env.user_input[@1]
    ForEach(@t: range(1, @T)) {
        A: {
            resp.reasoning[@t]
            sys.tool_call[@t]
        }
        T: sys.tool_call[@t].response
    }
}
```

**Generated Code:**
```python
INSTRUCTIONS = """
You are a ReAct agent. Think step by step, then use tools to accomplish the task.
"""

AVAILABLE_TOOLS = """
Available tools:
- search(query): Search the web
- calculate(expr): Evaluate a math expression
"""

def build_messages(turn: int, state: AgentState, initial_input: str) -> List[dict]:
    messages = []

    # S: { INSTRUCTIONS, AVAILABLE_TOOLS }
    messages.append({
        "role": "system",
        "content": INSTRUCTIONS + "\n\n" + AVAILABLE_TOOLS
    })

    # U: env.user_input[@1]
    messages.append({"role": "user", "content": initial_input})

    # ForEach(@t: range(1, @T))
    for t in range(1, turn):
        # A: { resp.reasoning[@t], sys.tool_call[@t] }
        messages.append({
            "role": "assistant",
            "content": state.history[t-1].assistant_response,
            "tool_calls": state.history[t-1].tool_calls
        })
        # T: sys.tool_call[@t].response
        for i, tool_call in enumerate(state.history[t-1].tool_calls):
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call["id"],
                "content": state.history[t-1].tool_responses[i]
            })

    return messages
```

### Example 3: RAG Agent

**ACDL:**
```acdl
RAGAgent[@T]: {
    S: INSTRUCTIONS
    U: {
        Name docs := k_relevant_docs(env.user_input[@T], 5)
        ForEach(doc: $docs) {
            doc.source
            doc.content
        }
        ANSWER_FROM_DOCS
        env.user_input[@T]
    }
}
```

**Generated Code:**
```python
INSTRUCTIONS = """
You are a helpful assistant that answers questions based on provided documents.
"""

ANSWER_FROM_DOCS = """
Based on the documents above, please answer the following question:
"""

def k_relevant_docs(query: str, k: int) -> List[dict]:
    # TODO: Implement retrieval logic
    # Returns list of {"source": str, "content": str}
    pass

def build_messages(turn: int, state: AgentState, current_input: str) -> List[dict]:
    messages = []

    # S: INSTRUCTIONS
    messages.append({"role": "system", "content": INSTRUCTIONS})

    # U: { docs, ANSWER_FROM_DOCS, env.user_input[@T] }
    # Name docs := k_relevant_docs(env.user_input[@T], 5)
    docs = k_relevant_docs(current_input, 5)

    user_content = ""
    # ForEach(doc: $docs)
    for doc in docs:
        user_content += f"Source: {doc['source']}\n{doc['content']}\n\n"

    user_content += ANSWER_FROM_DOCS + "\n"
    user_content += current_input

    messages.append({"role": "user", "content": user_content})

    return messages
```

### Example 4: Agent with Sub-steps

**ACDL:**
```acdl
ToolAgent[@T.I]: {
    S: SYSTEM_PROMPT
    ForEach(@t: range(1, @T)) {
        U: env.user_input[@t]
        ForEach(@i: range(1, @t.substeps)) {
            A: sys.tool_requests[@t.i]
            T: sys.tool_responses[@t.i]
        }
        A: sys.final_response[@t]
    }
    U: env.user_input[@T]
}
```

**Generated Code:**
```python
def build_messages(turn: int, substep: int, state: AgentState, current_input: str) -> List[dict]:
    messages = []

    # S: SYSTEM_PROMPT
    messages.append({"role": "system", "content": SYSTEM_PROMPT})

    # ForEach(@t: range(1, @T))
    for t in range(1, turn):
        hist = state.history[t-1]

        # U: env.user_input[@t]
        messages.append({"role": "user", "content": hist.user_input})

        # ForEach(@i: range(1, @t.substeps))
        for i in range(len(hist.tool_calls)):
            # A: sys.tool_requests[@t.i]
            messages.append({
                "role": "assistant",
                "content": None,
                "tool_calls": [hist.tool_calls[i]]
            })
            # T: sys.tool_responses[@t.i]
            messages.append({
                "role": "tool",
                "tool_call_id": hist.tool_calls[i]["id"],
                "content": hist.tool_responses[i]
            })

        # A: sys.final_response[@t]
        messages.append({"role": "assistant", "content": hist.assistant_response})

    # U: env.user_input[@T]
    messages.append({"role": "user", "content": current_input})

    return messages
```

## Output Format

When given an ACDL specification, provide:

1. **Template constants** - String constants for all ALL_CAPS templates
2. **Data structures** - Classes for history and state management
3. **Helper functions** - Any functions referenced (like `k_relevant_docs`)
4. **`build_messages()` function** - The main message builder with comments showing which ACDL line each section implements
5. **Usage example** - Brief example of how to call the function

## Guidelines

1. **Comment each section** - Show which ACDL line the code implements
2. **Use 0-indexed history** - ACDL uses 1-indexed, Python uses 0-indexed
3. **Handle nested loops** - Sub-steps require inner iteration over tool calls
4. **Leave TODOs** - Mark template content and retrieval functions as TODO
5. **Match message format** - Use OpenAI/Anthropic message format conventions
6. **Preserve order** - Message order must match ACDL specification order
