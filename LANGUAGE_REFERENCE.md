# Prompt DSL Language Reference

A declarative language for specifying LLM prompt templates with dynamic context and control flow.

## File Structure

```
PromptName[index1, index2, ...]: {
    <prompt-blocks>
}
```

- **PromptName**: Identifier for the prompt template
- **Indices**: Optional parameters (e.g., `@t` for time, `agent_name` for other indices)
- **Body**: Contains prompt blocks (role messages and control flow)

## Scoping Rules

The language has two distinct scopes:

### 1. Top-Level Scope (Outside Role)
At the top level, you can only use:
- **Role Messages**: `S:`, `U:`, `A:`
- **Control Flow**: `ForEach`, `If`, `Switch`

### 2. Inside-Role Scope
Inside role message blocks `{ }`, you can use:
- **Context Variables**: `obs.`, `mem.`, `act.`, `resp.`, `prompt.`
- **Functions**: `camelCase(args)`
- **Templates**: `ALL_CAPS // comment`
- **Control Flow**: `ForEach`, `If`, `Switch`

**Critical Rule**: Role messages CANNOT be nested inside other role messages.

## Role Messages

Three role types corresponding to LLM conversation roles:

```
S: { <content> }  // System message
U: { <content> }  // User message
A: { <content> }  // Assistant message
```

**Example:**
```
S: {INSTRUCTIONS // You are a helpful assistant}
U: {obs.user_question[@t]}
A: {act.response[@t]}
```

## Context Variables

Access dynamic data using context namespaces:

**Syntax**: `namespace.path[indices]`

### Context Namespaces
- **`obs`**: Observations (external inputs)
- **`mem`**: Memory (stored state)
- **`act`**: Actions (agent outputs)
- **`resp`**: Responses (LLM outputs)
- **`prompt`**: Prompt-related context

**Examples:**
```
obs.user_question[@t]              // Observation at time t
mem.agent_desc                     // Memory without index
act.my_utterance[@i]               // Action at iteration i
resp.tool_reasoning[@0]            // First tool reasoning response
obs.datetime[@t]                   // Observation with time index
```

### Path Syntax
Paths can be nested with dots:
```
act.tool_call[@i].tool             // Nested path
obs.agent_utterance[@i]            // Simple path with index
```

## Indices

Two types of indices:

### Time Index
Prefixed with `@`:
```
[@t]                               // Current time
[@i]                               // Iterator variable (in loops)
[@t-1]                             // Previous time
```

### Other Index
No prefix:
```
[agent_name]                       // Named index
[0]                                // Numeric index
```

## Functions

Functions provide computed values and are called with arguments.

**Syntax**: `functionName(arg1, arg2, ...)`

**Naming**: Must use camelCase (not ALL_CAPS)

**Arguments**: Can be:
- Context variables: `obs.field[@t]`
- Time indices: `@t`
- Other functions: `otherFunc(args)`

**Examples:**
```
get_context_summary(@t, mem.agent_name, mem.topic)
get_dialog_history(mem.agent_name)
```

**Note**: Functions don't need to be defined - the name conveys their purpose.

## Templates

Templates are uppercase placeholders for text that will be filled in later.

**Syntax**: `TEMPLATE_NAME // optional comment`

**Examples:**
```
INSTRUCTIONS // Explain the task to the user
QUESTION // How would the agent respond?
INTRO // explanation of task and introducing history section
AVAILABLE_TOOLS
```

## Control Flow

### ForEach Loop

Iterate over ranges or collections.

**Syntax**:
```
ForEach(index: iterable) {
    <body>
}
```

**Examples:**
```
ForEach(i: 1…t-1) {
    U: {obs.user_question[@i]}
    A: {act.response[@i]}
}

ForEach(agent_name: agent_names) {
    U: {obs.utterance[agent_name]}
}

ForEach(tool: act.tool_call[@i].*) {
    A: {act.tool_call[@i].tool}
}
```

**Iterables**:
- Ranges: `1…t-1`, `t-k…t-1`, `0...10`
- Collections: `agent_names`, `tool_list`
- Wildcard paths: `act.tool_call[@i].*`

### If/ElseIf/Else Conditional

**Syntax**:
```
If <condition> {
    <body>
}
ElseIf <condition> {
    <body>
}
Else {
    <body>
}
```

**Example:**
```
If obs.in_dialog(agent_name) {
    U: {get_dialog_history(mem.agent_name)}
}
```

### Switch Statement

**Syntax**:
```
Switch <expression> {
    Case <value> {
        <body>
    }
    Default {
        <body>
    }
}
```

## Syntax Rules

### Braces
- Must be balanced: every `{` needs a matching `}`
- Role blocks and control flow blocks require braces

### Whitespace
- Generally flexible
- Indentation is for readability (not enforced)

### Comments
- Use `//` after templates: `TEMPLATE // comment text`

## Common Patterns

### Basic Prompt with History
```
Prompt[@t]: {
    S: {INTRO}
    ForEach(i: 1…t-1) {
        U: {obs.user_question[@i]}
        A: {resp.answer[@i]}
    }
    U: {obs.user_question[@t]}
    S: {INSTRUCTIONS}
}
```

### Multi-Agent Interaction
```
Prompt[@t, agent_name]: {
    S: {mem.agent_desc}
    U: {obs.datetime[@t]}
    ForEach(other_agent: agent_names) {
        If obs.in_dialog(other_agent) {
            U: {get_dialog_history(other_agent)}
        }
    }
    S: {QUESTION}
}
```

### Tool Use Pattern
```
Prompt[@t]: {
    U: {obs.user_question}
    A: {
        AVAILABLE_TOOLS
        resp.tool_reasoning[@0]
        act.tool[@0]
    }
    U: {obs.tool_resp[@0]}
    S: {INSTRUCTION}
}
```

## Common Errors

### Error: Unclosed Braces
```
U: {obs.datetime[@t]    // Missing }
```
**Fix**: Ensure every `{` has a matching `}`

### Error: Nested Role Markers
```
U: {
    S: {something}      // S: cannot be inside U:
}
```
**Fix**: Role markers (S:, U:, A:) can only appear at top level

### Error: Invalid Nesting
```
S: {obs.errorthing[@t]}  // obs.errorthing should not be in S: if incorrectly structured
U: {obs.datetime[@t]
    S: {obs.errorthing[@t]}  // This is invalid
}
```
**Fix**: Complete each role block before starting another
