// SVG Layout utilities for text measurement and positioning
import * as opentype from 'opentype.js';

// Detect browser environment
const isBrowser = typeof window !== 'undefined';

// Conditional Node.js imports - these will be undefined in browser
let fs: typeof import('fs') | undefined;
let path: typeof import('path') | undefined;

if (!isBrowser) {
  // Dynamic imports for Node.js environment only
  try {
    fs = require('fs');
    path = require('path');
  } catch (e) {
    // Silently ignore if modules aren't available
  }
}

// Color palette matching styles.css exactly
export const COLORS = {
  // Backgrounds
  bgPrimary: '#ffffff',
  bgSecondary: '#f8f9fa',
  bgTertiary: '#f1f3f4',

  // Borders
  borderLight: '#e1e4e8',
  borderMedium: '#d0d7de',
  borderDark: '#b0b8c1',

  // Text
  textPrimary: '#1f2328',
  textSecondary: '#57606a',
  textMuted: '#8b949e',

  // Role colors
  systemBorder: '#0969da',
  systemBg: '#f0f7ff',
  systemText: '#0550ae',

  assistantBorder: '#1acad1',
  assistantBg: '#e6fafa',
  assistantText: '#0a9196',

  toolBorder: '#f7660b',
  toolBg: '#ffebe6',
  toolText: '#800d00',

  userBorder: '#e5990b',
  userBg: '#fff8e6',
  userText: '#805600',

  noneBorder: '#6e7781',
  noneBg: '#f5f5f5',
  noneText: '#57606a',

  // Control flow
  controlBg: '#f6f8fa',
  controlBorder: '#6e7781',
  controlText: '#57606a',
  controlHeaderBg: '#eaeef2',

  // Accents
  template: '#9333ea',
  templateBg: '#faf5ff',
  func: '#9333ea',
  funcBg: '#faf5ff',
  context: '#0da66b',
  contextBg: '#e0ffdd',
  variable: '#0969da',
  variableBg: 'rgba(9, 105, 218, 0.12)',
  nameRef: '#ec4899',
  comment: '#6e7781',
  string: '#a31515',

  // Fragment badge colors
  badgeBg: '#e5e7eb',
  badgeText: '#4b5563',
};

// Font sizes matching styles.css
export const FONT_SIZES = {
  title: 10,
  normal: 9,
  header: 7,
  comment: 7,
  roleHeader: 7,
};

// Spacing/padding values matching styles.css
export const SPACING = {
  containerPaddingLeft: 10,
  containerBorderWidth: 1,
  rolePadding: 6,
  roleBodyPadding: 2,
  blockPadding: 3,
  inlinePadding: 2,
  lineHeight: 1.5,
  elementGap: 3,
  blockGap: 4,
  indentSize: 8,
};

// Loaded fonts cache
let regularFont: opentype.Font | null = null;
let boldFont: opentype.Font | null = null;
let fontsLoaded = false;

// Load fonts synchronously (Node.js only - browser uses fallback measurement)
export function loadFonts(): void {
  if (fontsLoaded) return;
  fontsLoaded = true;

  // Skip font loading in browser environment - will use fallback measurement
  if (isBrowser || !fs || !path) {
    return;
  }

  try {
    const fontsDir = path.join(__dirname, '..', 'fonts');
    const regularPath = path.join(fontsDir, 'JetBrainsMono-Regular.ttf');
    const boldPath = path.join(fontsDir, 'JetBrainsMono-Bold.ttf');

    if (fs.existsSync(regularPath)) {
      regularFont = opentype.loadSync(regularPath);
    }
    if (fs.existsSync(boldPath)) {
      boldFont = opentype.loadSync(boldPath);
    }
  } catch (e) {
    // Failed to load fonts, will use fallback measurement
  }
}

// Get font base64 for embedding (Node.js only)
export function getFontBase64(fontType: 'regular' | 'bold'): string {
  // Cannot load fonts in browser environment
  if (isBrowser || !fs || !path) {
    return '';
  }

  try {
    const fontsDir = path.join(__dirname, '..', 'fonts');
    const fontPath = path.join(fontsDir, fontType === 'bold' ? 'JetBrainsMono-Bold.ttf' : 'JetBrainsMono-Regular.ttf');

    if (fs.existsSync(fontPath)) {
      const fontData = fs.readFileSync(fontPath);
      return fontData.toString('base64');
    }
  } catch (e) {
    // Failed to load font
  }
  return '';
}

// Measure text width using opentype.js
export function measureText(text: string, fontSize: number, bold: boolean = false): number {
  loadFonts();

  const font = bold ? boldFont : regularFont;
  if (!font) {
    // Fallback: estimate based on average character width for browser monospace fonts
    // Browser default fonts (Consolas, Monaco, Menlo) tend to be narrower than JetBrains Mono
    // Use 0.55 ratio - between 0.52 (too tight) and 0.6 (too loose)
    const charWidth = fontSize * 0.55;
    return text.length * charWidth;
  }

  const scale = fontSize / font.unitsPerEm;
  let width = 0;

  for (let i = 0; i < text.length; i++) {
    const glyph = font.charToGlyph(text[i]);
    width += glyph.advanceWidth || 0;
  }

  return width * scale;
}

// Measure text height (line height)
export function getLineHeight(fontSize: number): number {
  return fontSize * SPACING.lineHeight;
}

// Layout context to track position during rendering
export class LayoutContext {
  x: number = 0;
  y: number = 0;
  maxWidth: number = 450;
  indentLevel: number = 0;
  elements: string[] = [];

  constructor(maxWidth: number = 450) {
    this.maxWidth = maxWidth;
    this.x = SPACING.containerPaddingLeft;
    this.y = 0;
  }

  // Get current x with indentation
  get currentX(): number {
    return this.x + this.indentLevel * SPACING.indentSize;
  }

  // Move to next line
  newLine(fontSize: number = FONT_SIZES.normal): void {
    this.y += getLineHeight(fontSize);
    this.x = SPACING.containerPaddingLeft;
  }

  // Add vertical spacing
  addSpace(pixels: number): void {
    this.y += pixels;
  }

  // Indent content
  indent(): void {
    this.indentLevel++;
  }

  unindent(): void {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
  }

  // Add SVG element to output
  add(element: string): void {
    this.elements.push(element);
  }

  // Get all elements as string
  getElements(): string {
    return this.elements.join('\n');
  }
}

// SVG escape function
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Create SVG rect element
export function svgRect(
  x: number,
  y: number,
  width: number,
  height: number,
  options: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    rx?: number;
    ry?: number;
  } = {}
): string {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `width="${width}"`,
    `height="${height}"`,
  ];

  if (options.fill) attrs.push(`fill="${options.fill}"`);
  if (options.stroke) attrs.push(`stroke="${options.stroke}"`);
  if (options.strokeWidth) attrs.push(`stroke-width="${options.strokeWidth}"`);
  if (options.rx) attrs.push(`rx="${options.rx}"`);
  if (options.ry) attrs.push(`ry="${options.ry}"`);

  return `<rect ${attrs.join(' ')}/>`;
}

// Create SVG text element
export function svgText(
  x: number,
  y: number,
  text: string,
  options: {
    fill?: string;
    fontSize?: number;
    fontWeight?: string;
    fontFamily?: string;
    fontStyle?: string;
  } = {}
): string {
  const fontSize = options.fontSize || FONT_SIZES.normal;
  const fontFamily = options.fontFamily || "'JetBrains Mono', 'SF Mono', monospace";
  const fill = options.fill || COLORS.textPrimary;

  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `font-family="${fontFamily}"`,
    `font-size="${fontSize}"`,
    `fill="${fill}"`,
    `text-rendering="geometricPrecision"`,
  ];

  if (options.fontWeight) attrs.push(`font-weight="${options.fontWeight}"`);
  if (options.fontStyle) attrs.push(`font-style="${options.fontStyle}"`);

  return `<text ${attrs.join(' ')}>${escapeXml(text)}</text>`;
}

// Create SVG line element
export function svgLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: {
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
  } = {}
): string {
  const attrs = [
    `x1="${x1}"`,
    `y1="${y1}"`,
    `x2="${x2}"`,
    `y2="${y2}"`,
  ];

  if (options.stroke) attrs.push(`stroke="${options.stroke}"`);
  if (options.strokeWidth) attrs.push(`stroke-width="${options.strokeWidth}"`);
  if (options.strokeDasharray) attrs.push(`stroke-dasharray="${options.strokeDasharray}"`);

  return `<line ${attrs.join(' ')}/>`;
}

// Create SVG group element
export function svgGroup(content: string, transform?: string): string {
  if (transform) {
    return `<g transform="${transform}">${content}</g>`;
  }
  return `<g>${content}</g>`;
}

// Generate SVG font-face definitions
export function getSvgFontFaces(): string {
  const regularBase64 = getFontBase64('regular');
  const boldBase64 = getFontBase64('bold');

  let defs = '';

  if (regularBase64) {
    defs += `
      @font-face {
        font-family: 'JetBrains Mono';
        font-weight: 400;
        src: url(data:font/truetype;base64,${regularBase64}) format('truetype');
      }`;
  }

  if (boldBase64) {
    defs += `
      @font-face {
        font-family: 'JetBrains Mono';
        font-weight: 700;
        src: url(data:font/truetype;base64,${boldBase64}) format('truetype');
      }`;
  }

  return defs;
}

// Create complete SVG document
export function wrapSvg(content: string, width: number, height: number): string {
  const fontFaces = getSvgFontFaces();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <style type="text/css">
      ${fontFaces}
    </style>
  </defs>
  <rect width="100%" height="100%" fill="${COLORS.bgPrimary}"/>
  ${content}
</svg>`;
}
