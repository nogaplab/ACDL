# Binding map — acdl-agent/out/supportbot/SupportBot.acdl

Target: `acdl-tests/test1-supportbot`  ·  proposed by opus (claude-cli)  ·  2026-08-19T22:01:14.478Z

A binding says how to make one variable take a chosen value in a real run.
It is proposed by a model, so each is checked twice: the cited line must exist and
say what was claimed (*grounded*), and setting the handle must actually move the
recorded request (*confirmed*). Only confirmed bindings may carry a causal claim.

| | count |
|---|---|
| bindings | 6 |
| grounded | 6 |
| confirmed at runtime | 0 |

## How each variable is reached

| kind | count | meaning |
|---|---|---|
| `harness` | 6 | no input surface — the builder is called directly with synthetic state |

## Bindings

| variable | kind | grounded | runtime | confidence | handle |
|---|---|---|---|---|---|
| `cond:44` | harness | ✓ | · unverified | high | `AgentState(customer_tier="premium") passed to…` |
| `env.customer_name` | harness | ✓ | · unverified | high | `AgentState(customer_name=...) passed to build…` |
| `env.customer_tier` | harness | ✓ | · unverified | high | `AgentState(customer_tier=...) passed to build…` |
| `env.message` | harness | ✓ | · unverified | high | `build_messages(current_message=...) and TurnH…` |
| `resp.reply` | harness | ✓ | · unverified | medium | `TurnHistory(reply=...) entries in AgentState.…` |
| `time` | harness | ✓ | · unverified | high | `build_messages(turn=N, ...) with state.histor…` |

## Evidence

Each snippet below was compared against the file before the binding was accepted.

### `cond:44` — harness

**To set it:** Set customer_tier to "premium" in the AgentState you pass to build_messages to take the branch, and to any other string (e.g. "standard") to skip it.

**How it reaches the prompt:** The branch at line 92 tests state.customer_tier, whose only source is the AgentState constructor argument hardcoded at line 116. Flipping that literal (or passing a different value when calling build_messages directly) toggles the appended PREMIUM_PRIORITY_NOTICE system message.

**Values the spec compares it against:** `premium`

**Cited at** `supportbot.py:116`

```
        customer_tier="premium"
```

### `env.customer_name` — harness

**To set it:** Import supportbot and call build_messages(turn, AgentState(history=[...], customer_name="<chosen name>", customer_tier=...), current_message), or edit the customer_name= literal in the __main__ block.

**How it reaches the prompt:** customer_name is a field of the AgentState dataclass, hardcoded in the __main__ block at line 115, and read at line 77 into CUSTOMER_INFO. There is no argparse, os.environ, config file or stdin read anywhere in the file, so the only handle is the AgentState constructor argument.

**Cited at** `supportbot.py:115`

```
        customer_name="Alice Johnson",
```

### `env.customer_tier` — harness

**To set it:** Import supportbot and call build_messages(turn, AgentState(history=[...], customer_name=..., customer_tier="<chosen tier>"), current_message), or edit the customer_tier= literal in the __main__ block.

**How it reaches the prompt:** customer_tier is an AgentState field hardcoded at line 116; it reaches the prompt both through CUSTOMER_INFO at line 77 and through the premium branch at line 92. No environment variable, flag, or file feeds it.

**Cited at** `supportbot.py:116`

```
        customer_tier="premium"
```

### `env.message` — harness

**To set it:** Call build_messages directly, passing the current turn's text as current_message and each earlier turn's text as TurnHistory(message="...") entries in state.history (both are hardcoded in __main__ at lines 107/111/120).

**How it reaches the prompt:** The current-turn message is the `current_message` parameter of build_messages (line 89) and past messages come from state.history[t-1].message (line 84); both are supplied only by the hardcoded __main__ call at line 121. The process reads nothing from stdin, argv, env or disk.

**Cited at** `supportbot.py:59`

```
def build_messages(turn: int, state: AgentState, current_message: str) -> List[dict]:
```

### `resp.reply` — harness

**To set it:** Call build_messages with state.history preloaded as TurnHistory(message=..., reply="<chosen assistant text>") for each prior turn; a recording proxy cannot set it because no API call is ever made.

**How it reaches the prompt:** Although resp.* is normally proxy-controlled, this codebase never calls a model — the OpenAI call at lines 131-133 is commented out — so prior replies never come back from a live response; they are only the hardcoded TurnHistory.reply strings read at line 86. Therefore the reply value must be seeded through the TurnHistory constructor rather than scripted at the proxy.

**Cited at** `supportbot.py:108`

```
                reply="I apologize for the delay. Let me look up your order. Could you provide your order number?"
```

### `time` — harness

**To set it:** Call build_messages(turn=N, state=AgentState(history=[TurnHistory(...)] * (N-1), ...), current_message=...) — the turn counter is a plain integer argument, so any N is reachable in a single call.

**How it reaches the prompt:** There is no agent loop at all: @T is the `turn` parameter, used only as the bound of `for t in range(1, turn)` at line 82, and the history it indexes is the preloaded state.history list. Seeding both — turn=N and N-1 TurnHistory entries — puts the agent at turn N immediately.

**Cited at** `supportbot.py:121`

```
    messages = build_messages(turn=3, state=state, current_message=current_message)
```

## Grounded but not yet confirmed

The cited line exists and says what was claimed, but no episode has shown that
setting the handle moves the prompt. Run `verify.ts` before relying on these.

- `cond:44`
- `env.customer_name`
- `env.customer_tier`
- `env.message`
- `resp.reply`
- `time`

