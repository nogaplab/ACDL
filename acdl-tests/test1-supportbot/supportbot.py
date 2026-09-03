"""
Test 1: SupportBot - Customer Support Agent
Implements ACDL spec with history loop, conditionals, and template functions.
"""

import argparse
import json
import os
import urllib.request
from dataclasses import dataclass
from typing import List, Optional


# =============================================================================
# Template Constants
# =============================================================================

SUPPORT_GUIDELINES = """You are a helpful customer support agent for ShopCo.
Always be polite, professional, and solution-oriented.
If you cannot resolve an issue, escalate to a human agent."""

COMPANY_POLICIES = """Return Policy: 30-day returns for unused items.
Shipping: Free shipping on orders over $50.
Support Hours: 24/7 chat support available."""

PREMIUM_PRIORITY_NOTICE = """IMPORTANT: This is a premium customer.
Prioritize their request and offer expedited solutions.
Consider offering exclusive discounts or perks if appropriate."""


# =============================================================================
# Template Functions
# =============================================================================

def CUSTOMER_INFO(name: str, tier: str) -> str:
    """Template function for customer information block."""
    return f"Customer: {name}\nTier: {tier}"


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class TurnHistory:
    """Stores a single turn of conversation history."""
    message: str
    reply: Optional[str] = None


@dataclass
class AgentState:
    """Stores the complete agent state including history and customer info."""
    history: List[TurnHistory]
    customer_name: str
    customer_tier: str


# =============================================================================
# Message Builder
# =============================================================================

def build_messages(turn: int, state: AgentState, current_message: str) -> List[dict]:
    """
    Build the messages array for the LLM API call.

    Args:
        turn: Current turn number (1-indexed)
        state: Agent state containing history and customer info
        current_message: The current user message

    Returns:
        List of message dictionaries for the LLM API
    """
    messages = []

    # S: { SUPPORT_GUIDELINES, COMPANY_POLICIES, CUSTOMER_INFO(...) }
    system_content = (
        SUPPORT_GUIDELINES + "\n\n" +
        COMPANY_POLICIES + "\n\n" +
        CUSTOMER_INFO(state.customer_name, state.customer_tier)
    )
    messages.append({"role": "system", "content": system_content})

    # ForEach(@t: range(1, @T))
    for t in range(1, turn):
        # U: env.message[@t]
        messages.append({"role": "user", "content": state.history[t-1].message})
        # A: resp.reply[@t]
        messages.append({"role": "assistant", "content": state.history[t-1].reply})

    # U: env.message[@T]
    messages.append({"role": "user", "content": current_message})

    # If env.customer_tier[@T] == "premium"
    if state.customer_tier == "premium":
        messages.append({"role": "system", "content": PREMIUM_PRIORITY_NOTICE})

    return messages


# =============================================================================
# Sending
# =============================================================================

DEFAULT_HISTORY = [
    {
        "message": "I ordered a laptop last week but haven't received it yet.",
        "reply": "I apologize for the delay. Let me look up your order. Could you provide your order number?",
    },
    {
        "message": "My order number is #12345",
        "reply": "Thank you! I can see your order is currently in transit and should arrive tomorrow.",
    },
]


def send(messages: List[dict]) -> None:
    """POST the built array to the configured provider.

    The specification describes the message array this program *sends*, so the
    array has to actually be sent for that claim to be checkable at all. With no
    endpoint configured the messages are printed, which is what this file did
    before it could send anything.
    """
    base = os.environ.get("ANTHROPIC_BASE_URL")
    if not base:
        print("Generated Messages:")
        print("=" * 60)
        for i, msg in enumerate(messages):
            print(f"\n[{i}] Role: {msg['role']}")
            print(f"Content: {msg['content'][:200]}..." if len(msg['content']) > 200
                  else f"Content: {msg['content']}")
        return

    # Only a *leading* run of system messages is hoisted into the top-level
    # field. The premium notice is a system message that comes after the user's,
    # and joining it onto the front would move it -- which is exactly the claim
    # the specification makes about where it sits.
    rest = list(messages)
    system = ""
    while rest and rest[0]["role"] == "system":
        system += ("\n\n" if system else "") + rest.pop(0)["content"]

    body = {"model": os.environ.get("MODEL", "claude-haiku-4-5"),
            "max_tokens": 64, "messages": rest}
    if system:
        body["system"] = system

    request = urllib.request.Request(
        base.rstrip("/") + "/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json",
                 "x-api-key": os.environ.get("ANTHROPIC_API_KEY", ""),
                 "anthropic-version": "2023-06-01"})
    with urllib.request.urlopen(request) as response:
        response.read()


# =============================================================================
# Entrypoint
# =============================================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="SupportBot: build and send one turn.")
    parser.add_argument("--turn", type=int, default=int(os.environ.get("TURN", "3")),
                        help="1-indexed turn number; history before it is replayed")
    parser.add_argument("--name", default=os.environ.get("CUSTOMER_NAME", "Alice Johnson"))
    parser.add_argument("--tier", default=os.environ.get("CUSTOMER_TIER", "premium"),
                        help='"premium" unlocks the priority notice')
    parser.add_argument("--message", default=os.environ.get(
        "CURRENT_MESSAGE", "That's great! Can I also get a discount on my next order?"))
    parser.add_argument("--history", default=os.environ.get("HISTORY_FILE"),
                        help="JSON file of {message, reply} objects; defaults to a sample")
    args = parser.parse_args()

    turns = DEFAULT_HISTORY
    if args.history:
        with open(args.history, encoding="utf-8") as handle:
            turns = json.load(handle)

    state = AgentState(
        history=[TurnHistory(message=t["message"], reply=t.get("reply")) for t in turns],
        customer_name=args.name,
        customer_tier=args.tier,
    )
    send(build_messages(turn=args.turn, state=state, current_message=args.message))


if __name__ == "__main__":
    main()
