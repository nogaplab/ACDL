---
title: Getting Started - ACDL Tutorial
hero_title: Getting Started with ACDL
hero_subtitle: Learn to describe LLM agent context structures in under 10 minutes
---

:::: step 1 | What is ACDL?

**ACDL (Agentic Context Description Language)** is a notation for describing the structure
of agent contexts—the system instructions, user messages, tool calls, conversation history that is sent to the llm at every turn.

when documenting **prompts** we care about what gets sent to the LLM at a single point in time. When describing agentic **contexts**
we also care about how prompts are constructed and evolve across turns—which parts stay fixed,
which parts accumulate, and how the structure changes dynamically. There are existing methods for describing prompts. We created ACDL to describe agentic contexts.

Ad hoc prose or prompt excerpts are imprecise, hard to verify, and make comparing implementations difficult.
ACDL provides a clean, precise notation that is easy to read and compare across different systems.
As your agent grows more complex, ACDL helps you see the structure at a glance, share it with others, and reason about how context evolves over time.

::::

:::: step 2 | Your First ACDL Description

Let's start with the simplest possible ACDL context. Every context is a series of messages, each marked with a role (System, User, Assistant, Tool) and containing different types of content. Here's what that looks like in ACDL:

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">HelloWorld</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">INSTRUCTIONS</span>
    <span class="role">U</span>: <span class="template">CONTENT</span>
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>HelloWorld[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body"><span class="tpl">INSTRUCTIONS</span></div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="tpl">CONTENT</span></div>
    </div>
  </div>
</div>

This describes an llm context with two messages. The first message is a message who's role is **System** (**S:**)which has a single piece of content: the template `INSTRUCTIONS`. The second message is a message who's role is **User** (**U:**) and whose content is the template `CONTENT`. Like every ACDL description, the @T signifies that this is the context sent at turn T of the conversation.

::: explanation
**Templates** let you separate structure from content. `INSTRUCTIONS` might expand
to a long system prompt, but in ACDL we just see the structural role it plays. This keeps specifications
clean and focused on the conversation flow.
:::

::: callout The Roles
ACDL has four chat role markers: `S:` (System), `U:` (User), `A:` (Assistant),
and `T:` (Tool response). These map directly to the roles in chat-based LLM APIs.
:::

When a role message contains multiple elements, use **braces** to group them together:

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">CodingAssistant</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: {
        <span class="template">SYSTEM_INSTRUCTIONS</span>
        <span class="template">CODING_GUIDELINES</span>
        <span class="template">AVAILABLE_TOOLS</span>
    }
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@T</span>]
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>CodingAssistant[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body">
        <span class="tpl">SYSTEM_INSTRUCTIONS</span><br>
        <span class="tpl">CODING_GUIDELINES</span><br>
        <span class="tpl">AVAILABLE_TOOLS</span>
      </div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@T</span>]</span></div>
    </div>
  </div>
</div>

The `S: { ... }` form lets you include multiple templates, variables, or any combination
of content in a single message. Without braces, a role takes just one element.
The above specification describes a coding assistant that receives 2 messages. The first message is a System message containing system instructions, coding guidelines, and a list of available tools, and the second message is the user's input at turn T. We will address the meaning of the env prefix later.

<!-- example of template with arguments, add here -->

::::

:::: step 3 | Adding Variables

Beyond fixed templates, contexts also include dynamic content like inputs, memory contents. ACDL uses **context variables** that come from
three sources:

<ul class="feature-list">
  <li><code>env.</code> - Environment inputs (user inputs, task descriptions, external data)</li>
  <li><code>sys.</code> - Agent state (memory contents, tool configurations, action histories)</li>
  <li><code>resp.</code> - LLM responses (what the model previously generated)</li>
</ul>

::: callout Immutable Values
All values in ACDL are immutable. A value like `sys.config.role` stays the same throughout
the system's lifetime. Values that change between steps are accessed with a time index:
`env.user_input[@T]` is the user input at the current step.
:::

<div class="code-example">
  <div class="code-example-header">
    <span class="code-example-title">with-variables.acdl</span>
  </div>
  <pre><span class="template">AssistantPrompt</span>: {
    <span class="role">S</span>: <span class="template">ROLE_DESCRIPTION</span>(<span class="context">env.assistant_name</span>)
    <span class="role">U</span>: <span class="context">env.user_input</span>
}</pre>
</div>

::: explanation code
Variables like `env.user_input` are placeholders. When you implement your agent, you'll fill
these in with actual values. ACDL doesn't care about the implementation - it just describes the structure.
:::

::::

:::: step 5 | Time Indices: Tracking Conversation Turns

Agents have conversations that evolve over multiple turns. ACDL uses **time indices** to
describe which turn we're talking about:

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">ChatAgent</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">ROLE</span>  <span class="comment">// you are a helpful assistant...</span>
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@T</span>]
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>ChatAgent[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body"><span class="tpl">ROLE</span> <span class="cmt">// you are a helpful assistant...</span></div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@T</span>]</span></div>
    </div>
  </div>
</div>

The `[@T]` after the prompt name means "this prompt is parameterized by turn `T`".
Inside the prompt, `env.user_input[@T]` means "the user's input at turn T".

<ul class="feature-list">
  <li><code>@T</code> - The current turn (a parameter)</li>
  <li><code>@1</code>, <code>@2</code>, etc. - Specific turn numbers</li>
  <li><code>@t</code> - A loop variable (lowercase) for iterating through turns</li>
</ul>

::::

:::: step 6 | Loops: Including Conversation History

Most agents need to include previous conversation turns. Use `ForEach` to loop through history:

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">ChatWithHistory</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">INSTRUCTIONS</span>
    <span class="comment">// Previous turns</span>
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: range(1, <span class="context">@T</span>)) {
        <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@t</span>]
        <span class="role">A</span>: <span class="context">resp.reply</span>[<span class="context">@t</span>]
    }
    <span class="comment">// Current turn</span>
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@T</span>]
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>ChatWithHistory[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body"><span class="tpl">INSTRUCTIONS</span></div>
    </div>
    <span class="cmt">// Previous turns</span>
    <div class="ctrl-block">
      <div class="ctrl-header">ForEach <span class="idx">@t</span> : 1 ... <span class="idx">@T</span></div>
      <div class="role-msg user">
        <span class="role-badge">User</span>
        <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@t</span>]</span></div>
      </div>
      <div class="role-msg assistant">
        <span class="role-badge">Assistant</span>
        <div class="role-body"><span class="ctx">resp.reply[<span class="idx">@t</span>]</span></div>
      </div>
    </div>
    <span class="cmt">// Current turn</span>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@T</span>]</span></div>
    </div>
  </div>
</div>

::: explanation refresh
`ForEach(@t: range(1, @T))` iterates from turn 1 up to (but not including) the current turn `@T`.
The loop variable `@t` takes each value in that range.
:::

::::

:::: step 7 | Putting It Together: A ReAct Agent

Let's combine everything to describe a **ReAct agent** - an agent that reasons and uses tools
in a loop:

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">ReactAgent</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: {
        <span class="template">TASK_INSTRUCTIONS</span>
        <span class="template">AVAILABLE_TOOLS</span>
    }
    <span class="role">U</span>: <span class="context">env.user_question</span>
    <span class="comment">// Action history</span>
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: range(1, <span class="context">@T</span>)) {
        <span class="role">A</span>: {
            <span class="context">resp.reasoning</span>[<span class="context">@t</span>]
            <span class="context">sys.tool_call</span>[<span class="context">@t</span>]
        }
        <span class="role">T</span>: <span class="context">sys.tool_call</span>[<span class="context">@t</span>].response
    }
    <span class="role">S</span>: <span class="template">CONTINUE_OR_ANSWER</span>
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>ReactAgent[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body">
        <span class="tpl">TASK_INSTRUCTIONS</span><br>
        <span class="tpl">AVAILABLE_TOOLS</span>
      </div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.user_question</span></div>
    </div>
    <span class="cmt">// Action history</span>
    <div class="ctrl-block">
      <div class="ctrl-header">ForEach <span class="idx">@t</span> : 1 ... <span class="idx">@T</span></div>
      <div class="role-msg assistant">
        <span class="role-badge">Assistant</span>
        <div class="role-body">
          <span class="ctx">resp.reasoning[<span class="idx">@t</span>]</span><br>
          <span class="ctx">sys.tool_call[<span class="idx">@t</span>]</span>
        </div>
      </div>
      <div class="role-msg tool">
        <span class="role-badge">Tool</span>
        <div class="role-body"><span class="ctx">sys.tool_call[<span class="idx">@t</span>].response</span></div>
      </div>
    </div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body"><span class="tpl">CONTINUE_OR_ANSWER</span></div>
    </div>
  </div>
</div>

This describes the classic ReAct pattern:

<ul class="feature-list">
  <li>System message with instructions and available tools</li>
  <li>User's original question</li>
  <li>Loop through all previous reasoning steps and tool responses</li>
  <li>Final prompt asking the agent to continue or give an answer</li>
</ul>

<a href="visualizer.html?example=react" class="try-it">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
  See this in the Live Editor
</a>

::::

:::: step 8 | Conditionals: Dynamic Context

Sometimes you need different context based on conditions. Use `If`, `ElseIf`, and
`Else`:

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">AdaptiveAgent</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">BASE_INSTRUCTIONS</span>

    <span class="keyword">If</span> <span class="context">env.has_documents</span> {
        <span class="role">S</span>: {
            <span class="template">RAG_INSTRUCTIONS</span>
            <span class="context">sys.retrieved_docs</span>
        }
    }

    <span class="keyword">If</span> <span class="context">env.has_tools</span> {
        <span class="role">S</span>: <span class="template">TOOL_INSTRUCTIONS</span>
    } <span class="keyword">Else</span> {
        <span class="role">S</span>: <span class="template">NO_TOOLS_MESSAGE</span>
    }

    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@T</span>]
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>AdaptiveAgent[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body"><span class="tpl">BASE_INSTRUCTIONS</span></div>
    </div>
    <div class="ctrl-block">
      <div class="ctrl-header cond">If <span class="ctx">env.has_documents</span></div>
      <div class="role-msg system">
        <span class="role-badge">System</span>
        <div class="role-body">
          <span class="tpl">RAG_INSTRUCTIONS</span><br>
          <span class="ctx">sys.retrieved_docs</span>
        </div>
      </div>
    </div>
    <div class="ctrl-block">
      <div class="ctrl-header cond">If <span class="ctx">env.has_tools</span></div>
      <div class="role-msg system">
        <span class="role-badge">System</span>
        <div class="role-body"><span class="tpl">TOOL_INSTRUCTIONS</span></div>
      </div>
    </div>
    <div class="ctrl-block">
      <div class="ctrl-header cond">Else</div>
      <div class="role-msg system">
        <span class="role-badge">System</span>
        <div class="role-body"><span class="tpl">NO_TOOLS_MESSAGE</span></div>
      </div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@T</span>]</span></div>
    </div>
  </div>
</div>

This agent adapts its instructions based on whether documents and tools are available.

::::

<section class="next-steps">
  <h2>What's Next?</h2>
  <div class="next-steps-grid">
    <a href="visualizer.html" class="next-step-card">
      <h4>Live Editor</h4>
      <p>Write ACDL and see it rendered in real-time</p>
    </a>
    <a href="syntax-reference.html" class="next-step-card">
      <h4>Full Documentation</h4>
      <p>Complete syntax reference with all features</p>
    </a>
    <a href="examples/index.html" class="next-step-card">
      <h4>Browse Examples</h4>
      <p>See ACDL specs for real agent systems</p>
    </a>
    <a href="vscode.html" class="next-step-card">
      <h4>VSCode Extension</h4>
      <p>Syntax highlighting and preview in your editor</p>
    </a>
  </div>
</section>
