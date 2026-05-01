// SVG rendering for ACDL prompts - produces SVG with selectable text
import {
  Prompt,
  PromptTitle,
  Index,
  IndexValue,
  PromptBody,
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
  MarkBlock,
  MarkBlockInsideRole,
  ExpressionToken,
  Iterable,
  RangeExpr,
  NameDef,
  NameRef,
  ListComprehension,
  EndBlock,
  StrFragDef,
  RoleFragDef,
  StrFragInvocation,
  RoleFragInvocation,
} from "./types";

import {
  COLORS,
  FONT_SIZES,
  SPACING,
  measureText,
  getLineHeight,
  escapeXml,
  svgRect,
  svgText,
  svgLine,
  svgGroup,
  wrapSvg,
  loadFonts,
} from "./svg-layout";

// Render result contains SVG content and dimensions
interface RenderResult {
  svg: string;
  width: number;
  height: number;
}

// Context for tracking render state
interface RenderContext {
  x: number;
  y: number;
  maxWidth: number;
  indentLevel: number;
}

function createContext(maxWidth: number = 450): RenderContext {
  return {
    x: SPACING.containerPaddingLeft,
    y: 0,
    maxWidth,
    indentLevel: 0,
  };
}

// Check if a block type is inline (can flow horizontally with flex-wrap) or block-level (starts new line)
// Each content piece (template, context-var, function) should be on its own line
function isInlineBlock(_kind: string): boolean {
  // All role building blocks are block-level - each appears on its own line
  return false;
}

// Flow layout result for inline elements
interface FlowLayoutResult {
  svg: string;
  width: number;  // max line width
  height: number; // total height including all lines
}

// Render inline blocks in a flow layout with wrapping
function renderInlineBlocksWithWrap(
  blocks: RoleBuildingBlock[],
  startX: number,
  startY: number,
  maxWidth: number,
  renderBlock: (block: RoleBuildingBlock, x: number, y: number, maxWidth?: number) => RenderResult
): FlowLayoutResult {
  const elements: string[] = [];
  const lineHeight = getLineHeight(FONT_SIZES.normal);
  const gap = SPACING.elementGap;

  let currentX = startX;
  let currentY = startY;
  let lineMaxHeight = lineHeight; // Track tallest element on current line
  let maxLineWidth = 0;

  for (const block of blocks) {
    // Pre-render to get dimensions (render at 0,0, we'll translate)
    // Adjust maxWidth to account for current X position so inline comments wrap correctly
    const adjustedMaxWidth = maxWidth - currentX;
    const result = renderBlock(block, 0, 0, adjustedMaxWidth);

    // Check if we need to wrap to next line
    if (currentX > startX && currentX + result.width > maxWidth) {
      // Wrap to next line
      maxLineWidth = Math.max(maxLineWidth, currentX - startX);
      currentX = startX;
      currentY += lineMaxHeight + gap;
      lineMaxHeight = lineHeight;

      // Re-render with new adjusted maxWidth for the new line
      const newAdjustedMaxWidth = maxWidth - currentX;
      const newResult = renderBlock(block, 0, 0, newAdjustedMaxWidth);
      const translated = `<g transform="translate(${currentX}, ${currentY})">${newResult.svg}</g>`;
      elements.push(translated);
      currentX += newResult.width + gap;
      lineMaxHeight = Math.max(lineMaxHeight, newResult.height);
    } else {
      // Fits on current line
      const translated = `<g transform="translate(${currentX}, ${currentY})">${result.svg}</g>`;
      elements.push(translated);
      currentX += result.width + gap;
      lineMaxHeight = Math.max(lineMaxHeight, result.height);
    }
  }

  // Account for last line
  maxLineWidth = Math.max(maxLineWidth, currentX - startX);

  return {
    svg: elements.join('\n'),
    width: maxLineWidth,
    height: currentY - startY + lineMaxHeight,
  };
}

// Helper to add an inline comment to a render result with wrapping support
function addInlineComment(
  result: RenderResult,
  comment: string | undefined,
  x: number,
  y: number,
  maxWidth?: number
): RenderResult {
  if (!comment) return result;

  const fontSize = FONT_SIZES.comment;
  const commentText = ` // ${comment}`;
  const commentX = x + result.width + 4;
  const commentWidth = measureText(commentText, fontSize);

  // Check if we need to wrap (only if maxWidth is specified and comment would exceed it)
  if (maxWidth) {
    const availableWidth = maxWidth - commentX;

    if (availableWidth > 0 && commentWidth > availableWidth) {
      // Comment needs wrapping - wrap and align to top of element
      const lines = wrapText(commentText, fontSize, availableWidth, false);

      // If wrapped to multiple lines, align to top; if still single line, center vertically
      if (lines.length > 1) {
        const commentY = y;
        const wrappedResult = renderMultilineText(lines, commentX, commentY, {
          fill: COLORS.comment,
          fontSize,
          fontStyle: 'italic',
        });

        return {
          svg: result.svg + '\n' + wrappedResult.svg,
          width: result.width + 4 + wrappedResult.width,
          height: Math.max(result.height, wrappedResult.height),
        };
      }
    }
  }

  // Single line comment - vertically center it
  const commentY = y + result.height / 2 + fontSize * 0.35;

  const commentSvg = svgText(commentX, commentY, commentText, {
    fill: COLORS.comment,
    fontSize,
    fontStyle: 'italic',
  });

  return {
    svg: result.svg + '\n' + commentSvg,
    width: result.width + 4 + commentWidth,
    height: result.height,
  };
}

// Wrap text into multiple lines that fit within maxWidth
function wrapText(text: string, fontSize: number, maxWidth: number, bold: boolean = false): string[] {
  const words = text.split(/(\s+)/); // Split but keep whitespace
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine + word;
    const testWidth = measureText(testLine, fontSize, bold);

    if (testWidth > maxWidth && currentLine.trim() !== '') {
      // Current line is full, start new line
      lines.push(currentLine.trimEnd());
      currentLine = word.trimStart(); // Start new line with current word (trim leading space)
    } else {
      currentLine = testLine;
    }
  }

  // Add remaining text
  if (currentLine.trim() !== '') {
    lines.push(currentLine.trimEnd());
  }

  return lines.length > 0 ? lines : [''];
}

// Render multi-line text
function renderMultilineText(
  lines: string[],
  x: number,
  y: number,
  options: {
    fill: string;
    fontSize: number;
    fontWeight?: string;
    fontStyle?: string;
  }
): { svg: string; width: number; height: number } {
  const lineHeight = getLineHeight(options.fontSize);
  const elements: string[] = [];
  let maxWidth = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineY = y + i * lineHeight + options.fontSize * 0.85;
    elements.push(svgText(x, lineY, lines[i], {
      fill: options.fill,
      fontSize: options.fontSize,
      fontWeight: options.fontWeight,
      fontStyle: options.fontStyle,
    }));
    maxWidth = Math.max(maxWidth, measureText(lines[i], options.fontSize, options.fontWeight === '700'));
  }

  return {
    svg: elements.join('\n'),
    width: maxWidth,
    height: lines.length * lineHeight,
  };
}

// Get role colors
function getRoleColors(role: string): { border: string; bg: string; text: string } {
  switch (role.toLowerCase()) {
    case 'system':
      return { border: COLORS.systemBorder, bg: COLORS.systemBorder, text: '#ffffff' };
    case 'user':
      return { border: COLORS.userBorder, bg: COLORS.userBorder, text: '#ffffff' };
    case 'assistant':
      return { border: COLORS.assistantBorder, bg: COLORS.assistantBorder, text: '#ffffff' };
    case 'tool':
      return { border: COLORS.toolBorder, bg: COLORS.toolBorder, text: '#ffffff' };
    default:
      return { border: COLORS.noneBorder, bg: COLORS.noneBorder, text: '#ffffff' };
  }
}

// Render inline box (for templates, functions, context vars)
function renderInlineBox(
  text: string,
  x: number,
  y: number,
  options: {
    fill: string;
    stroke: string;
    textColor: string;
    prefix?: string;
    bold?: boolean;
    nested?: boolean;
  }
): RenderResult {
  const fontSize = FONT_SIZES.normal;
  // Use smaller padding for nested boxes
  const padding = options.nested ? 2 : SPACING.blockPadding;
  const prefixText = options.prefix || '';

  // Check if prefix is a diamond character - we'll render it as SVG shape
  const isDiamond = prefixText.includes('◆');
  const diamondSize = fontSize * 0.6; // Size of the diamond shape
  const diamondSpacing = 2; // Space after diamond
  const prefixWidth = isDiamond ? (diamondSize + diamondSpacing) : (prefixText ? measureText(prefixText, fontSize * 0.7, true) : 0);

  const textWidthOnly = measureText(text, fontSize, options.bold);
  const totalTextWidth = prefixWidth + textWidthOnly;
  const boxWidth = totalTextWidth + padding * 2;
  const boxHeight = fontSize + padding * 2;

  const elements: string[] = [];

  // Background rect
  elements.push(svgRect(x, y, boxWidth, boxHeight, {
    fill: options.fill,
    stroke: options.stroke,
    strokeWidth: 1,
    rx: 3,
  }));

  // Text - y is baseline position
  const textY = y + padding + fontSize * 0.85;
  let textX = x + padding;

  if (isDiamond) {
    // Render diamond as a rotated square for sharp corners
    const cx = textX + diamondSize / 2;
    const cy = y + boxHeight / 2;
    const size = diamondSize * 0.6;
    // Rotated rect centered at (cx, cy)
    elements.push(`<rect x="${cx - size/2}" y="${cy - size/2}" width="${size}" height="${size}" fill="${options.textColor}" transform="rotate(45 ${cx} ${cy})" />`);
    textX += prefixWidth;
  } else if (prefixText) {
    elements.push(svgText(textX, textY, prefixText, {
      fill: options.textColor,
      fontSize: fontSize * 0.7,
      fontWeight: '600',
    }));
    textX += prefixWidth;
  }

  elements.push(svgText(textX, textY, text, {
    fill: options.textColor,
    fontSize,
    fontWeight: options.bold ? '550' : '550',
  }));

  return {
    svg: elements.join('\n'),
    width: boxWidth,
    height: boxHeight,
  };
}

// Render text with specific styling
function renderStyledText(
  text: string,
  x: number,
  y: number,
  options: {
    color?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
  } = {}
): RenderResult {
  const fontSize = options.fontSize || FONT_SIZES.normal;
  const width = measureText(text, fontSize, options.bold);

  const svg = svgText(x, y, text, {
    fill: options.color || COLORS.textPrimary,
    fontSize,
    fontWeight: options.bold ? '550' : '550',
    fontStyle: options.italic ? 'italic' : undefined,
  });

  return { svg, width, height: fontSize };
}

// Convert index to display text
function indexToText(index: Index): string {
  const content = indexValueToText(index.value);
  if (index.kind === 'time-index') {
    return `@${content}`;
  }
  return content;
}

function indexValueToText(value: IndexValue): string {
  switch (value.kind) {
    case 'identifier':
      let result = value.name;
      if (value.path) {
        result += '.' + pathToText(value.path);
      }
      return result;
    case 'context-var':
      return contextVarToText(value);
    case 'function':
      return funcToText(value);
    case 'arithmetic':
      return `${indexValueToText(value.left as IndexValue)}${value.operator.join('')}${indexValueToText(value.right as IndexValue)}`;
    case 'name-ref':
      return value.name;
  }
}

function pathToText(path: PathDesc): string {
  let result = path.base;
  if (path.indices.length > 0) {
    result += '[' + path.indices.map(indexToText).join(',') + ']';
  }
  if (path.next) {
    result += '.' + pathToText(path.next);
  }
  return result;
}

function contextVarToText(cv: ContextVar): string {
  let result = cv.base;
  if (cv.indices.length > 0) {
    result += '[' + cv.indices.map(indexToText).join(',') + ']';
  }
  if (cv.path) {
    result += '.' + pathToText(cv.path);
  }
  return result;
}

function funcToText(func: Func): string {
  const args = func.arguments.map(textArgsToText).join(', ');
  return `${func.name}(${args})`;
}

function textArgsToText(arg: TextArgs): string {
  switch (arg.kind) {
    case 'context-var':
      return contextVarToText(arg);
    case 'function':
      return funcToText(arg);
    case 'time-index':
    case 'other-index':
      return indexToText(arg);
    case 'identifier':
      let result = arg.name;
      if (arg.path) {
        result += '.' + pathToText(arg.path);
      }
      return result;
    case 'arithmetic':
      return `${textArgsToText(arg.left)}${arg.operator.join('')}${textArgsToText(arg.right)}`;
    case 'name-ref':
      return nameRefToText(arg);
    case 'str-frag-invocation':
      const fragArgs = arg.arguments.map(textArgsToText).join(', ');
      return `Frag ${arg.name}[${fragArgs}]`;
  }
}

// Strip the $ prefix from name references for display
function stripNameRefPrefix(name: string): string {
  return name.startsWith('$') ? name.slice(1) : name;
}

function nameRefToText(ref: NameRef): string {
  let result = stripNameRefPrefix(ref.name);
  if (ref.indices.length > 0) {
    result += '[' + ref.indices.map(indexToText).join(',') + ']';
  }
  if (ref.path) {
    result += '.' + pathToText(ref.path);
  }
  return result;
}

function expressionTokensToText(tokens: ExpressionToken[]): string {
  return tokens.map(t => t.value).join('');
}

function iterableToText(iterable: Iterable): string {
  if (iterable.kind === 'range-expr') {
    const start = expressionTokensToText(iterable.start);
    const end = expressionTokensToText(iterable.end);
    const step = iterable.step ? ` every ${expressionTokensToText(iterable.step)}` : '';
    return `${start}...${end}${step}`;
  }
  return expressionTokensToText(iterable.tokens);
}

// Render a template block
// Parse Template into colored segments
function templateToColoredSegments(block: Template): ColoredSegment[] {
  const segments: ColoredSegment[] = [];

  segments.push({ text: block.name, type: 'default' });

  if (block.arguments.length > 0) {
    segments.push({ text: '(', type: 'default' });
    for (let i = 0; i < block.arguments.length; i++) {
      if (i > 0) segments.push({ text: ', ', type: 'default' });
      segments.push(...textArgsToColoredSegments(block.arguments[i]));
    }
    segments.push({ text: ')', type: 'default' });
  }

  return segments;
}

function renderTemplateBlock(block: Template, x: number, y: number, maxWidth?: number): RenderResult {
  // If no arguments, use simple box
  if (block.arguments.length === 0) {
    const text = block.name;
    const result = renderInlineBox(text, x, y, {
      fill: COLORS.templateBg,
      stroke: COLORS.template,
      textColor: COLORS.template,
      prefix: '◆ ',
    });
    return addInlineComment(result, block.comment, x, y, maxWidth);
  }

  // Render template with nested argument boxes, with wrapping support
  const elements: string[] = [];
  const fontSize = FONT_SIZES.normal;
  const padding = SPACING.blockPadding;
  const lineHeight = getLineHeight(fontSize);
  const nestedPadding = 2;
  const nestedYOffset = (padding - nestedPadding);

  let currentX = x + padding;
  let currentY = y;
  const startX = x + padding;
  const textY = y + padding + fontSize * 0.85;
  let maxRenderedWidth = 0;
  let totalHeight = fontSize + padding * 2;

  // Diamond prefix - render as rotated square for sharp corners
  const diamondSize = fontSize * 0.6;
  const diamondSpacing = 2;
  const boxHeight = fontSize + padding * 2;
  const cx = currentX + diamondSize / 2;
  const cy = y + boxHeight / 2;
  const size = diamondSize * 0.6;
  elements.push(`<rect x="${cx - size/2}" y="${cy - size/2}" width="${size}" height="${size}" fill="${COLORS.template}" transform="rotate(45 ${cx} ${cy})" />`);
  currentX += diamondSize + diamondSpacing;

  // Template name (purple)
  elements.push(svgText(currentX, textY, block.name, {
    fill: COLORS.template,
    fontSize,
    fontWeight: '600',
  }));
  currentX += measureText(block.name, fontSize, true);

  // Opening paren
  elements.push(svgText(currentX, textY, '(', {
    fill: COLORS.template,
    fontSize,
    fontWeight: '600',
  }));
  currentX += measureText('(', fontSize, true);

  // Arguments with their own boxes - render with wrapping
  const indentX = startX + measureText('  ', fontSize); // Indent wrapped args

  for (let i = 0; i < block.arguments.length; i++) {
    // Pre-render argument to check width
    const argResult = renderTextArgsElement(block.arguments[i], 0, 0, true);

    // Render on current line
    const currentTextY = currentY + padding + fontSize * 0.85;

    // Render argument
    const translatedArg = `<g transform="translate(${currentX}, ${currentY + nestedYOffset})">${argResult.svg}</g>`;
    elements.push(translatedArg);
    currentX += argResult.width;

    // Add comma after argument if not last
    if (i < block.arguments.length - 1) {
      elements.push(svgText(currentX, currentTextY, ',', {
        fill: COLORS.template,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText(',', fontSize, true);

      // Track width including comma before wrapping
      maxRenderedWidth = Math.max(maxRenderedWidth, currentX - x + padding);

      // Check if next argument would fit on this line
      const nextArgResult = renderTextArgsElement(block.arguments[i + 1], 0, 0, true);
      const spaceWidth = measureText(' ', fontSize);
      const availableWidth = maxWidth ? maxWidth - currentX - spaceWidth : Infinity;
      const shouldWrap = maxWidth && (nextArgResult.width > availableWidth);

      if (shouldWrap) {
        // Wrap to next line before next argument
        currentY += lineHeight;
        currentX = indentX;
      } else {
        // Add space after comma
        currentX += spaceWidth;
      }
    } else {
      // Track width of last argument
      maxRenderedWidth = Math.max(maxRenderedWidth, currentX - x + padding);
    }

    // Update total height
    totalHeight = Math.max(totalHeight, currentY - y + argResult.height + padding);
  }

  // Closing paren
  const closingTextY = currentY + padding + fontSize * 0.85;
  elements.push(svgText(currentX, closingTextY, ')', {
    fill: COLORS.template,
    fontSize,
    fontWeight: '600',
  }));
  currentX += measureText(')', fontSize, true);

  // Box width is the maximum width across all lines
  const boxWidth = Math.max(maxRenderedWidth, currentX - x + padding);

  // Background box (rendered first, so it appears behind)
  const bgRect = svgRect(x, y, boxWidth, totalHeight, {
    fill: COLORS.templateBg,
    stroke: COLORS.template,
    strokeWidth: 1,
    rx: 3,
  });

  const result = {
    svg: bgRect + '\n' + elements.join('\n'),
    width: boxWidth,
    height: totalHeight,
  };

  // Add inline comment if present
  return addInlineComment(result, block.comment, x, y, maxWidth);
}

// Render a function block
// Segment type for multi-color rendering
type SegmentType = 'default' | 'index' | 'nameRef' | 'contextVar';

interface ColoredSegment {
  text: string;
  type: SegmentType;
}

// Parse TextArgs into colored segments
function textArgsToColoredSegments(arg: TextArgs): ColoredSegment[] {
  const segments: ColoredSegment[] = [];

  switch (arg.kind) {
    case 'context-var':
      return contextVarToColoredSegments(arg);

    case 'function':
      return funcToColoredSegments(arg);

    case 'time-index':
    case 'other-index':
      segments.push({ text: indexToText(arg), type: 'index' });
      break;

    case 'identifier':
      segments.push({ text: arg.name, type: 'default' });
      if (arg.path) {
        segments.push(...pathToColoredSegments(arg.path));
      }
      break;

    case 'arithmetic':
      segments.push(...textArgsToColoredSegments(arg.left));
      segments.push({ text: arg.operator.join(''), type: 'default' });
      segments.push(...textArgsToColoredSegments(arg.right));
      break;

    case 'name-ref':
      segments.push({ text: nameRefToText(arg), type: 'nameRef' });
      break;
  }

  return segments;
}

// Legacy wrapper for backward compatibility
function textArgsToSegments(arg: TextArgs): Array<{ text: string; isIndex: boolean }> {
  return textArgsToColoredSegments(arg).map(s => ({
    text: s.text,
    isIndex: s.type === 'index'
  }));
}

// Parse PathDesc into colored segments
function pathToColoredSegments(path: PathDesc): ColoredSegment[] {
  const segments: ColoredSegment[] = [];

  segments.push({ text: '.', type: 'default' });
  segments.push({ text: path.base, type: 'default' });

  if (path.indices.length > 0) {
    segments.push({ text: '[', type: 'default' });
    for (let i = 0; i < path.indices.length; i++) {
      if (i > 0) segments.push({ text: ',', type: 'default' });
      segments.push({ text: indexToText(path.indices[i]), type: 'index' });
    }
    segments.push({ text: ']', type: 'default' });
  }

  if (path.next) {
    segments.push(...pathToColoredSegments(path.next));
  }

  return segments;
}

// Legacy wrapper
function pathToSegments(path: PathDesc): Array<{ text: string; isIndex: boolean }> {
  return pathToColoredSegments(path).map(s => ({
    text: s.text,
    isIndex: s.type === 'index'
  }));
}

// Parse Func into colored segments
function funcToColoredSegments(block: Func): ColoredSegment[] {
  const segments: ColoredSegment[] = [];

  segments.push({ text: block.name, type: 'default' });
  segments.push({ text: '(', type: 'default' });

  for (let i = 0; i < block.arguments.length; i++) {
    if (i > 0) segments.push({ text: ', ', type: 'default' });
    segments.push(...textArgsToColoredSegments(block.arguments[i]));
  }

  segments.push({ text: ')', type: 'default' });

  if (block.indices && block.indices.length > 0) {
    segments.push({ text: '[', type: 'default' });
    for (let i = 0; i < block.indices.length; i++) {
      if (i > 0) segments.push({ text: ',', type: 'default' });
      segments.push({ text: indexToText(block.indices[i]), type: 'index' });
    }
    segments.push({ text: ']', type: 'default' });
  }

  return segments;
}

// Legacy wrapper
function funcToSegments(block: Func): Array<{ text: string; isIndex: boolean }> {
  return funcToColoredSegments(block).map(s => ({
    text: s.text,
    isIndex: s.type === 'index'
  }));
}

// Render a TextArgs element with its appropriate box/styling
// When nested=true, use smaller padding for boxes inside other boxes
function renderTextArgsElement(arg: TextArgs, x: number, y: number, nested: boolean = false): RenderResult {
  switch (arg.kind) {
    case 'context-var':
      return renderContextVarBoxed(arg, x, y, nested);
    case 'function':
      // Recursive - functions inside functions
      return renderFuncBlock(arg, x, y, nested);
    case 'time-index':
    case 'other-index':
      return renderIndex(arg, x, y, nested);
    case 'identifier':
      return renderIdentifierBoxed(arg, x, y, nested);
    case 'arithmetic':
      return renderArithmeticBoxed(arg, x, y, nested);
    case 'name-ref':
      return renderNameRef(arg, x, y, nested);
    case 'str-frag-invocation':
      return renderStrFragInvocation(arg, x, y);
  }
}

// Render context var in green box
function renderContextVarBoxed(block: ContextVar, x: number, y: number, nested: boolean = false): RenderResult {
  const segments = contextVarToColoredSegments(block);
  return renderColoredSegmentBox(segments, x, y, {
    fill: COLORS.contextBg,
    stroke: COLORS.context,
    defaultColor: COLORS.context,
    nested,
  });
}

// Render index as blue text (no box)
function renderIndex(index: Index, x: number, y: number, nested: boolean = false): RenderResult {
  const text = indexToText(index);
  const fontSize = FONT_SIZES.normal;
  const padding = nested ? 2 : SPACING.blockPadding;
  const textY = y + padding + fontSize * 0.85;

  const svg = svgText(x, textY, text, {
    fill: COLORS.variable,
    fontSize,
    fontWeight: '700',
  });

  return {
    svg,
    width: measureText(text, fontSize, true),
    height: fontSize + padding * 2,
  };
}

// Render identifier (plain text, no box, or with path)
function renderIdentifierBoxed(arg: { kind: 'identifier'; name: string; path?: PathDesc }, x: number, y: number, nested: boolean = false): RenderResult {
  const segments: ColoredSegment[] = [];
  segments.push({ text: arg.name, type: 'default' });
  if (arg.path) {
    segments.push(...pathToColoredSegments(arg.path));
  }
  const text = segments.map(s => s.text).join('');
  // Plain identifiers render as regular text
  // Adjust Y for nested context (smaller padding)
  const padding = nested ? 2 : SPACING.blockPadding;
  return renderStyledText(text, x, y + padding + FONT_SIZES.normal * 0.85, {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.normal,
  });
}

// Render arithmetic expression
function renderArithmeticBoxed(arg: { kind: 'arithmetic'; left: TextArgs; operator: string[]; right: TextArgs }, x: number, y: number, nested: boolean = false): RenderResult {
  const elements: string[] = [];
  let currentX = x;
  const fontSize = FONT_SIZES.normal;
  const padding = nested ? 2 : SPACING.blockPadding;

  // Left operand
  const leftResult = renderTextArgsElement(arg.left, currentX, y, nested);
  elements.push(leftResult.svg);
  currentX += leftResult.width;

  // Operator
  const opText = arg.operator.join('');
  elements.push(svgText(currentX, y + padding + fontSize * 0.85, opText, {
    fill: COLORS.textPrimary,
    fontSize,
  }));
  currentX += measureText(opText, fontSize);

  // Right operand
  const rightResult = renderTextArgsElement(arg.right, currentX, y, nested);
  elements.push(rightResult.svg);
  currentX += rightResult.width;

  return {
    svg: elements.join('\n'),
    width: currentX - x,
    height: Math.max(leftResult.height, rightResult.height, fontSize + padding * 2),
  };
}

// Parse NameRef into colored segments
function nameRefToColoredSegments(ref: NameRef): ColoredSegment[] {
  const segments: ColoredSegment[] = [];

  // The name itself (pink) - strip the $ prefix for display
  segments.push({ text: stripNameRefPrefix(ref.name), type: 'nameRef' });

  // Indices in brackets (blue)
  if (ref.indices.length > 0) {
    segments.push({ text: '[', type: 'nameRef' });
    for (let i = 0; i < ref.indices.length; i++) {
      if (i > 0) segments.push({ text: ',', type: 'nameRef' });
      segments.push({ text: indexToText(ref.indices[i]), type: 'index' });
    }
    segments.push({ text: ']', type: 'nameRef' });
  }

  // Path segments
  if (ref.path) {
    let current: PathDesc | undefined = ref.path;
    while (current) {
      segments.push({ text: '.', type: 'nameRef' });
      segments.push({ text: current.base, type: 'nameRef' });
      if (current.indices.length > 0) {
        segments.push({ text: '[', type: 'nameRef' });
        for (let i = 0; i < current.indices.length; i++) {
          if (i > 0) segments.push({ text: ',', type: 'nameRef' });
          segments.push({ text: indexToText(current.indices[i]), type: 'index' });
        }
        segments.push({ text: ']', type: 'nameRef' });
      }
      current = current.next;
    }
  }

  return segments;
}

// Render name ref as pink text (no box)
function renderNameRef(ref: NameRef, x: number, y: number, nested: boolean = false): RenderResult {
  const segments = nameRefToColoredSegments(ref);
  const fontSize = FONT_SIZES.normal;
  const padding = nested ? 2 : SPACING.blockPadding;

  const elements: string[] = [];
  let currentX = x;
  const textY = y + padding + fontSize * 0.85;

  // Render each segment with appropriate color
  for (const seg of segments) {
    const color = seg.type === 'index' ? COLORS.variable : COLORS.nameRef;
    const fontWeight = '600';

    elements.push(svgText(currentX, textY, seg.text, {
      fill: color,
      fontSize,
      fontWeight,
    }));
    currentX += measureText(seg.text, fontSize, true);
  }

  return {
    svg: elements.join('\n'),
    width: currentX - x,
    height: fontSize + padding * 2,
  };
}

function renderFuncBlock(block: Func, x: number, y: number, nested: boolean = false, maxWidth?: number): RenderResult {
  // Handle range() specially
  if (block.name === 'range' && block.arguments.length >= 2) {
    const start = textArgsToText(block.arguments[0]);
    const end = textArgsToText(block.arguments[1]);
    const step = block.arguments.length >= 3 ? ` every ${textArgsToText(block.arguments[2])}` : '';
    const text = `${start}...${end}${step}`;
    return renderStyledText(text, x, y + FONT_SIZES.normal * 0.85, {
      color: COLORS.textPrimary,
      fontSize: FONT_SIZES.normal,
    });
  }

  // min/max are rendered without box
  if (block.name === 'min' || block.name === 'max') {
    const segments = funcToColoredSegments(block);
    const text = segments.map(s => s.text).join('');
    return renderStyledText(text, x, y + FONT_SIZES.normal * 0.85, {
      color: COLORS.textPrimary,
      fontSize: FONT_SIZES.normal,
    });
  }

  // Render function with nested argument boxes, with wrapping support
  const elements: string[] = [];
  const fontSize = FONT_SIZES.normal;
  const padding = SPACING.blockPadding;
  const lineHeight = getLineHeight(fontSize);
  const nestedPadding = 2;
  const nestedYOffset = (padding - nestedPadding);

  let currentX = x + padding;
  let currentY = y;
  const startX = x + padding;
  const textY = y + padding + fontSize * 0.85;
  let maxRenderedWidth = 0;
  let totalHeight = fontSize + padding * 2;

  // Function name (purple)
  elements.push(svgText(currentX, textY, block.name, {
    fill: COLORS.func,
    fontSize,
    fontWeight: '600',
  }));
  currentX += measureText(block.name, fontSize, true);

  // Opening paren
  elements.push(svgText(currentX, textY, '(', {
    fill: COLORS.func,
    fontSize,
    fontWeight: '600',
  }));
  currentX += measureText('(', fontSize, true);

  // Arguments with their own boxes - render with wrapping
  const indentX = startX + measureText('  ', fontSize); // Indent wrapped args

  for (let i = 0; i < block.arguments.length; i++) {
    // Pre-render argument to check width
    const argResult = renderTextArgsElement(block.arguments[i], 0, 0, true);

    // Render on current line
    const currentTextY = currentY + padding + fontSize * 0.85;

    // Render argument
    const translatedArg = `<g transform="translate(${currentX}, ${currentY + nestedYOffset})">${argResult.svg}</g>`;
    elements.push(translatedArg);
    currentX += argResult.width;

    // Add comma after argument if not last
    if (i < block.arguments.length - 1) {
      elements.push(svgText(currentX, currentTextY, ',', {
        fill: COLORS.func,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText(',', fontSize, true);

      // Track width including comma before wrapping
      maxRenderedWidth = Math.max(maxRenderedWidth, currentX - x + padding);

      // Check if next argument would fit on this line
      const nextArgResult = renderTextArgsElement(block.arguments[i + 1], 0, 0, true);
      const spaceWidth = measureText(' ', fontSize);
      const availableWidth = maxWidth ? maxWidth - currentX - spaceWidth : Infinity;
      const shouldWrap = maxWidth && (nextArgResult.width > availableWidth);

      if (shouldWrap) {
        // Wrap to next line before next argument
        currentY += lineHeight;
        currentX = indentX;
      } else {
        // Add space after comma
        currentX += spaceWidth;
      }
    } else {
      // Track width of last argument
      maxRenderedWidth = Math.max(maxRenderedWidth, currentX - x + padding);
    }

    // Update total height
    totalHeight = Math.max(totalHeight, currentY - y + argResult.height + padding);
  }

  // Closing paren
  const closingTextY = currentY + padding + fontSize * 0.85;
  elements.push(svgText(currentX, closingTextY, ')', {
    fill: COLORS.func,
    fontSize,
    fontWeight: '600',
  }));
  currentX += measureText(')', fontSize, true);

  // Indices if present
  if (block.indices && block.indices.length > 0) {
    elements.push(svgText(currentX, closingTextY, '[', {
      fill: COLORS.func,
      fontSize,
      fontWeight: '600',
    }));
    currentX += measureText('[', fontSize, true);

    for (let i = 0; i < block.indices.length; i++) {
      if (i > 0) {
        elements.push(svgText(currentX, closingTextY, ',', {
          fill: COLORS.func,
          fontSize,
        }));
        currentX += measureText(',', fontSize);
      }
      const idxText = indexToText(block.indices[i]);
      elements.push(svgText(currentX, closingTextY, idxText, {
        fill: COLORS.variable,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText(idxText, fontSize, true);
    }

    elements.push(svgText(currentX, closingTextY, ']', {
      fill: COLORS.func,
      fontSize,
      fontWeight: '600',
    }));
    currentX += measureText(']', fontSize, true);
  }

  // Box width is the maximum width across all lines
  const boxWidth = Math.max(maxRenderedWidth, currentX - x + padding);

  // Background box (rendered first, so it appears behind text)
  const bgRect = svgRect(x, y, boxWidth, totalHeight, {
    fill: COLORS.funcBg,
    stroke: COLORS.func,
    strokeWidth: 1,
    rx: 3,
  });

  const result = {
    svg: bgRect + '\n' + elements.join('\n'),
    width: boxWidth,
    height: totalHeight,
  };

  return addInlineComment(result, block.comment, x, y, maxWidth);
}

// Render multi-colored segmented text in a box
function renderColoredSegmentBox(
  segments: ColoredSegment[],
  x: number,
  y: number,
  options: {
    fill: string;
    stroke: string;
    defaultColor: string;
    prefix?: string;
    nested?: boolean;
  }
): RenderResult {
  const fontSize = FONT_SIZES.normal;
  // Use smaller padding for nested boxes so they fit inside parent boxes
  const padding = options.nested ? 2 : SPACING.blockPadding;

  // Calculate total width including prefix
  let totalWidth = 0;
  if (options.prefix) {
    totalWidth += measureText(options.prefix, fontSize, true);
  }
  for (const seg of segments) {
    totalWidth += measureText(seg.text, fontSize, true);
  }
  const boxWidth = totalWidth + padding * 2;
  const boxHeight = fontSize + padding * 2;

  const elements: string[] = [];

  // Background rect
  elements.push(svgRect(x, y, boxWidth, boxHeight, {
    fill: options.fill,
    stroke: options.stroke,
    strokeWidth: 1,
    rx: 3,
  }));

  // Render prefix if present
  const textY = y + padding + fontSize * 0.85;
  let textX = x + padding;

  if (options.prefix) {
    elements.push(svgText(textX, textY, options.prefix, {
      fill: options.defaultColor,
      fontSize,
      fontWeight: '600',
    }));
    textX += measureText(options.prefix, fontSize, true);
  }

  // Render each segment with appropriate color
  for (const seg of segments) {
    let color = options.defaultColor;
    let fontWeight = '600';

    switch (seg.type) {
      case 'index':
        color = COLORS.variable; // blue
        fontWeight = '600';
        break;
      case 'nameRef':
        color = COLORS.nameRef; // pink
        fontWeight = '600';
        break;
      case 'contextVar':
        color = COLORS.context; // green
        fontWeight = '600';
        break;
      default:
        color = options.defaultColor;
    }

    elements.push(svgText(textX, textY, seg.text, {
      fill: color,
      fontSize,
      fontWeight,
    }));
    textX += measureText(seg.text, fontSize, true);
  }

  return {
    svg: elements.join('\n'),
    width: boxWidth,
    height: boxHeight,
  };
}

// Helper to add index segments with proper coloring for name-refs
function addIndexSegments(segments: ColoredSegment[], index: Index): void {
  // Check if this is a time-index with a name-ref value (like @$C)
  if (index.kind === 'time-index' && index.value.kind === 'name-ref') {
    // Split into @ (blue/index) and variable name (pink/nameRef)
    segments.push({ text: '@', type: 'index' });
    segments.push({ text: index.value.name, type: 'nameRef' });
  } else if (index.value.kind === 'name-ref') {
    // Standalone name-ref without @ (like $C) - just the name in pink
    segments.push({ text: index.value.name, type: 'nameRef' });
  } else {
    // Regular index - all blue
    segments.push({ text: indexToText(index), type: 'index' });
  }
}

function contextVarToColoredSegments(block: ContextVar): ColoredSegment[] {
  const segments: ColoredSegment[] = [];

  // Base - mark as contextVar for green coloring
  segments.push({ text: block.base, type: 'contextVar' });

  // Root indices
  if (block.indices.length > 0) {
    segments.push({ text: '[', type: 'contextVar' });
    for (let i = 0; i < block.indices.length; i++) {
      if (i > 0) segments.push({ text: ',', type: 'contextVar' });
      addIndexSegments(segments, block.indices[i]);
    }
    segments.push({ text: ']', type: 'contextVar' });
  }

  // Path segments
  let current = block.path;
  while (current) {
    segments.push({ text: '.', type: 'contextVar' });
    segments.push({ text: current.base, type: 'contextVar' });
    if (current.indices.length > 0) {
      segments.push({ text: '[', type: 'contextVar' });
      for (let i = 0; i < current.indices.length; i++) {
        if (i > 0) segments.push({ text: ',', type: 'contextVar' });
        addIndexSegments(segments, current.indices[i]);
      }
      segments.push({ text: ']', type: 'contextVar' });
    }
    current = current.next;
  }

  return segments;
}

// Render a context variable block with proper index and nameRef coloring
function renderContextVarBlock(block: ContextVar, x: number, y: number, maxWidth?: number): RenderResult {
  const segments = contextVarToColoredSegments(block);

  const result = renderColoredSegmentBox(segments, x, y, {
    fill: COLORS.contextBg,
    stroke: COLORS.context,
    defaultColor: COLORS.context,
  });

  return addInlineComment(result, block.comment, x, y, maxWidth);
}

// Render name reference (pink text)
function renderNameRefBlock(block: NameRef, x: number, y: number): RenderResult {
  const text = nameRefToText(block);
  return renderStyledText(text, x, y + FONT_SIZES.normal * 0.85, {
    color: COLORS.nameRef,
    fontSize: FONT_SIZES.normal,
    bold: true,
  });
}

// Render a comment
function renderComment(text: string, x: number, y: number, addOffset: boolean = false, maxWidth?: number): RenderResult {
  const commentText = `// ${text}`;
  const contentX = addOffset ? x + 8 : x;
  const fontSize = FONT_SIZES.comment;

  // If maxWidth is specified, wrap the text
  if (maxWidth) {
    const availableWidth = maxWidth - contentX;
    const lines = wrapText(commentText, fontSize, availableWidth, false);
    const result = renderMultilineText(lines, contentX, y, {
      fill: COLORS.comment,
      fontSize,
      fontStyle: 'italic',
    });
    return result;
  }

  // No wrapping
  return renderStyledText(commentText, contentX, y + fontSize * 0.85, {
    color: COLORS.comment,
    fontSize,
    italic: true,
  });
}

// Render index value with proper coloring
function renderIndexValue(index: Index, x: number, y: number): RenderResult {
  const text = indexToText(index);
  const color = index.kind === 'time-index' ? COLORS.variable : COLORS.variable;

  return renderStyledText(text, x, y + FONT_SIZES.normal * 0.85, {
    color,
    fontSize: FONT_SIZES.normal,
    bold: true,
  });
}

// Render a role building block (inline element inside role)
function renderRoleBuildingBlock(block: RoleBuildingBlock, x: number, y: number, maxWidth?: number): RenderResult {
  if (block.kind === 'conditional-block-inside-role') {
    console.log('[renderRoleBuildingBlock] calling renderConditionalInsideRole with maxWidth:', maxWidth);
  }

  switch (block.kind) {
    case 'template':
      return renderTemplateBlock(block, x, y, maxWidth);
    case 'context-var':
      return renderContextVarBlock(block, x, y, maxWidth);
    case 'function':
      return renderFuncBlock(block, x, y, false, maxWidth);
    case 'name-ref':
      return renderNameRefBlock(block, x, y);
    case 'comment-block':
      return renderComment(block.text, x, y, false, maxWidth);
    case 'name-def':
      return renderNameDef(block, x, y, maxWidth);
    case 'other-index':
      return renderIndexValue(block, x, y);
    case 'loop-block-inside-role':
      return renderLoopInsideRole(block, x, y, maxWidth);
    case 'conditional-block-inside-role':
      return renderConditionalInsideRole(block, x, y, maxWidth);
    case 'switch-block-inside-role':
      return renderSwitchInsideRole(block, x, y, maxWidth);
    case 'mark-block-inside-role':
      return renderMarkBlockInsideRole(block, x, y, maxWidth);
    case 'end-block':
      return renderEndBlock(block, x, y);
    case 'str-frag-invocation':
      return renderStrFragInvocation(block, x, y, maxWidth);
    default:
      return { svg: '', width: 0, height: 0 };
  }
}

// Render name definition: Name varname := value
function renderNameDef(block: NameDef, x: number, y: number, maxWidth?: number): RenderResult {
  const elements: string[] = [];
  // Add offset to align with control flow headers
  const startX = x + 8;
  let currentX = startX;
  const fontSize = FONT_SIZES.normal;
  const padding = SPACING.blockPadding;

  // Box height for inline elements
  const boxHeight = fontSize + padding * 2;

  // Vertically center text with the boxes
  // Box text baseline is at: boxY + padding + fontSize * 0.85
  // We want text baseline to match, so render text at same baseline
  const textY = y + padding + fontSize * 0.85;

  // "Name" keyword
  elements.push(svgText(currentX, textY, 'Name', {
    fill: COLORS.textPrimary,
    fontSize,
    fontWeight: '800',
  }));
  currentX += measureText('Name', fontSize, true) + 4;

  // Variable name (pink)
  elements.push(svgText(currentX, textY, block.name, {
    fill: COLORS.nameRef,
    fontSize,
    fontWeight: '600',
  }));
  currentX += measureText(block.name, fontSize, true) + 4;

  // :=
  elements.push(svgText(currentX, textY, ':=', {
    fill: COLORS.textPrimary,
    fontSize,
    fontWeight: '600',
  }));
  currentX += measureText(':=', fontSize, true) + 4;

  // Pre-render value at natural width to check if it fits on the same line
  let valueResult: RenderResult;
  if (block.value.kind === 'context-var') {
    valueResult = renderContextVarBlock(block.value, 0, 0, undefined);
  } else if (block.value.kind === 'function') {
    valueResult = renderFuncBlock(block.value, 0, 0, false, undefined);
  } else if (block.value.kind === 'list-comprehension') {
    valueResult = renderListComprehension(block.value, 0, 0, undefined);
  } else {
    // StrFragInvocation
    valueResult = renderStrFragInvocation(block.value, 0, 0, undefined);
  }

  // Check if value fits on the same line
  const availableWidth = maxWidth ? maxWidth - currentX : Infinity;
  const fitsOnSameLine = valueResult.width <= availableWidth;

  if (fitsOnSameLine) {
    // Render value on same line
    const translated = `<g transform="translate(${currentX}, ${y})">${valueResult.svg}</g>`;
    elements.push(translated);
    currentX += valueResult.width;

    return {
      svg: elements.join('\n'),
      width: currentX - x,
      height: Math.max(boxHeight, valueResult.height),
    };
  } else {
    // Wrap value to next line - don't constrain width, let it render at full natural width
    const lineHeight = getLineHeight(fontSize);
    const nextLineY = y + lineHeight + SPACING.elementGap;

    // Re-render value on next line without width constraint
    if (block.value.kind === 'context-var') {
      valueResult = renderContextVarBlock(block.value, 0, 0, undefined);
    } else if (block.value.kind === 'function') {
      valueResult = renderFuncBlock(block.value, 0, 0, false, undefined);
    } else if (block.value.kind === 'list-comprehension') {
      valueResult = renderListComprehension(block.value, 0, 0, undefined);
    } else {
      // StrFragInvocation
      valueResult = renderStrFragInvocation(block.value, 0, 0, undefined);
    }

    const translated = `<g transform="translate(${startX}, ${nextLineY})">${valueResult.svg}</g>`;
    elements.push(translated);

    return {
      svg: elements.join('\n'),
      width: Math.max(currentX - x, startX - x + valueResult.width),
      height: lineHeight + SPACING.elementGap + valueResult.height,
    };
  }
}

// Render list comprehension
function renderListComprehension(block: ListComprehension, x: number, y: number, _maxWidth?: number): RenderResult {
  const elements: string[] = [];
  let currentX = x;
  const fontSize = FONT_SIZES.normal;
  const padding = SPACING.blockPadding;
  // Align text baseline with boxes (boxes use y + padding + fontSize * 0.85)
  const textY = y + padding + fontSize * 0.85;

  // [
  elements.push(svgText(currentX, textY, '[', {
    fill: COLORS.textPrimary,
    fontSize,
    fontWeight: '700',
  }));
  currentX += measureText('[', fontSize, true) + 2;

  // element
  let elemResult: RenderResult;
  if (block.element.kind === 'context-var') {
    elemResult = renderContextVarBlock(block.element, currentX, y);
  } else if (block.element.kind === 'function') {
    elemResult = renderFuncBlock(block.element, currentX, y);
  } else {
    elemResult = renderStrFragInvocation(block.element, currentX, y);
  }
  elements.push(elemResult.svg);
  currentX += elemResult.width + 4;

  // |
  elements.push(svgText(currentX, textY, '|', {
    fill: COLORS.textPrimary,
    fontSize,
    fontWeight: '700',
  }));
  currentX += measureText('|', fontSize, true) + 4;

  // variable
  elements.push(svgText(currentX, textY, block.variable, {
    fill: COLORS.variable,
    fontSize,
    fontWeight: '700',
  }));
  currentX += measureText(block.variable, fontSize, true) + 4;

  // ∈
  elements.push(svgText(currentX, textY, '∈', {
    fill: COLORS.textPrimary,
    fontSize,
    fontWeight: '600',
  }));
  currentX += measureText('∈', fontSize) + 4;

  // iterable - use token-based rendering for proper coloring
  const iterTokens = iterableToTokens(block.iterable);
  const iterResult = renderExpressionTokensSvg(iterTokens, currentX, textY, fontSize);
  elements.push(...iterResult.elements);
  currentX += iterResult.width + 2;

  // ]
  elements.push(svgText(currentX, textY, ']', {
    fill: COLORS.textPrimary,
    fontSize,
    fontWeight: '700',
  }));
  currentX += measureText(']', fontSize, true);

  return {
    svg: elements.join('\n'),
    width: currentX - x,
    height: Math.max(fontSize + padding * 2, elemResult.height),
  };
}

// Render end block (PromptEndsHere when condition)
function renderEndBlock(block: EndBlock, x: number, y: number): RenderResult {
  const elements: string[] = [];
  const lineHeight = getLineHeight(FONT_SIZES.normal);
  const fontSize = FONT_SIZES.normal;
  const textY = y + fontSize * 0.85;

  // Line Y position: align with middle of text (baseline - half of x-height)
  const lineY = textY - fontSize * 0.35;

  // Dashed line starts from left edge, extends to where text begins
  const lineStartX = x;
  const dashLength = 80;

  // Dashed line (left side) - darker color to match text
  elements.push(svgLine(lineStartX, lineY, lineStartX + dashLength, lineY, {
    stroke: COLORS.textPrimary,
    strokeWidth: 1,
    strokeDasharray: '4,4',
  }));

  let currentX = lineStartX + dashLength + 6;

  // "PromptEndsHere" keyword
  elements.push(svgText(currentX, textY, 'PromptEndsHere', {
    fill: COLORS.textPrimary,
    fontSize: FONT_SIZES.normal,
    fontWeight: '800',
  }));
  currentX += measureText('PromptEndsHere', FONT_SIZES.normal, true) + 4;

  // "when" keyword
  elements.push(svgText(currentX, textY, 'when', {
    fill: COLORS.textPrimary,
    fontSize: FONT_SIZES.normal,
    fontWeight: '800',
  }));
  currentX += measureText('when', FONT_SIZES.normal, true) + 4;

  // Condition - render with proper styling (context vars with boxes, indices in blue, etc.)
  const condResult = renderExpressionTokensSvg(block.condition, currentX, textY, FONT_SIZES.normal);
  elements.push(...condResult.elements);
  currentX += condResult.width;

  return {
    svg: elements.join('\n'),
    width: currentX - x,
    height: lineHeight,
  };
}

/* ───────────────── Fragment Definitions ───────────────── */

// Render a StrFragDef (String Fragment Definition) as SVG
// Similar structure to a prompt container with badge approach: "Name[params] [SF]"
function renderStrFragDefSvg(frag: StrFragDef, x: number, y: number, maxWidth?: number): RenderResult {
  const elements: string[] = [];
  const fontSize = FONT_SIZES.title;
  const badgeFontSize = 8;
  let currentY = y;

  // Build title text: "Name[params]"
  let titleText = frag.name;
  if (frag.params.length > 0) {
    const paramsText = frag.params.map(p => textArgsToText(p)).join(', ');
    titleText += `[${paramsText}]`;
  }

  // Render fragment name first
  const titleWidth = measureText(titleText, fontSize);
  elements.push(svgText(x, currentY + fontSize, titleText, {
    fill: COLORS.textPrimary,
    fontSize,
    fontWeight: '700',
  }));

  // Render [SF] badge to the right
  const badgeText = 'SF';
  const badgeTextWidth = measureText(badgeText, badgeFontSize);
  const badgePadding = 4;
  const badgeWidth = badgeTextWidth + badgePadding * 2;
  const badgeHeight = badgeFontSize + badgePadding;
  const badgeX = x + titleWidth + 8;
  const badgeY = currentY + (fontSize - badgeHeight) / 2 + 2;

  // Badge background
  elements.push(svgRect(badgeX, badgeY, badgeWidth, badgeHeight, {
    fill: COLORS.badgeBg,
    rx: 3,
    ry: 3,
  }));

  // Badge text
  elements.push(svgText(badgeX + badgePadding, badgeY + badgeFontSize - 1, badgeText, {
    fill: COLORS.badgeText,
    fontSize: badgeFontSize,
    fontWeight: '600',
  }));

  const titleHeight = fontSize + SPACING.blockGap;
  currentY += titleHeight;

  // Left border starts from bottom of title
  const borderStartY = currentY;

  // Render body (RoleBuildingBlocks)
  const bodyX = x + SPACING.indentSize;
  let bodyHeight = 0;

  for (const block of frag.body) {
    const result = renderRoleBuildingBlock(block, bodyX, currentY, maxWidth ? maxWidth - SPACING.indentSize : undefined);
    elements.push(result.svg);
    currentY += result.height + SPACING.elementGap;
    bodyHeight += result.height + SPACING.elementGap;
  }

  // Container left border
  elements.push(svgLine(x, borderStartY, x, currentY - SPACING.elementGap, {
    stroke: COLORS.borderMedium,
    strokeWidth: 1,
  }));

  const totalHeight = titleHeight + bodyHeight;
  const totalWidth = maxWidth || 400;

  return {
    svg: elements.join('\n'),
    width: totalWidth,
    height: totalHeight,
  };
}

// Render a RoleFragDef (Role Fragment Definition) as SVG
// Similar structure to a prompt container with badge approach: "Name[params] [RF]"
function renderRoleFragDefSvg(frag: RoleFragDef, x: number, y: number, maxWidth?: number): RenderResult {
  const elements: string[] = [];
  const fontSize = FONT_SIZES.title;
  const badgeFontSize = 8;
  let currentY = y;

  // Build title text: "Name[params]"
  let titleText = frag.name;
  if (frag.params.length > 0) {
    const paramsText = frag.params.map(p => textArgsToText(p)).join(', ');
    titleText += `[${paramsText}]`;
  }

  // Render fragment name first
  const titleWidth = measureText(titleText, fontSize);
  elements.push(svgText(x, currentY + fontSize, titleText, {
    fill: COLORS.textPrimary,
    fontSize,
    fontWeight: '700',
  }));

  // Render [RF] badge to the right
  const badgeText = 'RF';
  const badgeTextWidth = measureText(badgeText, badgeFontSize);
  const badgePadding = 4;
  const badgeWidth = badgeTextWidth + badgePadding * 2;
  const badgeHeight = badgeFontSize + badgePadding;
  const badgeX = x + titleWidth + 8;
  const badgeY = currentY + (fontSize - badgeHeight) / 2 + 2;

  // Badge background
  elements.push(svgRect(badgeX, badgeY, badgeWidth, badgeHeight, {
    fill: COLORS.badgeBg,
    rx: 3,
    ry: 3,
  }));

  // Badge text
  elements.push(svgText(badgeX + badgePadding, badgeY + badgeFontSize - 1, badgeText, {
    fill: COLORS.badgeText,
    fontSize: badgeFontSize,
    fontWeight: '600',
  }));

  const titleHeight = fontSize + SPACING.blockGap;
  currentY += titleHeight;

  // Left border starts from bottom of title
  const borderStartY = currentY;

  // Render body (PromptBlocks - role messages, etc.)
  let bodyHeight = 0;

  for (const block of frag.body) {
    const result = renderTopLevelBlock(block, x, currentY, maxWidth);
    elements.push(result.svg);
    currentY += result.height + SPACING.blockGap;
    bodyHeight += result.height + SPACING.blockGap;
  }

  // Container left border
  elements.push(svgLine(x, borderStartY, x, currentY - SPACING.blockGap, {
    stroke: COLORS.borderMedium,
    strokeWidth: 1,
  }));

  const totalHeight = titleHeight + bodyHeight;
  const totalWidth = maxWidth || 400;

  return {
    svg: elements.join('\n'),
    width: totalWidth,
    height: totalHeight,
  };
}

/* ───────────────── Fragment Invocations ───────────────── */

// Render a StrFragInvocation (String Fragment Invocation) as SVG
// Renders like a function call with "Frag" keyword in pink
function renderStrFragInvocation(block: StrFragInvocation, x: number, y: number, _maxWidth?: number): RenderResult {
  const elements: string[] = [];
  let currentX = x;
  const fontSize = FONT_SIZES.normal;
  const padding = SPACING.blockPadding;

  // Build the full text to measure for the box
  let fullText = `Frag ${block.name}`;
  if (block.arguments.length > 0) {
    const argsText = block.arguments.map(arg => textArgsToText(arg)).join(', ');
    fullText += `[${argsText}]`;
  }

  const textWidth = measureText(fullText, fontSize);
  const boxWidth = textWidth + padding * 2 + 4;
  const boxHeight = fontSize + padding * 2;

  // Draw box with purple styling (like functions)
  elements.push(svgRect(currentX, y, boxWidth, boxHeight, {
    fill: COLORS.funcBg,
    stroke: COLORS.func,
    strokeWidth: 1,
    rx: 3,
  }));

  const textY = y + padding + fontSize * 0.85;
  let textX = currentX + padding + 2;

  // "Frag" keyword in pink
  elements.push(svgText(textX, textY, 'Frag', {
    fill: COLORS.nameRef,
    fontSize,
    fontWeight: '600',
  }));
  textX += measureText('Frag', fontSize) + 4;

  // Fragment name in purple
  elements.push(svgText(textX, textY, block.name, {
    fill: COLORS.func,
    fontSize,
    fontWeight: '600',
  }));
  textX += measureText(block.name, fontSize);

  // Arguments
  if (block.arguments.length > 0) {
    elements.push(svgText(textX, textY, '[', {
      fill: COLORS.func,
      fontSize,
      fontWeight: '500',
    }));
    textX += measureText('[', fontSize);

    for (let i = 0; i < block.arguments.length; i++) {
      if (i > 0) {
        elements.push(svgText(textX, textY, ', ', {
          fill: COLORS.func,
          fontSize,
        }));
        textX += measureText(', ', fontSize);
      }
      const argText = textArgsToText(block.arguments[i]);
      elements.push(svgText(textX, textY, argText, {
        fill: COLORS.func,
        fontSize,
      }));
      textX += measureText(argText, fontSize);
    }

    elements.push(svgText(textX, textY, ']', {
      fill: COLORS.func,
      fontSize,
      fontWeight: '500',
    }));
  }

  return {
    svg: elements.join('\n'),
    width: boxWidth,
    height: boxHeight,
  };
}

// Render a RoleFragInvocation (Role Fragment Invocation) as SVG
// Renders like a function call with "Frag" keyword in pink
function renderRoleFragInvocation(block: RoleFragInvocation, x: number, y: number, _maxWidth?: number): RenderResult {
  const elements: string[] = [];
  let currentX = x;
  const fontSize = FONT_SIZES.normal;
  const padding = SPACING.blockPadding;

  // Build the full text to measure for the box
  let fullText = `Frag ${block.name}`;
  if (block.arguments.length > 0) {
    const argsText = block.arguments.map(arg => textArgsToText(arg)).join(', ');
    fullText += `[${argsText}]`;
  }

  const textWidth = measureText(fullText, fontSize);
  const boxWidth = textWidth + padding * 2 + 4;
  const boxHeight = fontSize + padding * 2;

  // Draw box with purple styling (like functions)
  elements.push(svgRect(currentX, y, boxWidth, boxHeight, {
    fill: COLORS.funcBg,
    stroke: COLORS.func,
    strokeWidth: 1,
    rx: 3,
  }));

  const textY = y + padding + fontSize * 0.85;
  let textX = currentX + padding + 2;

  // "Frag" keyword in pink
  elements.push(svgText(textX, textY, 'Frag', {
    fill: COLORS.nameRef,
    fontSize,
    fontWeight: '600',
  }));
  textX += measureText('Frag', fontSize) + 4;

  // Fragment name in purple
  elements.push(svgText(textX, textY, block.name, {
    fill: COLORS.func,
    fontSize,
    fontWeight: '600',
  }));
  textX += measureText(block.name, fontSize);

  // Arguments
  if (block.arguments.length > 0) {
    elements.push(svgText(textX, textY, '[', {
      fill: COLORS.func,
      fontSize,
      fontWeight: '500',
    }));
    textX += measureText('[', fontSize);

    for (let i = 0; i < block.arguments.length; i++) {
      if (i > 0) {
        elements.push(svgText(textX, textY, ', ', {
          fill: COLORS.func,
          fontSize,
        }));
        textX += measureText(', ', fontSize);
      }
      const argText = textArgsToText(block.arguments[i]);
      elements.push(svgText(textX, textY, argText, {
        fill: COLORS.func,
        fontSize,
      }));
      textX += measureText(argText, fontSize);
    }

    elements.push(svgText(textX, textY, ']', {
      fill: COLORS.func,
      fontSize,
      fontWeight: '500',
    }));
  }

  return {
    svg: elements.join('\n'),
    width: boxWidth,
    height: boxHeight,
  };
}

// Render role message body (content inside a role) with wrapping support
function renderRoleBody(body: RoleBuildingBlock[], startX: number, startY: number, maxWidth?: number): RenderResult {
  console.log('[renderRoleBody]', {
    hasMaxWidth: !!maxWidth,
    maxWidth,
    bodyLength: body.length
  });

  const elements: string[] = [];
  let currentY = startY;
  let overallMaxWidth = 0;
  const contentX = startX + SPACING.rolePadding;
  const effectiveMaxWidth = maxWidth || 800; // Default max width

  console.log('[renderRoleBody] effectiveMaxWidth:', effectiveMaxWidth);

  // Group consecutive inline blocks for flow layout
  let inlineGroup: RoleBuildingBlock[] = [];

  const flushInlineGroup = () => {
    if (inlineGroup.length === 0) return;

    const flowResult = renderInlineBlocksWithWrap(
      inlineGroup,
      contentX,
      currentY,
      effectiveMaxWidth,
      (block, _x, _y, maxW) => renderRoleBuildingBlock(block, 0, 0, maxW)
    );
    elements.push(flowResult.svg);
    overallMaxWidth = Math.max(overallMaxWidth, flowResult.width);
    currentY += flowResult.height + SPACING.elementGap;
    inlineGroup = [];
  };

  for (const block of body) {
    if (isInlineBlock(block.kind)) {
      // Accumulate inline blocks
      inlineGroup.push(block);
    } else {
      // Flush any pending inline blocks first
      flushInlineGroup();

      // Render block-level element on its own line
      console.log('[renderRoleBody] rendering block:', block.kind, 'with effectiveMaxWidth:', effectiveMaxWidth);
      const result = renderRoleBuildingBlock(block, contentX, currentY, effectiveMaxWidth);
      elements.push(result.svg);
      overallMaxWidth = Math.max(overallMaxWidth, result.width);
      currentY += result.height + SPACING.elementGap;
    }
  }

  // Flush any remaining inline blocks
  flushInlineGroup();

  return {
    svg: elements.join('\n'),
    width: overallMaxWidth + SPACING.rolePadding * 2,
    height: currentY - startY,
  };
}

// Render role message
function renderRoleMessage(msg: RoleMessage, x: number, y: number, maxWidth?: number): RenderResult {
  const colors = getRoleColors(msg.role);
  const elements: string[] = [];
  let currentY = y;

  // Add offset to align with control flow headers
  const contentX = x + 8;

  // Role header badge - render "ROLE:" and role name separately with small gap
  const rolePrefix = 'ROLE:';
  const roleName = msg.role.toUpperCase();
  const roleGap = 2; // pixels between colon and role name
  const prefixWidth = measureText(rolePrefix, FONT_SIZES.roleHeader, true);
  const nameWidth = measureText(roleName, FONT_SIZES.roleHeader, true);
  const headerWidth = prefixWidth + roleGap + nameWidth + 8;
  const headerHeight = FONT_SIZES.roleHeader + 4;

  elements.push(svgRect(contentX, currentY, headerWidth, headerHeight, {
    fill: colors.bg,
    rx: 2,
  }));

  const textY = currentY + FONT_SIZES.roleHeader + 1;
  // Use stroke to make text appear bolder
  const roleTextStyle = `font-family="'JetBrains Mono', monospace" font-size="${FONT_SIZES.roleHeader}" font-weight="900" fill="${colors.text}" stroke="${colors.text}" stroke-width="0.15"`;
  elements.push(`<text x="${contentX + 4}" y="${textY}" ${roleTextStyle}>${rolePrefix}</text>`);
  elements.push(`<text x="${contentX + 4 + prefixWidth + roleGap}" y="${textY}" ${roleTextStyle}>${roleName}</text>`);

  currentY += headerHeight + 2;

  // Body content - pass maxWidth adjusted for content offset
  const bodyMaxWidth = maxWidth ? maxWidth - 8 : undefined;
  const bodyResult = renderRoleBody(msg.body, contentX, currentY, bodyMaxWidth);
  elements.push(bodyResult.svg);

  const totalHeight = currentY - y + bodyResult.height;

  // Left border line (aligned with content)
  elements.push(svgLine(contentX, y, contentX, y + totalHeight, {
    stroke: colors.border,
    strokeWidth: 1,
  }));

  return {
    svg: elements.join('\n'),
    width: Math.max(headerWidth, bodyResult.width) + 8,
    height: totalHeight,
  };
}

// Render expression tokens with proper coloring for conditions/expressions
// Handles context vars, time indices, name refs, operators, range(), function calls, etc.
function renderExpressionTokensSvg(
  tokens: ExpressionToken[],
  startX: number,
  textY: number,
  fontSize: number,
  maxWidth?: number,
  startY?: number
): { elements: string[]; width: number; height?: number; lastLineY?: number } {

  // TWO-PASS ALGORITHM for wrapping:
  // Pass 1: Calculate width and find logical operator positions
  // Pass 2: If too wide, determine break points and render with wrapping

  if (maxWidth) {
    // Pass 1: Render to calculate width and track logical operators
    const pass1Result = renderExpressionTokensPass1(tokens, fontSize);

    console.log('[PASS 1] width:', pass1Result.width, 'maxWidth:', maxWidth, 'exceeds:', pass1Result.width > maxWidth);
    console.log('[PASS 1] logical operators at:', pass1Result.logicalOpPositions);

    // If it fits, return the single-line render
    if (pass1Result.width <= maxWidth) {
      return renderExpressionTokensOneLine(tokens, startX, textY, fontSize);
    }

    // Pass 2: Determine break points
    const breakPoints = determineBreakPoints(pass1Result.logicalOpPositions, pass1Result.tokenWidths, maxWidth, startX);
    console.log('[PASS 2] break points:', breakPoints);

    // Render with breaks
    return renderExpressionTokensWithBreaks(tokens, startX, textY, fontSize, breakPoints);
  }

  // No maxWidth, just render on one line
  return renderExpressionTokensOneLine(tokens, startX, textY, fontSize);
}

// Helper: Calculate width and track logical operator positions (Pass 1)
function renderExpressionTokensPass1(
  tokens: ExpressionToken[],
  fontSize: number
): { width: number; logicalOpPositions: number[]; tokenWidths: number[] } {
  console.log('[PASS 1] tokens:', tokens.map(t => ({ type: t.type, value: t.value })));

  // Use actual rendering to get correct width (including context vars, functions, etc.)
  const actualRender = renderExpressionTokensOneLine(tokens, 0, 0, fontSize);
  const totalWidth = actualRender.width;

  // Track logical operator positions and cumulative widths
  const logicalOpPositions: number[] = [];
  const tokenWidths: number[] = [];

  // Now render chunk by chunk to track widths at each logical operator
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // Check if this is a logical operator we can break at
    if (tok.type === 'LOGIC_OP' && (tok.value === '&&' || tok.value === '||')) {
      console.log(`[PASS 1] Found logical operator at ${i}:`, tok.value);
      logicalOpPositions.push(i);
      // Render up to and including this operator to get width
      const chunkTokens = tokens.slice(0, i + 1);
      const chunkRender = renderExpressionTokensOneLine(chunkTokens, 0, 0, fontSize);
      tokenWidths[i] = chunkRender.width;
    } else if (tok.type === 'KEYWORD' && (tok.value === 'and' || tok.value === 'or')) {
      console.log(`[PASS 1] Found logical keyword at ${i}:`, tok.value);
      logicalOpPositions.push(i);
      // Render up to and including this keyword to get width
      const chunkTokens = tokens.slice(0, i + 1);
      const chunkRender = renderExpressionTokensOneLine(chunkTokens, 0, 0, fontSize);
      tokenWidths[i] = chunkRender.width;
    }
  }

  return { width: totalWidth, logicalOpPositions, tokenWidths };
}

// Helper: Determine where to break lines
function determineBreakPoints(
  logicalOpPositions: number[],
  tokenWidths: number[],
  maxWidth: number,
  startX: number
): number[] {
  const breakPoints: number[] = [];
  let lineStartWidth = 0;

  for (let i = logicalOpPositions.length - 1; i >= 0; i--) {
    const opIndex = logicalOpPositions[i];
    const widthAtOp = tokenWidths[opIndex] - lineStartWidth;

    console.log(`[determineBreakPoints] op at ${opIndex}, width: ${widthAtOp}, maxWidth: ${maxWidth}`);

    // If this operator position is past maxWidth, skip it
    if (widthAtOp > maxWidth) {
      continue;
    }

    // This operator fits! Break after it
    breakPoints.unshift(opIndex); // Add to beginning to keep in order
    lineStartWidth = tokenWidths[opIndex];

    console.log(`[determineBreakPoints] Breaking after token ${opIndex}`);
  }

  return breakPoints;
}

// Helper: Render on one line (used when no wrapping needed)
function renderExpressionTokensOneLine(
  tokens: ExpressionToken[],
  startX: number,
  textY: number,
  fontSize: number
): { elements: string[]; width: number; height?: number; lastLineY?: number } {
  // This is the existing rendering logic without wrapping
  const elements: string[] = [];
  let currentX = startX;
  let currentTextY = textY;
  let i = 0;

  const smallSpace = measureText(' ', fontSize) * 0.65;

  while (i < tokens.length) {
    const tok = tokens[i];

    // Add small space before token if needed, but NOT before certain symbols
    // that should attach directly to the previous token
    const noSpaceBeforeSymbols = ['.', '(', ')', '[', ']', ',', ':'];
    if (tok.spaceBefore && !noSpaceBeforeSymbols.includes(tok.value)) {
      currentX += smallSpace;
    }

    // Check for context var pattern: namespace keyword followed by dot
    if (tok.type === 'KEYWORD' &&
        ['env', 'sys', 'resp', 'prompt'].includes(tok.value) &&
        i + 1 < tokens.length &&
        tokens[i + 1].type === 'SYMBOL' &&
        tokens[i + 1].value === '.') {

      // Collect all tokens that form the context var path
      let contextVarText = tok.value;
      i++;

      // Track bracket/paren depth to handle nested structures
      let parenDepth = 0;
      let bracketDepth = 0;

      while (i < tokens.length) {
        const t = tokens[i];

        // Handle opening brackets
        if (t.value === '[') {
          bracketDepth++;
          contextVarText += t.value;
          i++;
          continue;
        }
        if (t.value === ']') {
          bracketDepth--;
          contextVarText += t.value;
          i++;
          if (bracketDepth === 0 && parenDepth === 0) {
            // Check if there's more path after bracket
            if (i < tokens.length && tokens[i].value === '.') {
              continue;
            }
            break;
          }
          continue;
        }

        // Handle opening parens
        if (t.value === '(') {
          parenDepth++;
          contextVarText += t.value;
          i++;
          continue;
        }
        if (t.value === ')') {
          parenDepth--;
          contextVarText += t.value;
          i++;
          if (bracketDepth === 0 && parenDepth === 0) {
            if (i < tokens.length && tokens[i].value === '.') {
              continue;
            }
            break;
          }
          continue;
        }

        // Inside brackets/parens, collect everything
        if (parenDepth > 0 || bracketDepth > 0) {
          contextVarText += t.value;
          i++;
          continue;
        }

        // Dot continues the path
        if (t.value === '.') {
          contextVarText += t.value;
          i++;
          continue;
        }

        // Identifier or keyword continues the path (path segments can be keywords like "name")
        if (t.type === 'IDENT' || t.type === 'KEYWORD' || t.type === 'NUMBER') {
          contextVarText += t.value;
          i++;
          continue;
        }

        // @ continues the path
        if (t.value === '@') {
          contextVarText += t.value;
          i++;
          continue;
        }

        // $ continues the path (for variable references like $C)
        if (t.value === '$') {
          contextVarText += t.value;
          i++;
          continue;
        }

        // Anything else ends the context var
        break;
      }

      // Parse context var text into segments with proper coloring
      // - Indices (@T, @i, @t.i, @T.0) are blue
      // - Variables ($C, $var) are pink - $ is NOT stored/displayed
      // - @$var splits into @ (blue) + varname (pink)
      const ctxSegments: Array<{ text: string; type: 'index' | 'variable' | 'regular' }> = [];
      let pos = 0;
      while (pos < contextVarText.length) {
        const ch = contextVarText[pos];

        // Handle brackets
        if (ch === '[' || ch === ']') {
          ctxSegments.push({ text: ch, type: 'regular' });
          pos++;
          continue;
        }

        // Handle @ followed by $ (variable reference as index)
        if (ch === '@' && pos + 1 < contextVarText.length && contextVarText[pos + 1] === '$') {
          // Push @ as index (blue)
          ctxSegments.push({ text: '@', type: 'index' });
          pos += 2; // skip @ and $
          // Collect the variable name (without $)
          let varName = '';
          while (pos < contextVarText.length && /[A-Za-z0-9_]/.test(contextVarText[pos])) {
            varName += contextVarText[pos];
            pos++;
          }
          if (varName) {
            // Push variable name as variable (pink) - $ already excluded
            ctxSegments.push({ text: varName, type: 'variable' });
          }
          continue;
        }

        // Handle @ followed by identifier (time index) - all blue
        if (ch === '@') {
          let indexText = '@';
          pos++;
          // Collect identifier with optional dot-separated parts
          while (pos < contextVarText.length) {
            const c = contextVarText[pos];
            if (/[A-Za-z0-9_]/.test(c)) {
              indexText += c;
              pos++;
            } else if (c === '.' && pos + 1 < contextVarText.length && /[A-Za-z0-9_@]/.test(contextVarText[pos + 1])) {
              indexText += c;
              pos++;
            } else {
              break;
            }
          }
          ctxSegments.push({ text: indexText, type: 'index' });
          continue;
        }

        // Handle standalone $ (variable reference) - pink, $ not stored
        if (ch === '$') {
          pos++; // skip $
          let varName = '';
          while (pos < contextVarText.length && /[A-Za-z0-9_]/.test(contextVarText[pos])) {
            varName += contextVarText[pos];
            pos++;
          }
          if (varName) {
            ctxSegments.push({ text: varName, type: 'variable' });
          }
          continue;
        }

        // Collect regular text until next special character
        let regularText = '';
        while (pos < contextVarText.length && !/[@\[\]$]/.test(contextVarText[pos])) {
          regularText += contextVarText[pos];
          pos++;
        }
        if (regularText) {
          ctxSegments.push({ text: regularText, type: 'regular' });
        }
      }

      // Calculate total width - variable text no longer includes $
      let ctxTotalWidth = 0;
      for (const seg of ctxSegments) {
        const isBold = seg.type === 'index';
        ctxTotalWidth += measureText(seg.text, fontSize, isBold);
      }

      // Render context var with box
      const ctxPadding = 2;
      const ctxBoxWidth = ctxTotalWidth + ctxPadding * 2;
      const ctxBoxHeight = fontSize + ctxPadding * 2;
      const ctxBoxY = currentTextY - fontSize - ctxPadding + 1;

      // Box background
      elements.push(svgRect(currentX, ctxBoxY, ctxBoxWidth, ctxBoxHeight, {
        fill: COLORS.contextBg,
        stroke: COLORS.context,
        strokeWidth: 1,
        rx: 3,
      }));

      // Render each segment with appropriate color
      // - index: blue, bold
      // - variable: pink (nameRef) - $ already excluded from text
      // - regular: green (context), semi-bold
      let segX = currentX + ctxPadding;
      for (const seg of ctxSegments) {
        const displayText = seg.text; // $ already excluded during parsing
        const isBold = seg.type === 'index';
        let fill = COLORS.context; // default green
        if (seg.type === 'index') fill = COLORS.variable; // blue
        if (seg.type === 'variable') fill = COLORS.nameRef; // pink
        elements.push(svgText(segX, currentTextY, displayText, {
          fill,
          fontSize,
          fontWeight: '600',
        }));
        segX += measureText(displayText, fontSize, isBold);
      }
      currentX += ctxBoxWidth;
      continue;
    }

    // Check for range pattern: range(start, end) or range(start, end, step)
    if (tok.type === 'IDENT' &&
        tok.value === 'range' &&
        i + 1 < tokens.length &&
        tokens[i + 1].value === '(') {

      i++; // skip "range"
      i++; // skip "("

      // Parse start tokens (until comma at depth 0)
      const startTokens: ExpressionToken[] = [];
      let depth = 0;
      while (i < tokens.length && !(tokens[i].value === ',' && depth === 0)) {
        const t = tokens[i];
        if (t.value === '(') depth++;
        if (t.value === ')') depth--;
        startTokens.push(t);
        i++;
      }
      i++; // skip ","

      // Parse end tokens (until comma or closing paren at depth 0)
      const endTokens: ExpressionToken[] = [];
      depth = 0;
      while (i < tokens.length && !((tokens[i].value === ',' || tokens[i].value === ')') && depth === 0)) {
        const t = tokens[i];
        if (t.value === '(') depth++;
        if (t.value === ')') depth--;
        endTokens.push(t);
        i++;
      }

      // Check for optional step
      let stepTokens: ExpressionToken[] | undefined;
      if (i < tokens.length && tokens[i].value === ',') {
        i++; // skip ","
        stepTokens = [];
        depth = 0;
        while (i < tokens.length && !(tokens[i].value === ')' && depth === 0)) {
          const t = tokens[i];
          if (t.value === '(') depth++;
          if (t.value === ')') depth--;
          stepTokens.push(t);
          i++;
        }
      }
      i++; // skip closing ")"

      // Render as start...end or start...end every step
      const startResult = renderExpressionTokensSvg(startTokens, currentX, currentTextY, fontSize);
      elements.push(...startResult.elements);
      currentX += startResult.width;

      // ...
      elements.push(svgText(currentX, currentTextY, '...', {
        fill: COLORS.textPrimary,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText('...', fontSize, true);

      const endResult = renderExpressionTokensSvg(endTokens, currentX, currentTextY, fontSize);
      elements.push(...endResult.elements);
      currentX += endResult.width;

      // every step - use smaller spacing
      if (stepTokens) {
        const everySpace = measureText(' ', fontSize) * 0.5;
        currentX += everySpace;
        elements.push(svgText(currentX, currentTextY, 'every', {
          fill: COLORS.textPrimary,
          fontSize,
          fontWeight: '700',
        }));
        currentX += measureText('every', fontSize, true);
        currentX += everySpace;
        const stepResult = renderExpressionTokensSvg(stepTokens, currentX, currentTextY, fontSize);
        elements.push(...stepResult.elements);
        currentX += stepResult.width;
      }
      continue;
    }

    // Check for general function call pattern: identifier followed by (
    if (tok.type === 'IDENT' &&
        i + 1 < tokens.length &&
        tokens[i + 1].value === '(') {

      const funcName = tok.value;
      i++; // skip function name
      i++; // skip "("

      // Collect all tokens inside the parentheses
      const argTokens: ExpressionToken[] = [];
      let depth = 1;
      while (i < tokens.length && depth > 0) {
        const t = tokens[i];
        if (t.value === '(') depth++;
        if (t.value === ')') depth--;
        if (depth > 0) {
          argTokens.push(t);
        }
        i++;
      }

      // Render the function call
      // Special handling for min/max - render without special coloring
      const isBuiltinMath = funcName === 'min' || funcName === 'max';
      const funcColor = isBuiltinMath ? COLORS.textPrimary : COLORS.func;

      elements.push(svgText(currentX, currentTextY, funcName, {
        fill: funcColor,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText(funcName, fontSize, true);

      elements.push(svgText(currentX, currentTextY, '(', {
        fill: funcColor,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText('(', fontSize, true);

      // Render arguments recursively
      const argsResult = renderExpressionTokensSvg(argTokens, currentX, currentTextY, fontSize);
      elements.push(...argsResult.elements);
      currentX += argsResult.width;

      elements.push(svgText(currentX, currentTextY, ')', {
        fill: funcColor,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText(')', fontSize, true);
      continue;
    }

    // Check for @ followed by identifier (time index)
    if (tok.type === 'SYMBOL' && tok.value === '@' && i + 1 < tokens.length) {
      const nextTok = tokens[i + 1];

      // Handle @$varname (time index with name reference)
      if (nextTok.type === 'SYMBOL' && nextTok.value === '$' && i + 2 < tokens.length) {
        const varNameTok = tokens[i + 2];
        if (varNameTok.type === 'IDENT') {
          // Render @ in blue
          elements.push(svgText(currentX, currentTextY, '@', {
            fill: COLORS.variable,
            fontSize,
            fontWeight: '700',
          }));
          currentX += measureText('@', fontSize, true);
          // Render varname in pink (skip the $)
          elements.push(svgText(currentX, currentTextY, varNameTok.value, {
            fill: COLORS.nameRef,
            fontSize,
            fontWeight: '700',
          }));
          currentX += measureText(varNameTok.value, fontSize, true);
          i += 3;
          continue;
        }
      }

      // Handle @identifier or @number (simple time index)
      if (nextTok.type === 'IDENT' || nextTok.type === 'NUMBER') {
        let timeIndexText = '@' + nextTok.value;
        i += 2;

        // Check for compound indices like @i.k or @i.@k
        while (i < tokens.length && tokens[i].value === '.' &&
               i + 1 < tokens.length &&
               (tokens[i + 1].type === 'IDENT' || tokens[i + 1].type === 'NUMBER' || tokens[i + 1].value === '@')) {
          timeIndexText += '.';
          i++; // skip the dot
          if (tokens[i].value === '@') {
            timeIndexText += '@';
            i++;
          }
          if (i < tokens.length && (tokens[i].type === 'IDENT' || tokens[i].type === 'NUMBER')) {
            timeIndexText += tokens[i].value;
            i++;
          }
        }

        elements.push(svgText(currentX, currentTextY, timeIndexText, {
          fill: COLORS.variable,
          fontSize,
          fontWeight: '700',
        }));
        currentX += measureText(timeIndexText, fontSize, true);
        continue;
      }
    }

    // Check for $ followed by identifier (name reference)
    if (tok.type === 'SYMBOL' && tok.value === '$' && i + 1 < tokens.length) {
      const nextTok = tokens[i + 1];
      if (nextTok.type === 'IDENT') {
        let nameRefText = nextTok.value;
        i += 2;

        // Check for path or indices after name ref
        while (i < tokens.length) {
          if (tokens[i].value === '.' && i + 1 < tokens.length && tokens[i + 1].type === 'IDENT') {
            nameRefText += '.' + tokens[i + 1].value;
            i += 2;
          } else if (tokens[i].value === '[') {
            // Collect bracketed content
            let bracketDepth = 1;
            nameRefText += '[';
            i++;
            while (i < tokens.length && bracketDepth > 0) {
              if (tokens[i].value === '[') bracketDepth++;
              if (tokens[i].value === ']') bracketDepth--;
              nameRefText += tokens[i].value;
              i++;
            }
          } else {
            break;
          }
        }

        elements.push(svgText(currentX, currentTextY, nameRefText, {
          fill: COLORS.nameRef,
          fontSize,
          fontWeight: '700',
        }));
        currentX += measureText(nameRefText, fontSize, true);
        continue;
      }
    }

    // Combine consecutive logical operators (e.g., !=, <=, >=, ==, &&, ||)
    if (tok.type === 'LOGIC_OP') {
      let combined = tok.value;
      i++;
      while (i < tokens.length && tokens[i].type === 'LOGIC_OP') {
        combined += tokens[i].value;
        i++;
      }
      // Add small space before if not already present
      if (!tok.spaceBefore && currentX > startX) {
        currentX += smallSpace;
      }

      elements.push(svgText(currentX, currentTextY, combined, {
        fill: COLORS.textPrimary,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText(combined, fontSize, false); // semi-bold uses regular measurement

      // Add small space after
      currentX += smallSpace;
      continue;
    }

    // Handle arithmetic operators - % needs spacing like comparison ops
    if (tok.type === 'ARITH_OP') {
      const needsSpacing = tok.value === '%';
      if (needsSpacing && !tok.spaceBefore && currentX > startX) {
        currentX += smallSpace;
      }
      elements.push(svgText(currentX, currentTextY, tok.value, {
        fill: COLORS.textPrimary,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText(tok.value, fontSize, false); // semi-bold uses regular measurement
      if (needsSpacing) {
        currentX += smallSpace;
      }
      i++;
      continue;
    }

    // Handle range dots (...)
    if (tok.type === 'RANGE') {
      elements.push(svgText(currentX, currentTextY, tok.value, {
        fill: COLORS.textPrimary,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText(tok.value, fontSize, false); // semi-bold uses regular measurement
      i++;
      continue;
    }

    // Handle strings
    if (tok.type === 'STRING') {
      elements.push(svgText(currentX, currentTextY, tok.value, {
        fill: COLORS.string,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText(tok.value, fontSize, false); // semi-bold uses regular measurement
      i++;
      continue;
    }

    // Handle numbers - render as indices (blue)
    if (tok.type === 'NUMBER') {
      elements.push(svgText(currentX, currentTextY, tok.value, {
        fill: COLORS.variable,
        fontSize,
        fontWeight: '700',
      }));
      currentX += measureText(tok.value, fontSize, true);
      i++;
      continue;
    }

    // Handle keywords - add small spaces around logical/control keywords used in expressions
    if (tok.type === 'KEYWORD') {
      // Keywords that need space before and after (use same smallSpace for consistency)
      const needsSpacing = ['and', 'or', 'not', 'for', 'in', 'when', 'every'].includes(tok.value);
      if (needsSpacing && currentX > startX && !tok.spaceBefore) {
        currentX += smallSpace;
      }

      elements.push(svgText(currentX, currentTextY, tok.value, {
        fill: COLORS.textPrimary,
        fontSize,
        fontWeight: '700',
      }));
      currentX += measureText(tok.value, fontSize, true);

      if (needsSpacing) {
        currentX += smallSpace;
      }

      i++;
      continue;
    }

    // Handle identifiers
    if (tok.type === 'IDENT') {
      elements.push(svgText(currentX, currentTextY, tok.value, {
        fill: COLORS.textPrimary,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText(tok.value, fontSize, false); // semi-bold uses regular measurement
      i++;
      continue;
    }

    // Handle symbols (parens, brackets, commas, etc.)
    if (tok.type === 'SYMBOL') {
      // Comma - add small space after
      if (tok.value === ',') {
        elements.push(svgText(currentX, currentTextY, tok.value, {
          fill: COLORS.textPrimary,
          fontSize,
          fontWeight: '600',
        }));
        currentX += measureText(tok.value, fontSize, false);
        currentX += measureText(' ', fontSize) * 0.5; // small space after comma
        i++;
        continue;
      }

      elements.push(svgText(currentX, currentTextY, tok.value, {
        fill: COLORS.textPrimary,
        fontSize,
        fontWeight: '600',
      }));
      currentX += measureText(tok.value, fontSize, false);
      i++;
      continue;
    }

    // Default: render as-is
    elements.push(svgText(currentX, currentTextY, tok.value, {
      fill: COLORS.textPrimary,
      fontSize,
      fontWeight: '600',
    }));
    currentX += measureText(tok.value, fontSize, false);
    i++;
  }

  return {
    elements,
    width: currentX - startX,
    height: undefined,
    lastLineY: undefined
  };
}

// Helper: Render with line breaks at specified token indices
function renderExpressionTokensWithBreaks(
  tokens: ExpressionToken[],
  startX: number,
  textY: number,
  fontSize: number,
  breakPoints: number[]
): { elements: string[]; width: number; height?: number; lastLineY?: number } {
  // Strategy: Render each line segment separately using renderExpressionTokensOneLine
  const elements: string[] = [];
  let currentTextY = textY;
  let maxRenderedWidth = 0;
  const lineHeight = getLineHeight(fontSize);

  console.log('[renderWithBreaks] Starting render with', breakPoints.length, 'break points:', breakPoints);

  // Split tokens into line segments based on break points
  let lineStartIdx = 0;

  for (let i = 0; i <= breakPoints.length; i++) {
    const lineEndIdx = i < breakPoints.length ? breakPoints[i] + 1 : tokens.length;
    const lineTokens = tokens.slice(lineStartIdx, lineEndIdx);

    if (lineTokens.length > 0) {
      console.log(`[renderWithBreaks] Rendering line ${i}: tokens ${lineStartIdx} to ${lineEndIdx-1}`);

      // Render this line segment
      const lineResult = renderExpressionTokensOneLine(lineTokens, startX, currentTextY, fontSize);
      elements.push(...lineResult.elements);
      maxRenderedWidth = Math.max(maxRenderedWidth, lineResult.width);

      // Move to next line
      if (i < breakPoints.length) {
        currentTextY += lineHeight;
      }
    }

    lineStartIdx = lineEndIdx;
  }

  const totalHeight = currentTextY - textY + fontSize;

  return {
    elements,
    width: maxRenderedWidth,
    height: breakPoints.length > 0 ? totalHeight : undefined,
    lastLineY: breakPoints.length > 0 ? currentTextY : undefined
  };
}

function renderControlFlowHeader(
  keyword: string,
  symbol: string,
  tokens: ExpressionToken[],
  suffix: string,
  x: number,
  y: number,
  maxWidth?: number
): RenderResult {
  const elements: string[] = [];
  // Use larger font size for keywords
  const keywordFontSize = FONT_SIZES.header + 2; // 9px instead of 7px
  const symbolFontSize = 11; // Larger symbol
  let currentX = x + 5; // Add padding inside box
  let currentY = y;
  const textY = y + keywordFontSize + 1;
  let maxRenderedWidth = 0;

  // Symbol (larger)
  if (symbol) {
    elements.push(svgText(currentX, textY, symbol, {
      fill: COLORS.controlBorder,
      fontSize: symbolFontSize,
      fontWeight: '600',
    }));
    currentX += 13;
  }

  // Keyword (bolder and bigger)
  elements.push(svgText(currentX, textY, keyword, {
    fill: COLORS.textPrimary,
    fontSize: keywordFontSize,
    fontWeight: '900',
  }));
  currentX += measureText(keyword, keywordFontSize, true) + 4;

  // Track width before tokens
  maxRenderedWidth = Math.max(maxRenderedWidth, currentX - x);

  // Condition/expression - render tokens with proper coloring and wrapping support
  // Calculate available width: total maxWidth minus width already used (currentX - x) minus padding (8)
  const tokensMaxWidth = maxWidth ? maxWidth - (currentX - x) - 8 : undefined;

  if (maxWidth) {
    console.log('[renderControlFlowHeader]', {
      keyword,
      maxWidth,
      usedWidth: currentX - x,
      tokensMaxWidth,
      tokens: tokens.map(t => t.value).join('')
    });
  }

  const tokenResult = renderExpressionTokensSvg(
    tokens,
    currentX,
    textY,
    keywordFontSize,
    tokensMaxWidth,
    maxWidth ? y : undefined
  );
  elements.push(...tokenResult.elements);

  if (tokenResult.height !== undefined) {
    // Multi-line expression - use height from token result
    currentY += tokenResult.height;
    maxRenderedWidth = Math.max(maxRenderedWidth, tokenResult.width);
    currentX = x + tokenResult.width;
  } else {
    // Single-line expression
    currentX += tokenResult.width;
    maxRenderedWidth = Math.max(maxRenderedWidth, currentX - x);
  }

  // Suffix (like ":") - on last line of expression
  if (suffix) {
    const suffixY = tokenResult.lastLineY !== undefined ? tokenResult.lastLineY : textY;
    elements.push(svgText(currentX, suffixY, suffix, {
      fill: COLORS.textPrimary,
      fontSize: keywordFontSize,
      fontWeight: '600',
    }));
    const suffixWidth = measureText(suffix, keywordFontSize, true);
    currentX += suffixWidth;
    maxRenderedWidth = Math.max(maxRenderedWidth, currentX - x);
  }

  // Calculate final height
  const headerHeight = tokenResult.height !== undefined
    ? tokenResult.height + keywordFontSize + 6
    : keywordFontSize + 6;

  // Background box encompasses all lines
  const boxWidth = maxRenderedWidth + 8;
  const bgRect = svgRect(x, y, boxWidth, headerHeight, {
    fill: COLORS.controlHeaderBg,
    rx: 2,
  });

  return {
    svg: bgRect + '\n' + elements.join('\n'),
    width: boxWidth,
    height: headerHeight,
  };
}

// Convert Iterable to ExpressionTokens for rendering
function iterableToTokens(iterable: Iterable): ExpressionToken[] {
  if (iterable.kind === 'range-expr') {
    const tokens: ExpressionToken[] = [];
    tokens.push(...iterable.start);
    tokens.push({ type: 'RANGE', value: '...' });
    tokens.push(...iterable.end);
    if (iterable.step) {
      // "every" keyword will get spacing from keyword handler, no need for extra spaceBefore on step
      tokens.push({ type: 'KEYWORD', value: 'every', spaceBefore: true });
      tokens.push(...iterable.step);
    }
    return tokens;
  }
  return iterable.tokens;
}

// Render loop header with proper coloring
function renderLoopHeader(
  indexValue: IndexValue,
  iterable: Iterable,
  x: number,
  y: number
): RenderResult {
  const elements: string[] = [];
  // Use larger font size for keyword and expressions
  const keywordFontSize = FONT_SIZES.header + 2; // 9px instead of 7px
  const symbolFontSize = 11; // Larger symbol
  const fontSize = keywordFontSize; // Same size for expressions
  const headerHeight = keywordFontSize + 6;
  let currentX = x + 5; // Add padding inside box
  const textY = y + keywordFontSize + 1;

  // Symbol (larger)
  elements.push(svgText(currentX, textY, '↻', {
    fill: COLORS.controlBorder,
    fontSize: symbolFontSize,
    fontWeight: '600',
  }));
  currentX += 13;

  // Keyword (bolder and bigger)
  elements.push(svgText(currentX, textY, 'ForEach', {
    fill: COLORS.textPrimary,
    fontSize: keywordFontSize,
    fontWeight: '900',
  }));
  currentX += measureText('ForEach', keywordFontSize, true) + 4;

  // Index variable (blue)
  const indexText = indexValueToText(indexValue);
  elements.push(svgText(currentX, textY, indexText, {
    fill: COLORS.variable,
    fontSize,
    fontWeight: '700',
  }));
  currentX += measureText(indexText, fontSize, true) + 3; // Add space before colon

  // Colon separator
  elements.push(svgText(currentX, textY, ': ', {
    fill: COLORS.textPrimary,
    fontSize,
    fontWeight: '600',
  }));
  currentX += measureText(': ', fontSize, true);

  // Iterable - render with proper token coloring
  const iterTokens = iterableToTokens(iterable);
  const tokenResult = renderExpressionTokensSvg(iterTokens, currentX, textY, fontSize);
  elements.push(...tokenResult.elements);
  currentX += tokenResult.width;

  // Background
  const bgRect = svgRect(x, y, currentX - x + 8, headerHeight, {
    fill: COLORS.controlHeaderBg,
    rx: 2,
  });

  return {
    svg: bgRect + '\n' + elements.join('\n'),
    width: currentX - x + 8,
    height: headerHeight,
  };
}

// Render loop (outside role)
function renderLoopOutsideRole(block: LoopBlockOutsideRole, x: number, y: number, maxWidth?: number): RenderResult {
  const elements: string[] = [];
  let currentY = y;

  // Header
  const headerResult = renderLoopHeader(block.index.value, block.iterable, x + 8, currentY);
  elements.push(headerResult.svg);
  currentY += headerResult.height + 5;

  // Body - pass adjusted maxWidth for indentation
  const childMaxWidth = maxWidth ? maxWidth - SPACING.indentSize - 8 : undefined;
  let resultMaxWidth = headerResult.width;
  for (const child of block.body) {
    const childResult = renderTopLevelBlock(child, x + SPACING.indentSize + 8, currentY, childMaxWidth);
    elements.push(childResult.svg);
    resultMaxWidth = Math.max(resultMaxWidth, childResult.width + SPACING.indentSize);
    currentY += childResult.height + SPACING.blockGap;
  }

  const totalHeight = currentY - y;

  // Left border
  elements.push(svgLine(x + 8, y, x + 8, y + totalHeight, {
    stroke: COLORS.controlBorder,
    strokeWidth: 1,
  }));

  return {
    svg: elements.join('\n'),
    width: resultMaxWidth + 8,
    height: totalHeight,
  };
}

// Render loop (inside role)
function renderLoopInsideRole(block: LoopBlockInsideRole, x: number, y: number, maxWidthParam?: number): RenderResult {
  const elements: string[] = [];
  let currentY = y;

  console.log('[renderLoopInsideRole]', {
    hasMaxWidthParam: !!maxWidthParam,
    maxWidthParam,
    bodyLength: block.body.length
  });

  // Header
  const headerResult = renderLoopHeader(block.index.value, block.iterable, x + 8, currentY);
  elements.push(headerResult.svg);
  currentY += headerResult.height + 5;

  // Body - calculate maxWidth for children
  const childMaxWidth = maxWidthParam ? maxWidthParam - SPACING.indentSize - 8 : undefined;
  console.log('[renderLoopInsideRole] childMaxWidth:', childMaxWidth);

  let maxWidth = headerResult.width;
  for (const child of block.body) {
    console.log('[renderLoopInsideRole] rendering child:', child.kind);
    const childResult = renderRoleBuildingBlock(child, x + SPACING.indentSize + 8, currentY, childMaxWidth);
    elements.push(childResult.svg);
    maxWidth = Math.max(maxWidth, childResult.width + SPACING.indentSize);
    currentY += childResult.height + SPACING.elementGap;
  }

  const totalHeight = currentY - y;

  // Left border
  elements.push(svgLine(x + 8, y, x + 8, y + totalHeight, {
    stroke: COLORS.controlBorder,
    strokeWidth: 1,
  }));

  return {
    svg: elements.join('\n'),
    width: maxWidth + 8,
    height: totalHeight,
  };
}

// Render conditional (outside role)
function renderConditionalOutsideRole(block: ConditionalBlockOutsideRole, x: number, y: number, maxWidthParam?: number): RenderResult {
  const elements: string[] = [];
  let currentY = y;
  let resultMaxWidth = 0;
  const childMaxWidth = maxWidthParam ? maxWidthParam - SPACING.indentSize - 8 : undefined;

  // If block
  const ifHeader = renderControlFlowHeader('If', '◇', block.Ifcondition, ':', x + 8, currentY, maxWidthParam);
  elements.push(ifHeader.svg);
  resultMaxWidth = Math.max(resultMaxWidth, ifHeader.width);
  currentY += ifHeader.height + 5;

  for (const child of block.IfBody) {
    const childResult = renderTopLevelBlock(child, x + SPACING.indentSize + 8, currentY, childMaxWidth);
    elements.push(childResult.svg);
    resultMaxWidth = Math.max(resultMaxWidth, childResult.width + SPACING.indentSize);
    currentY += childResult.height + SPACING.blockGap;
  }

  // ElseIf blocks
  for (let i = 0; i < block.elseif.length; i++) {
    const elseifHeader = renderControlFlowHeader('ElseIf', '◇', block.elseif[i], ':', x + 8, currentY, maxWidthParam);
    elements.push(elseifHeader.svg);
    resultMaxWidth = Math.max(resultMaxWidth, elseifHeader.width);
    currentY += elseifHeader.height + 5;

    for (const child of block.elseifBody[i]) {
      const childResult = renderTopLevelBlock(child, x + SPACING.indentSize + 8, currentY, childMaxWidth);
      elements.push(childResult.svg);
      resultMaxWidth = Math.max(resultMaxWidth, childResult.width + SPACING.indentSize);
      currentY += childResult.height + SPACING.blockGap;
    }
  }

  // Else block
  if (block.elseBody && block.elseBody.length > 0) {
    const elseHeader = renderControlFlowHeader('Else', '◇', [], ':', x + 8, currentY, maxWidthParam);
    elements.push(elseHeader.svg);
    resultMaxWidth = Math.max(resultMaxWidth, elseHeader.width);
    currentY += elseHeader.height + 5;

    for (const child of block.elseBody) {
      const childResult = renderTopLevelBlock(child, x + SPACING.indentSize + 8, currentY, childMaxWidth);
      elements.push(childResult.svg);
      resultMaxWidth = Math.max(resultMaxWidth, childResult.width + SPACING.indentSize);
      currentY += childResult.height + SPACING.blockGap;
    }
  }

  const totalHeight = currentY - y;

  // Left border
  elements.push(svgLine(x + 8, y, x + 8, y + totalHeight, {
    stroke: COLORS.controlBorder,
    strokeWidth: 1,
  }));

  return {
    svg: elements.join('\n'),
    width: resultMaxWidth + 8,
    height: totalHeight,
  };
}

// Render conditional (inside role)
function renderConditionalInsideRole(block: ConditionalBlockInsideRole, x: number, y: number, maxWidthParam?: number): RenderResult {
  const elements: string[] = [];
  let currentY = y;
  let maxWidth = 0;

  console.log('[renderConditionalInsideRole]', {
    hasMaxWidthParam: !!maxWidthParam,
    maxWidthParam,
    condition: block.Ifcondition.map(t => t.value).join('')
  });

  // If block
  const ifHeader = renderControlFlowHeader('If', '◇', block.Ifcondition, ':', x + 8, currentY, maxWidthParam);
  elements.push(ifHeader.svg);
  maxWidth = Math.max(maxWidth, ifHeader.width);
  currentY += ifHeader.height + 5;

  // Calculate maxWidth for children (account for indentation)
  const childMaxWidth = maxWidthParam ? maxWidthParam - SPACING.indentSize - 8 : undefined;
  console.log('[renderConditionalInsideRole] childMaxWidth for IfBody:', childMaxWidth, 'from maxWidthParam:', maxWidthParam);

  for (const child of block.IfBody) {
    console.log('[renderConditionalInsideRole] rendering IfBody child:', child.kind, 'with childMaxWidth:', childMaxWidth);
    const childResult = renderRoleBuildingBlock(child, x + SPACING.indentSize + 8, currentY, childMaxWidth);
    elements.push(childResult.svg);
    maxWidth = Math.max(maxWidth, childResult.width + SPACING.indentSize);
    currentY += childResult.height + SPACING.elementGap;
  }

  // ElseIf blocks
  for (let i = 0; i < block.elseif.length; i++) {
    const elseifHeader = renderControlFlowHeader('ElseIf', '◇', block.elseif[i], ':', x + 8, currentY, maxWidthParam);
    elements.push(elseifHeader.svg);
    maxWidth = Math.max(maxWidth, elseifHeader.width);
    currentY += elseifHeader.height + 5;

    for (const child of block.elseifBody[i]) {
      const childResult = renderRoleBuildingBlock(child, x + SPACING.indentSize + 8, currentY, childMaxWidth);
      elements.push(childResult.svg);
      maxWidth = Math.max(maxWidth, childResult.width + SPACING.indentSize);
      currentY += childResult.height + SPACING.elementGap;
    }
  }

  // Else block
  if (block.elseBody && block.elseBody.length > 0) {
    const elseHeader = renderControlFlowHeader('Else', '◇', [], ':', x + 8, currentY, maxWidthParam);
    elements.push(elseHeader.svg);
    maxWidth = Math.max(maxWidth, elseHeader.width);
    currentY += elseHeader.height + 5;

    for (const child of block.elseBody) {
      const childResult = renderRoleBuildingBlock(child, x + SPACING.indentSize + 8, currentY, childMaxWidth);
      elements.push(childResult.svg);
      maxWidth = Math.max(maxWidth, childResult.width + SPACING.indentSize);
      currentY += childResult.height + SPACING.elementGap;
    }
  }

  const totalHeight = currentY - y;

  // Left border
  elements.push(svgLine(x + 8, y, x + 8, y + totalHeight, {
    stroke: COLORS.controlBorder,
    strokeWidth: 1,
  }));

  return {
    svg: elements.join('\n'),
    width: maxWidth + 8,
    height: totalHeight,
  };
}

// Render switch (outside role)
function renderSwitchOutsideRole(block: SwitchBlockOutsideRole, x: number, y: number, maxWidthParam?: number): RenderResult {
  const elements: string[] = [];
  let currentY = y;
  let resultMaxWidth = 0;
  const childMaxWidth = maxWidthParam ? maxWidthParam - SPACING.indentSize * 2 - 8 : undefined;

  // Switch header - wrap expression in parens
  const switchTokens: ExpressionToken[] = [
    { type: 'SYMBOL', value: '(' },
    ...block.expression,
    { type: 'SYMBOL', value: ')' },
  ];
  const switchHeader = renderControlFlowHeader('Switch', '⎇', switchTokens, ':', x + 8, currentY, maxWidthParam);
  elements.push(switchHeader.svg);
  resultMaxWidth = Math.max(resultMaxWidth, switchHeader.width);
  currentY += switchHeader.height + 4;

  // Cases
  for (const c of block.cases) {
    const caseMaxWidth = maxWidthParam ? maxWidthParam - SPACING.indentSize : undefined;
    const caseHeader = renderControlFlowHeader('Case', '', c.match, '', x + SPACING.indentSize + 8, currentY, caseMaxWidth);
    elements.push(caseHeader.svg);
    resultMaxWidth = Math.max(resultMaxWidth, caseHeader.width + SPACING.indentSize);
    currentY += caseHeader.height + 5;

    for (const child of c.body) {
      const childResult = renderTopLevelBlock(child, x + SPACING.indentSize * 2 + 8, currentY, childMaxWidth);
      elements.push(childResult.svg);
      resultMaxWidth = Math.max(resultMaxWidth, childResult.width + SPACING.indentSize * 2);
      currentY += childResult.height + SPACING.blockGap;
    }
  }

  // Default case
  if (block.defaultCase) {
    const caseMaxWidth = maxWidthParam ? maxWidthParam - SPACING.indentSize : undefined;
    const defaultHeader = renderControlFlowHeader('Default', '', [], ':', x + SPACING.indentSize + 8, currentY, caseMaxWidth);
    elements.push(defaultHeader.svg);
    resultMaxWidth = Math.max(resultMaxWidth, defaultHeader.width + SPACING.indentSize);
    currentY += defaultHeader.height + 5;

    for (const child of block.defaultCase.body) {
      const childResult = renderTopLevelBlock(child, x + SPACING.indentSize * 2 + 8, currentY, childMaxWidth);
      elements.push(childResult.svg);
      resultMaxWidth = Math.max(resultMaxWidth, childResult.width + SPACING.indentSize * 2);
      currentY += childResult.height + SPACING.blockGap;
    }
  }

  const totalHeight = currentY - y;

  // Left border
  elements.push(svgLine(x + 8, y, x + 8, y + totalHeight, {
    stroke: COLORS.controlBorder,
    strokeWidth: 1,
  }));

  return {
    svg: elements.join('\n'),
    width: resultMaxWidth + 8,
    height: totalHeight,
  };
}

// Render switch (inside role)
function renderSwitchInsideRole(block: SwitchBlockInsideRole, x: number, y: number, maxWidthParam?: number): RenderResult {
  const elements: string[] = [];
  let currentY = y;
  let maxWidth = 0;

  // Switch header - wrap expression in parens
  const switchTokens: ExpressionToken[] = [
    { type: 'SYMBOL', value: '(' },
    ...block.expression,
    { type: 'SYMBOL', value: ')' },
  ];
  const switchHeader = renderControlFlowHeader('Switch', '⎇', switchTokens, ':', x + 8, currentY, maxWidthParam);
  elements.push(switchHeader.svg);
  maxWidth = Math.max(maxWidth, switchHeader.width);
  currentY += switchHeader.height + 4;

  // Cases
  for (const c of block.cases) {
    const caseMaxWidth = maxWidthParam ? maxWidthParam - SPACING.indentSize : undefined;
    const caseHeader = renderControlFlowHeader('Case', '', c.match, '', x + SPACING.indentSize + 8, currentY, caseMaxWidth);
    elements.push(caseHeader.svg);
    maxWidth = Math.max(maxWidth, caseHeader.width + SPACING.indentSize);
    currentY += caseHeader.height + 5;

    // Calculate maxWidth for case body children (account for double indentation)
    const caseBodyMaxWidth = maxWidthParam ? maxWidthParam - SPACING.indentSize * 2 - 8 : undefined;

    for (const child of c.body) {
      const childResult = renderRoleBuildingBlock(child, x + SPACING.indentSize * 2 + 8, currentY, caseBodyMaxWidth);
      elements.push(childResult.svg);
      maxWidth = Math.max(maxWidth, childResult.width + SPACING.indentSize * 2);
      currentY += childResult.height + SPACING.elementGap;
    }
  }

  // Default case
  if (block.defaultCase) {
    const caseMaxWidth = maxWidthParam ? maxWidthParam - SPACING.indentSize : undefined;
    const defaultHeader = renderControlFlowHeader('Default', '', [], ':', x + SPACING.indentSize + 8, currentY, caseMaxWidth);
    elements.push(defaultHeader.svg);
    maxWidth = Math.max(maxWidth, defaultHeader.width + SPACING.indentSize);
    currentY += defaultHeader.height + 5;

    // Calculate maxWidth for default body children (account for double indentation)
    const defaultBodyMaxWidth = maxWidthParam ? maxWidthParam - SPACING.indentSize * 2 - 8 : undefined;

    for (const child of block.defaultCase.body) {
      const childResult = renderRoleBuildingBlock(child, x + SPACING.indentSize * 2 + 8, currentY, defaultBodyMaxWidth);
      elements.push(childResult.svg);
      maxWidth = Math.max(maxWidth, childResult.width + SPACING.indentSize * 2);
      currentY += childResult.height + SPACING.elementGap;
    }
  }

  const totalHeight = currentY - y;

  // Left border
  elements.push(svgLine(x + 8, y, x + 8, y + totalHeight, {
    stroke: COLORS.controlBorder,
    strokeWidth: 1,
  }));

  return {
    svg: elements.join('\n'),
    width: maxWidth + 8,
    height: totalHeight,
  };
}

// Render mark block (with bracket on right)
function renderMarkBlock(block: MarkBlock, x: number, y: number, maxWidthParam?: number): RenderResult {
  const elements: string[] = [];
  let currentY = y;
  let resultMaxWidth = 0;

  // Render body - reserve space for bracket on right (25px)
  const childMaxWidth = maxWidthParam ? maxWidthParam - 25 : undefined;
  for (const child of block.body) {
    const childResult = renderTopLevelBlock(child, x, currentY, childMaxWidth);
    elements.push(childResult.svg);
    resultMaxWidth = Math.max(resultMaxWidth, childResult.width);
    currentY += childResult.height + SPACING.blockGap;
  }

  const totalHeight = currentY - y;

  // Right bracket
  const bracketX = x + resultMaxWidth + 8;
  const markNum = block.markNumber !== undefined && !isNaN(block.markNumber) ? block.markNumber : 0;

  // Bracket line (right side)
  elements.push(svgLine(bracketX, y, bracketX + 5, y, { stroke: '#000000', strokeWidth: 2 }));
  elements.push(svgLine(bracketX + 5, y, bracketX + 5, y + totalHeight, { stroke: '#000000', strokeWidth: 2 }));
  elements.push(svgLine(bracketX, y + totalHeight, bracketX + 5, y + totalHeight, { stroke: '#000000', strokeWidth: 2 }));

  // Mark number
  elements.push(svgText(bracketX + 10, y + totalHeight / 2 + FONT_SIZES.normal / 3, String(markNum), {
    fill: '#000000',
    fontSize: FONT_SIZES.normal,
    fontWeight: '700',
  }));

  return {
    svg: elements.join('\n'),
    width: resultMaxWidth + 25,
    height: totalHeight,
  };
}

// Render mark block inside role
function renderMarkBlockInsideRole(block: MarkBlockInsideRole, x: number, y: number, maxWidthParam?: number): RenderResult {
  const elements: string[] = [];
  let currentY = y;
  let maxWidth = 0;

  // Calculate maxWidth for children (reserve space for bracket: 25px)
  const childMaxWidth = maxWidthParam ? maxWidthParam - 25 : undefined;

  // Render body
  for (const child of block.body) {
    const childResult = renderRoleBuildingBlock(child, x, currentY, childMaxWidth);
    elements.push(childResult.svg);
    maxWidth = Math.max(maxWidth, childResult.width);
    currentY += childResult.height + SPACING.elementGap;
  }

  const totalHeight = currentY - y;

  // Right bracket
  const bracketX = x + maxWidth + 8;
  const markNum = block.markNumber !== undefined && !isNaN(block.markNumber) ? block.markNumber : 0;

  // Bracket line
  elements.push(svgLine(bracketX, y, bracketX + 5, y, { stroke: '#000000', strokeWidth: 2 }));
  elements.push(svgLine(bracketX + 5, y, bracketX + 5, y + totalHeight, { stroke: '#000000', strokeWidth: 2 }));
  elements.push(svgLine(bracketX, y + totalHeight, bracketX + 5, y + totalHeight, { stroke: '#000000', strokeWidth: 2 }));

  // Mark number
  elements.push(svgText(bracketX + 10, y + totalHeight / 2 + FONT_SIZES.normal / 3, String(markNum), {
    fill: '#000000',
    fontSize: FONT_SIZES.normal,
    fontWeight: '700',
  }));

  return {
    svg: elements.join('\n'),
    width: maxWidth + 25,
    height: totalHeight,
  };
}

// Render none message (completion prompt)
function renderNoneMessage(msg: NoneMessage, x: number, y: number): RenderResult {
  const colors = getRoleColors('none');
  const elements: string[] = [];
  let currentY = y;

  // Header
  const headerText = 'Completion Prompt (no role)';
  const headerWidth = measureText(headerText.toUpperCase(), FONT_SIZES.roleHeader, true) + 8;
  const headerHeight = FONT_SIZES.roleHeader + 4;

  elements.push(svgRect(x, currentY, headerWidth, headerHeight, {
    fill: colors.bg,
    rx: 2,
  }));

  elements.push(svgText(x + 4, currentY + FONT_SIZES.roleHeader + 1, headerText.toUpperCase(), {
    fill: colors.text,
    fontSize: FONT_SIZES.roleHeader,
    fontWeight: '900',
  }));

  currentY += headerHeight + 2;

  // Body
  const bodyResult = renderRoleBody(msg.body, x, currentY);
  elements.push(bodyResult.svg);

  const totalHeight = currentY - y + bodyResult.height;

  // Left border
  elements.push(svgLine(x, y, x, y + totalHeight, {
    stroke: colors.border,
    strokeWidth: 1,
  }));

  return {
    svg: elements.join('\n'),
    width: Math.max(headerWidth, bodyResult.width),
    height: totalHeight,
  };
}

// Render top-level block
function renderTopLevelBlock(block: PromptBlock, x: number, y: number, maxWidth?: number): RenderResult {
  switch (block.kind) {
    case 'role-message':
      return renderRoleMessage(block, x, y, maxWidth);
    case 'conditional-block-outside-role':
      return renderConditionalOutsideRole(block, x, y, maxWidth);
    case 'loop-block-outside-role':
      return renderLoopOutsideRole(block, x, y, maxWidth);
    case 'switch-block-outside-role':
      return renderSwitchOutsideRole(block, x, y, maxWidth);
    case 'comment-block':
      return renderComment(block.text, x, y, true, maxWidth);
    case 'mark-block':
      return renderMarkBlock(block, x, y, maxWidth);
    case 'name-def':
      return renderNameDef(block, x, y, maxWidth);
    case 'end-block':
      return renderEndBlock(block, x, y);
    case 'role-frag-invocation':
      return renderRoleFragInvocation(block, x, y, maxWidth);
    default:
      return { svg: '', width: 0, height: 0 };
  }
}

// Render prompt body
function renderPromptBody(body: PromptBody, x: number, y: number, maxWidthParam?: number): RenderResult {
  if (body.kind === 'chat-prompt-body') {
    const elements: string[] = [];
    let currentY = y;
    let resultMaxWidth = 0;

    for (const item of body.body) {
      const result = renderTopLevelBlock(item, x, currentY, maxWidthParam);
      elements.push(result.svg);
      resultMaxWidth = Math.max(resultMaxWidth, result.width);
      currentY += result.height + SPACING.blockGap;
    }

    return {
      svg: elements.join('\n'),
      width: resultMaxWidth,
      height: currentY - y,
    };
  } else {
    return renderNoneMessage(body.message, x, y);
  }
}

// Render prompt title
function renderPromptTitle(title: PromptTitle, x: number, y: number, containerWidth: number): RenderResult {
  const elements: string[] = [];

  // Index suffix
  let indexText = '';
  if (title.indices.length > 0) {
    indexText = '[' + title.indices.map(indexToText).join(',') + ']';
  }
  const fullTitle = title.name + indexText;

  const titleWidth = measureText(fullTitle, FONT_SIZES.title, true);
  const boxWidth = Math.max(titleWidth + 16, containerWidth);
  const boxHeight = FONT_SIZES.title + 6;

  // Background
  elements.push(svgRect(x, y, boxWidth, boxHeight, {
    fill: COLORS.bgSecondary,
    stroke: COLORS.borderMedium,
    strokeWidth: 1,
    rx: 3,
  }));

  // Title text
  let textX = x + 8;
  const textY = y + FONT_SIZES.title + 2;

  // Name part
  elements.push(svgText(textX, textY, title.name, {
    fill: COLORS.textPrimary,
    fontSize: FONT_SIZES.title,
    fontWeight: '700',
  }));
  textX += measureText(title.name, FONT_SIZES.title, true);

  // Index part (blue)
  if (indexText) {
    elements.push(svgText(textX, textY, indexText, {
      fill: COLORS.variable,
      fontSize: FONT_SIZES.title,
      fontWeight: '700',
    }));
  }

  return {
    svg: elements.join('\n'),
    width: boxWidth,
    height: boxHeight,
  };
}

// Main render function for a single prompt
export function renderPromptSvg(prompt: Prompt): string {
  loadFonts();

  const elements: string[] = [];
  const startX = SPACING.containerPaddingLeft;
  let currentY = 20; // Top padding

  // First, calculate body dimensions to know the full width
  const bodyY = currentY + FONT_SIZES.title + 6 + SPACING.blockGap; // title height + gap
  const bodyResult = renderPromptBody(prompt.body, startX, bodyY);
  const contentWidth = bodyResult.width + startX + 40; // Include right padding

  // Title - render with full content width but leave same padding on right as left
  const titleResult = renderPromptTitle(prompt.title, startX, currentY, contentWidth - startX - startX);
  elements.push(titleResult.svg);

  // Left border starts from bottom of title
  const borderStartY = currentY + titleResult.height;
  currentY += titleResult.height + SPACING.blockGap;

  // Container left border (from bottom of title through body)
  elements.push(svgLine(startX, borderStartY, startX, currentY + bodyResult.height, {
    stroke: COLORS.borderMedium,
    strokeWidth: 1,
  }));

  // Body content on top (including role borders)
  elements.push(bodyResult.svg);
  currentY += bodyResult.height;

  const totalHeight = currentY + 20; // Bottom padding
  const totalWidth = contentWidth;

  return wrapSvg(elements.join('\n'), totalWidth, totalHeight);
}

// Render multiple prompts and fragments
// maxWidth parameter allows constraining the output width (e.g., from width slider)
export function renderPromptsSvg(blocks: (Prompt | CommentBlock | StrFragDef | RoleFragDef)[], maxWidth?: number): string {
  loadFonts();

  const startX = SPACING.containerPaddingLeft;

  // First pass: calculate all body widths to determine the max content width
  let maxContentWidth = 0;
  for (const block of blocks) {
    if (block.kind === 'prompt') {
      const bodyResult = renderPromptBody(block.body, startX, 0);
      maxContentWidth = Math.max(maxContentWidth, bodyResult.width + startX);
    } else if (block.kind === 'comment-block') {
      const commentResult = renderComment(block.text, startX, 0);
      maxContentWidth = Math.max(maxContentWidth, commentResult.width + startX);
    } else if (block.kind === 'str-frag-def') {
      const fragResult = renderStrFragDefSvg(block, startX, 0);
      maxContentWidth = Math.max(maxContentWidth, fragResult.width + startX);
    } else if (block.kind === 'role-frag-def') {
      const fragResult = renderRoleFragDefSvg(block, startX, 0);
      maxContentWidth = Math.max(maxContentWidth, fragResult.width + startX);
    }
  }

  // Apply maxWidth constraint if provided
  let totalWidth = maxContentWidth + 40; // Add right padding
  if (maxWidth && maxWidth > 0) {
    totalWidth = Math.min(totalWidth, maxWidth);
  }
  // Title should span across but leave same padding on right as on left
  const titleWidth = totalWidth - startX - startX;

  // Second pass: render everything with consistent title width
  const elements: string[] = [];
  let currentY = 20;
  let lastWasPrompt = false;

  for (const block of blocks) {
    if (block.kind === 'prompt') {
      // Add divider if previous was also a prompt
      if (lastWasPrompt) {
        elements.push(svgLine(startX, currentY + 6, 200, currentY + 6, {
          stroke: COLORS.borderMedium,
          strokeWidth: 1,
          strokeDasharray: '4,4',
        }));
        currentY += 20;
      }

      // Title - render with full width
      const titleResult = renderPromptTitle(block.title, startX, currentY, titleWidth);
      elements.push(titleResult.svg);

      // Left border starts from bottom of title
      const borderStartY = currentY + titleResult.height;
      currentY += titleResult.height + SPACING.blockGap;

      // Body - pass maxWidth for wrapping
      // Title: starts at startX, has width titleWidth, ends at (startX + titleWidth)
      // Body: starts at startX, should end at same place, so maxWidth = titleWidth + small buffer
      const bodyMaxWidth = titleWidth + 20; // Slightly more room than title for better wrapping
      const bodyResult = renderPromptBody(block.body, startX, currentY, bodyMaxWidth);

      // Container left border (from bottom of title through body)
      elements.push(svgLine(startX, borderStartY, startX, currentY + bodyResult.height, {
        stroke: COLORS.borderMedium,
        strokeWidth: 1,
      }));

      // Body content on top (including role borders)
      elements.push(bodyResult.svg);

      currentY += bodyResult.height + SPACING.blockGap;
      lastWasPrompt = true;
    } else if (block.kind === 'comment-block') {
      const commentMaxWidth = titleWidth + 20; // Same as body
      const commentResult = renderComment(block.text, startX, currentY, false, commentMaxWidth);
      elements.push(commentResult.svg);
      currentY += commentResult.height + SPACING.elementGap;
      lastWasPrompt = false;
    } else if (block.kind === 'str-frag-def') {
      const fragResult = renderStrFragDefSvg(block, startX, currentY, titleWidth);
      elements.push(fragResult.svg);
      currentY += fragResult.height + SPACING.blockGap;
      lastWasPrompt = false;
    } else if (block.kind === 'role-frag-def') {
      const fragResult = renderRoleFragDefSvg(block, startX, currentY, titleWidth);
      elements.push(fragResult.svg);
      currentY += fragResult.height + SPACING.blockGap;
      lastWasPrompt = false;
    }
  }

  const totalHeight = currentY + 20;

  return wrapSvg(elements.join('\n'), totalWidth, totalHeight);
}
