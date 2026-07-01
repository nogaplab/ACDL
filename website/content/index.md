---
title: ACDL - Agentic Context Description Language
---

  <section class="hero">
    <div class="hero-badge">
      <span>Agentic Context Description Language</span>
    </div>
    <h1><span class="title-line">A formal language for</span><span class="title-line">LLM context structures</span></h1>
    <p class="hero-tagline">
      Describe, visualize and communicate agentic context structures with precision. ACDL captures the structure and dynamics of agentic LLM contexts in a concise, readable, and standard manner, along with visualizations.
    </p>
    <div class="hero-buttons">
      <a href="motivation.html" class="btn btn-secondary">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="9" y1="18" x2="15" y2="18"></line>
          <line x1="10" y1="22" x2="14" y2="22"></line>
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"></path>
        </svg>
        What is it about?
      </a>
      <a href="tutorial.html" class="btn btn-primary">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
        </svg>
        Learn the language
      </a>
      <a href="examples/index.html" class="btn btn-secondary">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        Explore examples
      </a>
    </div>

    <div class="hero-code code-and-render">
      <div class="code-panel">
        <div class="code-header">
          <span class="code-dot"></span>
          <span class="code-dot"></span>
          <span class="code-dot"></span>
          <span class="code-title">react-agent.acdl</span>
        </div>
        <div class="code-body">
<pre><span class="template">ReactAgent</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: {
          <span class="template">INSTRUCTIONS</span>
          <span class="template">AVAILABLE_TOOLS</span>
    }
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@1</span>]
    <span class="comment">// Action history</span>
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: range(1, <span class="context">@T</span>)) {
        <span class="role">A</span>: {
             <span class="context">resp.reasoning</span>[<span class="context">@t</span>]
             <span class="context">sys.tool_used</span>[<span class="context">@t</span>]
        }
        <span class="role">T</span>: <span class="context">sys.tool_used</span>[<span class="context">@t</span>].response
    }
    <span class="role">S</span>: <span class="template">SOLVE_TASK</span>
}</pre>
        </div>
      </div>
      <div class="rendered-output">
        <div class="render-label">Rendered Output</div>
        <div class="prompt-title">ReactAgent[<span class="idx">@T</span>]:</div>
        <div class="role-msg system">
          <span class="role-badge">Role: System</span>
          <div class="role-body">
            <span class="tpl">INSTRUCTIONS</span><br>
            <span class="tpl">AVAILABLE_TOOLS</span>
          </div>
        </div>
        <div class="role-msg user">
          <span class="role-badge">Role: User</span>
          <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@1</span>]</span></div>
        </div>
        <div class="cmt">// Action history</div>
        <div class="ctrl-block">
          <div class="ctrl-header">↻ ForEach <span class="idx">@t</span> : 1 ... <span class="idx">@T</span></div>
          <div class="role-msg assistant">
            <span class="role-badge">Role: Assistant</span>
            <div class="role-body">
              <span class="ctx">resp.reasoning[<span class="idx">@t</span>]</span><br>
              <span class="ctx">sys.tool_used[<span class="idx">@t</span>]</span>
            </div>
          </div>
          <div class="role-msg tool">
            <span class="role-badge">Role: Tool</span>
            <div class="role-body"><span class="ctx">sys.tool_used[<span class="idx">@t</span>].response</span></div>
          </div>
        </div>
        <div class="role-msg system">
          <span class="role-badge">Role: System</span>
          <div class="role-body"><span class="tpl">SOLVE_TASK</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="section example-section">
    <div class="container">
      <div class="example-grid">
        <div class="example-content">
          <h3>Describe Real Systems</h3>
          <p>ACDL has been used to specify context structures for production agent systems including coding assistants, persistent agents, and multi-agent simulations.</p>
          <ul class="example-list">
            <li>Claude Code-style coding assistants</li>
            <li>Persistent agents with heartbeat timers</li>
            <li>Multi-agent simulations with memory</li>
            <li>Game-playing agents with hierarchical summaries</li>
          </ul>
        </div>
        <a href="examples/index.html" class="example-cta">
          <div class="example-cta-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </div>
          <div class="example-cta-content">
            <h4>Browse All Examples</h4>
            <p>Explore ReAct agents, RAG pipelines, multi-agent systems, and more</p>
          </div>
          <svg class="example-cta-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </a>
      </div>
    </div>
  </section>

  <section class="section cheatsheet-section">
    <div class="container">
      <div class="section-header">
        <h2>Language Cheat Sheet</h2>
        <p>A concise syntax designed for describing complex LLM context structures</p>
      </div>

      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icons">
            <span class="feature-icon icon-purple">S:</span>
            <span class="feature-icon icon-purple">U:</span>
            <span class="feature-icon icon-purple">A:</span>
            <span class="feature-icon icon-purple">T:</span>
          </div>
          <h3>Role Messages</h3>
          <p>Four chat roles (System, User, Assistant, Tool) and a completion format. Each message carries exactly one role with visual color-coding.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icons">
            <span class="feature-icon icon-blue">@T</span>
            <span class="feature-icon icon-blue">@T.i</span>
            <span class="feature-icon icon-blue">x[@T]</span>
          </div>
          <h3>Time Indexing</h3>
          <p>Explicit indices describe context evolution. @T is the current step, with sub-steps (@T.I) and history iteration support.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icons">
            <span class="feature-icon icon-green">env</span>
            <span class="feature-icon icon-green">sys</span>
            <span class="feature-icon icon-green">resp</span>
          </div>
          <h3>Context Variables</h3>
          <p>Three namespaces: env (environment), sys (system state), and resp (LLM responses).</p>
        </div>
        <div class="feature-card">
          <div class="feature-icons">
            <span class="feature-icon icon-purple">If</span>
            <span class="feature-icon icon-purple">Else</span>
            <span class="feature-icon icon-purple">ForEach</span>
            <span class="feature-icon icon-purple">Switch</span>
          </div>
          <h3>Control Flow</h3>
          <p>ForEach loops, If/ElseIf/Else conditions, and Switch/Case constructs determine context based on runtime state.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icons">
            <span class="feature-icon icon-blue">ABC</span>
            <span class="feature-icon icon-blue">ABC(a,b)</span>
          </div>
          <h3>Templates</h3>
          <p>ALL_CAPS placeholders for text blocks. Separates architecture from prose, with optional parameterization.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon icon-green">fn()</div>
          <h3>Functions</h3>
          <p>Named functions for computed content—summarization, retrieval, or any transformation beyond simple lookups.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section section-light">
    <div class="container">
      <div class="section-header">
        <h2>Everything you need to describe and visualize LLM contexts</h2>
      </div>

      <div class="resources-grid">
        <a href="visualizer.html?example=react_base" class="resource-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
          <h4>Live Editor</h4>
          <span>Write and render ACDL in browser</span>
        </a>
        <a href="syntax-reference.html" class="resource-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
          <h4>Documentation</h4>
          <span>Complete syntax reference</span>
        </a>
        <a href="examples/index.html" class="resource-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <h4>ACDL Examples</h4>
          <span>ReAct, RAG, multi-agent</span>
        </a>
        <a href="vscode.html" class="resource-card">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/>
          </svg>
          <h4>VSCode Extension</h4>
          <span>Syntax highlighting & preview</span>
        </a>
        <a href="claude-code-skill.html" class="resource-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
            <path d="M2 17l10 5 10-5"></path>
            <path d="M2 12l10 5 10-5"></path>
          </svg>
          <h4>Claude Code Skill</h4>
          <span>Generate code from ACDL</span>
        </a>
        <a href="tutorial.html" class="resource-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
          <h4>Tutorial</h4>
          <span>Learn ACDL step by step</span>
        </a>
      </div>
    </div>
  </section>
