---
title: Examples - ACDL
---

  <section class="hero">
    <h1>ACDL Examples</h1>
    <p>Explore ACDL specifications for common agentic patterns and real-world systems</p>
  </section>

  <section class="section section-light">
    <div class="container">
      <div class="examples-legend">
        <h3 class="legend-title">Card Actions</h3>
        <div class="legend-items">
          <div class="legend-item">
            <span class="legend-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </span>
            <div class="legend-content">
              <span class="legend-label">Preview</span>
              <span class="legend-desc">View rendered visualization</span>
            </div>
          </div>
          <div class="legend-item">
            <span class="legend-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </span>
            <div class="legend-content">
              <span class="legend-label">Open in Live Editor</span>
              <span class="legend-desc">Modify the code interactively</span>
            </div>
          </div>
        </div>
      </div>

      <div class="section-header">
        <h2>Basic Patterns</h2>
        <p>Foundational structures for LLM context management</p>
      </div>

      <div class="examples-grid">
        <div class="example-card">
          <div class="example-card-header">
            <h3>Basic Context</h3>
            <p>The simplest ACDL specification: a system message with instructions</p>
            <div class="example-card-tags">
              <span class="tag tag-basic">Basic</span>
            </div>
          </div>
          <div class="example-card-code">
            <pre><span class="template">Context</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">PERSONA</span>
    <span class="role">S</span>: <span class="template">INSTRUCTIONS</span>
}</pre>
          </div>
          <div class="example-card-rendered">
            <div class="rendered-output">
              <div class="prompt-title">Context[<span class="idx">@T</span>]:</div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body"><span class="tpl">PERSONA</span></div>
              </div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body"><span class="tpl">INSTRUCTIONS</span></div>
              </div>
            </div>
          </div>
          <div class="example-card-footer">
            <a href="#" onclick="openModal('Basic Context', this, 'basic'); return false;">Preview</a>
            <a href="../visualizer.html?example=basic">Open in Live Editor</a>
          </div>
        </div>

        <div class="example-card">
          <div class="example-card-header">
            <h3>Basic RAG</h3>
            <p>Retrieval-augmented generation with document context</p>
            <div class="example-card-tags">
              <span class="tag tag-rag">RAG</span>
            </div>
          </div>
          <div class="example-card-code">
            <pre><span class="template">BasicRAG</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">INSTRUCTIONS</span>
    <span class="role">U</span>: {
        <span class="keyword">Name</span> docs := k_relevant_docs(<span class="context">env.user_input</span>[<span class="context">@T</span>])
        <span class="keyword">ForEach</span>(i: range(1, $docs.len)) {
            $docs[i].source
            $docs[i].content
        }
        <span class="template">ANSWER_Q_FROM_DOCS</span>
        <span class="context">env.user_input</span>[<span class="context">@T</span>]
    }
}</pre>
            <button class="expand-btn" onclick="toggleExpand(this)">Show More</button>
          </div>
          <div class="example-card-rendered">
            <div class="rendered-output">
              <div class="prompt-title">BasicRAG[<span class="idx">@T</span>]:</div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body"><span class="tpl">INSTRUCTIONS</span></div>
              </div>
              <div class="role-msg user">
                <span class="role-badge">Role: User</span>
                <div class="role-body">
                  <div class="ctrl-block">
                    <div class="ctrl-header">↻ ForEach i : 1 ... $docs.len</div>
                    <span class="ctx">$docs[i].source</span><br>
                    <span class="ctx">$docs[i].content</span>
                  </div>
                  <span class="tpl">ANSWER_Q_FROM_DOCS</span><br>
                  <span class="ctx">env.user_input[<span class="idx">@T</span>]</span>
                </div>
              </div>
            </div>
          </div>
          <div class="example-card-footer">
            <a href="#" onclick="openModal('Basic RAG', this, 'basic_rag'); return false;">Preview</a>
            <a href="../visualizer.html?example=basic_rag">Open in Live Editor</a>
          </div>
        </div>
      </div>

      <div class="section-divider"></div>
      <div class="section-header">
        <h2>ReAct Patterns</h2>
        <p>Reasoning and action loops for tool-using agents</p>
      </div>

      <div class="examples-grid">
        <div class="example-card">
          <div class="example-card-header">
            <h3>ReAct Base</h3>
            <p>Basic ReAct loop with tool reasoning and responses</p>
            <div class="example-card-tags">
              <span class="tag tag-react">ReAct</span>
            </div>
          </div>
          <div class="example-card-code no-scroll">
            <pre><span class="template">ReactBase</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: {
        <span class="template">INSTRUCTIONS</span>
        <span class="template">AVAILABLE_TOOLS</span>
    }
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@1</span>]  <span class="comment">// history</span>
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: range(1, <span class="context">@T</span>-1)) {
        <span class="role">A</span>: {
            <span class="context">resp.tool_reasoning</span>[<span class="context">@t</span>]
            <span class="context">sys.tool_used</span>[<span class="context">@t</span>]
        }
        <span class="role">T</span>: <span class="context">sys.tool_used</span>[<span class="context">@t</span>].tool_response
    }
    <span class="role">S</span>: <span class="template">USE_TOOLS_TO_SOLVE_TASK</span>
}</pre>
            <button class="expand-btn" onclick="toggleExpand(this)">Show More</button>
          </div>
          <div class="example-card-rendered">
            <div class="rendered-output">
              <div class="prompt-title">ReactBase[<span class="idx">@T</span>]:</div>
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
              <div class="ctrl-block">
                <div class="ctrl-header">↻ ForEach <span class="idx">@t</span> : 1 ... <span class="idx">@T</span>-1</div>
                <div class="role-msg assistant">
                  <span class="role-badge">Role: Assistant</span>
                  <div class="role-body">
                    <span class="ctx">resp.tool_reasoning[<span class="idx">@t</span>]</span><br>
                    <span class="ctx">sys.tool_used[<span class="idx">@t</span>]</span>
                  </div>
                </div>
                <div class="role-msg tool">
                  <span class="role-badge">Role: Tool</span>
                  <div class="role-body"><span class="ctx">sys.tool_used[<span class="idx">@t</span>].tool_response</span></div>
                </div>
              </div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body"><span class="tpl">USE_TOOLS_TO_SOLVE_TASK</span></div>
              </div>
            </div>
          </div>
          <div class="example-card-footer">
            <a href="#" onclick="openModal('ReAct Base', this, 'react_base'); return false;">Preview</a>
            <a href="../visualizer.html?example=react_base">Open in Live Editor</a>
          </div>
        </div>

        <div class="example-card">
          <div class="example-card-header">
            <h3>ReAct No Reasoning in History</h3>
            <p>Variant without reasoning traces in action history</p>
            <div class="example-card-tags">
              <span class="tag tag-react">ReAct</span>
              <span class="tag tag-basic">Variant</span>
            </div>
          </div>
          <div class="example-card-code no-scroll">
            <pre><span class="template">ReactNoReasoningInHistory</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: {
        <span class="template">INSTRUCTIONS</span>
        <span class="template">AVAILABLE_TOOLS</span>
    }
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@1</span>]  <span class="comment">// history</span>
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: range(1, <span class="context">@T</span>-1)) {
        <span class="role">A</span>: <span class="context">sys.tool_used</span>[<span class="context">@t</span>]
        <span class="role">T</span>: <span class="context">sys.tool_used</span>[<span class="context">@t</span>].tool_response
    }
    <span class="role">S</span>: <span class="template">USE_TOOLS_TO_SOLVE_TASK</span>
}</pre>
            <button class="expand-btn" onclick="toggleExpand(this)">Show More</button>
          </div>
          <div class="example-card-rendered">
            <div class="rendered-output">
              <div class="prompt-title">ReactNoReasoningInHistory[<span class="idx">@T</span>]:</div>
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
              <div class="ctrl-block">
                <div class="ctrl-header">↻ ForEach <span class="idx">@t</span> : 1 ... <span class="idx">@T</span>-1</div>
                <div class="role-msg assistant">
                  <span class="role-badge">Role: Assistant</span>
                  <div class="role-body"><span class="ctx">sys.tool_used[<span class="idx">@t</span>]</span></div>
                </div>
                <div class="role-msg tool">
                  <span class="role-badge">Role: Tool</span>
                  <div class="role-body"><span class="ctx">sys.tool_used[<span class="idx">@t</span>].tool_response</span></div>
                </div>
              </div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body"><span class="tpl">USE_TOOLS_TO_SOLVE_TASK</span></div>
              </div>
            </div>
          </div>
          <div class="example-card-footer">
            <a href="#" onclick="openModal('ReAct No Reasoning', this, 'react_no_reasoning'); return false;">Preview</a>
            <a href="../visualizer.html?example=react_no_reasoning">Open in Live Editor</a>
          </div>
        </div>

        <div class="example-card">
          <div class="example-card-header">
            <h3>ReAct with Tool-RAG</h3>
            <p>ReAct pattern with dynamic tool retrieval</p>
            <div class="example-card-tags">
              <span class="tag tag-react">ReAct</span>
              <span class="tag tag-rag">RAG</span>
            </div>
          </div>
          <div class="example-card-code">
            <pre><span class="template">ReactToolRag</span>[<span class="context">@T</span>]: {
    <span class="role">S</span>: <span class="template">INSTRUCTIONS</span>
    <span class="role">U</span>: <span class="context">env.user_input</span>[<span class="context">@1</span>]
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: range(1, <span class="context">@T</span>-1)) {
        <span class="role">A</span>: {
            <span class="context">resp.tool_reasoning</span>[<span class="context">@t</span>]
            <span class="context">sys.tool_used</span>[<span class="context">@t</span>]
        }
        <span class="role">T</span>: <span class="context">sys.tool_used</span>[<span class="context">@t</span>].tool_response
    }
    <span class="role">S</span>: {
        <span class="keyword">Name</span> tools := retrieve_tools(<span class="context">env.context</span>[<span class="context">@T</span>])
        <span class="keyword">ForEach</span>(tool: $tools) { $tool.description }
        <span class="template">USE_TOOLS_TO_SOLVE_TASK</span>
    }
}</pre>
            <button class="expand-btn" onclick="toggleExpand(this)">Show More</button>
          </div>
          <div class="example-card-rendered">
            <div class="rendered-output">
              <div class="prompt-title">ReactToolRag[<span class="idx">@T</span>]:</div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body"><span class="tpl">INSTRUCTIONS</span></div>
              </div>
              <div class="role-msg user">
                <span class="role-badge">Role: User</span>
                <div class="role-body"><span class="ctx">env.user_input[<span class="idx">@1</span>]</span></div>
              </div>
              <div class="ctrl-block">
                <div class="ctrl-header">↻ ForEach <span class="idx">@t</span> : 1 ... <span class="idx">@T</span>-1</div>
                <div class="role-msg assistant">
                  <span class="role-badge">Role: Assistant</span>
                  <div class="role-body">
                    <span class="ctx">resp.tool_reasoning[<span class="idx">@t</span>]</span><br>
                    <span class="ctx">sys.tool_used[<span class="idx">@t</span>]</span>
                  </div>
                </div>
                <div class="role-msg tool">
                  <span class="role-badge">Role: Tool</span>
                  <div class="role-body"><span class="ctx">sys.tool_used[<span class="idx">@t</span>].tool_response</span></div>
                </div>
              </div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body">
                  <div class="ctrl-block">
                    <div class="ctrl-header">↻ ForEach tool : $tools</div>
                    <span class="ctx">$tool.description</span>
                  </div>
                  <span class="tpl">USE_TOOLS_TO_SOLVE_TASK</span>
                </div>
              </div>
            </div>
          </div>
          <div class="example-card-footer">
            <a href="#" onclick="openModal('ReAct Tool-RAG', this, 'react_tool_rag'); return false;">Preview</a>
            <a href="../visualizer.html?example=react_tool_rag">Open in Live Editor</a>
          </div>
        </div>
      </div>

      <div class="section-divider"></div>
      <div class="section-header">
        <h2>Real-World Systems</h2>
        <p>Production-grade agent architectures</p>
      </div>

      <div class="examples-grid">
        <div class="example-card">
          <div class="example-card-header">
            <h3>OpenCode (Claude Code-like)</h3>
            <p>Coding assistant with conversation compaction, plan mode, and tool use</p>
            <div class="example-card-tags">
              <span class="tag tag-react">ReAct</span>
              <span class="tag tag-basic">Production</span>
            </div>
          </div>
          <div class="example-card-code">
            <pre><span class="template">OpenCodeMain</span>[<span class="context">@T.I</span>]: {
  <span class="role">S</span>: {
    <span class="template">SYSTEM_PROMPT</span>
    <span class="template">ENV_INFO</span>(<span class="context">env.working_directory</span>[<span class="context">@1</span>], ...)
  }
  <span class="keyword">Mark</span> 2 {
  <span class="keyword">Name</span> C := <span class="context">sys.last_compaction_time</span>[<span class="context">@T</span>]
  <span class="keyword">If</span> <span class="context">@$C</span> &gt; 1 {
    <span class="role">U</span>: <span class="template">WHAT_DID_WE_DO</span>
    <span class="role">A</span>: <span class="context">sys.conversation_summary</span>[<span class="context">@$C</span>]
  }
  }
  <span class="keyword">ForEach</span>(<span class="context">@t</span>: range(<span class="context">@$C</span>, <span class="context">@T</span>)) {
    <span class="role">U</span>: {
      <span class="context">env.user_input</span>[<span class="context">@t</span>]
      <span class="keyword">Mark</span> 3 {
      <span class="keyword">If</span> <span class="context">@T</span> == <span class="context">@t</span> {
        <span class="keyword">If</span> <span class="context">sys.is_plan_mode</span>[<span class="context">@t</span>] { <span class="template">PLAN_MODE_REMINDER</span> }
        <span class="keyword">If</span> <span class="context">sys.is_build_mode</span>[<span class="context">@t</span>] &amp;&amp; <span class="context">sys.prev_is_plan</span>[<span class="context">@t</span>] {
          <span class="template">LEAVE_PLAN_MODE_REMINDER</span>
        }
      }
      }
    }
    <span class="keyword">PromptEndsHere</span> <span class="keyword">when</span> (<span class="context">@T</span> == <span class="context">@t</span> &amp;&amp; <span class="context">@T</span>.0)
    <span class="keyword">ForEach</span>(<span class="context">@i</span>: range(1, <span class="context">@t</span>.substeps)) {
      <span class="keyword">Mark</span> 1 {
      <span class="role">A</span>: {
        <span class="keyword">ForEach</span>(tool: <span class="context">sys.tool_requests</span>[<span class="context">@t.i</span>]) {
          tool.id_name_and_args
        }
      }
      <span class="keyword">ForEach</span>(tool: <span class="context">tool_requests</span>[<span class="context">@t.i</span>]) {
        <span class="role">T</span>: tool.id_and_response
      }
      }
      <span class="keyword">PromptEndsHere</span> <span class="keyword">when</span> (<span class="context">@T</span> == <span class="context">@t</span> &amp;&amp; <span class="context">@T</span>.I)
    }
    <span class="role">A</span>: <span class="context">sys.response</span>[<span class="context">@t</span>]
  }
}</pre>
            <button class="expand-btn" onclick="toggleExpand(this)">Show More</button>
          </div>
          <div class="example-card-rendered">
            <div class="rendered-output">
              <div class="prompt-title">OpenCodeMain[<span class="idx">@T.I</span>]:</div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body">
                  <span class="tpl">SYSTEM_PROMPT</span><br>
                  <span class="tpl">ENV_INFO</span>(<span class="ctx">env.working_directory[<span class="idx">@1</span>]</span>, ...)
                </div>
              </div>
              <div style="background: #e8f4fd; border: 1px solid #0969da; border-radius: 3px; padding: 2px 6px; margin: 4px 0; font-size: 8px; color: #0969da; font-weight: 600;">Mark 2</div>
              <div class="ctrl-block">
                <div class="ctrl-header">? If <span class="idx">@$C</span> &gt; 1</div>
                <div class="role-msg user">
                  <span class="role-badge">Role: User</span>
                  <div class="role-body"><span class="tpl">WHAT_DID_WE_DO</span></div>
                </div>
                <div class="role-msg assistant">
                  <span class="role-badge">Role: Assistant</span>
                  <div class="role-body"><span class="ctx">sys.conversation_summary[<span class="idx">@$C</span>]</span></div>
                </div>
              </div>
              <div class="ctrl-block">
                <div class="ctrl-header">↻ ForEach <span class="idx">@t</span> : <span class="idx">@$C</span> ... <span class="idx">@T</span></div>
                <div class="role-msg user">
                  <span class="role-badge">Role: User</span>
                  <div class="role-body">
                    <span class="ctx">env.user_input[<span class="idx">@t</span>]</span>
                    <div style="background: #e8f4fd; border: 1px solid #0969da; border-radius: 3px; padding: 2px 6px; margin: 4px 0; font-size: 8px; color: #0969da; font-weight: 600;">Mark 3</div>
                    <div class="ctrl-block">
                      <div class="ctrl-header">? If <span class="idx">@T</span> == <span class="idx">@t</span></div>
                      <div class="ctrl-block">
                        <div class="ctrl-header">? If sys.is_plan_mode[<span class="idx">@t</span>]</div>
                        <span class="tpl">PLAN_MODE_REMINDER</span>
                      </div>
                      <div class="ctrl-block">
                        <div class="ctrl-header">? If sys.is_build_mode[<span class="idx">@t</span>] && sys.prev_is_plan[<span class="idx">@t</span>]</div>
                        <span class="tpl">LEAVE_PLAN_MODE_REMINDER</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div style="background: #fff3cd; border: 1px solid #e5990b; border-radius: 3px; padding: 2px 6px; margin: 4px 0; font-size: 8px; color: #856404; font-weight: 500;">PromptEndsHere when (<span class="idx">@T</span> == <span class="idx">@t</span> && <span class="idx">@T</span>.0)</div>
                <div style="background: #e8f4fd; border: 1px solid #0969da; border-radius: 3px; padding: 2px 6px; margin: 4px 0; font-size: 8px; color: #0969da; font-weight: 600;">Mark 1</div>
                <div class="ctrl-block">
                  <div class="ctrl-header">↻ ForEach <span class="idx">@i</span> : 1 ... <span class="idx">@t</span>.substeps</div>
                  <div class="role-msg assistant">
                    <span class="role-badge">Role: Assistant</span>
                    <div class="role-body">
                      <div class="ctrl-block">
                        <div class="ctrl-header">↻ ForEach tool : sys.tool_requests[<span class="idx">@t.i</span>]</div>
                        <span class="ctx">tool.id_name_and_args</span>
                      </div>
                    </div>
                  </div>
                  <div class="ctrl-block">
                    <div class="ctrl-header">↻ ForEach tool : tool_requests[<span class="idx">@t.i</span>]</div>
                    <div class="role-msg tool">
                      <span class="role-badge">Role: Tool</span>
                      <div class="role-body"><span class="ctx">tool.id_and_response</span></div>
                    </div>
                  </div>
                  <div style="background: #fff3cd; border: 1px solid #e5990b; border-radius: 3px; padding: 2px 6px; margin: 4px 0; font-size: 8px; color: #856404; font-weight: 500;">PromptEndsHere when (<span class="idx">@T</span> == <span class="idx">@t</span> && <span class="idx">@T</span>.I)</div>
                </div>
                <div class="role-msg assistant">
                  <span class="role-badge">Role: Assistant</span>
                  <div class="role-body"><span class="ctx">sys.response[<span class="idx">@t</span>]</span></div>
                </div>
              </div>
            </div>
          </div>
          <div class="example-card-footer">
            <a href="#" onclick="openModal('OpenCode', this, 'opencode'); return false;">Preview</a>
            <a href="../visualizer.html?example=opencode">Open in Live Editor</a>
          </div>
        </div>

        <div class="example-card">
          <div class="example-card-header">
            <h3>OpenClaw</h3>
            <p>Persistent agent with heartbeat timer, pending messages, and memory</p>
            <div class="example-card-tags">
              <span class="tag tag-react">ReAct</span>
            </div>
          </div>
          <div class="example-card-code">
            <pre><span class="template">OpenClaw</span>[<span class="context">@T.I</span>]: {
  <span class="role">S</span>: <span class="template">SystemPrompt</span>()
  <span class="keyword">Mark</span> 2 {
  <span class="keyword">Name</span> C := <span class="context">sys.last_compaction_time</span>[<span class="context">@T</span>]
  <span class="keyword">If</span> (<span class="context">@$C</span> &gt; 1) {
    <span class="role">U</span>: { <span class="template">THIS_IS_A_SUMMARY</span>  <span class="context">sys.conversation_summary</span>[<span class="context">@$C</span>] }
    <span class="role">A</span>: <span class="context">resp.response</span>[<span class="context">@$C</span>]
  }
  }
  <span class="keyword">ForEach</span>(t: range(<span class="context">@$C</span> + 1, <span class="context">@T</span>)) {
    <span class="role">U</span>: {
      <span class="keyword">Mark</span> 6 {
      <span class="keyword">ForEach</span>(m: range(1, <span class="context">sys.pending_messages</span>[<span class="context">@t</span>].len)) {
        <span class="context">sys.pending_messages</span>[<span class="context">@t</span>][m].date_time
        <span class="context">sys.pending_messages</span>[<span class="context">@t</span>][m].message
      }
      }
      <span class="keyword">Mark</span> 5 {
      <span class="keyword">Switch</span> <span class="context">env.input_source</span>[<span class="context">@t</span>] {
        <span class="keyword">Case</span> user: { <span class="keyword">Mark</span> 4 { <span class="context">sys.date_time</span>[<span class="context">@t</span>] } <span class="context">env.user_query</span>[<span class="context">@t</span>] }
        <span class="keyword">Case</span> heartbeat_timer: { <span class="template">HEARTBEAT_INSTRUCTIONS</span> }
      }
      }
    }
    <span class="keyword">PromptEndsHere</span> <span class="keyword">when</span> (<span class="context">@t</span> == <span class="context">@T</span> &amp;&amp; T.0)
    <span class="keyword">ForEach</span>(i: range(1, <span class="context">@t</span>.substeps)) {
      <span class="keyword">Mark</span> 1 {
      <span class="role">A</span>: {
        <span class="keyword">ForEach</span>(tool: <span class="context">sys.tool_requests</span>[<span class="context">@t.i</span>]) {
          tool.id_name_and_arg
        }
      }
      <span class="keyword">ForEach</span>(tool: <span class="context">sys.tool_requests</span>[<span class="context">@t.i</span>]) {
        <span class="role">T</span>: tool.id_and_response
      }
      }
      <span class="keyword">PromptEndsHere</span> <span class="keyword">when</span> (<span class="context">@t</span> == <span class="context">@T</span> &amp;&amp; <span class="context">@T</span>.I)
    }
    <span class="role">A</span>: <span class="context">resp.response</span>[<span class="context">@t</span>]
  }
}</pre>
            <button class="expand-btn" onclick="toggleExpand(this)">Show More</button>
          </div>
          <div class="example-card-rendered">
            <div class="rendered-output">
              <div class="prompt-title">OpenClaw[<span class="idx">@T.I</span>]:</div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body"><span class="tpl">SystemPrompt</span>()</div>
              </div>
              <div style="background: #e8f4fd; border: 1px solid #0969da; border-radius: 3px; padding: 2px 6px; margin: 4px 0; font-size: 8px; color: #0969da; font-weight: 600;">Mark 2</div>
              <div class="ctrl-block">
                <div class="ctrl-header">? If <span class="idx">@$C</span> &gt; 1</div>
                <div class="role-msg user">
                  <span class="role-badge">Role: User</span>
                  <div class="role-body">
                    <span class="tpl">THIS_IS_A_SUMMARY</span><br>
                    <span class="ctx">sys.conversation_summary[<span class="idx">@$C</span>]</span>
                  </div>
                </div>
                <div class="role-msg assistant">
                  <span class="role-badge">Role: Assistant</span>
                  <div class="role-body"><span class="ctx">resp.response[<span class="idx">@$C</span>]</span></div>
                </div>
              </div>
              <div class="ctrl-block">
                <div class="ctrl-header">↻ ForEach t : <span class="idx">@$C</span> + 1 ... <span class="idx">@T</span></div>
                <div class="role-msg user">
                  <span class="role-badge">Role: User</span>
                  <div class="role-body">
                    <div style="background: #e8f4fd; border: 1px solid #0969da; border-radius: 3px; padding: 2px 6px; margin: 4px 0; font-size: 8px; color: #0969da; font-weight: 600;">Mark 6</div>
                    <div class="ctrl-block">
                      <div class="ctrl-header">↻ ForEach m : 1 ... sys.pending_messages[<span class="idx">@t</span>].len</div>
                      <span class="ctx">sys.pending_messages[<span class="idx">@t</span>][m].date_time</span><br>
                      <span class="ctx">sys.pending_messages[<span class="idx">@t</span>][m].message</span>
                    </div>
                    <div style="background: #e8f4fd; border: 1px solid #0969da; border-radius: 3px; padding: 2px 6px; margin: 4px 0; font-size: 8px; color: #0969da; font-weight: 600;">Mark 5</div>
                    <div class="ctrl-block">
                      <div class="ctrl-header">⇢ Switch env.input_source[<span class="idx">@t</span>]</div>
                      <div style="padding-left: 8px; border-left: 1px dashed #adb5bd;">
                        <span class="cmt">Case user:</span> <span style="background: #e8f4fd; border: 1px solid #0969da; border-radius: 3px; padding: 1px 4px; font-size: 7px; color: #0969da; font-weight: 600;">Mark 4</span> <span class="ctx">sys.date_time[<span class="idx">@t</span>]</span> <span class="ctx">env.user_query[<span class="idx">@t</span>]</span><br>
                        <span class="cmt">Case heartbeat_timer:</span> <span class="tpl">HEARTBEAT_INSTRUCTIONS</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div style="background: #fff3cd; border: 1px solid #e5990b; border-radius: 3px; padding: 2px 6px; margin: 4px 0; font-size: 8px; color: #856404; font-weight: 500;">PromptEndsHere when (<span class="idx">@t</span> == <span class="idx">@T</span> && T.0)</div>
                <div style="background: #e8f4fd; border: 1px solid #0969da; border-radius: 3px; padding: 2px 6px; margin: 4px 0; font-size: 8px; color: #0969da; font-weight: 600;">Mark 1</div>
                <div class="ctrl-block">
                  <div class="ctrl-header">↻ ForEach i : 1 ... <span class="idx">@t</span>.substeps</div>
                  <div class="role-msg assistant">
                    <span class="role-badge">Role: Assistant</span>
                    <div class="role-body">
                      <div class="ctrl-block">
                        <div class="ctrl-header">↻ ForEach tool : sys.tool_requests[<span class="idx">@t.i</span>]</div>
                        <span class="ctx">tool.id_name_and_arg</span>
                      </div>
                    </div>
                  </div>
                  <div class="ctrl-block">
                    <div class="ctrl-header">↻ ForEach tool : sys.tool_requests[<span class="idx">@t.i</span>]</div>
                    <div class="role-msg tool">
                      <span class="role-badge">Role: Tool</span>
                      <div class="role-body"><span class="ctx">tool.id_and_response</span></div>
                    </div>
                  </div>
                  <div style="background: #fff3cd; border: 1px solid #e5990b; border-radius: 3px; padding: 2px 6px; margin: 4px 0; font-size: 8px; color: #856404; font-weight: 500;">PromptEndsHere when (<span class="idx">@t</span> == <span class="idx">@T</span> && <span class="idx">@T</span>.I)</div>
                </div>
                <div class="role-msg assistant">
                  <span class="role-badge">Role: Assistant</span>
                  <div class="role-body"><span class="ctx">resp.response[<span class="idx">@t</span>]</span></div>
                </div>
              </div>
            </div>
          </div>
          <div class="example-card-footer">
            <a href="#" onclick="openModal('OpenClaw', this, 'openclaw'); return false;">Preview</a>
            <a href="../visualizer.html?example=openclaw">Open in Live Editor</a>
          </div>
        </div>

        <div class="example-card">
          <div class="example-card-header">
            <h3>Pokemon Agent</h3>
            <p>Game-playing agent with hierarchical summarization and critique</p>
            <div class="example-card-tags">
              <span class="tag tag-react">ReAct</span>
              <span class="tag tag-rag">Memory</span>
            </div>
          </div>
          <div class="example-card-code">
            <pre><span class="template">Pokemon</span>[<span class="context">@T</span>]: {
  <span class="role">U</span>: <span class="context">env.image.HUD</span> <span class="comment">// heads up display screenshot</span>
  <span class="role">S</span>: { <span class="template">INTRO</span> <span class="template">GOAL</span> <span class="template">CONVENTIONS</span> <span class="template">AVAILABLE_TOOLS</span> }
  <span class="role">A</span>: {
    <span class="keyword">If</span> <span class="context">@T</span>&gt;1 {
      <span class="keyword">ForEach</span>(i: range(<span class="context">@T</span>-(<span class="context">@T</span>%100),<span class="context">@T</span>-1)) {
        <span class="context">resp.action</span>[<span class="context">@i</span>]
      }
      <span class="keyword">If</span> <span class="context">@T</span>%100==0 {
        <span class="keyword">Name</span> actions := [<span class="context">resp.action</span>[<span class="context">@t</span>] <span class="keyword">for</span> t <span class="keyword">in</span> range(<span class="context">@T</span>-100, <span class="context">@T</span>)]
        summarize($actions)
      }
    }
  }
  <span class="keyword">If</span> <span class="context">@T</span>%25==0 {
    <span class="role">A</span>: critique_performance(<span class="context">sys.history</span>[<span class="context">@T</span>])
  }
  <span class="role">U</span>: <span class="context">env.xml_map</span>[<span class="context">@T</span>]
  <span class="role">S</span>: <span class="template">INSTRUCTION_TO_EXPLORE</span>
  <span class="role">S</span>: <span class="template">CHOOSE_ACTION</span>
}</pre>
            <button class="expand-btn" onclick="toggleExpand(this)">Show More</button>
          </div>
          <div class="example-card-rendered">
            <div class="rendered-output">
              <div class="prompt-title">Pokemon[<span class="idx">@T</span>]:</div>
              <div class="role-msg user">
                <span class="role-badge">Role: User</span>
                <div class="role-body"><span class="ctx">env.image.HUD</span> <span class="cmt">// heads up display screenshot</span></div>
              </div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body">
                  <span class="tpl">INTRO</span> <span class="tpl">GOAL</span> <span class="tpl">CONVENTIONS</span> <span class="tpl">AVAILABLE_TOOLS</span>
                </div>
              </div>
              <div class="role-msg assistant">
                <span class="role-badge">Role: Assistant</span>
                <div class="role-body">
                  <div class="ctrl-block">
                    <div class="ctrl-header">? If <span class="idx">@T</span> &gt; 1</div>
                    <div class="ctrl-block">
                      <div class="ctrl-header">↻ ForEach i : <span class="idx">@T</span>-(<span class="idx">@T</span>%100) ... <span class="idx">@T</span>-1</div>
                      <span class="ctx">resp.action[<span class="idx">@i</span>]</span>
                    </div>
                    <div class="ctrl-block">
                      <div class="ctrl-header">? If <span class="idx">@T</span>%100 == 0</div>
                      <span class="ctx">summarize($actions)</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="ctrl-block">
                <div class="ctrl-header">? If <span class="idx">@T</span>%25 == 0</div>
                <div class="role-msg assistant">
                  <span class="role-badge">Role: Assistant</span>
                  <div class="role-body"><span class="ctx">critique_performance(sys.history[<span class="idx">@T</span>])</span></div>
                </div>
              </div>
              <div class="role-msg user">
                <span class="role-badge">Role: User</span>
                <div class="role-body"><span class="ctx">env.xml_map[<span class="idx">@T</span>]</span></div>
              </div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body"><span class="tpl">INSTRUCTION_TO_EXPLORE</span></div>
              </div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body"><span class="tpl">CHOOSE_ACTION</span></div>
              </div>
            </div>
          </div>
          <div class="example-card-footer">
            <a href="#" onclick="openModal('Pokemon Agent', this, 'pokemon'); return false;">Preview</a>
            <a href="../visualizer.html?example=pokemon">Open in Live Editor</a>
          </div>
        </div>

        <div class="example-card">
          <div class="example-card-header">
            <h3>Multi-Agent Simulation</h3>
            <p>Agent with memory, peer awareness, and conversation handling</p>
            <div class="example-card-tags">
              <span class="tag tag-multiagent">Multi-Agent</span>
            </div>
          </div>
          <div class="example-card-code">
            <pre><span class="comment">// agent is self, agent2 is who we converse with</span>
<span class="template">MultiAgent</span>[<span class="context">@T</span>, agent]: {
  <span class="role">S</span>: <span class="template">INSTRUCTIONS</span>
  <span class="role">U</span>: {
    <span class="comment">// history (last 50 actions)</span>
    <span class="keyword">ForEach</span>(<span class="context">@t</span>: range(<span class="context">@T</span>-50, <span class="context">@T</span>-1)) {
      <span class="context">sys</span>[agent].performed_action[<span class="context">@t</span>]
      <span class="context">sys</span>[agent].performed_action[<span class="context">@t</span>].result
    }
    <span class="context">sys</span>[agent].inventory[<span class="context">@T</span>]
    <span class="comment">// whom I see and what I know</span>
    <span class="keyword">ForEach</span>(a: <span class="context">env.seen_actors</span>[<span class="context">@T</span>]) {
      a.name  a.description
      retrieve(<span class="context">sys</span>[agent].memory[<span class="context">@T</span>], a.name)
    }
    <span class="keyword">If</span> <span class="context">sys</span>[agent].in_conversation[<span class="context">@T</span>] {
      <span class="keyword">ForEach</span>(convTurn: <span class="context">sys</span>[agent].conversation[<span class="context">@T</span>]) {
        convTurn.speaker  convTurn.content
      }
    }
  }
  <span class="role">S</span>: {
    <span class="context">sys</span>[agent].available_actions
    <span class="keyword">If</span> <span class="context">sys</span>[agent].in_conversation[<span class="context">@T</span>] {
      <span class="template">CONTINUE_THE_CONVERSATION</span>
    }
  }
}</pre>
            <button class="expand-btn" onclick="toggleExpand(this)">Show More</button>
          </div>
          <div class="example-card-rendered">
            <div class="rendered-output">
              <div class="prompt-title">MultiAgent[<span class="idx">@T</span>, agent]:</div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body"><span class="tpl">INSTRUCTIONS</span></div>
              </div>
              <div class="role-msg user">
                <span class="role-badge">Role: User</span>
                <div class="role-body">
                  <span class="cmt">// history (last 50 actions)</span>
                  <div class="ctrl-block">
                    <div class="ctrl-header">↻ ForEach <span class="idx">@t</span> : <span class="idx">@T</span>-50 ... <span class="idx">@T</span>-1</div>
                    <span class="ctx">sys[agent].performed_action[<span class="idx">@t</span>]</span><br>
                    <span class="ctx">sys[agent].performed_action[<span class="idx">@t</span>].result</span>
                  </div>
                  <span class="ctx">sys[agent].inventory[<span class="idx">@T</span>]</span>
                  <span class="cmt">// whom I see and what I know</span>
                  <div class="ctrl-block">
                    <div class="ctrl-header">↻ ForEach a : env.seen_actors[<span class="idx">@T</span>]</div>
                    <span class="ctx">a.name</span> <span class="ctx">a.description</span><br>
                    <span class="ctx">retrieve(sys[agent].memory[<span class="idx">@T</span>], a.name)</span>
                  </div>
                  <div class="ctrl-block">
                    <div class="ctrl-header">? If sys[agent].in_conversation[<span class="idx">@T</span>]</div>
                    <div class="ctrl-block">
                      <div class="ctrl-header">↻ ForEach convTurn : sys[agent].conversation[<span class="idx">@T</span>]</div>
                      <span class="ctx">convTurn.speaker</span> <span class="ctx">convTurn.content</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="role-msg system">
                <span class="role-badge">Role: System</span>
                <div class="role-body">
                  <span class="ctx">sys[agent].available_actions</span>
                  <div class="ctrl-block">
                    <div class="ctrl-header">? If sys[agent].in_conversation[<span class="idx">@T</span>]</div>
                    <span class="tpl">CONTINUE_THE_CONVERSATION</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="example-card-footer">
            <a href="#" onclick="openModal('Multi-Agent', this, 'multiagent'); return false;">Preview</a>
            <a href="../visualizer.html?example=multiagent">Open in Live Editor</a>
          </div>
        </div>
      </div>

      <div class="more-link">
        <p>More examples available in the <a href="https://github.com/acdlang26/acdl/tree/main/Prompts" class="external">GitHub repository</a></p>
      </div>
    </div>
  </section>
