# Agentic Context Description Language - Conceptual Guide

## Overview

When you call a large language model, you send it a **prompt** - a structured piece of text that tells the model what to do and gives it the context it needs to respond. For simple one-off queries this is trivial: you type a question and get an answer. But in practice, prompts for LLM-based systems are complex, dynamic objects. They change over time as conversations evolve, they pull in data from the environment, they conditionally include or exclude sections depending on what has happened so far, and they follow recurring structural patterns that are hard to see when buried in application code.

This language exists to describe those prompts declaratively. Instead of describing your prompts through string concatenation scattered across your codebase, you write a prompt specification that captures the **structure** - what role messages exist, what dynamic content goes where, how the prompt evolves over time, and under what conditions sections appear or repeat. The specification is a blueprint: it describes the shape of a prompt family, not a single static string.

The language is designed for researchers and practitioners who need to reason about, communicate, compare, and document prompt designs - particularly for multi-turn agents, tool-using systems, and multi-agent setups where prompt structure is a core part of the system design.

## Design Principles

**Declarative over imperative.** The language describes what the prompt should contain, not how to build it. There are no variables to assign, no state to mutate, no procedures to call. The specification is a structural description that can be instantiated against a particular runtime state.

**Structure over content.** The language emphasizes the architecture of the prompt - which messages exist, in what order, with what conditions - rather than the exact text. Templates stand in for prose, functions stand in for computations, and context variables stand in for runtime data. This makes the structural patterns visible and comparable across different prompt designs.

**Two-level scoping.** The language enforces a clean distinction between the message-level structure (which role messages exist) and the content-level structure (what goes inside each message). This mirrors the actual structure of LLM chat APIs and prevents malformed prompts where roles are accidentally nested.

**Time as a first-class concept.** Since most interesting prompts evolve over an interaction, time indexing is built into the core of the language rather than being an afterthought. This makes it natural to express patterns like "replay history up to now" or "reference what happened 3 steps ago."

## The Core Model: Prompts as Sequences of Role Messages

The fundamental assumption of this language is that the context sent to an LLM is either:

1. **A sequence of role messages** (the standard chat format), where each message has a role and content, or
2. **A single block of text** with no role structure (the legacy completion format).

A prompt specification describes which messages appear in that sequence, what content goes inside each message, and how the sequence changes depending on dynamic state.

### Roles

In the chat format, every message has one of four roles:

- **System** - Instructions, rules, persona definitions, and other framing that tells the model how to behave. This is where you put the "you are a helpful assistant" preamble, tool descriptions, task explanations, and behavioral constraints.
- **User** - Content that represents input from the outside world: the user's question, environment observations, sensor data, tool results, or any external information the model needs to reason about.
- **Assistant** - Content that represents previous model outputs: past responses, reasoning traces, chosen actions, or any text the model itself produced in earlier turns.
- **Tool** - Content specifically representing tool call results, used in systems where the model invokes external tools and receives structured responses.

For the completion format (no roles), there is a single **None** role that wraps all content into one unstructured block. This is for older APIs or models that don't use the chat message structure. A prompt using the None role can only have one message and cannot be mixed with the other roles.

### What Goes Inside a Message

The content of each role message is built from a combination of:

- **Templates** - Named placeholders for static or semi-static text that will be filled in at instantiation time. These represent the "prose" parts of a prompt: instructions, descriptions, questions, formatting guidelines. A template says "there is a block of text here with this purpose" without specifying the exact wording.
- **Context variables** - References to dynamic data that changes at runtime. These pull in values from the environment, the system's internal state, past model responses, or other prompts. Context variables are how the prompt connects to the living state of the application.
- **Functions** - Computed values derived from other data. Functions represent transformations or aggregations: summarizing a history, retrieving relevant context, formatting a dialog log. Like templates, they describe *what* is needed semantically without specifying *how* it is computed.
- **Control flow** - Loops and conditionals that determine which pieces of content appear based on runtime conditions. This is how you express "include the conversation history" or "if the model used a tool, show the tool response; otherwise show the user's follow-up."

## Time and Indexing

Most interesting prompts are not static - they describe a prompt that gets called repeatedly as an interaction unfolds. The language models this through **time indexing**.

A prompt is typically parameterized by a time step. At each step, the prompt may need to include different amounts of history, reference different past events, or check different conditions. Time indices let you refer to "the current step," "the previous step," "step zero," or "three steps ago" when specifying which piece of dynamic data to include.

Beyond time, there are also general-purpose indices for iterating over collections or addressing specific items: a particular agent in a multi-agent system, a particular tool in a list, a particular bomb in a game scenario. Indices can use arithmetic, so you can express things like "from 100 steps ago to now" or "every 25th step."

## Context Variables: Connecting to the World

Context variables are how the prompt reaches into the runtime state to pull in dynamic content. They are organized into four namespaces:

- **env** - Environment data. Anything that comes from the outside world: user input, observations, sensor readings, game state, timestamps, retrieved documents. This is information the system receives, not information it generates.
- **sys** - System data. Internal state of the agent or application: agent descriptions, memory contents, tool configurations, action histories, teammate information. This is information the system maintains about itself.
- **resp** - Response data. Previous outputs from the language model including past answers and reasoning traces. This namespace lets you feed the model's own prior outputs back into future prompts.
- **prompt** - Prompt references. Content from labeled sections of this prompt or other prompts. This enables composition: one prompt can reference a section of another, or a later invocation can reference what was included in an earlier one.

Context variables can have nested paths (reaching into sub-fields of structured data) and can be indexed by time or by other dimensions. A single variable reference might say "the tool response from step i, for tool k" or "the bomb location at time t for bomb named X."

## Templates: Placeholders for Prose

Templates represent blocks of text whose exact content is specified elsewhere. When you see a template in a prompt specification, it means "a piece of text with this semantic role belongs here." Templates typically describe:

- Task instructions ("you are a booking assistant, your job is to...")
- Available tools and their descriptions
- Formatting conventions or output schemas
- Questions or prompts for the model to respond to
- Any reusable text block that doesn't change with dynamic state

Templates can also accept arguments, making them parameterized: a template for a question might take the agent's name as an argument so the question text can refer to that agent.

The key insight is that templates separate the **structure** of the prompt (where instructions go, what comes before the question) from the **content** of those instructions. This lets you reason about prompt architecture without getting lost in specific wording.

## Functions: Computed Content

Functions represent content that needs to be computed rather than simply retrieved. They express transformations like:

- Summarizing a range of past actions into a condensed history
- Retrieving a dialog history with a particular agent
- Compressing multiple summaries into a higher-level summary
- Getting a context-relevant subset of available information

Functions take arguments (which can be context variables, indices, numbers, or other functions) and may themselves be indexed. They are declared by name and purpose without defining their implementation - the name conveys the semantic intent.

## Control Flow: Dynamic Structure

Prompts are rarely a flat list of messages. The structure itself changes based on runtime conditions. The language supports three control flow mechanisms:

### Loops

Loops iterate over ranges or collections to produce repeated structures. The most common use is building conversation history: "for each past turn, include the user message and the assistant response." Loops can iterate over:

- Numeric ranges (e.g., from step 1 to the current step)
- Collections of items (e.g., all items in a list, all agents in the scene)

Loops can appear both at the message level (producing multiple role messages) and inside a message (producing multiple pieces of content within a single message).

### Conditionals

Conditionals include or exclude content based on runtime state. Common uses:

- "If the model chose to use a tool, show the tool result; otherwise show the user's follow-up"
- "Every 25th step, include a self-critique"
- "If the history is getting long, include a summary instead of the full transcript"

Conditionals can gate individual content items, entire role messages, or blocks of multiple messages.

### Switch Statements

Switch statements select between multiple alternatives based on the value of an expression. This is useful when the type of action or event determines what content to include: "if the action was a search, show search results; if it was a calculation, show the calculation output."

## Labels: Named Sections for Composition

Labels let you name a section of a prompt so it can be referenced from elsewhere. A labeled section groups a sequence of role messages under a name, making that section addressable.

This enables two powerful patterns:

1. **Cross-time references** - A later invocation of the same prompt can refer to a labeled section from a previous time step. For example, a summary generated at step 100 can be referenced at step 200, allowing progressive compression of long interaction histories.

2. **Cross-prompt references** - A different prompt can reference a labeled section from this prompt. This allows prompt composition: a summarization prompt can pull in the "History" section from the main interaction prompt.

Labels are the mechanism by which prompts become composable building blocks rather than isolated specifications.
