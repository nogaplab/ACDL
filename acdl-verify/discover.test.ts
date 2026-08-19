// bun test acdl-verify/discover.test.ts
//
// The discovery agent is the one part of acdl-verify that cannot be made
// deterministic, so what is tested here is the machinery that contains it: the
// evidence check that rejects an invented handle, and the retry loop that hands
// the rejection back. No network is used -- the model is a stub.

import { test, expect } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { extractTargets } from './provenance';
import { ground, usable, type Proposal, type BindingMap } from './bindings';
import { discover } from './discover';

const SUPPORTBOT = 'acdl-tests/test1-supportbot';
const SPEC = 'acdl-agent/out/supportbot/SupportBot.acdl';

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
    key: 'env.customer_tier',
    kind: 'harness',
    handle: 'AgentState(customer_tier=...)',
    setter: 'Import build_messages and pass an AgentState whose customer_tier is the value.',
    evidence: { file: 'supportbot.py', line: 116, snippet: 'customer_tier="premium"' },
    confidence: 'high',
    reasoning: 'The tier is a dataclass field set at the only call site.',
    ...over,
});

// ------------------------------------------------------------- grounding

test('a verbatim snippet at the cited line grounds', () => {
    const b = ground(proposal(), SUPPORTBOT);
    expect(b.status).toBe('grounded');
    expect(b.verification).toBe('unverified');
});

test('a few lines of slack is tolerated, being a transcription slip', () => {
    expect(ground(proposal({
        evidence: { file: 'supportbot.py', line: 113, snippet: 'customer_tier="premium"' },
    }), SUPPORTBOT).status).toBe('grounded');
});

test('a paraphrase is rejected', () => {
    const b = ground(proposal({
        evidence: {
            file: 'supportbot.py', line: 116,
            snippet: 'the customer tier is set to premium here',
        },
    }), SUPPORTBOT);
    expect(b.status).toBe('rejected');
    expect(b.rejection).toContain('does not appear in');
});

test('an invented flag is rejected', () => {
    const b = ground(proposal({
        kind: 'flag', handle: '--tier',
        evidence: {
            file: 'supportbot.py', line: 100,
            snippet: 'parser.add_argument("--tier", default="standard")',
        },
    }), SUPPORTBOT);
    expect(b.status).toBe('rejected');
    expect(b.rejection).toContain('does not appear in');
});

test('real text cited at the wrong place is rejected, and says so specifically', () => {
    // Line 52 is the dataclass field; line 116 is the assignment. Citing one and
    // quoting the other is the most common near-miss, and it is still wrong.
    const b = ground(proposal({
        evidence: { file: 'supportbot.py', line: 52, snippet: 'customer_tier="premium"' },
    }), SUPPORTBOT);
    expect(b.status).toBe('rejected');
    expect(b.rejection).toContain('but not within');
});

test('a missing file, an out-of-range line, and an empty snippet are all rejected', () => {
    expect(ground(proposal({
        evidence: { file: 'nope.py', line: 1, snippet: 'x' },
    }), SUPPORTBOT).rejection).toContain('does not exist');

    expect(ground(proposal({
        evidence: { file: 'supportbot.py', line: 9999, snippet: 'x' },
    }), SUPPORTBOT).rejection).toContain('out of range');

    expect(ground(proposal({
        evidence: { file: 'supportbot.py', line: 116, snippet: '   ' },
    }), SUPPORTBOT).rejection).toContain('empty');
});

test('a citation written against a different root still resolves', () => {
    // The extractor may cite `test1-supportbot/supportbot.py` while we are
    // pointed at that directory already.
    expect(ground(proposal({
        evidence: {
            file: 'test1-supportbot/supportbot.py', line: 116,
            snippet: 'customer_tier="premium"',
        },
    }), SUPPORTBOT).status).toBe('grounded');
});

// ------------------------------------------------------------- retry loop

/** A model that replies with a scripted batch per call, recording what it saw. */
function stubClient(batches: Proposal[][]) {
    const seen: Anthropic.MessageParam[][] = [];
    let n = 0;
    return {
        seen,
        calls: () => n,
        client: {
            messages: {
                parse: async (req: any) => {
                    seen.push(req.messages);
                    const bindings = batches[Math.min(n++, batches.length - 1)];
                    return { parsed_output: { bindings } };
                },
            },
        } as unknown as Anthropic,
    };
}

test('a rejected proposal is re-asked with the reason, and the retry is accepted', async () => {
    const bad = proposal({ evidence: { file: 'supportbot.py', line: 100, snippet: 'add_argument("--tier")' } });
    const good = proposal();
    const stub = stubClient([[bad], [good]]);

    const map = await discover({
        specFile: SPEC, targetRoot: SUPPORTBOT, client: stub.client, verbose: false,
    });

    expect(stub.calls()).toBe(2);
    const tier = map.bindings.find((b) => b.key === 'env.customer_tier')!;
    expect(tier.status).toBe('grounded');
    expect(tier.kind).toBe('harness');

    // The follow-up must carry the specific reason, or the retry is a coin flip.
    const followUp = stub.seen[1];
    const last = followUp[followUp.length - 1].content as string;
    expect(last).toContain('env.customer_tier');
    expect(last).toContain('does not appear in');
    expect(followUp).toHaveLength(3);   // original, assistant echo, rejection
});

test('a proposal that stays wrong is kept as rejected, not silently dropped', async () => {
    const bad = proposal({ evidence: { file: 'supportbot.py', line: 100, snippet: 'nonexistent text' } });
    const stub = stubClient([[bad]]);

    const map = await discover({
        specFile: SPEC, targetRoot: SUPPORTBOT, client: stub.client, verbose: false, retries: 1,
    });

    const tier = map.bindings.find((b) => b.key === 'env.customer_tier')!;
    expect(tier.status).toBe('rejected');
    expect(tier.rejection).toBeTruthy();
    expect(usable(map)).toHaveLength(0);
});

test('targets the agent never answered are recorded as unanswered', async () => {
    const stub = stubClient([[proposal()]]);   // answers 1 of 5 targets
    const map = await discover({
        specFile: SPEC, targetRoot: SUPPORTBOT, client: stub.client, verbose: false, retries: 0,
    });

    // The spec's own targets plus `time`, which discovery always asks about.
    const targets = extractTargets(fs.readFileSync(SPEC, 'utf8'));
    expect(map.bindings).toHaveLength(targets.length + 1);
    expect(map.bindings.some((b) => b.key === 'time')).toBe(true);

    const missing = map.bindings.filter((b) => b.rejection === 'no proposal returned');
    expect(missing.length).toBe(targets.length);
    expect(missing.every((b) => b.kind === 'unreachable')).toBe(true);
});

test('a condition carries the spec-stated domain onto its binding', async () => {
    const cond = proposal({ key: 'cond:44' });
    const stub = stubClient([[cond]]);
    const map = await discover({
        specFile: SPEC, targetRoot: SUPPORTBOT, client: stub.client, verbose: false, retries: 0,
    });

    // "premium" is read out of the spec, not guessed: it is what the If compares to.
    expect(map.bindings.find((b) => b.key === 'cond:44')!.domain).toEqual(['premium']);
});

test('the prompt hands the agent the cited source, not the whole codebase', async () => {
    const stub = stubClient([[proposal()]]);
    await discover({ specFile: SPEC, targetRoot: SUPPORTBOT, client: stub.client, verbose: false, retries: 0 });

    const user = stub.seen[0][0].content as string;
    expect(user).toContain('# Cited source');
    expect(user).toContain('supportbot.py:');
    expect(user).toContain('customer_tier');      // the cited window, with line numbers
    expect(user).toContain('91| ');
});

test('bindings round-trip through the file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acdl-bind-'));
    const file = path.join(dir, 'bindings.json');
    const map: BindingMap = {
        version: 1, spec: SPEC, target: SUPPORTBOT,
        generatedAt: '2026-08-19T00:00:00Z', model: 'claude-opus-5',
        bindings: [ground(proposal(), SUPPORTBOT)],
    };
    const { writeBindings, readBindings } = require('./bindings');
    writeBindings(file, map);
    expect(readBindings(file)).toEqual(map);
    expect(usable(readBindings(file))).toHaveLength(1);
});
