"""
Test 5: OrchestratorBot - Multi-Agent Orchestrator (Expert Bonus)
Implements ACDL spec with multi-agent coordination, Switch/Case, and parameterized agents.
"""

from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum


# =============================================================================
# Template Constants
# =============================================================================

# Orchestrator constants
ORCHESTRATOR_ROLE = """You are an orchestrator agent.
Your job is to analyze incoming tasks and route them to the appropriate specialist.
Respond with the specialist name: "analyst", "writer", or "general"."""

SPECIALIST_DESCRIPTIONS = """Available specialists:
- analyst: For data analysis, statistics, and quantitative tasks
- writer: For content creation, copywriting, and creative writing
- general: For general questions and tasks that don't fit other categories"""

# Specialist constants
SPECIALIST_BASE_ROLE = """You are a specialized assistant."""


# =============================================================================
# Template Functions
# =============================================================================

def SPECIALIST_ROLE(specialty: str) -> str:
    """Template function for specialist role definition."""
    roles = {
        "data analysis": "You are a data analysis expert. Focus on statistical analysis, data interpretation, and quantitative insights.",
        "content writing": "You are a professional content writer. Focus on clarity, engagement, and appropriate tone.",
        "general assistance": "You are a helpful general assistant. Provide clear, accurate, and helpful responses."
    }
    return roles.get(specialty, SPECIALIST_BASE_ROLE)


# =============================================================================
# Data Classes
# =============================================================================

class SpecialistType(Enum):
    """Enum for specialist types."""
    ANALYST = "analyst"
    WRITER = "writer"
    GENERAL = "general"


@dataclass
class TurnHistory:
    """Stores a single turn of specialist interaction."""
    subtask: str
    result: Optional[str] = None


@dataclass
class OrchestratorState:
    """State for the orchestrator agent."""
    task: str
    chosen_specialist: Optional[str] = None


@dataclass
class SpecialistState:
    """State for specialist agents."""
    history: List[TurnHistory]
    context: str = ""
    specialty: str = "general assistance"


@dataclass
class WorkflowState:
    """Combined state for the full workflow."""
    # Orchestrator state
    task: str
    chosen_specialist: Optional[str] = None

    # Specialist state
    specialist_history: List[TurnHistory] = field(default_factory=list)

    # Context for each specialist type
    analysis_context: str = ""
    writing_context: str = ""
    general_context: str = ""


# =============================================================================
# Agent Message Builders
# =============================================================================

def build_orchestrator_messages(task: str) -> List[dict]:
    """
    Build messages for the Orchestrator agent.
    Implements: Orchestrator[@T]: { S: { ORCHESTRATOR_ROLE, SPECIALIST_DESCRIPTIONS }, U: env.task[@T] }

    Args:
        task: The task to route

    Returns:
        List of message dictionaries for the orchestrator
    """
    messages = []

    # S: { ORCHESTRATOR_ROLE, SPECIALIST_DESCRIPTIONS }
    system_content = ORCHESTRATOR_ROLE + "\n\n" + SPECIALIST_DESCRIPTIONS
    messages.append({"role": "system", "content": system_content})

    # U: env.task[@T]
    messages.append({"role": "user", "content": task})

    return messages


def build_specialist_messages(
    turn: int,
    state: SpecialistState,
    current_subtask: str,
    context: str,
    specialty: str
) -> List[dict]:
    """
    Build messages for a Specialist agent.
    Implements: Specialist[@T](context, specialty): { S: { SPECIALIST_ROLE(specialty), context }, ForEach... }

    Args:
        turn: Current turn number (1-indexed)
        state: Specialist state containing history
        current_subtask: The current subtask
        context: Context passed from orchestrator
        specialty: The specialty type

    Returns:
        List of message dictionaries for the specialist
    """
    messages = []

    # S: { SPECIALIST_ROLE(specialty), context }
    system_content = SPECIALIST_ROLE(specialty)
    if context:
        system_content += "\n\n" + context
    messages.append({"role": "system", "content": system_content})

    # ForEach(@t: range(1, @T))
    for t in range(1, turn):
        # U: env.subtask[@t]
        messages.append({"role": "user", "content": state.history[t-1].subtask})
        # A: resp.result[@t]
        messages.append({"role": "assistant", "content": state.history[t-1].result})

    # U: env.subtask[@T]
    messages.append({"role": "user", "content": current_subtask})

    return messages


def build_workflow_messages(
    turn: int,
    substep: int,
    state: WorkflowState,
    current_subtask: str
) -> List[dict]:
    """
    Build messages for the full Workflow.
    Implements: Workflow[@T.I]: { Orchestrator[@1], Switch resp.chosen_specialist[@1] {...} }

    This function represents the composed workflow that:
    1. First calls the orchestrator to decide which specialist to use
    2. Then calls the appropriate specialist based on the orchestrator's decision

    Args:
        turn: Current turn number for the specialist (1-indexed)
        substep: Current substep (for tool use within specialist)
        state: Combined workflow state
        current_subtask: The current subtask for the specialist

    Returns:
        List of message dictionaries for the appropriate agent
    """
    # If we don't have a chosen specialist yet, build orchestrator messages
    if state.chosen_specialist is None:
        # Orchestrator[@1]
        return build_orchestrator_messages(state.task)

    # Switch resp.chosen_specialist[@1]
    specialist_state = SpecialistState(
        history=state.specialist_history
    )

    if state.chosen_specialist == "analyst":
        # Case "analyst": { Specialist[@T.I](sys.analysis_context[@1], "data analysis") }
        return build_specialist_messages(
            turn=turn,
            state=specialist_state,
            current_subtask=current_subtask,
            context=state.analysis_context,
            specialty="data analysis"
        )

    elif state.chosen_specialist == "writer":
        # Case "writer": { Specialist[@T.I](sys.writing_context[@1], "content writing") }
        return build_specialist_messages(
            turn=turn,
            state=specialist_state,
            current_subtask=current_subtask,
            context=state.writing_context,
            specialty="content writing"
        )

    else:
        # Default: { Specialist[@T.I](sys.general_context[@1], "general assistance") }
        return build_specialist_messages(
            turn=turn,
            state=specialist_state,
            current_subtask=current_subtask,
            context=state.general_context,
            specialty="general assistance"
        )


# =============================================================================
# Usage Example
# =============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("ORCHESTRATOR EXAMPLE")
    print("=" * 60)

    # Step 1: Build orchestrator messages to decide which specialist
    task = "I need help analyzing sales data from Q4 to identify trends."
    orchestrator_messages = build_orchestrator_messages(task)

    print("\n1. Orchestrator Messages:")
    for i, msg in enumerate(orchestrator_messages):
        print(f"\n[{i}] Role: {msg['role']}")
        content = msg['content']
        print(f"Content: {content[:150]}..." if len(content) > 150 else f"Content: {content}")

    # Simulated orchestrator response (would come from LLM)
    chosen_specialist = "analyst"

    print("\n" + "=" * 60)
    print("SPECIALIST EXAMPLE (after orchestrator decided: analyst)")
    print("=" * 60)

    # Step 2: Build specialist messages based on orchestrator's choice
    workflow_state = WorkflowState(
        task=task,
        chosen_specialist=chosen_specialist,
        specialist_history=[
            TurnHistory(
                subtask="Please summarize the overall sales trends.",
                result="Q4 sales show a 15% increase YoY with strongest growth in electronics category."
            )
        ],
        analysis_context="Focus on quarterly comparisons and category-level insights.",
        writing_context="Write in a professional business tone.",
        general_context="Be helpful and concise."
    )

    current_subtask = "What were the top 3 performing products?"
    specialist_messages = build_workflow_messages(
        turn=2,
        substep=0,
        state=workflow_state,
        current_subtask=current_subtask
    )

    print("\n2. Specialist Messages (Data Analyst):")
    for i, msg in enumerate(specialist_messages):
        print(f"\n[{i}] Role: {msg['role']}")
        content = msg['content']
        print(f"Content: {content[:150]}..." if len(content) > 150 else f"Content: {content}")

    print("\n" + "=" * 60)
    print("FULL WORKFLOW EXAMPLE")
    print("=" * 60)

    # Example of the full workflow
    print("\n3. Full Workflow Demonstration:")
    print("\n   Phase 1: Orchestrator decides specialist")
    print(f"   Task: '{task}'")
    print(f"   Decision: Route to '{chosen_specialist}' specialist")
    print("\n   Phase 2: Specialist handles the task")
    print(f"   Specialist: {chosen_specialist} (data analysis)")
    print(f"   Context: {workflow_state.analysis_context}")
    print(f"   Current subtask: {current_subtask}")

    # Example API call flow (commented out)
    # from openai import OpenAI
    # client = OpenAI()
    #
    # # Phase 1: Call orchestrator
    # orchestrator_response = client.chat.completions.create(
    #     model="gpt-4",
    #     messages=orchestrator_messages
    # )
    # chosen_specialist = orchestrator_response.choices[0].message.content.strip()
    #
    # # Phase 2: Call appropriate specialist
    # state.chosen_specialist = chosen_specialist
    # specialist_messages = build_workflow_messages(turn=1, substep=0, state=state, current_subtask="...")
    # specialist_response = client.chat.completions.create(
    #     model="gpt-4",
    #     messages=specialist_messages
    # )
