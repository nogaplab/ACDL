import {
  Prompt,
  PromptTitle,
  Index,
  IndexValue,
  Identifier,
  PromptBody,
  ChatPromptBody,
  CompletionPromptBody,
  NoneMessage,
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
  PromptBlock,
  TextArgs,
  CommentBlock,
  LabelBlock,
  MarkBlock,
  MarkBlockInsideRole,
  ExpressionToken,
  Iterable,
  RangeExpr,
  NameDef,
  NameRef,
  ListComprehension,
  EndBlock,
} from "./types";


function wrapBlock(
  cls: string,
  headerHtml: string,
  bodyHtml: string
): string {
  return `
<div class="${cls}">
  <div class="${cls}-header">${headerHtml}</div>
  <div class="block-children">
    ${bodyHtml}
  </div>
</div>`;
}


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
  return `<div class="prompt-container prompt-style-${style}">${titleHtml}${bodyHtml}</div>`;
}

/**
 * Render multiple prompts and comments from a file.
 * Prompts are separated by dividers, comments appear inline.
 */
export function renderPrompts(
  blocks: (Prompt | CommentBlock)[],
  style: string = "default"
): string {
  const parts: string[] = [];
  let lastWasPrompt = false;

  for (const block of blocks) {
    if (block.kind === "prompt") {
      // Add divider before prompt if previous block was also a prompt
      if (lastWasPrompt) {
        parts.push('<div class="prompt-divider"></div>');
      }
      parts.push(renderPrompt(block, style));
      lastWasPrompt = true;
    } else if (block.kind === "comment-block") {
      parts.push(`<div class="file-comment">// ${escapeHtml(block.text)}</div>`);
      lastWasPrompt = false;
    }
  }

  return parts.join('');
}

/**
 * Helper: escape characters that are special in HTML.
 * (So user-provided names / comments don't break the HTML)
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render an array of expression tokens with syntax highlighting.
 * Maps token types to appropriate CSS classes for consistent coloring.
 * Recognizes context var patterns (env.foo, sys.bar(x), etc.) and renders them as a unit.
 */
function renderExpressionTokens(tokens: ExpressionToken[]): string {
  const result: string[] = [];
  let i = 0;

  // Check if expression contains and/or - if so, we'll wrap sub-expressions in parens
  const hasLogicalOps = tokens.some(t => t.type === "IDENT" && (t.value === "and" || t.value === "or"));
  if (hasLogicalOps) {
    result.push("(");
  }

  while (i < tokens.length) {
    const tok = tokens[i];

    // Check for context var pattern: namespace keyword followed by dot
    if (tok.type === "KEYWORD" &&
        ["env", "sys", "resp", "prompt"].includes(tok.value) &&
        i + 1 < tokens.length &&
        tokens[i + 1].type === "SYMBOL" &&
        tokens[i + 1].value === ".") {

      // Collect all tokens that form the context var path
      const contextVarTokens: string[] = [tok.value];
      i++;

      // Track bracket/paren depth to handle nested structures
      let parenDepth = 0;
      let bracketDepth = 0;

      while (i < tokens.length) {
        const t = tokens[i];

        // Track nesting
        if (t.value === "(") parenDepth++;
        if (t.value === ")") parenDepth--;
        if (t.value === "[") bracketDepth++;
        if (t.value === "]") bracketDepth--;

        // Check for @ followed by identifier (time index pattern)
        if (t.value === "@" && i + 1 < tokens.length) {
          const nextTok = tokens[i + 1];
          if (nextTok.type === "IDENT" || nextTok.type === "NUMBER") {
            // Collect the full time index (e.g., @i, @t, @i.k)
            let timeIndexName = escapeHtml(nextTok.value);
            i += 2; // skip @ and the identifier

            // Check for compound indices like @i.k
            while (i < tokens.length && tokens[i].value === "." &&
                   i + 1 < tokens.length &&
                   (tokens[i + 1].type === "IDENT" || tokens[i + 1].type === "NUMBER" || tokens[i + 1].value === "@")) {
              timeIndexName += ".";
              i++; // skip the dot
              if (tokens[i].value === "@") {
                timeIndexName += "@";
                i++;
              }
              if (i < tokens.length && (tokens[i].type === "IDENT" || tokens[i].type === "NUMBER")) {
                timeIndexName += escapeHtml(tokens[i].value);
                i++;
              }
            }

            contextVarTokens.push(`<span class="time-index">@${timeIndexName}</span>`);
            continue;
          }
        }

        // Continue if we're inside parens/brackets
        if (parenDepth > 0 || bracketDepth > 0) {
          contextVarTokens.push(escapeHtml(t.value));
          i++;
          continue;
        }

        // Continue for path components: . ident ( ) [ ] @
        // Note: KEYWORD is included because words like "name", "for", "in" may appear as path segments
        if (t.value === "." ||
            t.type === "IDENT" ||
            t.type === "KEYWORD" ||
            t.value === "(" ||
            t.value === ")" ||
            t.value === "[" ||
            t.value === "]" ||
            t.value === "@" ||
            t.type === "NUMBER") {
          contextVarTokens.push(escapeHtml(t.value));
          i++;

          // Stop after closing paren/bracket at depth 0
          if ((t.value === ")" || t.value === "]") && parenDepth === 0 && bracketDepth === 0) {
            // Check if next token continues the path
            if (i < tokens.length && tokens[i].value === ".") {
              continue;
            }
            break;
          }
          continue;
        }

        // Stop at anything else (operators, other keywords, etc.)
        break;
      }

      result.push(`<span class="expr-context-var">${contextVarTokens.join("")}</span>`);
      continue;
    }

    // Check for range pattern: range(start, end) or range(start, end, step)
    if (tok.type === "IDENT" &&
        tok.value === "range" &&
        i + 1 < tokens.length &&
        tokens[i + 1].value === "(") {

      i++; // skip "range"
      i++; // skip "("

      // Parse start tokens (until comma at depth 0)
      const startTokens: ExpressionToken[] = [];
      let depth = 0;
      while (i < tokens.length && !(tokens[i].value === "," && depth === 0)) {
        const t = tokens[i];
        if (t.value === "(") depth++;
        if (t.value === ")") depth--;
        startTokens.push(t);
        i++;
      }
      i++; // skip ","

      // Parse end tokens (until comma or closing paren at depth 0)
      const endTokens: ExpressionToken[] = [];
      depth = 0;
      while (i < tokens.length && !((tokens[i].value === "," || tokens[i].value === ")") && depth === 0)) {
        const t = tokens[i];
        if (t.value === "(") depth++;
        if (t.value === ")") depth--;
        endTokens.push(t);
        i++;
      }

      // Check for optional step
      let stepTokens: ExpressionToken[] | undefined;
      if (i < tokens.length && tokens[i].value === ",") {
        i++; // skip ","
        stepTokens = [];
        depth = 0;
        while (i < tokens.length && !(tokens[i].value === ")" && depth === 0)) {
          const t = tokens[i];
          if (t.value === "(") depth++;
          if (t.value === ")") depth--;
          stepTokens.push(t);
          i++;
        }
      }
      i++; // skip closing ")"

      // Render as start...end or start...end every step
      const startHtml = renderExpressionTokens(startTokens);
      const endHtml = renderExpressionTokens(endTokens);
      const stepHtml = stepTokens
        ? ` <span class="range-keyword">every</span> ${renderExpressionTokens(stepTokens)}`
        : "";

      result.push(`<span class="range-expr">${startHtml}<span class="range-dots">...</span>${endHtml}${stepHtml}</span>`);
      continue;
    }

    // Check for general function call pattern: identifier followed by (
    if (tok.type === "IDENT" &&
        i + 1 < tokens.length &&
        tokens[i + 1].value === "(") {

      const funcName = escapeHtml(tok.value);
      i++; // skip function name
      i++; // skip "("

      // Collect all tokens inside the parentheses
      const argTokens: ExpressionToken[] = [];
      let depth = 1;
      while (i < tokens.length && depth > 0) {
        const t = tokens[i];
        if (t.value === "(") depth++;
        if (t.value === ")") depth--;
        if (depth > 0) {
          argTokens.push(t);
        }
        i++;
      }

      // Render the arguments recursively
      const argsHtml = renderExpressionTokens(argTokens);

      // Special handling for min/max - render without function coloring
      const isBuiltinMath = tok.value === "min" || tok.value === "max";
      if (isBuiltinMath) {
        result.push(`<span class="builtin-func">${funcName}(${argsHtml})</span>`);
      } else {
        result.push(`<span class="func-block"><span class="func-name">${funcName}</span><span class="func-parens">(</span>${argsHtml}<span class="func-parens">)</span></span>`);
      }
      continue;
    }

    // Combine consecutive logical operators (e.g., !=, <=, >=, ==)
    if (tok.type === "LOGIC_OP") {
      let combined = tok.value;
      i++;
      while (i < tokens.length && tokens[i].type === "LOGIC_OP") {
        combined += tokens[i].value;
        i++;
      }
      result.push(`<span class="expr-logic-op">${escapeHtml(combined)}</span>`);
      continue;
    }

    // Check for @ followed by identifier (time index) before regular rendering
    if (tok.type === "SYMBOL" && tok.value === "@" && i + 1 < tokens.length) {
      const nextTok = tokens[i + 1];
      if (nextTok.type === "IDENT" || nextTok.type === "NUMBER") {
        // Collect the full time index (e.g., @i, @t, @i.k)
        let timeIndexName = escapeHtml(nextTok.value);
        i += 2; // skip @ and the identifier

        // Check for compound indices like @i.k
        while (i < tokens.length && tokens[i].value === "." &&
               i + 1 < tokens.length &&
               (tokens[i + 1].type === "IDENT" || tokens[i + 1].type === "NUMBER" || tokens[i + 1].value === "@")) {
          timeIndexName += ".";
          i++; // skip the dot
          if (tokens[i].value === "@") {
            timeIndexName += "@";
            i++;
          }
          if (i < tokens.length && (tokens[i].type === "IDENT" || tokens[i].type === "NUMBER")) {
            timeIndexName += escapeHtml(tokens[i].value);
            i++;
          }
        }

        result.push(`<span class="time-index">@${timeIndexName}</span>`);
        continue;
      }
    }

    // Regular token rendering
    const escaped = escapeHtml(tok.value);

    switch (tok.type) {
      case "KEYWORD":
        result.push(`<span class="keyword">${escaped}</span>`);
        break;

      case "IDENT":
        // Add spacing and parentheses around logical keywords (and, or)
        if (tok.value === "and" || tok.value === "or") {
          result.push(`) <span class="expr-keyword">${escaped}</span> (`);
        } else {
          result.push(`<span class="expr-ident">${escaped}</span>`);
        }
        break;

      case "NUMBER":
        result.push(`<span class="expr-number">${escaped}</span>`);
        break;

      case "SYMBOL":
        if (tok.value === "@") {
          // Standalone @ without following identifier
          result.push(`<span class="expr-at">@</span>`);
        } else {
          result.push(`<span class="expr-symbol">${escaped}</span>`);
        }
        break;

      case "ARITH_OP":
        result.push(`<span class="expr-arith-op">${escaped}</span>`);
        break;

      case "RANGE":
        result.push(`<span class="expr-range">${escaped}</span>`);
        break;

      case "STRING":
        result.push(`<span class="expr-string">"${escaped}"</span>`);
        break;

      default:
        result.push(escaped);
    }
    i++;
  }

  // Close the final sub-expression paren if we had logical operators
  if (hasLogicalOps) {
    result.push(")");
  }

  // Join with spaces between tokens, but handle special cases
  // We need to be smart about spacing: no space after ( [ . @ or before ) ] . ,
  // Also no space within compound operators like !=, <=, >=, ==
  let output = "";
  for (let j = 0; j < result.length; j++) {
    const part = result[j];
    const prevPart = j > 0 ? result[j - 1] : "";

    // Helper to check if a string ends with a specific plain character (not inside HTML)
    const endsWithChar = (s: string, chars: string[]) => {
      // Check for plain character at end, or character at end of a span (before </span>)
      for (const c of chars) {
        if (s.endsWith(c)) return true;
        if (s.endsWith(`${c}</span>`)) return true;
        if (s.endsWith(`">${c}`)) return true;
      }
      return false;
    };

    // Helper to check if a string starts with a specific plain character (not HTML tag)
    const startsWithChar = (s: string, chars: string[]) => {
      for (const c of chars) {
        if (s.startsWith(c)) return true;
        // Also check if it's a span containing just this character
        if (s.startsWith(`<span`) && s.includes(`">${c}</span>`)) return true;
      }
      return false;
    };

    // Determine if we need a space before this part
    const needsSpace = j > 0 &&
      // Don't add space after opening brackets/parens or dots or @
      !endsWithChar(prevPart, ["(", "[", ".", "@"]) &&
      // Don't add space before closing brackets/parens, dots, or commas
      !startsWithChar(part, [")", "]", ".", ","]) &&
      // Don't add space within compound operators (!=, <=, >=, ==, etc.)
      !(endsWithChar(prevPart, ["!", "<", ">", "="]) && startsWithChar(part, ["="]));

    if (needsSpace) {
      output += " ";
    }
    output += part;
  }

  return output;
}

function renderPromptTitle(title: PromptTitle): string {
  const indices = title.indices;

  // Build something like:  prompt[@t][agent_name]
  const indexSuffix = renderIndexList(title.indices);

  return `<div class="prompt-title"><h1>${escapeHtml(title.name)}${indexSuffix}</h1></div>`;
}

function renderPathDesc(path: PathDesc): string {
  const segments: string[] = [];
  let current: PathDesc | undefined = path;
  while (current) {
    const segIndexText = current.indices.length > 0 ? renderIndexList(current.indices) : "";
    segments.push(`${escapeHtml(current.base)}${segIndexText}`);
    current = current.next;
  }
  return segments.join(".");
}

function renderIndexContent(value: IndexValue): string {
  switch (value.kind) {
    case "identifier":
      let result = escapeHtml(value.name);
      if (value.path) {
        result += "." + renderPathDesc(value.path);
      }
      // Check if it's a number to apply appropriate styling
      const isNumber = /^\d+$/.test(value.name);
      const className = isNumber ? "index-number" : "index-identifier";
      return `<span class="${className}">${result}</span>`;
    case "context-var":
      return renderContextVarBlock(value);
    case "function":
      return renderFuncBlock(value);
    case "arithmetic":
      const left = renderIndexContent(value.left as IndexValue);
      const ops = value.operator.join("");
      const right = renderIndexContent(value.right as IndexValue);
      return `<span class="arithmetic-expr">${left}<span class="arith-op">${escapeHtml(ops)}</span>${right}</span>`;
    case "name-ref":
      return renderNameRef(value);
  }
}

function renderIndexValue(index: Index): string {
  const content = renderIndexContent(index.value);
  return index.kind === "time-index"
    ? `<span class="time-index">@${content}</span>`
    : `<span class="other-index">${content}</span>`;
}

function renderIndexList(indices: Index[]): string {
  if (indices.length === 0) return "";
  // Render each index in its own bracket set to preserve [@t][i] syntax
  return indices.map(idx => `[${renderIndexValue(idx)}]`).join("");
}



/**
 * Render the body of the prompt: either a chat prompt or a completion prompt.
 */
function renderPromptBody(body: PromptBody): string {
  if (body.kind === "chat-prompt-body") {
    return body.body.map(renderPromptBodyItem).join("\n");
  } else {
    return renderNoneMessage(body.message);
  }
}

/**
 * Render a NoneMessage (completion prompt - no role structure).
 */
function renderNoneMessage(msg: NoneMessage): string {
  const bodyHtml = msg.body
    .map((b: RoleBuildingBlock) => {
      return `<div class="role-body-block">${renderRoleBuildingBlock(b)}</div>`;
    })
    .join("\n");

  return `
<div class="none-message completion-prompt">
  <div class="none-message-header">Completion Prompt (no role)</div>
  ${bodyHtml}
</div>`;
}

/**
 * Render a PromptBodyItem (either a PromptBlock or a LabelBlock).
 */
function renderPromptBodyItem(item: PromptBlock): string {
  if (item.kind === "label-block") {
    return renderLabelBlock(item);
  }
  if (item.kind === "mark-block") {
    return renderMarkBlock(item);
  }
  return renderTopLevelBlock(item);
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

    case "comment-block":
      return renderCommentBlock(block);

    case "label-block":
      return renderLabelBlock(block);

    case "mark-block":
      return renderMarkBlock(block);

    case "name-def":
      return renderNameDef(block);

    case "end-block":
      return renderEndBlock(block);
  }
}

function renderCommentBlock(block: CommentBlock): string {
  return `<div class="comment-block">// ${escapeHtml(block.text)}</div>`;
}

/**
 * Render a NameDef block: name varname := value
 */
function renderNameDef(block: NameDef): string {
  const varName = escapeHtml(block.name);
  let valueHtml: string;

  if (block.value.kind === "context-var") {
    valueHtml = renderContextVarBlock(block.value);
  } else if (block.value.kind === "function") {
    valueHtml = renderFuncBlock(block.value);
  } else {
    valueHtml = renderListComprehension(block.value);
  }

  return `<div class="name-def"><span class="keyword">name</span> <span class="name-ref"><span class="segment">${varName}</span></span> <span class="name-assign">:=</span> ${valueHtml}</div>`;
}

/**
 * Render a ListComprehension: [ element | var ∈ iterable ]
 */
function renderListComprehension(block: ListComprehension): string {
  // Render the element expression
  const elementHtml = block.element.kind === "context-var"
    ? renderContextVarBlock(block.element)
    : renderFuncBlock(block.element);

  // Render the iterable
  const iterableHtml = renderIterable(block.iterable);

  // Render as: [ element | var ∈ iterable ] - wrapped in flex container for alignment
  return `<span class="list-comp-wrapper"><span class="list-comprehension">[</span> ${elementHtml} <span class="list-comp-separator">|</span> <span class="list-comp-var">${escapeHtml(block.variable)}</span> <span class="list-comp-in">∈</span> ${iterableHtml} <span class="list-comprehension">]</span></span>`;
}

/**
 * Render a NameRef: renders the variable name in a pink box (no $ prefix)
 */
function renderNameRef(block: NameRef): string {
  const segments: Array<string> = [];

  // 1. Render the name with any indices
  const rootIndices = block.indices;
  const rootIndexText = rootIndices.length > 0
    ? renderIndexList(block.indices) : "";

  segments.push(
    `<span class="segment">${escapeHtml(block.name)}${rootIndexText}</span>`
  );

  // 2. Render every segment in the PathDesc chain if it exists
  let current: PathDesc | undefined = block.path;
  while (current) {
    const segIndices = current.indices;
    const segIndexText =
      segIndices.length > 0
        ? renderIndexList(current.indices) : "";

    segments.push(
      `<span class="segment">${escapeHtml(current.base)}${segIndexText}</span>`
    );

    current = current.next;
  }

  // 3. Join segments with dots
  const joined = segments.join(".");

  return `<span class="name-ref">${joined}</span>`;
}

/**
 * Render a LabelBlock: a labeled section containing multiple PromptBlocks.
 */
function renderLabelBlock(block: LabelBlock): string {
  const labelName = escapeHtml(block.label);
  const labelStart = `<div class="label-start">╔══ ${labelName} ══╗</div>`;
  const labelEnd = `<div class="label-end">╚══ End ${labelName} ══╝</div>`;

  // Render all blocks in the body array
  const bodyHtml = block.body.map(b => renderTopLevelBlock(b)).join("\n");

  return `
<div class="label-block">
  ${labelStart}
  <div class="label-block-body">
    ${bodyHtml}
  </div>
  ${labelEnd}
</div>`;
}

/**
 * Render a MarkBlock: a section with a right-side bracket and number.
 * The bracket appears on the right edge of the block's content with the
 * mark number displayed to the right of the bracket, vertically centered.
 */
function renderMarkBlock(block: MarkBlock): string {
  // Render all blocks in the body array
  const bodyHtml = block.body.map(b => renderTopLevelBlock(b)).join("\n");

  return `
<div class="mark-block">
  <div class="mark-block-content">
    ${bodyHtml}
  </div>
  <div class="mark-block-bracket">
    <span class="mark-bracket-line"></span>
    <span class="mark-bracket-number">${block.markNumber}</span>
  </div>
</div>`;
}

/**
 * Render a MarkBlockInsideRole: same as MarkBlock but for inside role contexts.
 */
function renderMarkBlockInsideRole(block: MarkBlockInsideRole): string {
  // Render all blocks in the body array
  const bodyHtml = block.body.map(b => renderRoleBuildingBlock(b)).join("\n");

  return `
<div class="mark-block">
  <div class="mark-block-content">
    ${bodyHtml}
  </div>
  <div class="mark-block-bracket">
    <span class="mark-bracket-line"></span>
    <span class="mark-bracket-number">${block.markNumber}</span>
  </div>
</div>`;
}

/**
 * Render a role message like:
 *   [system]
 *   - TEMPLATE(...)
 *   - {foreach ...}
 */
function renderRoleMessage(msg: RoleMessage): string {
  const roleClass = escapeHtml(msg.role); // "user" / "assistant" / "system" / "tool"
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

    case "mark-block-inside-role":
      return renderMarkBlockInsideRole(block);

    case "comment-block":
      return renderCommentBlock(block);

    case "name-def":
      return renderNameDef(block);

    case "name-ref":
      return renderNameRef(block);

    case "other-index":
      return renderIndexValue(block);

    case "end-block":
      return renderEndBlock(block);
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
  // Special handling for range() function - render as start...end or start...end every step
  if (block.name === "range" && block.arguments.length >= 2) {
    const startHtml = renderTextArgs(block.arguments[0]);
    const endHtml = renderTextArgs(block.arguments[1]);
    const stepHtml = block.arguments.length >= 3
      ? ` <span class="range-keyword">every</span> ${renderTextArgs(block.arguments[2])}`
      : "";

    const rangeCore = `<span class="range-expr">${startHtml}<span class="range-dots">...</span>${endHtml}${stepHtml}</span>`;

    if (block.comment) {
      return `<span class="block-with-comment">${rangeCore}<span class="inline-comment"> // ${escapeHtml(block.comment)}</span></span>`;
    }
    return rangeCore;
  }

  const argsText = block.arguments
    .map(renderTextArgs)
    .join(", ");

  const resultIndices =
    block.indices && block.indices.length > 0
      ? renderIndexList(block.indices) : "";

  // Special handling for min/max - render without function coloring
  const isBuiltinMath = block.name === "min" || block.name === "max";
  const funcCore = isBuiltinMath
    ? `<span class="builtin-func">${escapeHtml(block.name)}(${argsText})${resultIndices}</span>`
    : `<span class="func-block"><span class="func-name">${escapeHtml(block.name)}</span><span class="func-parens">(</span>${argsText}<span class="func-parens">)</span>${resultIndices}</span>`;

  if (block.comment) {
    return `<span class="block-with-comment">${funcCore}<span class="inline-comment"> // ${escapeHtml(block.comment)}</span></span>`;
  }

  return funcCore;
}



function renderTextArgs(arg: TextArgs): string {
  switch (arg.kind) {

    case "context-var":
      return renderContextVarBlock(arg);

    case "function":
      return renderFuncBlock(arg);

    case "time-index":
    case "other-index":
      // Index arguments - use the structured index renderer
      return renderIndexValue(arg);

    case "identifier":
      // Simple identifier (name or number, optionally with path)
      let result = escapeHtml(arg.name);
      if (arg.path) {
        result += "." + renderPathDesc(arg.path);
      }
      return `<span class="identifier">${result}</span>`;

    case "arithmetic":
      // Arithmetic expressions: left operator(s) right
      const left = renderTextArgs(arg.left);
      const ops = arg.operator.join("");
      const right = renderTextArgs(arg.right);
      return `<span class="arithmetic-expr">${left}${escapeHtml(ops)}${right}</span>`;

    case "name-ref":
      return renderNameRef(arg);
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

  const argsText =
    block.arguments.length > 0
      ? `(${block.arguments.map(renderTextArgs).join(", ")})`
      : "";

  const core = `<span class="template-block">${escapeHtml(
    block.name
  )}${argsText}</span>`;

  if (block.comment) {
    return `<span class="block-with-comment">${core}<span class="comment"> // ${escapeHtml(block.comment)}</span></span>`;
  }

  return core;
}



/**
 * Render a ContextVar reference using the DSL path structure.
 *
 * ContextVar:
 *   - base: ContextBase          // "env", "resp", "sys", "prompt"
 *   - indices: Index[]           // (optional) indices directly on the root
 *   - path: PathDesc             // linked list of path segments
 *
 * PathDesc:
 *   - base: string               // segment name
 *   - indices: Index[]           // optional indices (may be empty)
 *   - next?: PathDesc            // next segment
 *
 * This supports expressions like:
 *   env.user_question[@t].line[k]
 *   sys.action_name[@t]
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

  // 1. Render the ROOT segment (sys, resp, env, etc.)
  //    If there are indices on the root, append them directly.
  const rootIndices = block.indices;
  const rootIndexText = rootIndices.length > 0
    ? renderIndexList(block.indices) : "";

  segments.push(
    `<span class="segment base">${escapeHtml(block.base)}${rootIndexText}</span>`
  );

  // 2. Render every segment in the PathDesc chain.
  let current: PathDesc | undefined = block.path;
  while (current) {
    const segIndices = current.indices;
    const segIndexText =
      segIndices.length > 0
        ? renderIndexList(current.indices): "";

    segments.push(
      `<span class="segment">${escapeHtml(current.base)}${segIndexText}</span>`
    );

    current = current.next;
  }

  // 3. Join segments with dots.
  const joined = segments.join(".");

  // Add namespace-specific class for different styling (env, sys, resp)
  const namespaceClass = `context-var-${block.base.toLowerCase()}`;

  if (block.comment) {
    return `<span class="block-with-comment"><span class="context-var ${namespaceClass}">${joined}</span><span class="inline-comment"> // ${escapeHtml(block.comment)}</span></span>`;
  }

  return `<span class="context-var ${namespaceClass}">${joined}</span>`;
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
/**
 * Render an Iterable (either a RangeExpr or token-based iterable).
 */
function renderIterable(iterable: Iterable): string {
  if (iterable.kind === "range-expr") {
    return renderRangeExpr(iterable);
  } else {
    return renderExpressionTokens(iterable.tokens);
  }
}

/**
 * Render a RangeExpr: start...stop or start...stop every step
 */
function renderRangeExpr(range: RangeExpr): string {
  const startHtml = renderExpressionTokens(range.start);
  const endHtml = renderExpressionTokens(range.end);
  const stepHtml = range.step
    ? ` <span class="range-keyword">every</span> ${renderExpressionTokens(range.step)}`
    : "";

  return `<span class="range-expr">${startHtml}<span class="range-dots">...</span>${endHtml}${stepHtml}</span>`;
}

function renderLoopOutsideRole(block: LoopBlockOutsideRole): string {
  const indexHtml = `<span class="loop-var">${renderIndexContent(block.index.value)}</span>`;
  const iterableHtml = `<span class="loop-iterable">${renderIterable(block.iterable)}</span>`;
  const header = `<span class="keyword">ForEach</span> ${indexHtml}: ${iterableHtml}`;

  const bodyHtml = block.body
    .map(child =>
      `<div class="loop-child">${renderTopLevelBlock(child)}</div>`
    )
    .join("\n");

  return wrapBlock(
    "loop-block-outside-role",
    header,
    bodyHtml
  );
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
  const indexHtml = `<span class="loop-var">${renderIndexContent(block.index.value)}</span>`;
  const iterableHtml = `<span class="loop-iterable">${renderIterable(block.iterable)}</span>`;
  const header = `<span class="keyword">ForEach</span> ${indexHtml}: ${iterableHtml}`;
  const bodyHtml = block.body
    .map((child: any) =>
      `<div class="role-loop-child">${renderRoleBuildingBlock(child)}</div>`
    )
    .join("\n");

  return wrapBlock("loop-block-inside-role", header, bodyHtml);
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
 *       `<span class="keyword">Default</span>:`
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
  const exprHtml = `<span class="switch-expr">${renderExpressionTokens(block.expression)}</span>`;
  const header = `<span class="keyword">Switch</span>(${exprHtml}):`;

  const casesHtml = block.cases
    .map((c: CaseBlockOutsideRole) => {
      const bodyHtml = c.body
        .map(child =>
          `<div class="switch-child">${renderTopLevelBlock(child)}</div>`
        )
        .join("\n");

      return wrapBlock(
        "switch-case",
        `<span class="keyword">Case</span> <span class="case-match">${renderExpressionTokens(c.match)}</span>:`,
        bodyHtml
      );
    })
    .join("\n");

  const defaultHtml = block.defaultCase
    ? (() => {
        const bodyHtml = block.defaultCase.body
          .map(child =>
            `<div class="switch-child">${renderTopLevelBlock(child)}</div>`
          )
          .join("\n");

        return wrapBlock(
          "switch-default",
          `<span class="keyword">Default</span>:`,
          bodyHtml
        );
      })()
    : "";

  return wrapBlock(
    "switch-block-outside-role",
    header,
    `${casesHtml}${defaultHtml}`
  );
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
 *       `<span class="keyword">Default</span>:`
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
  const exprHtml = `<span class="switch-expr">${renderExpressionTokens(block.expression)}</span>`;
  const header = `<span class="keyword">Switch</span>(${exprHtml}):`;

  const casesHtml = block.cases
    .map((c: CaseBlockInsideRole) => {
      const bodyHtml = c.body
        .map(child =>
          `<div class="role-switch-child">${renderRoleBuildingBlock(child)}</div>`
        )
        .join("\n");

      return wrapBlock(
        "switch-case",
        `<span class="keyword">Case</span> <span class="case-match">${renderExpressionTokens(c.match)}</span>:`,
        bodyHtml
      );
    })
    .join("\n");

  const defaultHtml = block.defaultCase
    ? (() => {
        const bodyHtml = block.defaultCase.body
          .map(child =>
            `<div class="role-switch-child">${renderRoleBuildingBlock(child)}</div>`
          )
          .join("\n");

        return wrapBlock(
          "switch-default",
          `<span class="keyword">Default</span>:`,
          bodyHtml
        );
      })()
    : "";

  return wrapBlock(
    "switch-block-inside-role",
    header,
    `${casesHtml}${defaultHtml}`
  );
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
  const renderBody = (body: RoleBuildingBlock[]) =>
    body
      .map(child =>
        `<div class="role-condition-child">${renderRoleBuildingBlock(child)}</div>`
      )
      .join("\n");

  const parts: string[] = [];

  // IF
  parts.push(
    wrapBlock(
      "conditional-section",
      `<span class="keyword">If</span> (<span class="condition-expr">${renderExpressionTokens(block.Ifcondition)}</span>):`,
      renderBody(block.IfBody)
    )
  );

  // ELSEIFs
  for (let i = 0; i < block.elseif.length; i++) {
    parts.push(
      wrapBlock(
        "conditional-section",
        `<span class="keyword">ElseIf</span> (<span class="condition-expr">${renderExpressionTokens(block.elseif[i])}</span>):`,
        renderBody(block.elseifBody[i])
      )
    );
  }

  // ELSE
  if (block.elseBody && block.elseBody.length > 0) {
    parts.push(
      wrapBlock(
        "conditional-section",
        `<span class="keyword">Else</span>:`,
        renderBody(block.elseBody)
      )
    );
  }

  return `
<div class="conditional-block-inside-role">
  ${parts.join("\n")}
</div>`;
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
  const renderBody = (body: PromptBlock[]) =>
    body
      .map(child =>
        `<div class="conditional-child">${renderTopLevelBlock(child)}</div>`
      )
      .join("\n");

  // IF block
  const ifHeader = `<span class="keyword">If</span> (<span class="condition-expr">${renderExpressionTokens(block.Ifcondition)}</span>):`;
  let result = wrapBlock("conditional-block-outside-role", ifHeader, renderBody(block.IfBody));

  // ELSEIFs
  for (let i = 0; i < block.elseif.length; i++) {
    const elseifHeader = `<span class="keyword">ElseIf</span> (<span class="condition-expr">${renderExpressionTokens(block.elseif[i])}</span>):`;
    result += wrapBlock("conditional-block-outside-role", elseifHeader, renderBody(block.elseifBody[i]));
  }

  // ELSE
  if (block.elseBody && block.elseBody.length > 0) {
    const elseHeader = `<span class="keyword">Else</span>:`;
    result += wrapBlock("conditional-block-outside-role", elseHeader, renderBody(block.elseBody));
  }

  return result;
}

/**
 * Render an EndBlock: PromptEndsHere when (condition)
 * Conditional early termination that can appear anywhere.
 */
function renderEndBlock(block: EndBlock): string {
  const conditionHtml = renderExpressionTokens(block.condition);
  return `<div class="end-block"><span class="end-dashed-line"></span><span class="end-text"><span class="end-keyword">PromptEndsHere</span> <span class="keyword">when</span> (<span class="condition-expr">${conditionHtml}</span>)</span></div>`;
}

