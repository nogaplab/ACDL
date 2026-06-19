---
title: VSCode Extension - ACDL
---

  <section class="hero">
    <h1>VSCode Extension</h1>
    <p>Full language support for ACDL with syntax highlighting, live diagnostics, and instant preview</p>
    <div class="hero-buttons">
      <a href="https://marketplace.visualstudio.com/items?itemName=NogaPelegPelc.acdl-language" class="btn btn-primary" target="_blank">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
        </svg>
        Install from Marketplace
      </a>
      <a href="{{BASE}}acdl-language-0.1.2.vsix" download="acdl-language-0.1.2.vsix" class="btn btn-secondary">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Download VSIX
      </a>
    </div>
  </section>

  <section class="section install-section">
    <div class="container">
      <div class="section-header">
        <h2>Installation</h2>
        <p>Install the extension in seconds</p>
      </div>

      <div class="install-grid">
        <div class="install-card install-card-featured">
          <h3>VSCode Marketplace (Recommended)</h3>
          <ol class="install-steps">
            <li>
              <span class="step-num">1</span>
              <span>Open VSCode and press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd></span>
            </li>
            <li>
              <span class="step-num">2</span>
              <span>Search for <strong>"ACDL"</strong></span>
            </li>
            <li>
              <span class="step-num">3</span>
              <span>Click Install</span>
            </li>
          </ol>
          <a href="https://marketplace.visualstudio.com/items?itemName=NogaPelegPelc.acdl-language" class="install-link" target="_blank">View on Marketplace →</a>
        </div>
        <div class="install-card">
          <h3>Command Line</h3>
          <div class="install-code">
            code --install-extension acdl-language-0.1.2.vsix
          </div>
        </div>
        <div class="install-card">
          <h3>Manual VSIX Install</h3>
          <ol class="install-steps">
            <li>
              <span class="step-num">1</span>
              <span>Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd></span>
            </li>
            <li>
              <span class="step-num">2</span>
              <span>Type "Extensions: Install from VSIX"</span>
            </li>
            <li>
              <span class="step-num">3</span>
              <span>Select the downloaded .vsix file</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  </section>

  <section class="section features-section">
    <div class="container">
      <div class="section-header">
        <h2>Features</h2>
        <p>Everything you need for productive ACDL development</p>
      </div>

      <div class="features-grid">
        <div class="feature-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          <h3>Syntax Highlighting</h3>
          <p>Color-coded keywords, roles, templates, context variables, and comments</p>
        </div>
        <div class="feature-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h3>Live Diagnostics</h3>
          <p>Parse errors shown as red underlines in real-time as you type</p>
        </div>
        <div class="feature-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
          </svg>
          <h3>Live Preview</h3>
          <p>Visualization panel that updates automatically as you edit</p>
        </div>
        <div class="feature-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <h3>Go-to-Definition</h3>
          <p>Click prompt.X references to jump to label definitions</p>
        </div>
        <div class="feature-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <h3>Bracket Matching</h3>
          <p>Auto-closing pairs and matching bracket highlighting</p>
        </div>
        <div class="feature-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="4" y1="9" x2="20" y2="9"></line>
            <line x1="4" y1="15" x2="20" y2="15"></line>
            <line x1="10" y1="3" x2="8" y2="21"></line>
            <line x1="16" y1="3" x2="14" y2="21"></line>
          </svg>
          <h3>Code Folding</h3>
          <p>Collapse and expand blocks for easier navigation</p>
        </div>
      </div>
    </div>
  </section>
