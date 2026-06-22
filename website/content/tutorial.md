---
title: Getting Started - ACDL Tutorial
hero_title: Getting Started with ACDL
hero_subtitle: Learn to describe LLM agent context structures in 20 minutes
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

This describes an llm context with two messages. The first message is a message who's role is **System** (**S:**) which has a single piece of content: the template `INSTRUCTIONS`. The second message is a message who's role is **User** (**U:**) and whose content is the template `CONTENT`. Like every ACDL description, the @T signifies that this is the context sent at turn T of the conversation.

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

Templates can also take arguments—most often context variables. The template's text then depends on the arguments it receives, much like a format string with parameters in Python's `printf`.

::: explanation code
strings like `env.user_input` represent information that is tracked by the system or comes from the external world. The existence of a value like `env.user_input` in the context description assumes that your agent has a way to track this information.
:::

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">Assistant</span>: {
    <span class="role">S</span>: <span class="template">ROLE_DESCRIPTION</span>(<span class="context">env.assistant_name</span>)
    <span class="role">U</span>: <span class="context">env.user_input</span>
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>Assistant:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body"><span class="tpl">ROLE_DESCRIPTION(<span class="ctx">env.assistant_name</span>)</span></div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.user_input</span></div>
    </div>
  </div>
</div>

This specification shows an assistent agent that recieves 2 messages. The first message's content is a `ROLE` Template that is dependent on the assistant's name. The second message is the user's input at turn T. We use the env prefix here to signify that this value originated in the environment. The `@T` after the prompt name means "this prompt is parameterized by turn T".

::: callout Immutable Values
All values in ACDL are immutable. A value like `sys.config.role` stays the same throughout
the system's lifetime. Values that change between steps are accessed with a time index:
`env.user_input[@T]` is the user input at the current step.
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

This specification is very similar to the previous example: it has two messages. The first is a `ROLE` template, this time with no arguments, and the second is a user message containing the user's input at turn T. The key difference is the time index: here the user input is parameterized by the current turn (`[@T]`), whereas in the earlier example it had no time index—meaning there was a single user input, constant across all turns. The `[@T]` after the prompt name means "this prompt is parameterized by turn `T`". Notice that we do not include any of the history here.

<ul class="feature-list">
  <li><code>@T</code> - The current turn (a parameter)</li>
  <li><code>@1</code>, <code>@2</code>, etc. - Specific turn numbers</li>
  <li><code>@T-1</code> - The previous turn</li>
</ul>

Below is an example of a chat agent that also gets the user's input and the LLM's response from the 3 previous turns. 

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">ChatAgent</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">ROLE</span>
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@T-3</span>]
    <span class="role">A</span>: <span class="context">resp.answer</span>[<span class="context">@T-3</span>]
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@T-2</span>]
    <span class="role">A</span>: <span class="context">resp.answer</span>[<span class="context">@T-2</span>]
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@T-1</span>]
    <span class="role">A</span>: <span class="context">resp.answer</span>[<span class="context">@T-1</span>]
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@T</span>]
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>ChatAgent[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body"><span class="tpl">ROLE</span></div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@T-3</span>]</span></div>
    </div>
    <div class="role-msg assistant">
      <span class="role-badge">Assistant</span>
      <div class="role-body"><span class="ctx">resp.answer[<span class="idx">@T-3</span>]</span></div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@T-2</span>]</span></div>
    </div>
    <div class="role-msg assistant">
      <span class="role-badge">Assistant</span>
      <div class="role-body"><span class="ctx">resp.answer[<span class="idx">@T-2</span>]</span></div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@T-1</span>]</span></div>
    </div>
    <div class="role-msg assistant">
      <span class="role-badge">Assistant</span>
      <div class="role-body"><span class="ctx">resp.answer[<span class="idx">@T-1</span>]</span></div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@T</span>]</span></div>
    </div>
  </div>
</div>

The history can also be sent in one long message, instead of separate messages for each content piece. Here is how that would look like:

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">ChatAgent</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">ROLE</span>
    <span class="role">U</span>: {
        <span class="context">env.user_input</span>[<span class="context">@T-3</span>]
        <span class="context">resp.answer</span>[<span class="context">@T-3</span>]
        <span class="context">env.user_input</span>[<span class="context">@T-2</span>]
        <span class="context">resp.answer</span>[<span class="context">@T-2</span>]
        <span class="context">env.user_input</span>[<span class="context">@T-1</span>]
        <span class="context">resp.answer</span>[<span class="context">@T-1</span>]
        <span class="context">env.user_input</span>[<span class="context">@T</span>]
    }
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>ChatAgent[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body"><span class="tpl">ROLE</span></div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body">
        <span class="ctx">env.user_input[<span class="idx">@T-3</span>]</span><br>
        <span class="ctx">resp.answer[<span class="idx">@T-3</span>]</span><br>
        <span class="ctx">env.user_input[<span class="idx">@T-2</span>]</span><br>
        <span class="ctx">resp.answer[<span class="idx">@T-2</span>]</span><br>
        <span class="ctx">env.user_input[<span class="idx">@T-1</span>]</span><br>
        <span class="ctx">resp.answer[<span class="idx">@T-1</span>]</span><br>
        <span class="ctx">env.user_input[<span class="idx">@T</span>]</span>
      </div>
    </div>
  </div>
</div>

::::

:::: step 6 | Loops: Including Conversation History

Instead of writing out each of the turns, if there is a recurring pattern of what you include in the history (or in any other case), use `ForEach` to loop through it:

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

`ForEach` isn't limited to time ranges—you can loop over any list of items, such as `ForEach(doc: env.documents)`, binding the loop variable to each element in turn.
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

<a href="visualizer.html?example=react" class="try-it">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
  See this in the Live Editor
</a>

This describes the classic ReAct pattern. The first message is a System message holding two templates, `TASK_INSTRUCTIONS` and `AVAILABLE_TOOLS`. The second is a User message with the question to answer. After that come the steps of the ReAct loop—two messages per step: an Assistant message with the LLM's reasoning and the tool it chose to call, followed by a Tool message with that tool's response. Once every step up to the current one has been included, we close with a final System message that asks the LLM to either continue the loop or reply to the user.

Notice that this agent handles a single turn (the user's question) but takes multiple steps within it (the ReAct loop). We could also describe an agent that answers a series of questions, one after another, running a ReAct loop for each one. Here is an example description of such an agent:

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">MultiTurnReactAgent</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: {
        <span class="template">TASK_DESCRIPTION</span>
        <span class="context">env.tool_descriptions</span>
    }
    <span class="comment">// previous turns</span>
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: range(1, <span class="context">@T</span>)) {
        <span class="keyword">ForEach</span>(<span class="context">i</span>: range(1, <span class="context">@t.substeps</span>)) {
            <span class="role">A</span>: <span class="context">sys.tool_used</span>[<span class="context">@t.i</span>]
            <span class="role">T</span>: <span class="context">sys.tool_used</span>[<span class="context">@t.i</span>].tool_response
        }
    }
    <span class="comment">// current turn</span>
    <span class="keyword">ForEach</span>(<span class="context">i</span>: range(1, <span class="context">I</span>)) {
        <span class="role">A</span>: <span class="context">sys.tool_used</span>[<span class="context">@T.i</span>]
        <span class="role">T</span>: <span class="context">sys.tool_used</span>[<span class="context">@T.i</span>].tool_response
    }
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>MultiTurnReactAgent[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body">
        <span class="tpl">TASK_DESCRIPTION</span><br>
        <span class="ctx">env.tool_descriptions</span>
      </div>
    </div>
    <span class="cmt">// previous turns</span>
    <div class="ctrl-block">
      <div class="ctrl-header">ForEach <span class="idx">@t</span> : 1 ... <span class="idx">@T</span></div>
      <div class="ctrl-block">
        <div class="ctrl-header">ForEach <span class="idx">i</span> : 1 ... <span class="idx">@t.substeps</span></div>
        <div class="role-msg assistant">
          <span class="role-badge">Assistant</span>
          <div class="role-body"><span class="ctx">sys.tool_used[<span class="idx">@t.i</span>]</span></div>
        </div>
        <div class="role-msg tool">
          <span class="role-badge">Tool</span>
          <div class="role-body"><span class="ctx">sys.tool_used[<span class="idx">@t.i</span>].tool_response</span></div>
        </div>
      </div>
    </div>
    <span class="cmt">// current turn</span>
    <div class="ctrl-block">
      <div class="ctrl-header">ForEach <span class="idx">i</span> : 1 ... <span class="idx">I</span></div>
      <div class="role-msg assistant">
        <span class="role-badge">Assistant</span>
        <div class="role-body"><span class="ctx">sys.tool_used[<span class="idx">@T.i</span>]</span></div>
      </div>
      <div class="role-msg tool">
        <span class="role-badge">Tool</span>
        <div class="role-body"><span class="ctx">sys.tool_used[<span class="idx">@T.i</span>].tool_response</span></div>
      </div>
    </div>
  </div>
</div>

::: callout No answer at turn T
Pay attention: the description never shows the LLM's answer for the current turn `T`. That's intentional—at the moment this context is assembled, turn `T` hasn't happened yet, so the model hasn't produced an answer. The context describes what we send *to* the model at turn `T`; the response only exists afterward.
:::

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

:::: step 9 | Functions and Markers

Functions represent computed content—summarization, retrieval, formatting, or any transformation that cannot be expressed as a simple variable lookup. They are declared by name and purpose without defining their implementation; the name conveys semantic intent.

**Markers** annotate a section of a specification for visual emphasis in the rendered output. A mark draws a bracket along the side of the marked content with a number beside it (shown as `]1`), and is purely presentational—it doesn't change the prompt's meaning. You can wrap anything from a single content element to a large multi-message section, and use several marks with different numbers to highlight distinct parts.

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">ReactToolRagAtEnd</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: {
        <span class="template">INSTRUCTIONS</span>
    }
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@1</span>]
    <span class="comment">// history</span>
    <span class="keyword">ForEach</span>(<span class="context">t</span>: range(1, <span class="context">@T</span>)) {
        <span class="role">A</span>: {
            <span class="context">resp.tool_reasoning</span>[<span class="context">@t</span>]
            <span class="context">sys.tool_used</span>[<span class="context">@t</span>]
        }
        <span class="role">T</span>: <span class="context">sys.tool_used</span>[<span class="context">@t</span>].tool_response
    }
    <span class="role">S</span>: {
        <span class="keyword">Mark</span> 1 {
            <span class="function">locate_tools</span>(<span class="context">env.user_input</span>[<span class="context">@1</span>])
        }
        <span class="template">USE_TOOLS_TO_SOLVE_TASK</span>
    }
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>ReactToolRagAtEnd[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body"><span class="tpl">INSTRUCTIONS</span></div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@1</span>]</span></div>
    </div>
    <span class="cmt">// history</span>
    <div class="ctrl-block">
      <div class="ctrl-header">ForEach <span class="idx">t</span> : 1 ... <span class="idx">@T</span></div>
      <div class="role-msg assistant">
        <span class="role-badge">Assistant</span>
        <div class="role-body">
          <span class="ctx">resp.tool_reasoning[<span class="idx">@t</span>]</span><br>
          <span class="ctx">sys.tool_used[<span class="idx">@t</span>]</span>
        </div>
      </div>
      <div class="role-msg tool">
        <span class="role-badge">Tool</span>
        <div class="role-body"><span class="ctx">sys.tool_used[<span class="idx">@t</span>].tool_response</span></div>
      </div>
    </div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body">
        <div class="mark-block">
          <span class="fn">locate_tools(<span class="ctx">env.user_input[<span class="idx">@1</span>]</span>)</span>
          <div class="mark-bracket">
            <div class="mark-line"></div>
            <span class="mark-num">1</span>
          </div>
        </div>
        <span class="tpl">USE_TOOLS_TO_SOLVE_TASK</span>
      </div>
    </div>
  </div>
</div>

This specification describes a ReAct agent that retrieves its tools at the end of the context. The first message is a System message with the agent's `INSTRUCTIONS`, and the second is a User message holding the original task—`env.user_input[@1]`, fixed at the first turn. The `// history` loop then replays every previous step: for each turn `t` from 1 up to `@T`, an Assistant message with the model's reasoning for choosing the tool and the tool it used, followed by a Tool message with that tool's response. The final System message is where the function comes in: `locate_tools(env.user_input[@1])` is computed content—rather than looking up a stored value, it runs over the original task to retrieve the relevant tools—followed by the `USE_TOOLS_TO_SOLVE_TASK` template. The function is declared by name and purpose only; its implementation is left out of the specification. The `]1` on the right of the function is there to highlight the function.

::::

:::: step 10 | Fragments

Beyond messages and variables, ACDL gives you tools to reuse content and to highlight parts of a specification.

**String fragments** are reusable pieces of content with no role of their own. You define them with the `StrFrag` keyword and invoke them with the `Frag` keyword.

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="keyword">StrFrag</span> <span class="template">DocumentContext</span>[<span class="context">doc</span>]: {
    <span class="context">env.doc_title</span>[<span class="context">doc</span>]
    <span class="context">env.doc_content</span>[<span class="context">doc</span>]
    <span class="function">summarize</span>(<span class="context">env.doc_metadata</span>[<span class="context">doc</span>])
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="frag-title"><h1>DocumentContext[<span class="idx">doc</span>]</h1><span class="frag-badge">SF</span></div>
    <div style="border-left: 1px solid #d0d7de; padding-left: 8px; margin-left: 0;">
      <span class="ctx">env.doc_title[<span class="idx">doc</span>]</span><br>
      <span class="ctx">env.doc_content[<span class="idx">doc</span>]</span><br>
      <span class="fn">summarize(<span class="ctx">env.doc_metadata[<span class="idx">doc</span>]</span>)</span>
    </div>
  </div>
</div>

This string fragment, `DocumentContext`, bundles together everything that describes a single document, parameterized by `doc`. Its body holds three content pieces: the document's title (`env.doc_title[doc]`), its content (`env.doc_content[doc]`), and a `summarize(env.doc_metadata[doc])` function that condenses the document's metadata. The `SF` badge in the render marks it as a String Fragment—on its own it just defines a reusable block of content; it doesn't place anything in a prompt until it's invoked.

To use it, we invoke it with the `Frag` keyword from inside a message:

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="template">DocumentQA</span>[<span class="context">@T</span>]: {
    <span class="role">U</span>: {
        <span class="template">TASK_INSTRUCTIONS</span>
        <span class="keyword">ForEach</span>(<span class="context">doc</span>: <span class="context">env.documents</span>) {
            <span class="keyword">Frag</span> <span class="template">DocumentContext</span>[<span class="context">doc</span>]
        }
        <span class="context">env.user_question</span>[<span class="context">@T</span>]
    }
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="prompt-title"><h1>DocumentQA[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body">
        <span class="tpl">TASK_INSTRUCTIONS</span>
        <div class="ctrl-block">
          <div class="ctrl-header">ForEach <span class="idx">doc</span> : <span class="ctx">env.documents</span></div>
          <span class="frag-kw">Frag</span> <span class="frag-inv">DocumentContext[<span class="idx">doc</span>]</span>
        </div>
        <span class="ctx">env.user_question[<span class="idx">@T</span>]</span>
      </div>
    </div>
  </div>
</div>

Here, `DocumentQA` is an ordinary prompt with a single User message. Inside that message, a `ForEach` walks over `env.documents` and invokes `Frag DocumentContext[doc]` once per document. Each invocation drops the fragment's three pieces in place, and because they land inside a User message, they inherit the User role. The message ends up as `TASK_INSTRUCTIONS`, then a title–content–summary block for every document, then the user's question—and the document layout itself is written only once, back in the fragment definition.

**Role fragments** are reusable groups of whole messages. You define them with the `RolesFrag` keyword and invoke them at the top level of a prompt, wherever a role message would be valid. They expand to the full sequence of role messages defined in the fragment body.

<!-- role fragment example to be added -->

Both kinds of fragment can take parameters in square brackets and are invoked with the same `Frag Name[args]` syntax; ACDL decides which kind is meant from context—inside a role block it resolves to a string fragment, at the top level to a role fragment.

Putting it all together, here is a tool-using agent that defines both kinds of fragment and uses each one:

<div class="code-and-render">
  <div class="code-panel">
    <pre><span class="keyword">StrFrag</span> <span class="template">ToolDescription</span>[<span class="context">tool</span>]: {
    <span class="context">sys.tool_name</span>[<span class="context">tool</span>]
    <span class="context">sys.tool_schema</span>[<span class="context">tool</span>]
}

<span class="keyword">RolesFrag</span> <span class="template">ToolResult</span>[<span class="context">@t</span>, <span class="context">tool</span>]: {
    <span class="role">A</span>: <span class="context">sys.tool_call</span>[<span class="context">@t</span>, <span class="context">tool</span>]
    <span class="role">T</span>: <span class="context">sys.tool_response</span>[<span class="context">@t</span>, <span class="context">tool</span>]
}

<span class="template">ToolAgent</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: {
        <span class="template">INSTRUCTIONS</span>
        <span class="keyword">ForEach</span>(<span class="context">tool</span>: <span class="context">sys.available_tools</span>) {
            <span class="keyword">Frag</span> <span class="template">ToolDescription</span>[<span class="context">tool</span>]
        }
    }
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: range(1, <span class="context">@T</span>)) {
        <span class="role">U</span>: <span class="context">env.observation</span>[<span class="context">@t</span>]
        <span class="keyword">Frag</span> <span class="template">ToolResult</span>[<span class="context">@t</span>, <span class="context">sys.selected_tool</span>[<span class="context">@t</span>]]
    }
    <span class="role">U</span>: <span class="context">env.observation</span>[<span class="context">@T</span>]
}</pre>
  </div>
  <div class="rendered-output">
    <div class="render-label">Rendered</div>
    <div class="frag-title"><h1>ToolDescription[<span class="idx">tool</span>]</h1><span class="frag-badge">SF</span></div>
    <div style="border-left: 1px solid #d0d7de; padding-left: 8px; margin-left: 0; margin-bottom: 12px;">
      <span class="ctx">sys.tool_name[<span class="idx">tool</span>]</span><br>
      <span class="ctx">sys.tool_schema[<span class="idx">tool</span>]</span>
    </div>
    <div class="frag-title"><h1>ToolResult[<span class="idx">@t</span>, <span class="idx">tool</span>]</h1><span class="frag-badge">RF</span></div>
    <div style="border-left: 1px solid #d0d7de; padding-left: 8px; margin-left: 0; margin-bottom: 12px;">
      <div class="role-msg assistant">
        <span class="role-badge">Assistant</span>
        <div class="role-body"><span class="ctx">sys.tool_call[<span class="idx">@t</span>, <span class="idx">tool</span>]</span></div>
      </div>
      <div class="role-msg tool">
        <span class="role-badge">Tool</span>
        <div class="role-body"><span class="ctx">sys.tool_response[<span class="idx">@t</span>, <span class="idx">tool</span>]</span></div>
      </div>
    </div>
    <div class="prompt-title"><h1>ToolAgent[<span class="idx">@T</span>]:</h1></div>
    <div class="role-msg system">
      <span class="role-badge">System</span>
      <div class="role-body">
        <span class="tpl">INSTRUCTIONS</span>
        <div class="ctrl-block">
          <div class="ctrl-header">ForEach <span class="idx">tool</span> : <span class="ctx">sys.available_tools</span></div>
          <span class="frag-kw">Frag</span> <span class="frag-inv">ToolDescription[<span class="idx">tool</span>]</span>
        </div>
      </div>
    </div>
    <div class="ctrl-block">
      <div class="ctrl-header">ForEach <span class="idx">@t</span> : 1 ... <span class="idx">@T</span></div>
      <div class="role-msg user">
        <span class="role-badge">User</span>
        <div class="role-body">
          <span class="ctx">env.observation[<span class="idx">@t</span>]</span><br>
          <span class="frag-kw">Frag</span> <span class="frag-inv">ToolResult[<span class="idx">@t</span>, <span class="ctx">sys.selected_tool[<span class="idx">@t</span>]</span>]</span>
        </div>
      </div>
    </div>
    <div class="role-msg user">
      <span class="role-badge">User</span>
      <div class="role-body"><span class="ctx">env.observation[<span class="idx">@T</span>]</span></div>
    </div>
  </div>
</div>

`ToolDescription` is a string fragment and `ToolResult` is a role fragment, and `ToolAgent` uses both. Inside the System message, `Frag ToolDescription[tool]` is invoked within a role block, so it resolves to the **string fragment**—each tool's name and schema expand in place as System content. In the history loop, `Frag ToolResult[@t, sys.selected_tool[@t]]` sits at the top level, so it resolves to the **role fragment**, expanding into the Assistant and Tool messages for that step. The same `Frag Name[args]` syntax appears in both places; ACDL picks the right kind from where the invocation sits.

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
