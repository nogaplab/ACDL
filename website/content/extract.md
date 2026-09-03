---
title: Extract ACDL from a Repo - ACDL
---

  <section class="hero">
    <h1>Extract ACDL from a Repo</h1>
    <p>Point the extractor at any agent codebase and get back the ACDL specification of how it assembles context — with a line-by-line evidence table.</p>
  </section>

  <section class="extract-section">
    <div class="extract-container">
      <form class="url-form" id="urlForm" autocomplete="off">
        <label for="repoUrl">Repository</label>
        <div class="url-row">
          <input
            type="text"
            id="repoUrl"
            name="repoUrl"
            placeholder="https://github.com/owner/agent-repo"
            spellcheck="false"
            aria-describedby="urlHint">
          <button type="submit" class="btn btn-primary">Generate</button>
        </div>
        <p class="url-hint" id="urlHint">HTTPS, SSH, or just <span class="code-inline">owner/repo</span>. GitHub, GitLab, Bitbucket, or any git host.</p>
        <p class="url-error" id="urlError" hidden></p>
      </form>

      <div class="examples-row">
        <span>Try:</span>
        <button type="button" class="example-chip" data-url="https://github.com/nogaplab/ACDL">nogaplab/ACDL</button>
        <button type="button" class="example-chip" data-url="https://github.com/openai/swarm">openai/swarm</button>
        <button type="button" class="example-chip" data-url="git@github.com:owner/private-agent.git">SSH form</button>
      </div>

      <div class="result" id="result" hidden>
        <div class="result-head">
          <div class="result-target">
            <span class="result-label">Target</span>
            <span class="result-repo" id="resultRepo"></span>
          </div>
          <div class="tabs" role="tablist">
            <button class="tab is-active" role="tab" data-tab="cc">Claude Code</button>
            <button class="tab" role="tab" data-tab="api">Python + API key</button>
            <button class="tab" role="tab" data-tab="gha">GitHub Actions</button>
          </div>
        </div>

        <div class="tab-panel is-active" id="panel-cc">
          <p class="panel-note">Runs through the Claude Code CLI, so it bills your Claude subscription rather than API credits. Needs <span class="code-inline">claude</span> on your PATH and <span class="code-inline">node</span> for the run capture.</p>
          <div class="code-block">
            <button class="copy-btn" data-copy="code-cc">Copy</button>
            <pre id="code-cc"></pre>
          </div>
        </div>

        <div class="tab-panel" id="panel-api">
          <p class="panel-note">The standalone runner. Bills your Anthropic API key; add <span class="code-inline">--dry-run</span> to see the assembled prompt without spending anything.</p>
          <div class="code-block">
            <button class="copy-btn" data-copy="code-api">Copy</button>
            <pre id="code-api"></pre>
          </div>
        </div>

        <div class="tab-panel" id="panel-gha">
          <p class="panel-note">Commit this workflow to the repo and run it from the Actions tab. It runs on your Actions minutes with your <span class="code-inline">ANTHROPIC_API_KEY</span> secret, and leaves the spec as a downloadable artifact.</p>
          <div class="gha-actions" id="ghaActions"></div>
          <div class="code-block">
            <button class="copy-btn" data-copy="code-gha">Copy</button>
            <pre id="code-gha"></pre>
          </div>
          <p class="gha-hosted">Can't commit to the repo you want to analyze? <a href="https://github.com/nogaplab/ACDL/fork" class="external">Fork the ACDL repo</a>, add the same secret there, and run its <a href="https://github.com/nogaplab/ACDL/actions/workflows/acdl-extract.yml" class="external">ACDL extract</a> workflow with any public repository as the input.</p>
        </div>

        <div class="result-foot">
          <div class="deliverable">
            <span class="deliverable-name">&lt;AgentName&gt;.acdl</span>
            <span>The specification — one spec per structurally distinct prompt</span>
          </div>
          <div class="deliverable">
            <span class="deliverable-name">extraction-report.md</span>
            <span>Evidence table: a <span class="code-inline">file:line</span> for every spec line, plus the uncertainties to check first</span>
          </div>
          <div class="deliverable">
            <span class="deliverable-name">transcript.json</span>
            <span>Every turn of the run, so any conclusion can be audited</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="section how-section">
    <div class="container">
      <div class="section-header">
        <h2>What the extractor does</h2>
        <p>Reverse-engineers the message array your agent builds before every model call</p>
      </div>

      <div class="features-grid">
        <div class="feature-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          <h3>Reads source, not docs</h3>
          <p>It works from the code that actually assembles the prompt. READMEs describe intent; the message array is the ground truth.</p>
        </div>
        <div class="feature-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <h3>Never runs your code</h3>
          <p>Read-only file access, scoped to the checkout. Nothing in the target is executed or modified — the deliverables land in a separate output directory.</p>
        </div>
        <div class="feature-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
          <h3>Cites its evidence</h3>
          <p>Every line of the emitted spec is traced to a file and line number in the report, so you can check the extraction instead of trusting it.</p>
        </div>
        <div class="feature-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <h3>Takes a few minutes</h3>
          <p>A real extraction is a long agentic run over the whole codebase — minutes of wall time and a few dollars of tokens, not an instant answer.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section next-section">
    <div class="container">
      <div class="section-header">
        <h2>Then what?</h2>
        <p>The spec is a normal <span class="code-inline">.acdl</span> file — the rest of the toolchain takes it from there</p>
      </div>
      <div class="next-grid">
        <a class="next-card" href="{{BASE}}visualizer.html">
          <h3>Render it</h3>
          <p>Open the spec in the Live Editor to see the prompt structure laid out visually.</p>
        </a>
        <a class="next-card" href="{{BASE}}vscode.html">
          <h3>Edit it</h3>
          <p>The VSCode extension gives syntax highlighting, diagnostics and an inline preview.</p>
        </a>
        <a class="next-card" href="{{BASE}}diff.html">
          <h3>Diff it</h3>
          <p>Extract again after a refactor and diff the two specs to see what changed in the context.</p>
        </a>
      </div>
    </div>
  </section>
