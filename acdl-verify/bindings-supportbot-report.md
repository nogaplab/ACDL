# Binding map — acdl-agent/out/supportbot/SupportBot.acdl

Target: `acdl-tests/test1-supportbot`  ·  proposed by opus (claude-cli)  ·  2026-08-19T10:19:47.432Z

A binding says how to make one variable take a chosen value in a real run.
It is proposed by a model, so each is checked twice: the cited line must exist and
say what was claimed (*grounded*), and setting the handle must actually move the
recorded request (*confirmed*). Only confirmed bindings may carry a causal claim.

| | count |
|---|---|
| bindings | 5 |
| grounded | 5 |
| confirmed at runtime | 3 |

## How each variable is reached

| kind | count | meaning |
|---|---|---|
| `harness` | 5 | no input surface — the builder is called directly with synthetic state |

## Bindings

| variable | kind | grounded | runtime | confidence | handle |
|---|---|---|---|---|---|
| `cond:44` | harness | ✓ | ✓ confirmed | high | `AgentState(customer_tier=...) → build_message…` |
| `env.customer_name` | harness | ✓ | · unverified | high | `AgentState(customer_name=...) → build_message…` |
| `env.customer_tier` | harness | ✓ | ✓ confirmed | high | `AgentState(customer_tier=...) → build_message…` |
| `env.message` | harness | ✓ | ✓ confirmed | high | `build_messages(current_message=...) and TurnH…` |
| `resp.reply` | harness | ✓ | · unverified | high | `TurnHistory(reply=...) inside AgentState(hist…` |

## Evidence

Each snippet below was compared against the file before the binding was accepted.

### `cond:44` — harness

**To set it:** Set customer_tier to "premium" (true branch) or any other string (false branch) when constructing AgentState and passing it to build_messages(state=...); the demo hardcodes it at supportbot.py:116.

**How it reaches the prompt:** The branch at line 92 tests state.customer_tier against the literal "premium", and customer_tier has no input surface other than the AgentState constructor argument. Flipping the branch requires editing that literal or calling build_messages with a different synthetic state.

**Values the spec compares it against:** `premium`

**Cited at** `supportbot.py:116`

```
        customer_tier="premium"
```

**Runtime (differential):** message shape changed: arm "premium" gave [S U A U A U S], the off-arm value gave [S U A U A U]. Incidental text delta at "Tier: premium" vs "Tier: ACDLVBBBC9A75_NOT_premium"

<details><summary>Generated driver</summary>

```python
import os, sys, json, urllib.request

sys.path.insert(0, os.getcwd())

import supportbot
from supportbot import AgentState, TurnHistory, build_messages

value = os.environ["ACDL_VALUE"]
turn = int(os.environ.get("ACDL_TIME", "3"))
if turn < 1:
    turn = 1

history = []
for i in range(1, turn):
    history.append(TurnHistory(
        message="Customer message for turn %d." % i,
        reply="Assistant reply for turn %d." % i,
    ))

state = AgentState(
    history=history,
    customer_name="Alice Johnson",
    customer_tier=value,
)

current_message = "Customer message for turn %d." % turn

messages = build_messages(turn=turn, state=state, current_message=current_message)

msgs = [{"role": m["role"], "content": m["content"]} for m in messages]

system_parts = []
while msgs and msgs[0]["role"] == "system":
    system_parts.append(msgs.pop(0)["content"])

body = {
    "model": "claude-haiku-4-5",
    "max_tokens": 64,
    "messages": msgs,
}
if system_parts:
    body["system"] = "\n\n".join(system_parts)

base = os.environ["ANTHROPIC_BASE_URL"].rstrip("/")
req = urllib.request.Request(
    base + "/v1/messages",
    data=json.dumps(body).encode("utf-8"),
    headers={"content-type": "application/json"},
    method="POST",
)
try:
    urllib.request.urlopen(req).read()
except Exception as e:
    sys.stderr.write(str(e) + "\n")

sys.exit(0)
```

</details>

### `env.customer_name` — harness

**To set it:** Edit the hardcoded `customer_name="Alice Johnson"` in the `__main__` block (supportbot.py:115), or import supportbot and call build_messages(turn, AgentState(history=..., customer_name=<value>, customer_tier=...), current_message).

**How it reaches the prompt:** The file has no argparse, no os.environ read, and no file/stdin input; customer_name is set only by the literal in the `__main__` demo state. It reaches the prompt via state.customer_name in CUSTOMER_INFO at line 77.

**Cited at** `supportbot.py:115`

```
        customer_name="Alice Johnson",
```

### `env.customer_tier` — harness

**To set it:** Edit the hardcoded `customer_tier="premium"` in the `__main__` block (supportbot.py:116), or import supportbot and call build_messages(turn, AgentState(history=..., customer_name=..., customer_tier=<value>), current_message).

**How it reaches the prompt:** customer_tier enters only as a literal keyword argument to AgentState in the demo block; there is no CLI, env, or config surface. It is consumed at line 77 (CUSTOMER_INFO) and line 92 (the premium test).

**Cited at** `supportbot.py:116`

```
        customer_tier="premium"
```

**Runtime (canary):** canary ACDLV3435E6BB appeared in 1 position(s): system.system

Landed at: `system.system`

<details><summary>Generated driver</summary>

```python
import os, sys, json, urllib.request

sys.path.insert(0, os.getcwd())

import supportbot
from supportbot import AgentState, TurnHistory, build_messages

value = os.environ["ACDL_VALUE"]
turn = int(os.environ.get("ACDL_TIME", "3"))
if turn < 1:
    turn = 1

SAMPLE = [
    ("I ordered a laptop last week but haven't received it yet.",
     "I apologize for the delay. Let me look up your order. Could you provide your order number?"),
    ("My order number is #12345",
     "Thank you! I can see your order is currently in transit and should arrive tomorrow."),
]

history = []
for i in range(turn - 1):
    if i < len(SAMPLE):
        m, r = SAMPLE[i]
    else:
        m = "Follow-up question number %d." % (i + 1)
        r = "Here is my answer to follow-up number %d." % (i + 1)
    history.append(TurnHistory(message=m, reply=r))

state = AgentState(
    history=history,
    customer_name="Alice Johnson",
    customer_tier=value,
)

current_message = "That's great! Can I also get a discount on my next order?"

messages = build_messages(turn=turn, state=state, current_message=current_message)

msgs = [{"role": m["role"], "content": m["content"]} for m in messages]

system_parts = []
idx = 0
while idx < len(msgs) and msgs[idx]["role"] == "system":
    system_parts.append(msgs[idx]["content"])
    idx += 1
rest = msgs[idx:]

body = {"model": "claude-haiku-4-5", "max_tokens": 64, "messages": rest}
if system_parts:
    body["system"] = "\n\n".join(system_parts)

base = os.environ["ANTHROPIC_BASE_URL"].rstrip("/")
req = urllib.request.Request(
    base + "/v1/messages",
    data=json.dumps(body).encode("utf-8"),
    headers={"content-type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req) as resp:
        resp.read()
except Exception as e:
    print("proxy error:", e)

sys.exit(0)
```

</details>

### `env.message` — harness

**To set it:** Import supportbot and call build_messages(turn=N, state=AgentState(history=[TurnHistory(message=<value>, reply=...), ...], ...), current_message=<value>), or edit the literals at supportbot.py:107, 111 and 120.

**How it reaches the prompt:** Historical user messages come from TurnHistory.message literals built in `__main__` (lines 107, 111); the current-turn message is the `current_message` argument, assigned from a literal at line 120 and passed at line 121. No stdin, flag, or file feeds either.

**Cited at** `supportbot.py:121`

```
    messages = build_messages(turn=3, state=state, current_message=current_message)
```

**Runtime (canary):** canary ACDLV7C67EF0D appeared in 3 position(s): user[0].content, user[2].content, user[4].content

Landed at: `user[0].content`, `user[2].content`, `user[4].content`

<details><summary>Generated driver</summary>

```python
import os, sys, json, urllib.request

sys.path.insert(0, os.getcwd())

import supportbot

value = os.environ["ACDL_VALUE"]
turn = int(os.environ.get("ACDL_TIME", "3") or "3")
if turn < 1:
    turn = 1

# Build history so that every user message in the conversation is the value.
# Turn N means there are N-1 prior turns in history.
history = []
for i in range(turn - 1):
    history.append(supportbot.TurnHistory(message=value, reply="Thank you, let me look into that for you."))

state = supportbot.AgentState(
    history=history,
    customer_name="Alice Johnson",
    customer_tier="premium",
)

messages = supportbot.build_messages(turn=turn, state=state, current_message=value)

msgs = [{"role": m["role"], "content": m["content"]} for m in messages]

# Hoist ONLY a leading run of system messages.
lead = 0
while lead < len(msgs) and msgs[lead]["role"] == "system":
    lead += 1

body = {
    "model": "claude-haiku-4-5",
    "max_tokens": 64,
    "messages": msgs[lead:],
}
if lead > 0:
    body["system"] = "\n\n".join(m["content"] for m in msgs[:lead])

base = os.environ["ANTHROPIC_BASE_URL"].rstrip("/")
req = urllib.request.Request(
    base + "/v1/messages",
    data=json.dumps(body).encode("utf-8"),
    headers={"content-type": "application/json"},
    method="POST",
)
try:
    urllib.request.urlopen(req).read()
except Exception as e:
    print("post failed:", e)

sys.exit(0)
```

</details>

### `resp.reply` — harness

**To set it:** Import supportbot and pass TurnHistory(message=..., reply=<value>) entries in AgentState.history to build_messages(state=...), or edit the hardcoded reply literals at supportbot.py:108 and 112.

**How it reaches the prompt:** The API call that would produce real replies is commented out (lines 131-133), so reply values exist only as literals in the demo history or as whatever a caller supplies to TurnHistory. They are emitted verbatim as assistant messages at line 86.

**Cited at** `supportbot.py:108`

```
                reply="I apologize for the delay. Let me look up your order. Could you provide your order number?"
```

## Grounded but not yet confirmed

The cited line exists and says what was claimed, but no episode has shown that
setting the handle moves the prompt. Run `verify.ts` before relying on these.

- `env.customer_name`
- `resp.reply`

