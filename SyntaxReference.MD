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
- **Body**: Contains prompt blocks (role messages, label blocks, and control flow)

## Scoping Rules

The language has two distinct scopes:

### 1. Top-Level Scope (Outside Role)
At the top level of a **chat prompt**, you can only use:
- **Role Messages**: `S:`, `U:`, `A:`, `T:`
- **Label Blocks**: `LabelName { ... }`
- **Control Flow**: `ForEach`, `If`, `Switch`
- **Comments**: `// comment text`

For **completion prompts**, where no role is specified, the chosen role should be None and the top level contains only:
- **None Message**: `N:` 
- No control flow, labels, comments or other role messages on the top level scope except the single None message

### 2. Inside-Role Scope
Inside role message blocks `{ }`, you can use:
- **Context Variables**: `env.`, `sys.`, `resp.`, `prompt.`
- **Functions**: `camelCase(args)`
- **Templates**: `ALL_CAPS // comment`
- **Control Flow**: `ForEach`, `If`, `Switch`
- **Comments**: `// comment text`
- **Break/Continue**: `break`, `continue`

**Critical Rule**: Role messages CANNOT be nested inside other role messages.

## Role Messages

The language supports two prompt formats: **Chat Prompts** (multiple roles) and **Completion Prompts** (no roles).

### Chat Prompt Roles

Four role types corresponding to LLM chat/conversation roles:

```
S: { <content> }  // System message
U: { <content> }  // User message
A: { <content> }  // Assistant message
T: { <content> }  // Tool message
```

### Multi-line Syntax
Role messages can span multiple lines using curly braces:
```
S: {
    INSTRUCTIONS // You are a helpful assistant
    AVAILABLE_TOOLS
}
```

### Single-line Syntax
For simple role messages, you can omit the braces:
```
U: env.user_question[@t]
A: sys.response[@t]
```

**Example (both are allowed):**
```
S: {INSTRUCTIONS // You are a helpful assistant}
U: env.user_question[@t]
```

### Completion Prompt (None Role)

Use the `N:` (None) role. This describes a prompt without any role structure—just raw text sent to the model.

```
N: { <content> }  // Completion prompt (no role)
```

**Constraints:**
- A prompt using `N:` can only contain **one message**
- No other roles (`S:`, `U:`, `A:`, `T:`) can be used in the same prompt
- No labels or control flow at the top level (content goes inside the `N:` block)

**Use Case:** The completion format is for models/APIs that don't use the chat message structure, such as older completion endpoints or certain fine-tuned models that expect raw text input.

**Example:**
```
CompletionPrompt[@t]: {
    N: {
        TASK_DESCRIPTION
        env.context[@t]
        QUESTION
    }
}
```

**Single-line syntax also supported:**
```
SimpleCompletion[@t]: {
    N: env.raw_prompt[@t]
}
```

## Context Variables

Access dynamic data using context namespaces:

**Syntax**: `namespace[indices].path[indices]`

### Context Namespaces
- **`env`**: Environment data (external inputs, observations)
- **`sys`**: System data (agent state, memory, actions, tools)
- **`resp`**: Responses (LLM outputs)
- **`prompt`**: Prompt-related context

**Examples:**
```
env.user_question[@t]              // User question recieved as input at time t
sys.agent_desc                     // System data without index, does not change over time
resp.tool_reasoning[@t-3]          // tool reasoning recieved from the model before 3 time steps
env.datetime[@t]                   // Environment data at time t
```

### Path Syntax
Paths can be nested with dots:
```
sys.tool[@i].tool_response[@i]      // Nested path with indices
env.agent_utterance[@i]             // Simple path with index
sys.teammate_locations[@t].teammate // Path with member access
```

## Indices

Two types of indices:

### Time Index
Prefixed with `@`:
```
[@t]                               // Current time
[@i]                               // Iterator variable (in loops)
[@t-1]                             // Previous time
[@0]                               // First element
```

### Other Index
No `@` prefix:
```
[sys.agent_name]                   // Named index
[0]                                // Numeric index
```

### Multiple Indices
Multiple indices can be specified separated by commas:
```
env.bomb_location[@t, bomb]        // Time and element indices
```

## Functions

Functions provide computed values and are called with arguments.

**Syntax**: `functionName(arg1, arg2, ...)[indices]`

**Naming**: Must use camelCase (not ALL_CAPS)

**Arguments**: Can be:
- Context variables: `sys.field[@t]`
- Time indices: `@t`
- Numbers: `1`, `42`
- Other functions: `otherFunc(args)`
- Arithmetic expressions: `@t - 1`

**Examples:**
```
get_context_summary(@t, sys.agent_name, sys.topic)
get_dialog_history(sys.agent_name)
range(1, t-1, 2)
```

**Note**: Functions don't need to be defined - the name conveys their purpose.

## Templates

Templates are uppercase placeholders for text that will be filled in later.

**Syntax**: `TEMPLATE_NAME // optional comment`

Templates can also take arguments:
**Syntax**: `TEMPLATE_NAME(arg1, arg2)`

**Examples:**
```
INSTRUCTIONS                          // Explain the task to the user
QUESTION                              // How would the agent respond?
AVAILABLE_TOOLS                       // calendar_lookup, document_scan, flight_booking
TASK_INTRO                            // scenario description (note: spaces allowed in names)
QUERY(sys.agent_name)                 // a question that features and depends on the agent's name
```

## Label Blocks

Label blocks group multiple prompt blocks under a named section, making them referenceable from other prompts. This allows future prompts to access the content of a labeled section using the `prompt` namespace, thereby enabling composition and reuse. When a label is used, the labeled segment can retrieved by subsequent iterations of the same prompt or a separate prompt that gets this prompt as an argument. The format is `prompt.label_name[@time_step]`.

**Syntax**:
```
LabelName {
    <prompt-blocks>
}
```

**Accessing Labels from Other Prompts**:
```
prompt.Setup[@t-1]               // Access the "Setup" block from the previous time step
prompt.History[@0]               // Access the "History" block from time step 0
prompt.Summarizer.history[@t]    // Access the history section from the Summarizer prompt
```

**Example:**
```
Prompt[@t]: {
    Setup {
        S: {INSTRUCTIONS}
        U: {env.initial_context[@0]}
    }

    History {
        ForEach(i: 1...t-1) {
            U: {env.user_question[@i]}
            A: {sys.response[@i]}
        }
    }

    Reasoning {
        A: {sys.chain_of_thought[@t]}
    }
}

// A later prompt can reference these sections:
SummaryPrompt[@t]: {
    S: {SUMMARIZE_INSTRUCTIONS}
    U: {prompt.Reasoning[@t-1]}  // Include reasoning from previous prompt
}
```

Label blocks are rendered with visual markers showing the start and end of each section.

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
ForEach(i: range(1, @t-1, 10)) {
    // iterate over the all values between 1 and t-1, with a step size of 10
    U: {env.user_question[@i]}
    A: {sys.response[@i]}
}

ForEach(agent_name: sys.agent_names) {
    U: {env.utterance[@t, agent_name]}
}

ForEach(bomb: env.bombs) {
    env.bomb_location[@t, bomb]
    env.bomb_details[@t, bomb]
}
```

**Iterables**:
- Ranges: range(start, stop, step)
- Collections: `sys.agent_names`, `env.bombs`, `env.teammates`

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

**Examples:**
```
If env.in_dialog(agent_name) {
    U: get_dialog_history(sys.agent_name)
}

If t>1 {
    ForEach(i: range(1, t-1)) {
        U: env.user_input[@i]
    }
}

If sys.tool[@i] == get_clarification {
    U: env.user_input[@i]
}
Else {
    A: sys.tool[@i].tool_response[@i]
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

**Example:**
```
Switch sys.action_type[@t] {
    Case "search" {
        U: {env.search_results[@t]}
    }
    Case "calculate" {
        U: {env.calculation[@t]}
    }
    Default {
        U: {env.fallback[@t]}
    }
}
```

## Strings

String literals are enclosed in double quotes and support escape sequences:

```
"hello world"
"line1\nline2"     // newline
"say \"hello\""    // escaped quote
"path\\to\\file"   // escaped backslash
"tab\there"        // tab character
```

## Arithmetic Expressions

Arithmetic operators can be used in arguments and indices:

**Operators**: `+`, `-`, `*`, `/`, `%`

**Examples:**
```
[@t-1]                    // Previous time step
[@t+1]                    // Next time step
range(1, t-1)             // Range from 1 to t-1
ForEach(i: t - k … t - 1) // Range with arithmetic
@t - 1                    // Arithmetic in function args
```

## Logical Operators

Logical operators for conditions:

**Operators**: `=`, `!`, `<`, `>`, `&`, `|`, `^`

**Examples:**
```
If t>1 { ... }
If sys.tool[@i] == get_clarification { ... }
```

## Comments

Comments use `//` syntax:

### Inline Comments (attached to elements)
```
INSTRUCTIONS // Explain the task to the user
env.user_input[@t] // The current user query
get_context(@t) // Retrieves relevant context
```

### Standalone Comments
```
// This is a standalone comment
S: {INSTRUCTIONS}
// Another comment between blocks
U: {env.query[@t]}
```

Comments after templates, context variables, and functions are captured and rendered alongside the element.

## Syntax Rules

### Braces
- Must be balanced: every `{` needs a matching `}`
- Role blocks and control flow blocks require braces
- Single-line role messages can omit braces

### Whitespace
- Generally flexible
- Indentation is for readability (not enforced)
- Template names cannot contain spaces, use `_` to separate between words: `TASK_INTRO`, `MAP_DESCRIPTION`

### Identifiers
- Start with a letter or underscore
- Can contain letters, numbers, and underscores
- Case-sensitive

## Common Patterns

### Basic Prompt with History
```
Prompt[@t]: {
    S: {INTRO}
    ForEach(i: 1…t-1) {
        U: {env.user_question[@i]}
        A: {resp.answer[@i]}
    }
    U: {env.user_question[@t]}
    S: {INSTRUCTIONS}
}
```

### Multi-Agent Interaction
```
Prompt[@t, agent_name]: {
    S: {sys.agent_desc}
    U: {env.datetime[@t]}
    ForEach(other_agent: agent_names) {
        If env.in_dialog(other_agent) {
            U: {get_dialog_history(other_agent)}
        }
    }
    S: {QUESTION}
}
```

### Tool Use Pattern
```
Prompt[@t]: {
    S: {
        INSTRUCTIONS
        AVAILABLE_TOOLS
    }

    U: {
        env.user_input[@0]
        env.user_document[@0]
    }

    If t>1 {
        ForEach(i: range(1, t-1)) {
            If sys.tool[@i] == get_clarification {
                U: env.user_input[@i]
            }
            Else {
                A: sys.tool[@i].tool_response[@i]
            }
        }
    }

    S: REACT_INSTRUCTIONS
}
```

### Complex Environment with Nested Loops
```
Prompt[@t]: {
    S: {
        TASK INTRO
        MAP DESCRIPTION
        TOOLS
    }
    U: {
        env.round_number[@t]
        env.team_score[@t]
        ForEach(teammate: env.teammates) {
            sys.teammate_locations[@t].teammate
        }
        ForEach(bomb: env.bombs) {
            env.bomb_location[@t, bomb]
            env.bomb_details[@t, bomb]
        }
        env.available_actions[@t]
    }
}
```

### Completion Prompt (Legacy API)
```
CompletionPrompt[@t]: {
    N: {
        TASK_INSTRUCTIONS
        env.context[@t]
        ForEach(i: 1...@t-1) {
            env.history[@i]
        }
        QUESTION
        env.current_query[@t]
    }
}
```

## Common Errors

### Error: Unclosed Braces
```
U: {env.datetime[@t]    // Missing }
```
**Fix**: Ensure every `{` has a matching `}`

### Error: Nested Role Markers
```
U: {
    S: {something}      // S: cannot be inside U:
}
```
**Fix**: Role markers (S:, U:, A:, T:) can only appear at top level

### Error: Control Flow in Single-line Role
```
U: ForEach(i: 1...t) { env.item[@i] }  // Control flow not allowed in single-line
```
**Fix**: Use multi-line syntax with braces for control flow inside roles, or use braces around the message like so:
```
U: {ForEach(i: 1...t) { env.item[@i] }}
```

### Error: Unterminated String
```
S: {"hello world}       // Missing closing quote
```
**Fix**: Ensure strings have matching quotes

### Error: Mixing None Role with Chat Roles
```
Prompt[@t]: {
    N: {CONTENT}
    U: {env.query[@t]}      // Cannot mix N: with other roles
}
```
**Fix**: Use either `N:` alone (completion prompt) or chat roles (`S:`, `U:`, `A:`, `T:`) — never both

### Error: Multiple None Messages
```
Prompt[@t]: {
    N: {FIRST_CONTENT}
    N: {SECOND_CONTENT}     // Only one N: message allowed
}
```
**Fix**: Completion prompts can only have a single `N:` message — combine content into one block
