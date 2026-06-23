---
title: Syntax Reference - ACDL
---

  <div class="container">
    <aside>
      <h4>Overview</h4>
      <a href="#specification-structure">Specification Structure</a>
      <a href="#role-messages">Role Messages</a>
      <a href="#scoping-rules">Scoping Rules</a>

      <h4>Data</h4>
      <a href="#context-variables">Context Variables</a>
      <a href="#indices">Indices</a>
      <a href="#templates">Templates</a>
      <a href="#functions">Functions</a>

      <h4>Control Flow</h4>
      <a href="#foreach">ForEach</a>
      <a href="#conditionals">If / ElseIf / Else</a>
      <a href="#switch">Switch / Case / Default</a>
      <a href="#early-termination">Early Termination</a>

      <h4>Organization</h4>
      <a href="#mark-blocks">Mark Blocks</a>
      <a href="#name-definitions">Name Definitions</a>
      <a href="#fragments">Fragments</a>
      <a href="#comments">Comments</a>
      <a href="#naming-conventions">Naming Conventions</a>

      <h4>Examples</h4>
      <a href="#example-tool-agent">Tool-Using Agent</a>
      <a href="#example-multi-agent">Multi-Agent Prompt</a>
    </aside>

    <main>
      <h1>Language Reference</h1>
      <p class="intro-text">This is a complete reference for the Agentic Context Description Language (ACDL). The language declaratively specifies context structures sent to large language models, separating structural concerns from content and implementation.</p>

      <div class="tutorial-btn-wrapper">
        <a href="tutorial.html" class="tutorial-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"></polygon>
          </svg>
          Getting Started
        </a>
      </div>

      <!-- SPECIFICATION STRUCTURE -->
      <h2 id="specification-structure">Specification Structure</h2>
      <p>An ACDL specification defines a named prompt template parameterized by optional indices. The body consists of an ordered sequence of <em>prompt blocks</em>&mdash;role messages, mark blocks, and control flow constructs&mdash;which may be freely interleaved:</p>

      <pre>PromptName[idx1, idx2, ...]: {
    &lt;prompt-blocks&gt;
}</pre>

      <p>A single file may contain multiple specifications, each defining a separate prompt template.</p>

      <pre>PromptName1[idx1, idx2, ...]: {
    &lt;prompt-blocks&gt;
}

PromptName2[idx1, idx2, ...]: {
    &lt;prompt-blocks&gt;
}</pre>

      <h3>Example</h3>
      <div class="code-and-render">
        <pre>BasicPrompt[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">INSTRUCTIONS</span>
    <span class="role">U</span>: <span class="context">env.user_question</span>[<span class="context">@T</span>]
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="prompt-title"><h1>BasicPrompt[<span class="idx">@T</span>]:</h1></div>
          <div class="role-msg system">
            <span class="role-badge">Role: System</span>
            <div class="role-body"><span class="tpl">INSTRUCTIONS</span></div>
          </div>
          <div class="role-msg user">
            <span class="role-badge">Role: User</span>
            <div class="role-body"><span class="ctx">env.user_question[<span class="idx">@T</span>]</span></div>
          </div>
        </div>
      </div>

      <!-- ROLE MESSAGES -->
      <h2 id="role-messages">Role Messages</h2>
      <p>Every message carries exactly one role. Four roles serve the chat format; a fifth pseudo-role serves the legacy completion format:</p>

      <table>
        <tr><th>Marker</th><th>Purpose</th></tr>
        <tr><td><code>S:</code></td><td>System&mdash;instructions, persona, tool descriptions, behavioral constraints</td></tr>
        <tr><td><code>U:</code></td><td>User&mdash;external input, observations, tool results</td></tr>
        <tr><td><code>A:</code></td><td>Assistant&mdash;prior model outputs, reasoning traces, chosen actions</td></tr>
        <tr><td><code>T:</code></td><td>Tool&mdash;structured tool call results</td></tr>
        <tr><td><code>N:</code></td><td>None&mdash;single unstructured text block (completion format only)</td></tr>
      </table>

      <h3>Multi-Line Form</h3>
      <p>Role messages support two syntactic forms. The <strong>multi-line form</strong> encloses content in braces and permits any combination of content elements and control flow:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="role">S</span>: {
    <span class="template">INSTRUCTIONS</span>
    <span class="template">AVAILABLE_TOOLS</span>
    <span class="context">env.datetime</span>[<span class="context">@t</span>]
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="role-msg system">
            <span class="role-badge">Role: System</span>
            <div class="role-body">
              <span class="tpl">INSTRUCTIONS</span><br>
              <span class="tpl">AVAILABLE_TOOLS</span><br>
              <span class="ctx">env.datetime[<span class="idx">@t</span>]</span>
            </div>
          </div>
        </div>
      </div>

      <h3>Single-Line Form</h3>
      <p>The <strong>single-line form</strong> omits braces and accepts exactly one content element&mdash;a context variable, template, or function call:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="role">U</span>: <span class="context">env.user_question</span>[<span class="context">@t</span>]
<span class="role">A</span>: <span class="context">resp.answer</span>[<span class="context">@t</span>]
<span class="role">S</span>: <span class="template">INSTRUCTIONS</span></pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="role-msg user">
            <span class="role-badge">Role: User</span>
            <div class="role-body"><span class="ctx">env.user_question[<span class="idx">@t</span>]</span></div>
          </div>
          <div class="role-msg assistant">
            <span class="role-badge">Role: Assistant</span>
            <div class="role-body"><span class="ctx">resp.answer[<span class="idx">@t</span>]</span></div>
          </div>
          <div class="role-msg system">
            <span class="role-badge">Role: System</span>
            <div class="role-body"><span class="tpl">INSTRUCTIONS</span></div>
          </div>
        </div>
      </div>

      <div class="warning">
        <p><strong>Important:</strong> Control flow constructs (<code>ForEach</code>, <code>If</code>, <code>Switch</code>) are <em>not</em> permitted in single-line role messages. To include control flow inside a role message, the multi-line braced form must be used:</p>
      </div>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="role">U</span>: {
    <span class="keyword">ForEach</span>(item: <span class="context">env.items</span>) {
        <span class="context">env.item_detail</span>[<span class="context">@t</span>, item]
    }
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="role-msg user">
            <span class="role-badge">Role: User</span>
            <div class="role-body">
              <div class="ctrl-block">
                <div class="ctrl-header">ForEach <span class="idx">item</span> : <span class="ctx" >env.items</span></div>
                <span class="ctx">env.item_detail[<span class="idx">@t</span>, <span class="idx">item</span>]</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h3>Completion Format</h3>
      <p>The <code>N:</code> role (completion format) imposes two additional constraints: (1) exactly one <code>N:</code> block may appear per prompt, and (2) no chat roles (<code>S:</code>, <code>U:</code>, <code>A:</code>, <code>T:</code>) may appear in the same specification:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre>CompletionPrompt[<span class="context">@t</span>]: {
    <span class="role">N</span>: {
        <span class="template">TASK_DESCRIPTION</span>
        <span class="context">env.context</span>[<span class="context">@t</span>]
        <span class="template">QUESTION</span>
    }
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="role-msg" style="border-left-color: #6e7781;">
            <span class="role-badge" style="background: #6e7781;">Role: None</span>
            <div class="role-body">
              <span class="tpl">TASK_DESCRIPTION</span><br>
              <span class="ctx">env.context[<span class="idx">@t</span>]</span><br>
              <span class="tpl">QUESTION</span>
            </div>
          </div>
        </div>
      </div>

      <!-- SCOPING RULES -->
      <h2 id="scoping-rules">Scoping Rules</h2>
      <p>The language enforces a strict two-level scope that mirrors the structure of LLM chat APIs:</p>

      <ul>
        <li><strong>Top level</strong> (the prompt body, outside any role block): only role messages, marker blocks, control flow constructs, name definitions, and comments are permitted.</li>
        <li><strong>Inside role blocks</strong> (within braces): valid elements are context variables, functions, templates, control flow, comments, name definitions, marking blocks and <code>break</code>/<code>continue</code>.</li>
      </ul>

      <p>Role messages may <strong>not</strong> appear inside other role messages&mdash;the following is invalid:</p>

      <pre><span class="role">U</span>: {
    <span class="role">S</span>: {<span class="template">INSTRUCTIONS</span>}   <span class="comment">// ERROR: nested role</span>
}</pre>

      <div class="note">
        <p><strong>Completion Prompts:</strong> For prompts using <code>N:</code>, the top level may contain only the single <code>N:</code> block&mdash;no other role messages or control flow may appear outside it.</p>
      </div>

      <!-- CONTEXT VARIABLES -->
      <h2 id="context-variables">Context Variables</h2>
      <p>Context variables reference dynamic runtime data. The general syntax is:</p>

      <pre>namespace.path[indices]</pre>

      <p>where <code>namespace</code> is one of four reserved prefixes:</p>

      <table>
        <tr><th>Namespace</th><th>Use Cases</th></tr>
        <tr><td><code>env</code></td><td>Environment&mdash;external inputs, observations, sensor readings, user queries, game state</td></tr>
        <tr><td><code>sys</code></td><td>System&mdash;agent state, memory contents, tool configurations, action histories</td></tr>
        <tr><td><code>resp</code></td><td>Response&mdash;prior LLM outputs, reasoning traces</td></tr>
      </table>

      <p>Paths may be nested using dot notation to reach into sub-fields of structured data. Indices may appear at any level of the path:</p>

      <pre><span class="context">env.user_question</span>[<span class="context">@T</span>]            <span class="comment">// the user question at time T</span>
<span class="context">sys.agent_desc</span>                     <span class="comment">// the agent description (constant)</span>
<span class="context">sys.tool</span>[<span class="context">@t</span>].<span class="context">tool_response</span>[<span class="context">@t</span>]   <span class="comment">// tool response of tool at time t</span>
<span class="context">env.bomb_location</span>[<span class="context">@T</span>, bomb]       <span class="comment">// bomb location of bomb at time T</span></pre>
      <div class="rendered-output">
        <div class="render-label">Rendered Output</div>
        <div><span class="block-with-comment"><span class="ctx">env.user_question[<span class="idx">@T</span>]</span> <span class="cmt">// the user question at time T</span></span></div>
        <div><span class="block-with-comment"><span class="ctx">sys.agent_desc</span> <span class="cmt">// the agent description (constant)</span></span></div>
        <div><span class="block-with-comment"><span class="ctx">sys.tool[<span class="idx">@t</span>].tool_response[<span class="idx">@t</span>]</span> <span class="cmt">// tool response</span></span></div>
        <div><span class="block-with-comment"><span class="ctx">env.bomb_location[<span class="idx">@T</span>, <span class="idx">bomb</span>]</span> <span class="cmt">// bomb location</span></span></div>
      </div>

      <p>A variable without indices (e.g., <code>sys.agent_desc</code>) refers to data that does not vary over time or other dimensions.</p>

      <!-- INDICES -->
      <h2 id="indices">Indices</h2>
      <p>Indices address specific elements along one or more dimensions. Two types are distinguished syntactically.</p>

      <h3>Time Indices</h3>
      <p>The special symbol <code>@</code> denotes the primary time dimension that the prompt iterates over. What <code>@</code> represents depends on the agent's structure: for a ReAct agent that operates within a single turn but loops over many steps, <code>@</code> refers to the current step; for an agent that loops over multi-turn conversations, <code>@</code> refers to the current turn, and sub-steps within each turn are indexed with ordinary index variables.</p>

      <p>The current time is denoted with capital letters: <code>@T</code> for the main time step, and <code>I</code>, <code>J</code>, etc. for sub-steps. When iterating over time steps, the corresponding lower-case letters are used. Sub-steps are accessed using dot notation: <code>@t.i</code> refers to sub-step <code>i</code> within turn <code>t</code>, while <code>@T.I</code> refers to the current sub-step of the current turn. When iterating over the sub-steps of a previous turn, use <code>@t.substeps</code> to obtain the count.</p>

      <div class="note">
        <p><strong>Convention:</strong> Time indices start at 1, not 0. The first turn is <code>@1</code>.</p>
      </div>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="context">@T</span>            <span class="comment">// Current time step</span>
<span class="context">@T</span>-1          <span class="comment">// Previous time step</span>
<span class="context">@T</span>.<span class="context">I</span>          <span class="comment">// Current substep of current turn</span>
<span class="context">@t</span>.<span class="context">i</span>          <span class="comment">// Substep i of turn t (in loops)</span></pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div><span class="block-with-comment"><span class="idx">@T</span> <span class="cmt">// Current time step</span></span></div>
          <div><span class="block-with-comment"><span class="idx">@T-1</span> <span class="cmt">// Previous time step</span></span></div>
          <div><span class="block-with-comment"><span class="idx">@T.I</span> <span class="cmt">// Current substep</span></span></div>
          <div><span class="block-with-comment"><span class="idx">@t.i</span> <span class="cmt">// Substep i of turn t</span></span></div>
        </div>
      </div>

      <h3>Iteration Examples</h3>
      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="comment">// Iterating over all previous turns</span>
<span class="keyword">ForEach</span>(<span class="context">t</span>: <span class="function">range</span>(1, <span class="context">@T</span>-1)) {
    <span class="context">env.observation</span>[<span class="context">@t</span>]
}

<span class="comment">// Iterating over substeps in the current turn</span>
<span class="keyword">ForEach</span>(<span class="context">i</span>: <span class="function">range</span>(1, <span class="context">I</span>)) {
    <span class="context">sys.action</span>[<span class="context">@T</span>.<span class="context">i</span>]
}

<span class="comment">// Nested: substeps within each previous turn</span>
<span class="keyword">ForEach</span>(<span class="context">@t</span>: <span class="function">range</span>(1, <span class="context">@T</span>-1)) {
    <span class="keyword">ForEach</span>(<span class="context">i</span>: <span class="function">range</span>(1, <span class="context">@t</span>.substeps)) {
        <span class="context">sys.action</span>[<span class="context">@t</span>.<span class="context">i</span>]
    }
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div><span class="cmt">// Iterating over all previous turns</span></div>
          <div class="ctrl-block">
            <div class="ctrl-header">ForEach <span class="idx">t</span> : <span class="idx">1</span> ... <span class="idx">@T</span>-1</div>
            <span class="ctx">env.observation[<span class="idx">@t</span>]</span>
          </div>
          <div style="margin-top: 6px;"><span class="cmt">// Iterating over substeps</span></div>
          <div class="ctrl-block">
            <div class="ctrl-header">ForEach <span class="idx">i</span> : <span class="idx">1</span> ... <span class="idx">I</span></div>
            <span class="ctx">sys.action[<span class="idx">@T</span>.<span class="idx">i</span>]</span>
          </div>
          <div style="margin-top: 6px;"><span class="cmt">// Nested: substeps within each turn</span></div>
          <div class="ctrl-block">
            <div class="ctrl-header">ForEach <span class="idx">@t</span> : <span class="idx">1</span> ... <span class="idx">@T</span>-1</div>
            <div class="ctrl-block" style="margin-left: 6px;">
              <div class="ctrl-header">ForEach <span class="idx">i</span> : <span class="idx">1</span> ... <span class="idx">@t</span>.substeps</div>
              <span class="ctx">sys.action[<span class="idx">@t</span>.<span class="idx">i</span>]</span>
            </div>
          </div>
        </div>
      </div>

      <h3>Non-Time Indices</h3>
      <p>Non-time indices have no prefix and address other dimensions&mdash;named entities, or context-variable-valued keys:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre>[<span class="context">sys.agent_name</span>]
[bomb]</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div>[<span class="ctx" >sys.agent_name</span>]</div>
          <div>[<span class="idx">bomb</span>]</div>
        </div>
      </div>

      <p>Multiple indices are comma-separated: <code>env.bomb_location[@t, bomb]</code> addresses a specific bomb at a specific time step. Standard arithmetic operators (<code>+</code>, <code>-</code>, <code>*</code>, <code>/</code>, <code>%</code>) are permitted in all index positions, enabling expressions such as <code>@t-1</code>, <code>@t+1</code>, <code>t-k</code>, or <code>@t % 25</code>.</p>

      <!-- TEMPLATES -->
      <h2 id="templates">Templates</h2>
      <p>Templates are <code>ALL_CAPS</code> placeholders representing text blocks whose content is specified at instantiation time. They describe the semantic purpose of a text section without fixing its wording, separating prompt architecture from prompt prose. Words within a template name are separated by underscores: <code>TASK_INTRO</code>, <code>MAP_DESCRIPTION</code>.</p>

      <p>Templates may accept arguments in parentheses, enabling parameterized text:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="template">INSTRUCTIONS</span>         <span class="comment">// Task explanation</span>
<span class="template">AVAILABLE_TOOLS</span>      <span class="comment">// Tool list</span>
<span class="template">QUERY</span>(<span class="context">sys.agent_name</span>) <span class="comment">// Parameterized</span></pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div style="line-height: 2;">
            <span class="block-with-comment"><span class="tpl">INSTRUCTIONS</span> <span class="cmt">// Task explanation</span></span><br>
            <span class="block-with-comment"><span class="tpl">AVAILABLE_TOOLS</span> <span class="cmt">// Tool list</span></span><br>
            <span class="block-with-comment"><span class="tpl">QUERY(<span class="ctx" >sys.agent_name</span>)</span> <span class="cmt">// Parameterized</span></span>
          </div>
        </div>
      </div>

      <p>An optional inline comment (after <code>//</code>) documents the intended content of the template.</p>

      <!-- FUNCTIONS -->
      <h2 id="functions">Functions</h2>
      <p>Functions represent computed content&mdash;summarization, retrieval, formatting, or any transformation that cannot be expressed as a simple variable lookup. They are declared by name and purpose without defining their implementation; the name conveys semantic intent.</p>

      <p>The syntax is <code>functionName(arg1, arg2, ...)[indices]</code>. Function names use <code>camelCase</code> (distinguishing them from <code>ALL_CAPS</code> templates). Arguments may be context variables, time or regular indices, numeric literals, arithmetic expressions, or nested function calls:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="function">summarize</span>(<span class="context">prompt.History</span>[<span class="context">@t</span>])
<span class="function">get_dialog_history</span>(<span class="context">sys.agent_name</span>)
<span class="function">range</span>(1, <span class="context">@T</span>-1, 2)</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div style="line-height: 2;">
            <span class="fn">summarize(<span class="ctx" >prompt.History[<span class="idx">@t</span>]</span>)</span><br>
            <span class="fn">get_dialog_history(<span class="ctx" >sys.agent_name</span>)</span><br>
            <span class="fn">range(<span class="idx">1</span>, <span class="idx">@T</span>-1, <span class="idx">2</span>)</span>
          </div>
        </div>
      </div>

      <div class="note">
        <p><strong>Built-in Function:</strong> The <code>range(start, stop, step)</code> function generates numeric sequences for use in <code>ForEach</code> loops. The <code>step</code> argument is optional and defaults to 1. The range is <strong>inclusive</strong>, meaning <code>range(1, 2)</code> starts at 1 and ends at 2, including 2.</p>
      </div>

      <!-- CONTROL FLOW -->
      <h2 id="control-flow">Control Flow</h2>
      <p>Three constructs govern dynamic prompt structure. All three may appear both at the top level (producing or gating entire role messages) and inside role blocks (controlling content within a single message).</p>

      <h3 id="foreach">ForEach</h3>
      <p><code>ForEach</code> iterates over ranges or collections to produce repeated structures. The syntax is:</p>

      <pre><span class="keyword">ForEach</span>(variable: iterable) {
    &lt;body&gt;
}</pre>

      <p>The iterable may be a <code>range(start, stop, step)</code> call or a collection-valued context variable. At the top level, the loop body may contain role messages, producing multiple messages per iteration. Inside a role block, it produces repeated content elements:</p>

      <h4>Top-level ForEach (produces multiple messages)</h4>
      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="keyword">ForEach</span>(<span class="context">@t</span>: <span class="function">range</span>(1, <span class="context">@T</span>-1)) {
    <span class="role">U</span>: <span class="context">env.user_question</span>[<span class="context">@t</span>]
    <span class="role">A</span>: <span class="context">resp.answer</span>[<span class="context">@t</span>]
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="ctrl-block">
            <div class="ctrl-header">ForEach <span class="idx">@t</span> : <span class="idx">1</span> ... <span class="idx">@T</span>-1</div>
            <div class="role-msg user">
              <span class="role-badge">Role: User</span>
              <div class="role-body"><span class="ctx">env.user_question[<span class="idx">@t</span>]</span></div>
            </div>
            <div class="role-msg assistant">
              <span class="role-badge">Role: Assistant</span>
              <div class="role-body"><span class="ctx">resp.answer[<span class="idx">@t</span>]</span></div>
            </div>
          </div>
        </div>
      </div>

      <h4>ForEach inside a role (produces repeated content)</h4>
      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="role">U</span>: {
    <span class="keyword">ForEach</span>(bomb: <span class="context">env.bombs</span>) {
        <span class="context">env.bomb_location</span>[<span class="context">@t</span>, bomb]
        <span class="context">env.bomb_details</span>[<span class="context">@t</span>, bomb]
    }
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="role-msg user">
            <span class="role-badge">Role: User</span>
            <div class="role-body">
              <div class="ctrl-block" style="border-left-color: #6e7781;">
                <div class="ctrl-header">ForEach <span class="idx">bomb</span> : <span class="ctx" >env.bombs</span></div>
                <span class="ctx">env.bomb_location[<span class="idx">@t</span>, <span class="idx">bomb</span>]</span><br>
                <span class="ctx">env.bomb_details[<span class="idx">@t</span>, <span class="idx">bomb</span>]</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h3 id="conditionals">If / ElseIf / Else</h3>
      <p><code>If</code> / <code>ElseIf</code> / <code>Else</code> conditionally includes or excludes blocks based on runtime state. Conditions may use comparison operators (<code>==</code>, <code>!=</code>, <code>&lt;</code>, <code>&gt;</code>) and logical connectives (<code>&amp;</code>, <code>|</code>):</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="keyword">If</span> <span class="context">sys.tool</span>[<span class="context">@t</span>] == clarify {
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@t</span>]
}
<span class="keyword">ElseIf</span> <span class="context">sys.tool</span>[<span class="context">@t</span>] == search {
    <span class="role">U</span>: <span class="context">env.search_results</span>[<span class="context">@t</span>]
}
<span class="keyword">Else</span> {
    <span class="role">A</span>: <span class="context">sys.tool</span>[<span class="context">@t</span>].<span class="context">tool_response</span>
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="ctrl-block">
            <div class="ctrl-header cond">If <span class="ctx">sys.tool[<span class="idx">@t</span>]</span> == clarify</div>
            <div class="role-msg user">
              <span class="role-badge">Role: User</span>
              <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@t</span>]</span></div>
            </div>
          </div>
          <div class="ctrl-block">
            <div class="ctrl-header cond">ElseIf <span class="ctx">sys.tool[<span class="idx">@t</span>]</span> == search</div>
            <div class="role-msg user">
              <span class="role-badge">Role: User</span>
              <div class="role-body"><span class="ctx">env.search_results[<span class="idx">@t</span>]</span></div>
            </div>
          </div>
          <div class="ctrl-block">
            <div class="ctrl-header cond">Else</div>
            <div class="role-msg assistant">
              <span class="role-badge">Role: Assistant</span>
              <div class="role-body"><span class="ctx">sys.tool[<span class="idx">@t</span>].tool_response</span></div>
            </div>
          </div>
        </div>
      </div>

      <p>Conditionals can also guard entire sections including loops:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="keyword">If</span> <span class="context">@T</span> &gt; 1 {
    <span class="keyword">ForEach</span>(<span class="context">t</span>: <span class="function">range</span>(1, <span class="context">@T</span>-1)) {
        <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@t</span>]
        <span class="role">A</span>: <span class="context">resp.answer</span>[<span class="context">@t</span>]
    }
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="ctrl-block">
            <div class="ctrl-header cond">If <span class="idx">@T</span> &gt; 1</div>
            <div class="ctrl-block" style="margin-left: 6px;">
              <div class="ctrl-header">ForEach <span class="idx">t</span> : <span class="idx">1</span> ... <span class="idx">@T</span>-1</div>
              <div class="role-msg user">
                <span class="role-badge">Role: User</span>
                <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@t</span>]</span></div>
              </div>
              <div class="role-msg assistant">
                <span class="role-badge">Role: Assistant</span>
                <div class="role-body"><span class="ctx">resp.answer[<span class="idx">@t</span>]</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h3 id="switch">Switch / Case / Default</h3>
      <p><code>Switch</code> / <code>Case</code> / <code>Default</code> selects among multiple alternatives based on the value of an expression:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="keyword">Switch</span> <span class="context">sys.action_type</span>[<span class="context">@t</span>] {
    <span class="keyword">Case</span> <span class="string">"search"</span> {
        <span class="role">U</span>: <span class="context">env.search_results</span>[<span class="context">@t</span>]
    }
    <span class="keyword">Case</span> <span class="string">"calculate"</span> {
        <span class="role">U</span>: <span class="context">env.calculation</span>[<span class="context">@t</span>]
    }
    <span class="keyword">Default</span> {
        <span class="role">U</span>: <span class="context">env.fallback</span>[<span class="context">@t</span>]
    }
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="ctrl-block">
            <div class="ctrl-header switch">Switch <span class="ctx">sys.action_type[<span class="idx">@t</span>]</span></div>
            <div class="ctrl-block" style="margin-left: 12px;">
              <div class="ctrl-header case">Case "search"</div>
              <div class="role-msg user">
                <span class="role-badge">Role: User</span>
                <div class="role-body"><span class="ctx">env.search_results[<span class="idx">@t</span>]</span></div>
              </div>
            </div>
            <div class="ctrl-block" style="margin-left: 12px;">
              <div class="ctrl-header case">Case "calculate"</div>
              <div class="role-msg user">
                <span class="role-badge">Role: User</span>
                <div class="role-body"><span class="ctx">env.calculation[<span class="idx">@t</span>]</span></div>
              </div>
            </div>
            <div class="ctrl-block" style="margin-left: 12px;">
              <div class="ctrl-header case">Default</div>
              <div class="role-msg user">
                <span class="role-badge">Role: User</span>
                <div class="role-body"><span class="ctx">env.fallback[<span class="idx">@t</span>]</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p>The <code>break</code> and <code>continue</code> keywords are available inside loops with their standard semantics.</p>

      <!-- EARLY TERMINATION -->
      <h2 id="early-termination">Early Termination</h2>
      <p>The <code>PromptEndsHere when</code> construct signals that, if the given condition is true, the prompt ends at that point&mdash;no further content is appended to the message sequence sent to the LLM for that turn. This is useful when certain conditions require a truncated prompt, such as an initial turn that needs no history or context beyond the setup. The syntax is:</p>

      <pre><span class="keyword">PromptEndsHere when</span> &lt;condition&gt;</pre>

      <p>For example, to end the prompt at the first time step:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre>Prompt[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">INSTRUCTIONS</span>
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@T</span>]
    <span class="keyword">PromptEndsHere when</span> (<span class="context">@T</span> == 1)
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: <span class="function">range</span>(1, <span class="context">@T</span>-1)) {
        <span class="role">A</span>: <span class="context">resp.answer</span>[<span class="context">@t</span>]
    }
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="role-msg system">
            <span class="role-badge">Role: System</span>
            <div class="role-body"><span class="tpl">INSTRUCTIONS</span></div>
          </div>
          <div class="role-msg user">
            <span class="role-badge">Role: User</span>
            <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@T</span>]</span></div>
          </div>
          <div class="end-block">
            <div class="end-line"></div>
            <span class="end-text">PromptEndsHere when <span class="idx">@T</span> == 1</span>
          </div>
        </div>
      </div>

      <p>Here, if the current time is the first step, the prompt contains only the system instructions and user input. Otherwise, the full history is appended.</p>

      <!-- MARK BLOCKS -->
      <h2 id="mark-blocks">Mark Blocks</h2>
      <p>A mark block annotates a section of the specification for visual emphasis in the rendered output. It places a bracket (<code>]</code>) along the side of the marked content, with a number identifier displayed beside it. Marks are purely presentational&mdash;they do not affect prompt semantics or scoping. They can wrap any prompt block, from a single content element to a large multi-message section:</p>

      <pre><span class="keyword">Mark</span> 1 {
    &lt;prompt-blocks&gt;
}</pre>

      <p>The number appears next to the bracket in the visualization as <code>]1</code>. Multiple marks with different numbers may be used to highlight distinct sections:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="keyword">Mark</span> 1 {
    <span class="role">S</span>: {
        <span class="template">INSTRUCTIONS</span>
        <span class="template">AVAILABLE_TOOLS</span>
    }
}
<span class="keyword">Mark</span> 2 {
    <span class="role">U</span>: <span class="context">env.user_question</span>[<span class="context">@T</span>]
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="mark-block">
            <div class="role-msg system">
              <span class="role-badge">Role: System</span>
              <div class="role-body">
                <span class="tpl">INSTRUCTIONS</span><br>
                <span class="tpl">AVAILABLE_TOOLS</span>
              </div>
            </div>
            <div class="mark-bracket">
              <div class="mark-line"></div>
              <span class="mark-num">1</span>
            </div>
          </div>
          <div class="mark-block">
            <div class="role-msg user">
              <span class="role-badge">Role: User</span>
              <div class="role-body"><span class="ctx">env.user_question[<span class="idx">@T</span>]</span></div>
            </div>
            <div class="mark-bracket">
              <div class="mark-line"></div>
              <span class="mark-num">2</span>
            </div>
          </div>
        </div>
      </div>

      <p>Here, mark <code>]1</code> highlights the system setup, <code>]2</code> marks the current query.</p>

      <!-- NAME DEFINITIONS -->
      <h2 id="name-definitions">Name Definitions</h2>
      <p>A name definition binds a symbolic name to an expression, allowing complex or frequently repeated expressions to be written once and referenced concisely throughout the specification. The definition syntax is:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="keyword">Name</span> docs := <span class="function">k_relevant_docs</span>(<span class="context">env.query</span>[<span class="context">@T</span>])
<span class="keyword">ForEach</span>(<span class="context">i</span>: <span class="function">range</span>(1, $docs.len)) {
    $docs[<span class="context">i</span>].source
    $docs[<span class="context">i</span>].content
}</pre>
        <div class="rendered-output" style="font-size: 8px;">
          <div class="render-label">Rendered Output</div>
          <div style="margin-bottom: 6px;">
            <span class="name-kw">Name</span> <span class="name-var">docs</span> <span class="name-assign">:=</span> <span class="fn" style="padding:1px 3px;font-size:8px;">k_relevant_docs(<span class="ctx" style="padding:1px 3px;font-size:8px;">env.query[<span class="idx">@T</span>]</span>)</span>
          </div>
          <div class="ctrl-block">
            <div class="ctrl-header">ForEach <span class="idx">i</span> : 1..<span class="name-var">docs</span>.len</div>
            <span class="name-var">docs</span>[<span class="idx">i</span>].source<br>
            <span class="name-var">docs</span>[<span class="idx">i</span>].content
          </div>
        </div>
      </div>

      <p>Once defined, the name is referenced using the <code>$</code> prefix: <code>$var_name</code>. Name definitions improve readability by replacing long or opaque expressions with descriptive identifiers. The bound expression can be any valid ACDL element&mdash;a context variable, function call, arithmetic expression, or string literal. Fields of the bound value can be accessed via dot notation on the reference.</p>

      <p>Here, <code>$docs</code> binds the result of a retrieval function, avoiding repetition of the full function call. Its length and individual elements are then accessed via <code>$docs.len</code> and <code>$docs[i]</code>.</p>

      <h3>List Comprehensions</h3>
      <p>Name definitions also support list comprehensions, which construct a list by iterating over a range or collection:</p>

      <pre><span class="keyword">Name</span> relevant_summaries :=
    [<span class="context">sys.summary</span>[<span class="context">@t</span>] <span class="keyword">for</span> t <span class="keyword">in</span> <span class="function">range</span>(<span class="context">@T</span>, <span class="context">@T</span>-900, 100)]
<span class="function">compress_summaries</span>($relevant_summaries)</pre>
      <div class="rendered-output">
        <div class="render-label">Rendered Output</div>
        <div style="margin-bottom: 6px;">
          <span class="name-kw">Name</span> <span class="name-var">relevant_summaries</span> <span class="name-assign">:=</span> [<span class="ctx">sys.summary[<span class="idx">@t</span>]</span> | <span class="idx">t</span> ∈ <span class="idx">@T</span> ... <span class="idx">@T</span>-900 <b>every</b> 100]
        </div>
        <span class="fn">compress_summaries(<span class="name-var">relevant_summaries</span>)</span>
      </div>

      <p>This binds <code>$relevant_summaries</code> to a list of summaries sampled every 100 steps, which is then passed as an argument to a function. The reference syntax is the same regardless of whether the bound value is a single expression or a list.</p>

      <!-- FRAGMENTS -->
      <h2 id="fragments">Fragments</h2>
      <p>Fragments are reusable building blocks that encapsulate portions of a prompt specification. They enable modular prompt design by allowing common patterns to be defined once and invoked multiple times. Two kinds of fragments are supported, distinguished by what they produce when expanded.</p>

      <h3>String Fragments</h3>
      <p><em>String Fragments</em> produce content pieces without an associated role. They are defined with the <code>StrFrag</code> keyword and may contain any elements valid inside a role block&mdash;context variables, functions, templates, control flow, other string fragments, name definitions, and comments. When invoked, the content expands in place and inherits the role of the enclosing message:</p>

      <div class="code-and-render" style="grid-template-columns: 6fr 4fr;">
        <pre><span class="keyword">StrFrag</span> DocumentContext[doc]: {
    <span class="context">env.doc_title</span>[doc]
    <span class="context">env.doc_content</span>[doc]
    <span class="function">summarize</span>(<span class="context">env.doc_metadata</span>[doc])
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="frag-title"><h1>DocumentContext[<span class="idx">doc</span>]</h1><span class="frag-badge">SF</span></div>
          <div style="border-left: 1px solid #d0d7de; padding-left: 8px; margin-left: 0;">
            <span class="ctx">env.doc_title[<span class="idx">doc</span>]</span><br>
            <span class="ctx">env.doc_content[<span class="idx">doc</span>]</span><br>
            <span class="fn">summarize(<span class="ctx">env.doc_metadata[<span class="idx">doc</span>]</span>)</span>
          </div>
        </div>
      </div>

      <p>A more complex example with control flow:</p>

      <div class="code-and-render" style="grid-template-columns: 6fr 4fr;">
        <pre><span class="keyword">StrFrag</span> ConversationContext[<span class="context">@T</span>]: {
    <span class="template">CONTEXT_HEADER</span>
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: <span class="function">range</span>(<span class="context">@T</span>-5, <span class="context">@T</span>)) {
        <span class="context">sys.Summary</span>[<span class="context">@t</span>]
        <span class="keyword">If</span> <span class="context">sys.has_tool_call</span>[<span class="context">@t</span>] {
            <span class="context">sys.tool_response</span>[<span class="context">@t</span>]
        }
    }
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="frag-title"><h1>ConversationContext[<span class="idx">@T</span>]</h1><span class="frag-badge">SF</span></div>
          <div style="border-left: 1px solid #d0d7de; padding-left: 8px; margin-left: 0;">
            <span class="tpl">CONTEXT_HEADER</span>
            <div class="ctrl-block">
              <div class="ctrl-header">ForEach <span class="idx">@t</span> : <span class="idx">@T</span>-5 ... <span class="idx">@T</span></div>
              <span class="ctx">sys.Summary[<span class="idx">@t</span>]</span>
              <div class="ctrl-block">
                <div class="ctrl-header cond">If <span class="ctx">sys.has_tool_call[<span class="idx">@t</span>]</span></div>
                <span class="ctx">sys.tool_response[<span class="idx">@t</span>]</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p>String fragments are invoked with the <code>Frag</code> keyword followed by the fragment name and arguments. They may appear anywhere a context variable, function, or template is valid&mdash;inside role blocks, within control flow bodies, or as arguments to other constructs:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre><span class="role">U</span>: {
    <span class="template">TASK_INSTRUCTIONS</span>
    <span class="keyword">ForEach</span>(doc: <span class="context">env.documents</span>) {
        <span class="keyword">Frag</span> DocumentContext[doc]
    }
    <span class="context">env.user_question</span>[<span class="context">@T</span>]
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="role-msg user">
            <span class="role-badge">Role: User</span>
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

      <h3>Role Fragments</h3>
      <p><em>Role Fragments</em> produce one or more complete role messages. They are defined with the <code>RolesFrag</code> keyword and may contain role messages, control flow, mark blocks, and other prompt-level constructs&mdash;the same elements valid at the top level of a prompt body:</p>

      <div class="code-and-render" style="grid-template-columns: 6fr 4fr;">
        <pre><span class="keyword">RolesFrag</span> ConversationTurn[<span class="context">@t</span>]: {
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@t</span>]
    <span class="role">A</span>: <span class="context">resp.answer</span>[<span class="context">@t</span>]
    <span class="keyword">If</span> <span class="context">sys.tool</span>[<span class="context">@t</span>] != none {
        <span class="role">T</span>: <span class="context">sys.tool</span>[<span class="context">@t</span>].<span class="context">tool_response</span>
    }
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="frag-title"><h1>ConversationTurn[<span class="idx">@t</span>]</h1><span class="frag-badge">RF</span></div>
          <div style="border-left: 1px solid #d0d7de; padding-left: 8px; margin-left: 0;">
            <div class="role-msg user">
              <span class="role-badge">Role: User</span>
              <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@t</span>]</span></div>
            </div>
            <div class="role-msg assistant">
              <span class="role-badge">Role: Assistant</span>
              <div class="role-body"><span class="ctx">resp.answer[<span class="idx">@t</span>]</span></div>
            </div>
            <div class="ctrl-block">
              <div class="ctrl-header cond">If <span class="ctx">sys.tool[<span class="idx">@t</span>]</span> != none</div>
              <div class="role-msg tool">
                <span class="role-badge">Role: Tool</span>
                <div class="role-body"><span class="ctx">sys.tool[<span class="idx">@t</span>].tool_response</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p>Role fragments are invoked at the top level of a prompt, wherever a role message would be valid. They expand to the full sequence of role messages defined in the fragment body:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre>ChatAgent[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">INSTRUCTIONS</span>
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: <span class="function">range</span>(1, <span class="context">@T</span>)) {
        <span class="keyword">Frag</span> ConversationTurn[<span class="context">@t</span>]
    }
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@T</span>]
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="prompt-title"><h1>ChatAgent[<span class="idx">@T</span>]:</h1></div>
          <div class="role-msg system">
            <span class="role-badge">Role: System</span>
            <div class="role-body"><span class="tpl">INSTRUCTIONS</span></div>
          </div>
          <div class="ctrl-block">
            <div class="ctrl-header">ForEach <span class="idx">@t</span> : <span class="idx">1</span> ... <span class="idx">@T</span></div>
            <span class="frag-kw">Frag</span> <span class="frag-inv">ConversationTurn[<span class="idx">@t</span>]</span>
          </div>
          <div class="role-msg user">
            <span class="role-badge">Role: User</span>
            <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@T</span>]</span></div>
          </div>
        </div>
      </div>

      <h3>Fragment Parameters and Invocation</h3>
      <p>Both fragment types accept parameters, enabling parameterized reuse. Parameters follow the fragment name in square brackets and may include indices, context variables, or other valid index expressions. The same invocation syntax (<code>Frag Name[args]</code>) is used for both types; the parser determines which kind based on context&mdash;invocations inside role blocks resolve to string fragments, while those at the top level resolve to role fragments.</p>

      <p>Fragment definitions appear at the top level of an ACDL file, alongside prompt specifications. A single file may contain any combination of prompts and fragment definitions:</p>

      <div class="code-and-render" style="grid-template-columns: 55fr 45fr;">
        <pre><span class="keyword">StrFrag</span> ToolDescription[tool]: {
    <span class="context">sys.tool_name</span>[tool]
    <span class="context">sys.tool_schema</span>[tool]
}

<span class="keyword">RolesFrag</span> ToolResult[<span class="context">@t</span>, tool]: {
    <span class="role">A</span>: <span class="context">sys.tool_call</span>[<span class="context">@t</span>, tool]
    <span class="role">T</span>: <span class="context">sys.tool_response</span>[<span class="context">@t</span>, tool]
}

ToolAgent[<span class="context">@T</span>]: {
    <span class="role">S</span>: {
        <span class="template">INSTRUCTIONS</span>
        <span class="keyword">ForEach</span>(tool: <span class="context">sys.available_tools</span>) {
            <span class="keyword">Frag</span> ToolDescription[tool]
        }
    }
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: <span class="function">range</span>(1, <span class="context">@T</span>)) {
        <span class="role">U</span>: <span class="context">env.observation</span>[<span class="context">@t</span>]
        <span class="keyword">Frag</span> ToolResult[<span class="context">@t</span>, <span class="context">sys.selected_tool</span>[<span class="context">@t</span>]]
    }
    <span class="role">U</span>: <span class="context">env.observation</span>[<span class="context">@T</span>]
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <!-- StrFrag ToolDescription -->
          <div class="frag-title"><h1>ToolDescription[<span class="idx">tool</span>]</h1><span class="frag-badge">SF</span></div>
          <div style="border-left: 1px solid #d0d7de; padding-left: 8px; margin-left: 0; margin-bottom: 12px;">
            <span class="ctx">sys.tool_name[<span class="idx">tool</span>]</span><br>
            <span class="ctx">sys.tool_schema[<span class="idx">tool</span>]</span>
          </div>
          <!-- RolesFrag ToolResult -->
          <div class="frag-title"><h1>ToolResult[<span class="idx">@t</span>, <span class="idx">tool</span>]</h1><span class="frag-badge">RF</span></div>
          <div style="border-left: 1px solid #d0d7de; padding-left: 8px; margin-left: 0; margin-bottom: 12px;">
            <div class="role-msg assistant">
              <span class="role-badge">Role: Assistant</span>
              <div class="role-body"><span class="ctx">sys.tool_call[<span class="idx">@t</span>, <span class="idx">tool</span>]</span></div>
            </div>
            <div class="role-msg tool">
              <span class="role-badge">Role: Tool</span>
              <div class="role-body"><span class="ctx">sys.tool_response[<span class="idx">@t</span>, <span class="idx">tool</span>]</span></div>
            </div>
          </div>
          <!-- Prompt ToolAgent -->
          <div class="prompt-title"><h1>ToolAgent[<span class="idx">@T</span>]:</h1></div>
          <div class="role-msg system">
            <span class="role-badge">Role: System</span>
            <div class="role-body">
              <span class="tpl">INSTRUCTIONS</span>
              <div class="ctrl-block">
                <div class="ctrl-header">ForEach <span class="idx">tool</span> : <span class="ctx">sys.available_tools</span></div>
                <span class="frag-kw">Frag</span> <span class="frag-inv">ToolDescription[<span class="idx">tool</span>]</span>
              </div>
            </div>
          </div>
          <div class="ctrl-block">
            <div class="ctrl-header">ForEach <span class="idx">@t</span> : <span class="idx">1</span> ... <span class="idx">@T</span></div>
            <div class="role-msg user">
              <span class="role-badge">Role: User</span>
              <div class="role-body">
                <span class="ctx">env.observation[<span class="idx">@t</span>]</span><br>
                <span class="frag-kw">Frag</span> <span class="frag-inv">ToolResult[<span class="idx">@t</span>, <span class="ctx">sys.selected_tool[<span class="idx">@t</span>]</span>]</span>
              </div>
            </div>
          </div>
          <div class="role-msg user">
            <span class="role-badge">Role: User</span>
            <div class="role-body"><span class="ctx">env.observation[<span class="idx">@T</span>]</span></div>
          </div>
        </div>
      </div>

      <!-- COMMENTS -->
      <h2 id="comments">Comments</h2>
      <p>Comments use <code>//</code> syntax and may appear on any line&mdash;between prompt blocks, inside role blocks, or between specifications. Once a <code>//</code> is encountered, the remainder of that line is treated as a comment; no further ACDL elements may follow on the same line.</p>

      <p>An <strong>inline comment</strong>, placed after a content element, renders alongside that element. A <strong>standalone comment</strong>, placed on its own line, renders at the current level of nesting:</p>

      <div class="code-and-render" style="grid-template-columns: 65fr 35fr;">
        <pre><span class="role">S</span>: {
    <span class="comment">// This comment appears on its own line,</span>
    <span class="comment">// indented to the level of the S: block</span>
    <span class="template">INSTRUCTIONS</span>  <span class="comment">// Renders beside INSTRUCTIONS</span>
    <span class="template">AVAILABLE_TOOLS</span>
    <span class="comment">// Another standalone comment</span>
    <span class="context">env.datetime</span>[<span class="context">@T</span>]  <span class="comment">// Renders beside datetime</span>
}
<span class="comment">// This comment is at the top level</span>
<span class="keyword">ForEach</span>(<span class="context">@t</span>: <span class="function">range</span>(1, <span class="context">@T</span>-1)) {
    <span class="comment">// This comment is inside the loop body</span>
    <span class="role">U</span>: <span class="context">env.user_question</span>[<span class="context">@t</span>]  <span class="comment">// Beside the message</span>
    <span class="role">A</span>: <span class="context">resp.answer</span>[<span class="context">@t</span>]
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="role-msg system">
            <span class="role-badge">Role: System</span>
            <div class="role-body">
              <div><span class="cmt">// This comment appears on its own line,</span></div>
              <div><span class="cmt">// indented to the level of the S: block</span></div>
              <div><span class="block-with-comment"><span class="tpl">INSTRUCTIONS</span> <span class="cmt">// Renders beside INSTRUCTIONS</span></span></div>
              <div><span class="tpl">AVAILABLE_TOOLS</span></div>
              <div><span class="cmt">// Another standalone comment</span></div>
              <div><span class="block-with-comment"><span class="ctx">env.datetime[<span class="idx">@T</span>]</span> <span class="cmt">// Renders beside datetime</span></span></div>
            </div>
          </div>
          <div><span class="cmt">// This comment is at the top level</span></div>
          <div class="ctrl-block">
            <div class="ctrl-header">ForEach <span class="idx">@t</span> : <span class="idx">1</span> ... <span class="idx">@T</span>-1</div>
            <div class="ctrl-body">
              <div><span class="cmt">// This comment is inside the loop body</span></div>
              <div class="role-msg user">
                <span class="role-badge">Role: User</span>
                <div class="role-body"><span class="block-with-comment"><span class="ctx">env.user_question[<span class="idx">@t</span>]</span> <span class="cmt">// Beside the message</span></span></div>
              </div>
              <div class="role-msg assistant">
                <span class="role-badge">Role: Assistant</span>
                <div class="role-body"><span class="ctx">resp.answer[<span class="idx">@t</span>]</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- NAMING CONVENTIONS -->
      <h2 id="naming-conventions">Identifiers and Naming Conventions</h2>
      <p>Identifiers start with a letter or underscore and may contain letters, digits, and underscores. They are case-sensitive. The language enforces naming conventions to visually distinguish element types:</p>

      <table>
        <tr><th>Element</th><th>Convention</th><th>Example</th></tr>
        <tr><td>Templates</td><td><code>ALL_CAPS</code></td><td><code>TASK_DESCRIPTION</code></td></tr>
        <tr><td>Functions</td><td><code>camelCase</code></td><td><code>summarize</code>, <code>k_relevant_docs</code></td></tr>
        <tr><td>Context variables</td><td><code>dot.separated</code></td><td><code>env.user_input</code></td></tr>
        <tr><td>Time indices</td><td><code>@</code> prefix</td><td><code>@T</code>, <code>@t</code></td></tr>
        <tr><td>Name references</td><td><code>$</code> prefix</td><td><code>$docs</code></td></tr>
      </table>

      <!-- ILLUSTRATIVE EXAMPLES -->
      <h2 id="example-tool-agent">Example: Tool-Using Agent</h2>
      <p>A complete specification for a tool-using agent with conditional history replay:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre>ToolAgent[<span class="context">@T</span>]: {
    <span class="role">S</span>: {
        <span class="template">INSTRUCTIONS</span>
        <span class="template">AVAILABLE_TOOLS</span>
    }
    <span class="role">U</span>: {
        <span class="context">env.user_input</span>[<span class="context">@0</span>]
        <span class="context">env.user_document</span>[<span class="context">@0</span>]
    }
    <span class="keyword">If</span> <span class="context">t</span> &gt; 1 {
        <span class="keyword">ForEach</span>(<span class="context">@t</span>: <span class="function">range</span>(1, <span class="context">@T</span>-1)) {
            <span class="keyword">If</span> <span class="context">sys.tool</span>[<span class="context">@t</span>] == clarify {
                <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@t</span>]
            }
            <span class="keyword">Else</span> {
                <span class="role">A</span>: <span class="context">sys.tool</span>[<span class="context">@t</span>].<span class="context">tool_response</span>
            }
        }
    }
    <span class="role">S</span>: {<span class="template">REACT_INSTRUCTIONS</span>}
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="prompt-title"><h1>ToolAgent[<span class="idx">@T</span>]:</h1></div>
          <div class="role-msg system">
            <span class="role-badge">Role: System</span>
            <div class="role-body"><span class="tpl">INSTRUCTIONS</span><br><span class="tpl">AVAILABLE_TOOLS</span></div>
          </div>
          <div class="role-msg user">
            <span class="role-badge">Role: User</span>
            <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@0</span>]</span><br><span class="ctx">env.user_document[<span class="idx">@0</span>]</span></div>
          </div>
          <div class="ctrl-block">
            <div class="ctrl-header cond">If <span class="idx">t</span> &gt; 1</div>
            <div class="ctrl-block" style="margin-left: 6px;">
              <div class="ctrl-header">ForEach <span class="idx">@t</span> : <span class="idx">1</span> ... <span class="idx">@T</span>-1</div>
              <div class="ctrl-block" style="margin-left: 6px;">
                <div class="ctrl-header cond">If <span class="ctx">sys.tool[<span class="idx">@t</span>]</span> == clarify</div>
                <div class="role-msg user">
                  <span class="role-badge">Role: User</span>
                  <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@t</span>]</span></div>
                </div>
              </div>
              <div class="ctrl-block" style="margin-left: 6px;">
                <div class="ctrl-header cond">Else</div>
                <div class="role-msg assistant">
                  <span class="role-badge">Role: Assistant</span>
                  <div class="role-body"><span class="ctx">sys.tool[<span class="idx">@t</span>].tool_response</span></div>
                </div>
              </div>
            </div>
          </div>
          <div class="role-msg system">
            <span class="role-badge">Role: System</span>
            <div class="role-body"><span class="tpl">REACT_INSTRUCTIONS</span></div>
          </div>
        </div>
      </div>
      <p class="figcaption"><strong>Tool-using agent.</strong> System messages frame the task; a conditional loop replays interaction history with role assignment determined by action type.</p>

      <h2 id="example-multi-agent">Example: Multi-Agent Prompt</h2>
      <p>A multi-agent prompt with collection iteration and dialog retrieval:</p>

      <div class="code-and-render" style="grid-template-columns: 3fr 2fr;">
        <pre>MultiAgent[<span class="context">@T</span>, agent_name]: {
    <span class="role">S</span>: <span class="context">sys.agent_desc</span>[agent_name]
    <span class="role">U</span>: <span class="context">env.datetime</span>[<span class="context">@T</span>]
    <span class="keyword">ForEach</span>(other: <span class="context">sys.agent_names</span>) {
        <span class="keyword">If</span> <span class="function">env.in_dialog</span>(other, <span class="context">@T</span>) {
            <span class="role">U</span>: <span class="function">get_dialog_history</span>(other, <span class="context">@T</span>)
        }
    }
    <span class="role">S</span>: <span class="template">QUESTION</span>(agent_name)
}</pre>
        <div class="rendered-output">
          <div class="render-label">Rendered Output</div>
          <div class="prompt-title"><h1>MultiAgent[<span class="idx">@T</span>, <span class="idx">agent_name</span>]:</h1></div>
          <div class="role-msg system">
            <span class="role-badge">Role: System</span>
            <div class="role-body"><span class="ctx">sys.agent_desc[<span class="idx">agent_name</span>]</span></div>
          </div>
          <div class="role-msg user">
            <span class="role-badge">Role: User</span>
            <div class="role-body"><span class="ctx">env.datetime[<span class="idx">@T</span>]</span></div>
          </div>
          <div class="ctrl-block">
            <div class="ctrl-header">ForEach <span class="idx">other</span> : <span class="ctx" >sys.agent_names</span></div>
            <div class="ctrl-block" style="margin-left: 6px;">
              <div class="ctrl-header cond">If <span class="fn" >env.in_dialog(<span class="idx">other</span>, <span class="idx">@T</span>)</span></div>
              <div class="role-msg user">
                <span class="role-badge">Role: User</span>
                <div class="role-body"><span class="fn">get_dialog_history(<span class="idx">other</span>, <span class="idx">@T</span>)</span></div>
              </div>
            </div>
          </div>
          <div class="role-msg system">
            <span class="role-badge">Role: System</span>
            <div class="role-body"><span class="tpl">QUESTION(<span class="idx" style="color: #9333ea;">agent_name</span>)</span></div>
          </div>
        </div>
      </div>
      <p class="figcaption"><strong>Multi-agent interaction.</strong> The prompt is parameterized by time and agent identity; dialog histories are conditionally included for agents currently in conversation.</p>

    </main>
  </div>
