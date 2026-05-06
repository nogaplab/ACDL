"""
ResearchBot: Python implementation generated from ACDL specification.

This module implements the message builder for a multi-turn research assistant
with conversation compaction, nested tool loops, and conditional modes.

ACDL Source:
    ResearchBot[@T.I]: { ... }
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any


# =============================================================================
# TEMPLATE CONSTANTS
# =============================================================================

SYSTEM_PROMPT = """
You are ResearchBot, an intelligent research assistant specialized in finding,
analyzing, and synthesizing information from academic papers and web sources.
You help users explore research topics, find relevant papers, and answer
questions based on scientific literature.
"""

RESEARCH_GUIDELINES = """
Research Guidelines:
1. Always cite your sources with proper references
2. Distinguish between established facts and emerging research
3. Acknowledge uncertainty when evidence is limited
4. Provide balanced perspectives on controversial topics
5. Prioritize peer-reviewed sources over informal content
"""

AVAILABLE_TOOLS = """
Available Tools:
- search_papers(query: str, limit: int) - Search academic paper databases
- search_web(query: str) - Search general web sources
- get_paper_details(paper_id: str) - Get full details of a specific paper
- summarize_text(text: str) - Summarize a long text passage
- compare_sources(source_ids: List[str]) - Compare multiple sources
"""

CONVERSATION_SUMMARY_HEADER = """
[Previous conversation has been summarized to manage context length]
Here is a summary of our earlier discussion:
"""

FOCUSED_MODE_REMINDER = """
[FOCUSED MODE ACTIVE]
You are now in focused research mode. Please concentrate your responses
on the specific sources and topics already identified. Relevant sources:
"""


# =============================================================================
# TEMPLATE FUNCTIONS
# =============================================================================

def ENV_INFO(date: str, expertise: str) -> str:
    """
    ACDL: ENV_INFO(env.date[@1], env.user_expertise[@1])
    Generates environment context string.
    """
    # TODO: Customize based on actual environment needs
    return f"""
Current Date: {date}
User Expertise Level: {expertise}
"""


def MODE_CHANGE_NOTICE(mode: str) -> str:
    """
    ACDL: MODE_CHANGE_NOTICE(sys.research_mode[@t])
    Generates a notice when research mode changes.
    """
    # TODO: Customize mode change messaging
    return f"\n[Research mode changed to: {mode}]\n"


def SOURCE_CITATION(id: str, title: str) -> str:
    """
    ACDL: SOURCE_CITATION(src.id, src.title)
    Formats a source citation.
    """
    # TODO: Customize citation format
    return f"- [{id}] {title}\n"


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class ToolCall:
    """Represents a single tool call within a substep."""
    id: str
    name: str
    args: Dict[str, Any]
    response: Optional[str] = None

    @property
    def name_and_args(self) -> str:
        """Returns formatted tool call for assistant message."""
        return f"{self.name}({self.args})"


@dataclass
class SubStep:
    """
    Represents a substep within a turn (one reasoning + tool calls cycle).
    ACDL: @t.@i indexing
    """
    reasoning: str
    tool_requests: List[ToolCall] = field(default_factory=list)


@dataclass
class TurnHistory:
    """
    Represents a complete turn in the conversation.
    ACDL: @t indexing
    """
    user_query: str
    substeps: List[SubStep] = field(default_factory=list)
    answer: Optional[str] = None
    mode_changed: bool = False
    research_mode: str = "exploratory"

    @property
    def num_substeps(self) -> int:
        """Returns @t.substeps - the number of substeps in this turn."""
        return len(self.substeps)


@dataclass
class AgentState:
    """
    Holds the complete state of the ResearchBot agent.
    """
    history: List[TurnHistory] = field(default_factory=list)
    last_compaction_turn: int = 1  # ACDL: sys.last_compaction_turn[@T]
    conversation_summary: Optional[str] = None  # ACDL: sys.conversation_summary[@$C]
    source_history: List[Dict[str, Any]] = field(default_factory=list)  # ACDL: sys.source_history[@T]
    current_research_mode: str = "exploratory"  # ACDL: sys.research_mode[@T]


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def get_relevant_sources(source_history: List[Dict[str, Any]], k: int) -> List[Dict[str, Any]]:
    """
    ACDL: get_relevant_sources(sys.source_history[@T], 3)

    Retrieves the k most relevant sources from the source history.

    Args:
        source_history: List of source dictionaries with 'id', 'title', etc.
        k: Number of sources to retrieve

    Returns:
        List of the k most relevant source dictionaries
    """
    # TODO: Implement actual relevance ranking logic
    # For now, return the k most recent sources
    return source_history[-k:] if len(source_history) >= k else source_history


# =============================================================================
# MESSAGE BUILDER
# =============================================================================

def build_messages(
    turn: int,
    substep: int,  # @T.I - 0 means no partial substep in progress
    state: AgentState,
    current_query: str,
    date: str,
    user_expertise: str
) -> List[Dict[str, Any]]:
    """
    Builds the messages array for the LLM API call.

    ACDL: ResearchBot[@T.I]

    Args:
        turn: Current turn number (1-indexed, @T in ACDL)
        substep: Current substep within turn (0 if not mid-substep, @T.I in ACDL)
        state: The agent's state containing history and metadata
        current_query: The user's current query (env.user_query[@T])
        date: Current date (env.date[@1])
        user_expertise: User's expertise level (env.user_expertise[@1])

    Returns:
        List of message dictionaries for the LLM API
    """
    messages = []

    # -------------------------------------------------------------------------
    # S: { SYSTEM_PROMPT, RESEARCH_GUIDELINES, AVAILABLE_TOOLS, ENV_INFO(...) }
    # -------------------------------------------------------------------------
    system_content = (
        SYSTEM_PROMPT.strip() + "\n\n" +
        RESEARCH_GUIDELINES.strip() + "\n\n" +
        AVAILABLE_TOOLS.strip() + "\n\n" +
        ENV_INFO(date, user_expertise).strip()
    )
    messages.append({
        "role": "system",
        "content": system_content
    })

    # -------------------------------------------------------------------------
    # Name C := sys.last_compaction_turn[@T]
    # -------------------------------------------------------------------------
    C = state.last_compaction_turn

    # -------------------------------------------------------------------------
    # If @$C > 1 { U: CONVERSATION_SUMMARY_HEADER, A: sys.conversation_summary[@$C] }
    # -------------------------------------------------------------------------
    if C > 1:
        # U: CONVERSATION_SUMMARY_HEADER
        messages.append({
            "role": "user",
            "content": CONVERSATION_SUMMARY_HEADER.strip()
        })
        # A: sys.conversation_summary[@$C]
        messages.append({
            "role": "assistant",
            "content": state.conversation_summary
        })

    # -------------------------------------------------------------------------
    # ForEach(@t: range(@$C, @T)) { ... }
    # Main conversation loop from compaction point to current turn
    # Note: ACDL is 1-indexed, Python history is 0-indexed
    # -------------------------------------------------------------------------
    for t in range(C, turn):
        # Get the history entry (0-indexed)
        t_idx = t - 1
        if t_idx < 0 or t_idx >= len(state.history):
            continue
        turn_history = state.history[t_idx]

        # ---------------------------------------------------------------------
        # U: { env.user_query[@t], If sys.mode_changed[@t] { MODE_CHANGE_NOTICE(...) } }
        # ---------------------------------------------------------------------
        user_content = turn_history.user_query
        # If sys.mode_changed[@t] { MODE_CHANGE_NOTICE(sys.research_mode[@t]) }
        if turn_history.mode_changed:
            user_content += MODE_CHANGE_NOTICE(turn_history.research_mode)
        messages.append({
            "role": "user",
            "content": user_content
        })

        # ---------------------------------------------------------------------
        # ForEach(@i: range(1, @t.substeps)) { ... }
        # Tool interaction substeps within each turn
        # Note: range(1, @t.substeps) means substeps 1 to substeps-1 (not including last)
        # In Python: range(0, num_substeps - 1) for 0-indexed, but we iterate all completed substeps
        # Actually, for completed turns, we have all substeps done, so iterate all
        # ---------------------------------------------------------------------
        for i, substep_obj in enumerate(turn_history.substeps):
            # -----------------------------------------------------------------
            # A: { resp.reasoning[@t.@i], ForEach(tool: sys.tool_requests[@t.@i]) { tool.name_and_args } }
            # -----------------------------------------------------------------
            assistant_content = substep_obj.reasoning
            # ForEach(tool: sys.tool_requests[@t.@i]) { tool.name_and_args }
            tool_calls_for_api = []
            for tool in substep_obj.tool_requests:
                tool_calls_for_api.append({
                    "id": tool.id,
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "arguments": str(tool.args)  # In practice, this would be JSON
                    }
                })

            assistant_message = {
                "role": "assistant",
                "content": assistant_content
            }
            if tool_calls_for_api:
                assistant_message["tool_calls"] = tool_calls_for_api
            messages.append(assistant_message)

            # -----------------------------------------------------------------
            # ForEach(tool: sys.tool_requests[@t.@i]) { T: { tool.id, tool.response } }
            # Each tool gets its own response message
            # -----------------------------------------------------------------
            for tool in substep_obj.tool_requests:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool.id,
                    "content": tool.response or ""
                })

        # ---------------------------------------------------------------------
        # A: resp.answer[@t]
        # Final assistant response for the turn
        # ---------------------------------------------------------------------
        if turn_history.answer:
            messages.append({
                "role": "assistant",
                "content": turn_history.answer
            })

    # -------------------------------------------------------------------------
    # U: { env.user_query[@T], If sys.research_mode[@T] == "focused" { ... } }
    # Current turn's user input
    # -------------------------------------------------------------------------
    current_user_content = current_query

    # If sys.research_mode[@T] == "focused" { FOCUSED_MODE_REMINDER, ... }
    if state.current_research_mode == "focused":
        current_user_content += "\n" + FOCUSED_MODE_REMINDER.strip()
        # Name relevant := get_relevant_sources(sys.source_history[@T], 3)
        relevant = get_relevant_sources(state.source_history, 3)
        # ForEach(src: $relevant) { SOURCE_CITATION(src.id, src.title) }
        for src in relevant:
            current_user_content += SOURCE_CITATION(
                src.get("id", "unknown"),
                src.get("title", "Untitled")
            )

    messages.append({
        "role": "user",
        "content": current_user_content
    })

    # -------------------------------------------------------------------------
    # If @T.I > 0 { ... }
    # Handle partial current turn (mid-tool-loop)
    # -------------------------------------------------------------------------
    if substep > 0:
        # Get current turn's history if it exists
        current_turn_idx = turn - 1
        if current_turn_idx >= 0 and current_turn_idx < len(state.history):
            current_turn_history = state.history[current_turn_idx]

            # ForEach(@i: range(1, @T.I)) { ... }
            # Iterate through completed substeps of the current turn
            for i in range(0, substep):
                if i >= len(current_turn_history.substeps):
                    break
                substep_obj = current_turn_history.substeps[i]

                # A: { resp.reasoning[@T.@i], ForEach(tool: ...) { tool.name_and_args } }
                assistant_content = substep_obj.reasoning
                tool_calls_for_api = []
                for tool in substep_obj.tool_requests:
                    tool_calls_for_api.append({
                        "id": tool.id,
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "arguments": str(tool.args)
                        }
                    })

                assistant_message = {
                    "role": "assistant",
                    "content": assistant_content
                }
                if tool_calls_for_api:
                    assistant_message["tool_calls"] = tool_calls_for_api
                messages.append(assistant_message)

                # ForEach(tool: sys.tool_requests[@T.@i]) { T: { tool.id, tool.response } }
                for tool in substep_obj.tool_requests:
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool.id,
                        "content": tool.response or ""
                    })

    return messages


# =============================================================================
# USAGE EXAMPLE
# =============================================================================

def main():
    """
    Demonstrates how to use the ResearchBot message builder.
    """
    # Create some sample tool calls
    tool1 = ToolCall(
        id="call_001",
        name="search_papers",
        args={"query": "machine learning transformers", "limit": 5},
        response='{"papers": [{"id": "arxiv:1706.03762", "title": "Attention Is All You Need"}]}'
    )

    tool2 = ToolCall(
        id="call_002",
        name="get_paper_details",
        args={"paper_id": "arxiv:1706.03762"},
        response='{"abstract": "The dominant sequence transduction models...", "authors": ["Vaswani et al."]}'
    )

    # Create substeps
    substep1 = SubStep(
        reasoning="I'll search for papers on transformers in machine learning.",
        tool_requests=[tool1]
    )

    substep2 = SubStep(
        reasoning="Let me get more details on the seminal paper.",
        tool_requests=[tool2]
    )

    # Create turn history
    turn1 = TurnHistory(
        user_query="What are transformers in machine learning?",
        substeps=[substep1, substep2],
        answer="Transformers are a neural network architecture introduced in the paper 'Attention Is All You Need'...",
        mode_changed=False,
        research_mode="exploratory"
    )

    # Create agent state
    state = AgentState(
        history=[turn1],
        last_compaction_turn=1,
        conversation_summary=None,
        source_history=[
            {"id": "arxiv:1706.03762", "title": "Attention Is All You Need"}
        ],
        current_research_mode="exploratory"
    )

    # Build messages for turn 2
    messages = build_messages(
        turn=2,
        substep=0,  # Not mid-substep
        state=state,
        current_query="Can you explain the self-attention mechanism in more detail?",
        date="2024-01-15",
        user_expertise="intermediate"
    )

    # Print the messages
    print("=" * 80)
    print("GENERATED MESSAGES")
    print("=" * 80)
    for i, msg in enumerate(messages):
        print(f"\n--- Message {i + 1} ({msg['role']}) ---")
        if "tool_calls" in msg:
            print(f"Content: {msg['content'][:100]}..." if len(msg.get('content', '')) > 100 else f"Content: {msg.get('content', '')}")
            print(f"Tool calls: {len(msg['tool_calls'])} call(s)")
        elif "tool_call_id" in msg:
            print(f"Tool Call ID: {msg['tool_call_id']}")
            print(f"Response: {msg['content'][:100]}..." if len(msg['content']) > 100 else f"Response: {msg['content']}")
        else:
            content = msg['content']
            print(content[:200] + "..." if len(content) > 200 else content)

    print("\n" + "=" * 80)
    print(f"Total messages: {len(messages)}")
    print("=" * 80)


if __name__ == "__main__":
    main()
