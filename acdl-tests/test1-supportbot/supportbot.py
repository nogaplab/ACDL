"""
Test 1: SupportBot - Customer Support Agent
Implements ACDL spec with history loop, conditionals, and template functions.
"""

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
# Usage Example
# =============================================================================

if __name__ == "__main__":
    # Create sample state with conversation history
    state = AgentState(
        history=[
            TurnHistory(
                message="I ordered a laptop last week but haven't received it yet.",
                reply="I apologize for the delay. Let me look up your order. Could you provide your order number?"
            ),
            TurnHistory(
                message="My order number is #12345",
                reply="Thank you! I can see your order is currently in transit and should arrive tomorrow."
            ),
        ],
        customer_name="Alice Johnson",
        customer_tier="premium"
    )

    # Build messages for turn 3
    current_message = "That's great! Can I also get a discount on my next order?"
    messages = build_messages(turn=3, state=state, current_message=current_message)

    # Print the messages
    print("Generated Messages:")
    print("=" * 60)
    for i, msg in enumerate(messages):
        print(f"\n[{i}] Role: {msg['role']}")
        print(f"Content: {msg['content'][:200]}..." if len(msg['content']) > 200 else f"Content: {msg['content']}")

    # Example API call (commented out)
    # from openai import OpenAI
    # client = OpenAI()
    # response = client.chat.completions.create(model="gpt-4", messages=messages)
