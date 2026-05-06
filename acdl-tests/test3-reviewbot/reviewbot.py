"""
Test 3: ReviewBot - Code Review Agent with Tool Use
Implements ACDL spec with substeps (@T.I), tool messages, and partial turns.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Any
import json


# =============================================================================
# Template Constants
# =============================================================================

REVIEW_GUIDELINES = """You are an expert code reviewer.
Analyze code changes for:
- Bugs and potential issues
- Security vulnerabilities
- Performance concerns
- Code style and best practices
- Test coverage gaps"""

ANALYSIS_TOOLS = """Available tools:
- lint_code: Run static analysis on code
- security_scan: Check for security vulnerabilities
- complexity_check: Analyze code complexity
- test_coverage: Check test coverage for changes"""

OUTPUT_FORMAT = """Provide your review in this format:
1. Summary of changes
2. Issues found (categorized by severity)
3. Suggestions for improvement
4. Overall assessment (approve/request changes)"""

CODE_REVIEW_REQUEST = """=== CODE REVIEW REQUEST ===
Please review the following code changes:"""

CONTEXT_HEADER = """=== ADDITIONAL CONTEXT ==="""


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class ToolCall:
    """Represents a single tool call."""
    call_id: str
    name: str
    arguments: dict
    result: Optional[str] = None

    @property
    def invocation(self) -> dict:
        """Return the tool invocation format for the API."""
        return {
            "id": self.call_id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": json.dumps(self.arguments)
            }
        }


@dataclass
class SubStep:
    """Represents a substep with analysis and tool calls."""
    analysis: str
    tool_calls: List[ToolCall] = field(default_factory=list)


@dataclass
class TurnHistory:
    """Stores a single review iteration."""
    substeps: List[SubStep] = field(default_factory=list)
    review_summary: Optional[str] = None
    has_feedback: bool = False
    feedback: Optional[str] = None


@dataclass
class AgentState:
    """Stores the complete agent state."""
    history: List[TurnHistory]
    code_diff: str = ""
    has_context: bool = False
    pr_description: Optional[str] = None


# =============================================================================
# Message Builder
# =============================================================================

def build_messages(
    turn: int,
    substep: int,
    state: AgentState,
    code_diff: str,
    pr_description: Optional[str] = None
) -> List[dict]:
    """
    Build the messages array for the LLM API call.

    Args:
        turn: Current turn number (1-indexed)
        substep: Current substep within the turn (0 = no partial progress)
        state: Agent state containing history
        code_diff: The code diff to review
        pr_description: Optional PR description for context

    Returns:
        List of message dictionaries for the LLM API
    """
    messages = []

    # S: { REVIEW_GUIDELINES, ANALYSIS_TOOLS, OUTPUT_FORMAT }
    system_content = REVIEW_GUIDELINES + "\n\n" + ANALYSIS_TOOLS + "\n\n" + OUTPUT_FORMAT
    messages.append({"role": "system", "content": system_content})

    # U: { CODE_REVIEW_REQUEST, env.code_diff[@1], If env.has_context[@1] {...} }
    user_content = CODE_REVIEW_REQUEST + "\n" + code_diff

    # If env.has_context[@1]
    if pr_description:
        user_content += "\n\n" + CONTEXT_HEADER + "\n" + pr_description

    messages.append({"role": "user", "content": user_content})

    # ForEach(@t: range(1, @T)) - Review iterations
    for t in range(1, turn):
        turn_history = state.history[t-1]

        # ForEach(@i: range(1, @t.substeps)) - Tool usage within this iteration
        for i in range(len(turn_history.substeps)):
            substep_data = turn_history.substeps[i]

            # A: { resp.analysis[@t.@i], ForEach(tool: sys.tool_calls[@t.@i]) { tool.invocation } }
            assistant_message = {
                "role": "assistant",
                "content": substep_data.analysis,
            }

            # Add tool_calls if present
            if substep_data.tool_calls:
                assistant_message["tool_calls"] = [
                    tc.invocation for tc in substep_data.tool_calls
                ]

            messages.append(assistant_message)

            # ForEach(tool: sys.tool_calls[@t.@i]) { T: { tool.call_id, tool.result } }
            for tool in substep_data.tool_calls:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool.call_id,
                    "content": tool.result
                })

        # A: resp.review_summary[@t]
        messages.append({"role": "assistant", "content": turn_history.review_summary})

        # If sys.has_feedback[@t] { U: env.feedback[@t] }
        if turn_history.has_feedback:
            messages.append({"role": "user", "content": turn_history.feedback})

    # If @T.I > 0 - Partial current turn
    if substep > 0:
        current_turn = state.history[turn-1]

        # ForEach(@i: range(1, @T.I))
        for i in range(substep):
            substep_data = current_turn.substeps[i]

            # A: { resp.analysis[@T.@i], ForEach(tool: sys.tool_calls[@T.@i]) { tool.invocation } }
            assistant_message = {
                "role": "assistant",
                "content": substep_data.analysis,
            }

            if substep_data.tool_calls:
                assistant_message["tool_calls"] = [
                    tc.invocation for tc in substep_data.tool_calls
                ]

            messages.append(assistant_message)

            # ForEach(tool: sys.tool_calls[@T.@i]) { T: { tool.call_id, tool.result } }
            for tool in substep_data.tool_calls:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool.call_id,
                    "content": tool.result
                })

    return messages


# =============================================================================
# Usage Example
# =============================================================================

if __name__ == "__main__":
    # Create sample state with review history
    state = AgentState(
        history=[
            TurnHistory(
                substeps=[
                    SubStep(
                        analysis="Let me analyze this code for potential issues. I'll start with static analysis.",
                        tool_calls=[
                            ToolCall(
                                call_id="call_001",
                                name="lint_code",
                                arguments={"file": "main.py"},
                                result="Found 2 unused imports and 1 undefined variable"
                            )
                        ]
                    ),
                    SubStep(
                        analysis="Now let me check for security vulnerabilities.",
                        tool_calls=[
                            ToolCall(
                                call_id="call_002",
                                name="security_scan",
                                arguments={"file": "main.py"},
                                result="No security issues found"
                            )
                        ]
                    )
                ],
                review_summary="Initial review complete. Found minor linting issues but no security concerns.",
                has_feedback=True,
                feedback="Can you also check the test coverage?"
            )
        ]
    )

    # Code diff to review
    code_diff = """
    +def calculate_total(items):
    +    total = 0
    +    for item in items:
    +        total += item.price * item.quantity
    +    return total
    """

    pr_description = "Added a function to calculate the total price of items in a cart."

    # Build messages for turn 2, substep 0 (no partial progress)
    messages = build_messages(
        turn=2,
        substep=0,
        state=state,
        code_diff=code_diff,
        pr_description=pr_description
    )

    # Print the messages
    print("Generated Messages:")
    print("=" * 60)
    for i, msg in enumerate(messages):
        print(f"\n[{i}] Role: {msg['role']}")
        if "tool_calls" in msg:
            print(f"Tool Calls: {len(msg['tool_calls'])} calls")
        if "tool_call_id" in msg:
            print(f"Tool Call ID: {msg['tool_call_id']}")
        content = msg.get('content', '')
        print(f"Content: {content[:150]}..." if len(content) > 150 else f"Content: {content}")

    # Example API call (commented out)
    # from openai import OpenAI
    # client = OpenAI()
    # response = client.chat.completions.create(
    #     model="gpt-4",
    #     messages=messages,
    #     tools=[...tool_definitions...]
    # )
