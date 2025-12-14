import {
  Prompt,
  PromptTitle,
  Index, 
  PromptBody, 
  RoleMessage, 
  RoleBuildingBlock,
  ContextVar, 
  PathDesc, 
  Func, 
  Template, 
  LoopBlockOutsideRole, 
  ConditionalBlockOutsideRole, 
  SwitchBlockOutsideRole, 
  CaseBlockOutsideRole, 
  LoopBlockInsideRole, 
  ConditionalBlockInsideRole, 
  SwitchBlockInsideRole, 
  CaseBlockInsideRole, 
  PromptBlock
} from "./types/types";


export function renderPrompt(
  prompt: Prompt,
  style: string = "default"
): string {
  const titleHtml = renderPromptTitle(prompt.title);
  const bodyHtml  = renderPromptBody(prompt.body);

  // For now, style is unused.
  // In the future, it can control:
  // - CSS class selection
  // - layout variants
  // - compact vs expanded rendering
  return `
<div class="prompt-container prompt-style-${style}">
  ${titleHtml}
  ${bodyHtml}
</div>`;
}

/**
 * Helper: escape characters that are special in HTML.
 * (So user-provided names / comments don’t break the HTML)
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPromptTitle(title: PromptTitle): string {
  const indices = title.indices ?? [];

  // Build something like:  prompt[@t][agent_name]
  const indexSuffix = indices
    .map(renderBracketedIndex)    // each becomes [@t] or [agent_name]
    .join("");

  return `
<div class="prompt-title">
  <h1>${escapeHtml(title.name)}${indexSuffix}</h1>
</div>`;
}

function renderBracketedIndex(index: Index): string {
  if (index.kind === "time-index") {
    return `[@${escapeHtml(index.name)}]`;
  }

  return `[${escapeHtml(index.name)}]`;
}

/**
 * Render the body of the prompt: an ordered list of blocks.
 */
function renderPromptBody(body: PromptBody): string {
  return body.body.map(renderTopLevelBlock).join("\n");
}

/**
 * A top-level block: RoleMessage, Conditional, Loop, or Switch.
 */
function renderTopLevelBlock(block: PromptBlock): string {
  switch (block.kind) {

    case "role-message":
      return renderRoleMessage(block);

    case "conditional-block-outside-role":
      return renderConditionalOutsideRole(block);

    case "loop-block-outside-role":
      return renderLoopOutsideRole(block);

    case "switch-block-outside-role":
      return renderSwitchOutsideRole(block);
  }
}



/**
 * Render a role message like:
 *   [system]
 *   - TEMPLATE(...)
 *   - {foreach ...}
 */
function renderRoleMessage(msg: RoleMessage): string {
  const roleClass = escapeHtml(msg.role); // "user" / "assistant" / "system"
  const bodyHtml = msg.body
    .map((b: RoleBuildingBlock) => {
      return `<div class="role-body-block">${renderRoleBuildingBlock(b)}</div>`;
    })
    .join("\n");

  return `
<div class="role-message ${roleClass}">
  <div class="role-message-header">Role: ${escapeHtml(msg.role)}</div>
  ${bodyHtml}
</div>`;
}

/**
 * Render a building block *inside* a role:
 *  - conditional-block-inside-role
 *  - loop-block-inside-role
 *  - switch-block-inside-role
 *  - template
 *  - context-var
 *  - func
 */
function renderRoleBuildingBlock(block: RoleBuildingBlock): string {
  switch (block.kind) {

    case "template":
      return renderTemplateBlock(block);

    case "context-var":
      return renderContextVarBlock(block);

    case "function":
      return renderFuncBlock(block);

    case "conditional-block-inside-role":
      return renderConditionalInsideRole(block);

    case "loop-block-inside-role":
      return renderLoopInsideRole(block);

    case "switch-block-inside-role":
      return renderSwitchInsideRole(block);

    default:
      return `<code>Error! unknown or disallowed role block</code>`;
  }
}

/**
 * Render a function call inside a role block.
 *
 * A Func block represents something like:
 *    name(arg1, arg2, ...)
 *
 * This renderer produces an inline HTML element that:
 *  - shows the function name
 *  - renders all arguments in parentheses, comma-separated
 *  - escapes all text for safety
 *  - assigns a distinct CSS class ("func-block") so functions
 *    can be styled differently from templates, context vars, etc.
 */
function renderFuncBlock(block: Func): string {
  const args = block.arguments ?? [];
  const argsText = args.map(renderTextArgs).join(", ");

  return `<span class="func-block">
    ${escapeHtml(block.name)}(${argsText})
  </span>`;
}


function renderTextArgs(arg: any): string {
  switch (arg.kind) {

    case "context-var":
      return renderContextVarBlock(arg);

    case "function":
      return renderFuncBlock(arg);

    case "time-index":
      // TimeIndex arguments are simple, just @name
      return `<span class="time-index">@${escapeHtml(arg.name)}</span>`;

    default:
      return `<span class="error-block">Error! Disallowed or unknown TextArg kind</span>`;
  }
}



/**
 * Render a Template block inside a role.
 *
 * A Template block represents a DSL call of the form:
 *    TEMPLATE_NAME(arg1, arg2, ...)
 * optionally followed by a human-readable comment.
 *
 * This renderer:
 *  - escapes the template name and its arguments for safety
 *  - formats the arguments as comma-separated inside parentheses
 *  - wraps the entire call in a <span class="template-block"> so it can be
 *    styled consistently (e.g., monospace font, shaded background)
 *  - if a comment is present, appends it in a separate <span class="comment">
 *    using a "//"-style annotation, kept inline with the template call
 *
 * Examples of rendered output:
 *    <span class="template-block">TASK_INTRO(a, b)</span>
 *    <span class="template-block">SETUP()</span><span class="comment"> // setup instructions</span>
 */
function renderTemplateBlock(block: Template): string {
  const args = block.arguments ?? [];

  const argsText =
    args.length > 0
      ? `(${args.map(renderTextArgs).join(", ")})`
      : "";

  const core = `<span class="template-block">${escapeHtml(
    block.name
  )}${argsText}</span>`;

  if (block.comment) {
    return `${core}<span class="comment"> // ${escapeHtml(block.comment)}</span>`;
  }

  return core;
}



/**
 * Render a ContextVar reference using the DSL path structure.
 *
 * ContextVar:
 *   - base: ContextBase          // "obs", "resp", "act", "mem", "prompt"
 *   - indices: Index[]           // (optional) indices directly on the root
 *   - path: PathDesc             // linked list of path segments
 *
 * PathDesc:
 *   - base: string               // segment name
 *   - indices: Index[]           // optional indices (may be empty)
 *   - next?: PathDesc            // next segment
 *
 * This supports expressions like:
 *   obs.user_question[@t].line[k]
 *   mem.summary[@t].tokens[@i][agent]
 *   act.action_name
 *
 * IMPORTANT RULE:
 *   - If a segment has *no indices*, render only its name:
 *         line       ← correct
 *         line[]     ← wrong (never render empty index lists)
 *
 * Rendering:
 *   - All text is escaped for safety.
 *   - Indices are formatted with renderBracketedIndex().
 *   - Path segments are joined by ".".
 */
function renderContextVarBlock(block: ContextVar): string {
  const segments: Array<string> = [];

  // 1. Render the ROOT segment (obs, resp, mem, etc.)
  //    If there are indices on the root, append them directly.
  const rootIndices = block.indices ?? [];
  const rootIndexText = rootIndices.length > 0
    ? rootIndices.map(renderBracketedIndex).join("")
    : "";

  segments.push(
    `<span class="segment base">${escapeHtml(block.base)}${rootIndexText}</span>`
  );

  // 2. Render every segment in the PathDesc chain.
  let current: PathDesc | undefined = block.path;
  while (current) {
    const segIndices = current.indices ?? [];
    const segIndexText =
      segIndices.length > 0
        ? segIndices.map(renderBracketedIndex).join("")
        : "";

    segments.push(
      `<span class="segment">${escapeHtml(current.base)}${segIndexText}</span>`
    );

    current = current.next;
  }

  // 3. Join segments with dots.
  const joined = segments.join(".");

  return `
<span class="context-var">
  ${joined}
</span>`;
}


/**
 * Render a LoopBlockOutsideRole (top-level loop).
 *
 * The DSL's visual format for outside-role loops is:
 *
 *    ForEach(var: range):
 *        <top-level-block>
 *        <top-level-block>
 *
 * These loops appear at the top level of the prompt structure, not inside
 * a role message. Therefore, their body elements are rendered with 
 * renderTopLevelBlock(), not renderRoleBuildingBlock().
 *
 * Examples that must be supported:
 *    ForEach(i: 1...k):
 *        RoleMessage
 *
 *    ForEach(item: set):
 *        ConditionalBlockOutsideRole
 *        LoopBlockOutsideRole
 *        SwitchBlockOutsideRole
 *
 * This renderer:
 *   - prints the exact DSL syntax "ForEach(var: range):"
 *   - delegates body rendering to renderTopLevelBlock()
 *   - nests all children visually under the loop header
 *   - escapes all text safely
 */
function renderLoopOutsideRole(block: LoopBlockOutsideRole): string {
  const indexText = block.index.name;
  const iterableText = block.iterable.value;

  const header = `ForEach(${escapeHtml(indexText)}: ${escapeHtml(iterableText)}):`;
  const bodyHtml = (block.body ?? [])
    .map((child: any) =>
      `<div class="loop-child">${renderTopLevelBlock(child)}</div>`
    )
    .join("\n");

  return `
<div class="loop-block-outside-role">
  <div class="loop-header">${header}</div>
  <div class="loop-children">
    ${bodyHtml}
  </div>
</div>`;
}


/**
 * Render a LoopBlockInsideRole.
 *
 * The DSL's visual format for inside-role loops is:
 *
 *    ForEach(var: range):
 *        <role-building-block>
 *        <role-building-block>
 *
 * Examples that must be supported:
 *    ForEach(i: 1...k):
 *    ForEach(item: set):
 *    ForEach(x: items[@t]):
 *
 * This renderer:
 *   - prints "ForEach(" + varName + ": " + range + "):" exactly as shown
 *   - delegates body rendering to renderRoleBuildingBlock(), since this
 *     loop exists *inside* a role message
 *   - nests children visually under the loop header
 *   - escapes all text for safety
 */
function renderLoopInsideRole(block: LoopBlockInsideRole): string {
  const indexText = block.index.name;
  const iterableText = block.iterable.value;

  const header = `ForEach(${escapeHtml(indexText)}: ${escapeHtml(iterableText)}):`;
  const bodyHtml = (block.body ?? [])
    .map((child: any) =>
      `<div class="role-loop-child">${renderRoleBuildingBlock(child)}</div>`
    )
    .join("\n");

  return `
<div class="loop-block-inside-role">
  <div class="loop-header">${header}</div>
  <div class="block-children">
    ${bodyHtml}
  </div>
</div>`;
}


/**
 * Render a SwitchBlockOutsideRole.
 *
 * DSL visual format:
 *
 *   Switch(expression):
 *       Case "value":
 *           <top-level-block>
 *
 *       Case "other":
 *           <top-level-block>
 *
 *       Default:
 *           <top-level-block>
 *
 * This block appears *outside* a role, so the body elements inside
 * each case are rendered with renderTopLevelBlock().
 *
 * Fields:
 *   - expression: string      // value being matched
 *   - cases: CaseBlockOutsideRole[]
 *   - defaultCase?: DefaultCaseBlockOutsideRole
 */
function renderSwitchOutsideRole(block: SwitchBlockOutsideRole): string {
  const header = `Switch(${escapeHtml(block.expression)}):`;

  const casesHtml = (block.cases ?? [])
    .map((c: CaseBlockOutsideRole) => {
      const bodyHtml = (c.body ?? [])
        .map((child: any) => 
          `<div class="switch-child">${renderTopLevelBlock(child)}</div>`
        )
        .join("\n");

      return `
<div class="switch-case">
  <div class="switch-case-header">Case "${escapeHtml(c.match)}":</div>
  <div class="block-children">
    ${bodyHtml}
  </div>
</div>`;
    })
    .join("\n");

  const defaultHtml = block.defaultCase
    ? (() => {
        const bodyHtml = (block.defaultCase!.body ?? [])
          .map((child: any) =>
            `<div class="switch-child">${renderTopLevelBlock(child)}</div>`
          )
          .join("\n");

        return `
<div class="switch-default">
  <div class="switch-default-header">Default:</div>
  <div class="block-children">
    ${bodyHtml}
  </div>
</div>`;
      })()
    : "";

  return `
<div class="switch-block-outside-role">
  <div class="switch-header">${header}</div>
  ${casesHtml}
  ${defaultHtml}
</div>`;
}


/**
 * Render a SwitchBlockInsideRole.
 *
 * DSL visual format:
 *
 *   Switch(expression):
 *       Case "value":
 *           <role-building-block>
 *
 *       Case "other":
 *           <role-building-block>
 *
 *       Default:
 *           <role-building-block>
 *
 * Because this switch appears *inside a role message*, its body elements
 * must be rendered using renderRoleBuildingBlock(), not renderTopLevelBlock().
 *
 * Fields:
 *   - expression: string
 *   - cases: CaseBlockInsideRole[]
 *   - defaultCase?: DefaultCaseBlockInsideRole
 */
function renderSwitchInsideRole(block: SwitchBlockInsideRole): string {
  const header = `Switch(${escapeHtml(block.expression)}):`;

  const casesHtml = (block.cases ?? [])
    .map((c: CaseBlockInsideRole) => {
      const bodyHtml = (c.body ?? [])
        .map((child: RoleBuildingBlock) =>
          `<div class="role-switch-child">${renderRoleBuildingBlock(child)}</div>`
        )
        .join("\n");

      return `
<div class="switch-case">
  <div class="switch-case-header">Case "${escapeHtml(c.match)}":</div>
  <div class="block-children">
    ${bodyHtml}
  </div>
</div>`;
    })
    .join("\n");

  const defaultHtml = block.defaultCase
    ? (() => {
        const bodyHtml = (block.defaultCase!.body ?? [])
          .map((child: RoleBuildingBlock) =>
            `<div class="role-switch-child">${renderRoleBuildingBlock(child)}</div>`
          )
          .join("\n");

        return `
<div class="switch-default">
  <div class="switch-default-header">Default:</div>
  <div class="block-children">
    ${bodyHtml}
  </div>
</div>`;
      })()
    : "";

  return `
<div class="switch-block-inside-role">
  <div class="switch-header">${header}</div>
  ${casesHtml}
  ${defaultHtml}
</div>`;
}


/**
 * Render a ConditionalBlockInsideRole.
 *
 * DSL visual format:
 *
 *   If (condition):
 *       <role-building-block>
 *
 *   ElseIf (condition2):
 *       <role-building-block>
 *
 *   Else:
 *       <role-building-block>
 *
 * This block appears *inside a role message*, so all children must be rendered
 * using renderRoleBuildingBlock().
 *
 * Types:
 *   - Ifcondition: string
 *   - IfBody: RoleBuildingBlock[]
 *   - elseif: string[]
 *   - elseifBody: RoleBuildingBlock[][]
 *   - elseBody?: RoleBuildingBlock[]
 */
function renderConditionalInsideRole(block: ConditionalBlockInsideRole): string {
  // --- IF ---
  const ifHeader = `If (${escapeHtml(block.Ifcondition)}):`;
  const ifBodyHtml = (block.IfBody ?? [])
    .map((child: RoleBuildingBlock) =>
      `<div class="role-condition-child">${renderRoleBuildingBlock(child)}</div>`
    )
    .join("\n");

  let fullHtml = `
<div class="conditional-block-inside-role">
  <div class="conditional-header">${ifHeader}</div>
  <div class="block-children">
    ${ifBodyHtml}
  </div>
`;

  // --- ELSEIFs ---
  const elseifConds = block.elseif ?? [];
  const elseifBodies = block.elseifBody ?? [];

  for (let i = 0; i < elseifConds.length; i++) {
    const cond = elseifConds[i];
    const body = elseifBodies[i] ?? [];

    const elseifHeader = `ElseIf (${escapeHtml(cond)}):`;
    const elseifBodyHtml = body
      .map((child: RoleBuildingBlock) =>
        `<div class="role-condition-child">${renderRoleBuildingBlock(child)}</div>`
      )
      .join("\n");

    fullHtml += `
  <div class="conditional-header">${elseifHeader}</div>
  <div class="block-children">
    ${elseifBodyHtml}
  </div>
`;
  }

  // --- ELSE ---
  if (block.elseBody && block.elseBody.length > 0) {
    const elseHeader = `Else:`;
    const elseBodyHtml = block.elseBody
      .map((child: RoleBuildingBlock) =>
        `<div class="role-condition-child">${renderRoleBuildingBlock(child)}</div>`
      )
      .join("\n");

    fullHtml += `
  <div class="conditional-header">${elseHeader}</div>
  <div class="block-children">
    ${elseBodyHtml}
  </div>
`;
  }

  // Close wrapper
  fullHtml += `</div>`;

  return fullHtml;
}


/**
 * Render a ConditionalBlockOutsideRole.
 *
 * DSL visual format:
 *
 *   If (condition):
 *       <top-level-block>
 *
 *   ElseIf (condition2):
 *       <top-level-block>
 *
 *   ElseIf (condition3):
 *       <top-level-block>
 *
 *   Else:
 *       <top-level-block>
 *
 * This block appears *outside* any role message.
 * Therefore:
 *   - its children are rendered using renderTopLevelBlock()
 *   - it may contain role messages OR other top-level blocks
 *
 * Types:
 *   - Ifcondition: string
 *   - IfBody: PromptBlock[]
 *   - elseif: string[]
 *   - elseifBody: PromptBlock[][]
 *   - elseBody?: PromptBlock[]
 */
function renderConditionalOutsideRole(block: ConditionalBlockOutsideRole): string {
  // --- IF ---
  const ifHeader = `If (${escapeHtml(block.Ifcondition)}):`;
  const ifBodyHtml = (block.IfBody ?? [])
    .map((child: any /* PromptBlock */) =>
      `<div class="conditional-child">${renderTopLevelBlock(child)}</div>`
    )
    .join("\n");

  let fullHtml = `
<div class="conditional-block-outside-role">
  <div class="conditional-header">${ifHeader}</div>
  <div class="block-children">
    ${ifBodyHtml}
  </div>
`;

  // --- ELSEIFs ---
  const elseifConds = block.elseif ?? [];
  const elseifBodies = block.elseifBody ?? [];

  for (let i = 0; i < elseifConds.length; i++) {
    const cond = elseifConds[i];
    const body = elseifBodies[i] ?? [];

    const elseifHeader = `ElseIf (${escapeHtml(cond)}):`;
    const elseifBodyHtml = body
      .map((child: any /* PromptBlock */) =>
        `<div class="conditional-child">${renderTopLevelBlock(child)}</div>`
      )
      .join("\n");

    fullHtml += `
  <div class="conditional-header">${elseifHeader}</div>
  <div class="block-children">
    ${elseifBodyHtml}
  </div>
`;
  }

  // --- ELSE ---
  if (block.elseBody && block.elseBody.length > 0) {
    const elseHeader = `Else:`;
    const elseBodyHtml = block.elseBody
      .map((child: any /* PromptBlock */) =>
        `<div class="conditional-child">${renderTopLevelBlock(child)}</div>`
      )
      .join("\n");

    fullHtml += `
  <div class="conditional-header">${elseHeader}</div>
  <div class="block-children">
    ${elseBodyHtml}
  </div>
`;
  }

  // close outer wrapper
  fullHtml += `</div>`;

  return fullHtml;
}
