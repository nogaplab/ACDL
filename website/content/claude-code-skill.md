---
title: ACDL to Code - Claude Code Skill
---

  <section class="hero">
    <h1>Generate Code from ACDL</h1>
    <p>Use this skill file to teach Claude Code how to implement LLM agent systems from your ACDL specifications. Write the ACDL, get the code skeleton.</p>
    <div class="hero-buttons">
      <a href="acdl-skill.md" download="acdl-skill.md" class="btn btn-primary">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download Skill File
      </a>
      <a href="visualizer.html" class="btn btn-secondary">Try Live Editor</a>
    </div>
  </section>

  <section class="skill-section">
    <div class="skill-container">
      <div class="skill-header">
        <h2>acdl-skill.md</h2>
        <div class="skill-actions">
          <button class="btn-icon" id="copyBtn" onclick="copySkillContent()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span id="copyText">Copy</span>
          </button>
          <a href="acdl-skill.md" download="acdl-skill.md" class="btn-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download
          </a>
        </div>
      </div>
      <div class="skill-box">
        <pre class="skill-content" id="skillContent">Loading skill content...</pre>
      </div>
    </div>
  </section>

  <section class="section instructions-section">
    <div class="container">
      <div class="section-header">
        <h2>Workflow</h2>
        <p>From ACDL specification to working code</p>
      </div>

      <div class="instructions-grid">
        <div class="instruction-card">
          <h3>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            Step 1: Write Your ACDL
          </h3>
          <ol class="instruction-steps">
            <li>
              <span class="step-num">1</span>
              <span>Use the <a href="visualizer.html" style="color: #7877c6;">Live Editor</a> to write your ACDL spec</span>
            </li>
            <li>
              <span class="step-num">2</span>
              <span>Preview the prompt structure visually</span>
            </li>
            <li>
              <span class="step-num">3</span>
              <span>Copy your finished ACDL specification</span>
            </li>
          </ol>
        </div>
        <div class="instruction-card">
          <h3>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            Step 2: Generate Code
          </h3>
          <ol class="instruction-steps">
            <li>
              <span class="step-num">1</span>
              <span>Download the skill file or copy it above</span>
            </li>
            <li>
              <span class="step-num">2</span>
              <span>In Claude Code, attach with <span class="code-inline">@acdl-skill.md</span></span>
            </li>
            <li>
              <span class="step-num">3</span>
              <span>Paste your ACDL and ask for the implementation</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </section>

  <section class="section use-cases-section">
    <div class="container">
      <div class="section-header">
        <h2>Example Prompt</h2>
        <p>What to say after attaching the skill and your ACDL</p>
      </div>

      <div class="use-cases-grid" style="grid-template-columns: 1fr;">
        <div class="use-case-card" style="max-width: 700px; margin: 0 auto;">
          <p style="font-family: 'JetBrains Mono', monospace; font-size: 0.95rem; line-height: 1.8;">
            "Generate the Python implementation for this ACDL spec. Include:<br>
            1. All template constants and template functions<br>
            2. Appropriate data classes<br>
            3. Helper functions (stubbed with TODO)<br>
            4. The complete build_messages() function with ACDL line comments<br>
            5. A usage example"
          </p>
        </div>
      </div>
    </div>
  </section>
