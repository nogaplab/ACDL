// blog/tools/acdl-code-png.ts
// Render a snippet of ACDL source as a syntax-coloured PNG for blog posts.
// Tokenises with the same rules as extension/syntaxes/acdl.tmLanguage.json and
// colours the scopes as VS Code's "Dark Modern" theme does.
//
// Every image has the same width, so the code is the same size in every figure
// once a blog column scales it. Keep snippet lines within MAX_COLS characters.
//
// Usage: bun run blog/tools/acdl-code-png.ts <snippet.acdl> <output.png>
import * as fs from 'fs';
import puppeteer from 'puppeteer';

const MAX_COLS = 66;
const CARD_WIDTH = 700;   // CSS px; the PNG is twice this
const FONT_SIZE = 18;

// Scope colours from Dark Modern (Dark+ token colours).
const C = {
    text: '#cccccc',
    comment: '#6a9955',
    string: '#ce9178',
    number: '#b5cea8',
    keyword: '#569cd6',     // keyword.other.*, entity.name.tag
    control: '#c586c0',     // keyword.control
    template: '#dcdcaa',    // entity.name.function
    variable: '#9cdcfe',    // variable.other.*, variable.parameter
    operator: '#d4d4d4',
    currentMsg: '#f97316',  // the extension's own rule for #msg
};

// Same order as the grammar's top-level patterns: on a tie the earlier rule wins.
const RULES: { re: RegExp; color: string; bold?: boolean; group?: number }[] = [
    { re: /#msg(?![\p{L}\p{N}_])/giu, color: C.currentMsg, bold: true },
    { re: /(?:\/\/|#).*$/gm, color: C.comment },
    { re: /\/\*[\s\S]*?\*\//g, color: C.comment },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|“[^”]*”|‘[^’]*’/g, color: C.string },
    { re: /\b[0-9]+\b/g, color: C.number },
    { re: /\bPrompt\b/g, color: C.keyword },
    { re: /\b(?:StrFrag|StringFrag|RolesFrag|RoleFrag)\b/gi, color: C.keyword },
    { re: /\bFrag\b/gi, color: C.keyword },
    { re: /\b(?:S|U|A|T|N|system|user|assistant|tool|none)(?=\s*:)/gi, color: C.keyword },
    { re: /\b(?:env|sys|resp)\b/g, color: C.keyword },
    { re: /\b(?:Env|Sys|Resp)\b(?=\s*[.\[])|\bprompt\b(?=\s*\.)/gi, color: C.keyword },
    { re: /\b(?:If|ElseIf|ElsIf|Elif|Else|ForEach|Switch|Case|Default|break|continue|when|and|or|not|for|in)\b/gi, color: C.control },
    { re: /\b(?:Name|Mark|PromptEndsHere)\b/gi, color: C.keyword },
    { re: /\$[a-zA-Z_][a-zA-Z0-9_]*/g, color: C.variable },
    { re: /\b[A-Z][A-Z0-9_]+\b/g, color: C.template },
    { re: /\.\.\.?|\u2026|\u2025/g, color: C.operator },
    { re: /[=!<>&|^+\-*\/%]/g, color: C.operator },
    { re: /(?<=\b(?:env|sys|resp|prompt))\.([a-zA-Z_][a-zA-Z0-9_]*)/g, color: C.variable, group: 1 },
    { re: /@[a-zA-Z_][a-zA-Z0-9_]*/g, color: C.variable },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function highlight(src: string): string {
    let out = '';
    let pos = 0;
    while (pos < src.length) {
        let best: { start: number; end: number; rule: (typeof RULES)[number] } | null = null;
        for (const rule of RULES) {
            rule.re.lastIndex = pos;
            const m = rule.re.exec(src);
            if (!m || m[0].length === 0) continue;
            let start = m.index;
            let end = m.index + m[0].length;
            if (rule.group) {
                start = end - m[rule.group].length;
            }
            if (!best || start < best.start) best = { start, end, rule };
        }
        if (!best) break;
        out += esc(src.slice(pos, best.start));
        const style = `color:${best.rule.color}` + (best.rule.bold ? ';font-weight:700' : '');
        out += `<span style="${style}">${esc(src.slice(best.start, best.end))}</span>`;
        pos = best.end;
    }
    return out + esc(src.slice(pos));
}

async function main() {
    const [input, output] = process.argv.slice(2);
    if (!input || !output) {
        console.log('Usage: bun run blog/tools/acdl-code-png.ts <snippet.acdl> <output.png>');
        process.exit(1);
    }
    const src = fs.readFileSync(input, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
    const tooLong = src.split('\n').filter(l => l.length > MAX_COLS);
    if (tooLong.length) {
        console.error(`Lines longer than ${MAX_COLS} characters; wrap them:\n` + tooLong.join('\n'));
        process.exit(1);
    }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body { margin: 0; background: transparent; }
        #card { display: block; width: ${CARD_WIDTH}px; background: #1f1f1f; border-radius: 8px; overflow: hidden;
                font-family: Consolas, 'JetBrains Mono', 'Courier New', monospace; }
        #bar { background: #181818; border-bottom: 1px solid #2b2b2b; color: #9d9d9d;
               font-size: 13px; letter-spacing: 0.08em; padding: 8px 20px; }
        pre { margin: 0; padding: 18px 20px 20px 20px; color: ${C.text}; font: inherit;
              font-size: ${FONT_SIZE}px; line-height: 1.55; white-space: pre; }
    </style></head><body><div id="card"><div id="bar">ACDL</div><pre>${highlight(src)}</pre></div></body></html>`;

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 2400, height: 1600, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const card = await page.$('#card');
    await card!.screenshot({ path: output as `${string}.png`, omitBackground: true });
    await browser.close();
    console.log(`Generated: ${output}`);
}

main().catch(err => { console.error(err); process.exit(1); });
