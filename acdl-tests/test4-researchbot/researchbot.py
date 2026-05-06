"""
Test 4: ResearchBot - Research Assistant with Memory Compaction
Implements ACDL spec with compaction (@$C dereference), mode switching, and triple nesting.
"""

from dataclasses import dataclass, field
from typing import List, Optional
import json


# =============================================================================
# Template Constants
# =============================================================================

SYSTEM_PROMPT = """You are an advanced research assistant.
Help users explore topics, find information, and synthesize knowledge."""

RESEARCH_GUIDELINES = """Research Guidelines:
- Cite sources when providing information
- Distinguish between facts and speculation
- Acknowledge uncertainty when appropriate
- Build on previous findings in the conversation"""

AVAILABLE_TOOLS = """Available research tools:
- web_search: Search the web for information
- academic_search: Search academic papers
- news_search: Search recent news articles
- fact_check: Verify claims against trusted sources"""

CONVERSATION_SUMMARY_HEADER = """The following is a summary of our earlier conversation:"""

FOCUSED_MODE_REMINDER = """You are in FOCUSED research mode.
Stay on topic and prioritize depth over breadth.
Here are the most relevant sources from our conversation:"""


# =============================================================================
# Template Functions
# =============================================================================

def ENV_INFO(date: str, expertise: str) -> str:
    """Template function for environment information."""
    return f"Date: {date}\nUser Expertise Level: {expertise}"


def MODE_CHANGE_NOTICE(mode: str) -> str:
    """Template function for mode change notification."""
    return f"[Research mode changed to: {mode}]"


def SOURCE_CITATION(id: str, title: str) -> str:
    """Template function for source citation."""
    return f"- [{id}] {title}"


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class Source:
    """Represents a research source."""
    id: str
    title: str
    url: Optional[str] = None


@dataclass
class ToolRequest:
    """Represents a tool request."""
    id: str
    name: str
    arguments: dict
    response: Optional[str] = None

    @property
    def name_and_args(self) -> dict:
        """Return the tool invocation format."""
        return {
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": json.dumps(self.arguments)
            }
        }


@dataclass
class SubStep:
    """Represents a substep with reasoning and tool requests."""
    reasoning: str
    tool_requests: List[ToolRequest] = field(default_factory=list)


@dataclass
class TurnHistory:
    """Stores a single research turn."""
    user_query: str
    substeps: List[SubStep] = field(default_factory=list)
    answer: Optional[str] = None
    research_mode: str = "exploratory"
    mode_changed: bool = False


@dataclass
class AgentState:
    """Stores the complete agent state with compaction support."""
    history: List[TurnHistory]
    date: str = ""
    user_expertise: str = "general"
    last_compaction_turn: int = 1
    conversation_summary: Optional[str] = None
    source_history: List[Source] = field(default_factory=list)
    research_mode: str = "exploratory"


# =============================================================================
# Helper Functions
# =============================================================================

def get_relevant_sources(source_history: List[Source], k: int) -> List[Source]:
    """
    Get the most relevant sources from the source history.

    Args:
        source_history: List of all sources from the conversation
        k: Number of sources to retrieve

    Returns:
        List of the k most relevant sources
    """
    # TODO: Implement relevance ranking (e.g., based on recency, citation count, etc.)
    return source_history[:k] if source_history else []


# =============================================================================
# Message Builder
# =============================================================================

def build_messages(
    turn: int,
    substep: int,
    state: AgentState,
    current_query: str
) -> List[dict]:
    """
    Build the messages array for the LLM API call.

    Args:
        turn: Current turn number (1-indexed)
        substep: Current substep within the turn (0 = no partial progress)
        state: Agent state containing history and compaction info
        current_query: The current user query

    Returns:
        List of message dictionaries for the LLM API
    """
    messages = []

    # S: { SYSTEM_PROMPT, RESEARCH_GUIDELINES, AVAILABLE_TOOLS, ENV_INFO(...) }
    system_content = (
        SYSTEM_PROMPT + "\n\n" +
        RESEARCH_GUIDELINES + "\n\n" +
        AVAILABLE_TOOLS + "\n\n" +
        ENV_INFO(state.date, state.user_expertise)
    )
    messages.append({"role": "system", "content": system_content})

    # Name C := sys.last_compaction_turn[@T]
    C = state.last_compaction_turn

    # If @$C > 1 - Handle conversation compaction
    if C > 1:
        # U: CONVERSATION_SUMMARY_HEADER
        messages.append({"role": "user", "content": CONVERSATION_SUMMARY_HEADER})
        # A: sys.conversation_summary[@$C]
        messages.append({"role": "assistant", "content": state.conversation_summary})

    # ForEach(@t: range(@$C, @T)) - Main conversation loop from compaction point
    for t in range(C, turn):
        turn_history = state.history[t-1]

        # U: { env.user_query[@t], If sys.mode_changed[@t] { MODE_CHANGE_NOTICE(...) } }
        user_content = turn_history.user_query
        if turn_history.mode_changed:
            user_content += "\n" + MODE_CHANGE_NOTICE(turn_history.research_mode)
        messages.append({"role": "user", "content": user_content})

        # ForEach(@i: range(1, @t.substeps)) - Tool interaction substeps
        for i in range(len(turn_history.substeps)):
            substep_data = turn_history.substeps[i]

            # A: { resp.reasoning[@t.@i], ForEach(tool: sys.tool_requests[@t.@i]) { tool.name_and_args } }
            assistant_message = {
                "role": "assistant",
                "content": substep_data.reasoning,
            }

            if substep_data.tool_requests:
                assistant_message["tool_calls"] = [
                    tr.name_and_args for tr in substep_data.tool_requests
                ]

            messages.append(assistant_message)

            # ForEach(tool: sys.tool_requests[@t.@i]) { T: { tool.id, tool.response } }
            for tool in substep_data.tool_requests:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool.id,
                    "content": tool.response
                })

        # A: resp.answer[@t]
        messages.append({"role": "assistant", "content": turn_history.answer})

    # U: { env.user_query[@T], If sys.research_mode[@T] == "focused" {...} }
    user_content = current_query

    # If sys.research_mode[@T] == "focused"
    if state.research_mode == "focused":
        user_content += "\n\n" + FOCUSED_MODE_REMINDER

        # Name relevant := get_relevant_sources(sys.source_history[@T], 3)
        relevant = get_relevant_sources(state.source_history, 3)

        # ForEach(src: $relevant) { SOURCE_CITATION(src.id, src.title) }
        for src in relevant:
            user_content += "\n" + SOURCE_CITATION(src.id, src.title)

    messages.append({"role": "user", "content": user_content})

    # If @T.I > 0 - Partial current turn
    if substep > 0:
        current_turn = state.history[turn-1]

        # ForEach(@i: range(1, @T.I))
        for i in range(substep):
            substep_data = current_turn.substeps[i]

            # A: { resp.reasoning[@T.@i], ForEach(tool: sys.tool_requests[@T.@i]) { tool.name_and_args } }
            assistant_message = {
                "role": "assistant",
                "content": substep_data.reasoning,
            }

            if substep_data.tool_requests:
                assistant_message["tool_calls"] = [
                    tr.name_and_args for tr in substep_data.tool_requests
                ]

            messages.append(assistant_message)

            # ForEach(tool: sys.tool_requests[@T.@i]) { T: { tool.id, tool.response } }
            for tool in substep_data.tool_requests:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool.id,
                    "content": tool.response
                })

    return messages


# =============================================================================
# Usage Example
# =============================================================================

if __name__ == "__main__":
    # Create sample state with compacted history
    state = AgentState(
        history=[
            # Turn 1 (before compaction - summarized)
            TurnHistory(
                user_query="What is quantum computing?",
                answer="Quantum computing uses quantum mechanics principles...",
                research_mode="exploratory"
            ),
            # Turn 2 (before compaction - summarized)
            TurnHistory(
                user_query="How does it differ from classical computing?",
                answer="Unlike classical bits, quantum bits (qubits) can exist in superposition...",
                research_mode="exploratory"
            ),
            # Turn 3 (after compaction - included in full)
            TurnHistory(
                user_query="Let's focus on practical applications.",
                substeps=[
                    SubStep(
                        reasoning="I'll search for current practical applications of quantum computing.",
                        tool_requests=[
                            ToolRequest(
                                id="call_001",
                                name="web_search",
                                arguments={"query": "quantum computing practical applications 2024"},
                                response="Found articles on quantum computing in drug discovery, optimization, and cryptography..."
                            )
                        ]
                    )
                ],
                answer="Quantum computing is being applied in several practical areas: drug discovery, financial optimization, and cryptography.",
                research_mode="focused",
                mode_changed=True
            )
        ],
        date="2024-01-15",
        user_expertise="intermediate",
        last_compaction_turn=3,  # Compaction happened, start from turn 3
        conversation_summary="We discussed the basics of quantum computing and how it differs from classical computing using qubits and superposition.",
        source_history=[
            Source(id="SRC-001", title="Introduction to Quantum Computing"),
            Source(id="SRC-002", title="Quantum vs Classical Computing"),
            Source(id="SRC-003", title="Practical Quantum Applications"),
        ],
        research_mode="focused"
    )

    # Build messages for turn 4 (focused mode, with compaction)
    current_query = "What are the main challenges preventing widespread quantum computing adoption?"
    messages = build_messages(
        turn=4,
        substep=0,
        state=state,
        current_query=current_query
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
        print(f"Content: {content[:200]}..." if len(content) > 200 else f"Content: {content}")

    # Example API call (commented out)
    # from openai import OpenAI
    # client = OpenAI()
    # response = client.chat.completions.create(
    #     model="gpt-4",
    #     messages=messages,
    #     tools=[...tool_definitions...]
    # )
