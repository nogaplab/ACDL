---
title: Why ACDL? - Motivation
---

  <section class="motivation-hero">
    <h1>Describing the Contexts of Agentic LLM Systems</h1>
    <p>The structure of an agent's context is one of its most consequential design decisions&mdash;and one of the hardest to communicate.</p>
  </section>

  <div class="motivation-content">
    <div class="motivation-section">
      <p>
        An LLM agent works by making a sequence of calls to a language model. Before each call, the surrounding
        system assembles a context out of instructions, observations, accumulated history, and tool results, and
        sends it to the model. The model's response drives the next action, the state updates, and the loop
        continues. The structure of that context&mdash;which pieces appear, in what order, under which roles, and how
        all of it changes from one step to the next&mdash;is one of the most consequential design decisions in an
        agent. It is also one of the hardest things to communicate.
      </p>
    </div>

    <div class="motivation-section">
      <h2>A description that sounds precise but isn't</h2>
      <p>Here is a sentence you might find in a paper or a design doc, written the way these things usually are:</p>

      <div class="ambiguity-demo">
        <div class="desc-box">
          <p class="desc-lead"><em>In each turn:</em></p>
          <ul class="desc-list">
            <li>The agent gets a description of the task, its tools and some examples.</li>
            <li>For each of its previous turns, it gets the <span class="hl-phrase">history of the ReAct loop<span class="hl-arrow" aria-hidden="true">&uarr;</span></span></li>
          </ul>
        </div>

        <p class="ambiguous-label">This description is ambiguous</p>

        <div class="options-compare">
          <div class="option-card">
            <span class="option-badge">1</span>
            <ul>
              <li>No reasoning traces</li>
              <li>Tool calls, responses:
                <ul>
                  <li>Sent in separate messages</li>
                  <li>With different roles</li>
                </ul>
              </li>
            </ul>
          </div>
          <div class="neq" aria-hidden="true">&ne;</div>
          <div class="option-card">
            <span class="option-badge">2</span>
            <ul>
              <li>Includes reasoning traces</li>
              <li>Tool calls, responses (&amp; reasoning):
                <ul>
                  <li>Sent in one message</li>
                  <li>Assistant role</li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <p>
        Both readings honor the sentence above, yet they produce different contexts&mdash;and from the text alone you
        cannot tell which one the author meant. In ACDL, each reading is written out explicitly:
      </p>

      <figure class="comparison-figure">
        <div class="comparison-grid">
          <!-- Option 1 -->
          <div class="comparison-col">
            <div class="comparison-col-header">
              <h4>Option 1</h4>
              <p>Reasoning dropped &middot; call and response as separate messages</p>
            </div>
            <div class="rendered-output">
              <div class="prompt-title"><h1>Option1[<span class="idx">@T.I</span>]:</h1></div>
              <div class="role-msg system">
                <span class="role-badge">System</span>
                <div class="role-body">
                  <span class="tpl">TASK_DESCRIPTION</span><br>
                  <span class="ctx">env.tool_descriptions</span><br>
                  <span class="ctx">env.in_context_examples</span>
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

          <!-- Option 2 -->
          <div class="comparison-col">
            <div class="comparison-col-header">
              <h4>Option 2</h4>
              <p>Reasoning kept &middot; call and response bundled into one assistant message</p>
            </div>
            <div class="rendered-output">
              <div class="prompt-title"><h1>Option2[<span class="idx">@T.I</span>]:</h1></div>
              <div class="role-msg system">
                <span class="role-badge">System</span>
                <div class="role-body">
                  <span class="tpl">TASK_DESCRIPTION</span><br>
                  <span class="ctx">env.tool_descriptions</span><br>
                  <span class="ctx">env.in_context_examples</span>
                </div>
              </div>
              <div class="role-msg assistant">
                <span class="role-badge">Assistant</span>
                <div class="role-body">
                  <span class="cmt">// previous turns</span>
                  <div class="ctrl-block">
                    <div class="ctrl-header">ForEach <span class="idx">@t</span> : 1 ... <span class="idx">@T</span></div>
                    <div class="ctrl-block">
                      <div class="ctrl-header">ForEach <span class="idx">i</span> : 1 ... <span class="idx">@t.substeps</span></div>
                      <span class="ctx">resp.tool_reasoning[<span class="idx">@t.i</span>]</span><br>
                      <span class="ctx">sys.tool_used[<span class="idx">@t.i</span>]</span><br>
                      <span class="ctx">sys.tool_used[<span class="idx">@t.i</span>].tool_response</span>
                    </div>
                  </div>
                  <span class="cmt">// current turn</span>
                  <div class="ctrl-block">
                    <div class="ctrl-header">ForEach <span class="idx">i</span> : 1 ... <span class="idx">I</span></div>
                    <span class="ctx">resp.tool_reasoning[<span class="idx">@T.i</span>]</span><br>
                    <span class="ctx">sys.tool_used[<span class="idx">@T.i</span>]</span><br>
                    <span class="ctx">sys.tool_used[<span class="idx">@T.i</span>].tool_response</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <figcaption>
          Two context structures that both satisfy the same prose description, rendered side by side.
        </figcaption>
      </figure>
    </div>

    <div class="motivation-section">
      <h2>Why this matters</h2>
      <p>
        Today the options for describing context structure are prose, ad hoc diagrams, or the implementation code
        itself. Prose and diagrams are quick to produce but ambiguous, as the example above shows. Code is exact,
        but recovering the structure from it means reading all of it, which is arduous and rarely how anyone wants
        to communicate a design.
      </p>
      <p>
        The consequences compound. Published systems are difficult to reproduce, because the logic that assembles
        the context is left to interpretation. Systems that look similar at a high level are difficult to compare,
        because the structural choices that actually distinguish them are not visible. And within a team, there is
        no shared vocabulary to discuss how a context is built, reason about a proposed change, or carry a design
        from a whiteboard into code without loss.
      </p>
    </div>

    <div class="cta-section">
      <h3>Ready to learn ACDL?</h3>
      <div class="cta-buttons">
        <a href="tutorial.html" class="btn btn-primary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
          Start the Tutorial
        </a>
        <a href="examples/index.html" class="btn btn-secondary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          Explore Examples
        </a>
      </div>
    </div>
  </div>
