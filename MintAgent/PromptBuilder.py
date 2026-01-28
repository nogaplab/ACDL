"""
PromptBuilder for MINT-compatible Agent.

This module handles prompt construction with configurable representations for:
- History: How past interactions are shown to the LLM

Designed for easy experimentation with different prompt strategies.
"""

from mint_types import Message, AgentState
from typing import List, Dict, Any, Optional, Callable


# =============================================================================
# SYSTEM PROMPT TEMPLATES
# =============================================================================

DEFAULT_SYSTEM_PROMPT = (
    'You are a helpful assistant that solves tasks using Python code.\n\n'
    'At each turn, you should first provide your step-by-step thinking for solving the task. '
    'Your thought process should be enclosed using "<thought>" tag, for example: '
    '<thought> I need to calculate X </thought>.\n\n'
    'After that, you have two options:\n\n'
    '1) Execute Python code for calculations or data processing. '
    'Your code should be enclosed using "<execute>" tag, for example: '
    '<execute> print(2 + 2) </execute>.\n'
    '2) Directly provide a solution based on the information you have gathered. '
    'Your solution should be enclosed using "<solution>" tag, for example: '
    'The answer is <solution> your answer </solution>.\n\n'
    'You have {max_turns} chances to interact with the environment or propose a solution. '
    'You can only propose a solution {max_propose_solution} times.\n\n'
    'Strategy: Break down the problem, use Python to compute, then provide your answer.'
)

TOOL_DESCRIPTION = (
    'Tool available:\n'
    '- Python: Execute Python code for calculations'
)


# =============================================================================
# IN-CONTEXT EXAMPLES
# =============================================================================

IN_CONTEXT_EXAMPLE_MATH = (
    '---\n'
    'Here is an example:\n\n'
    'Task: What is the sum of the first 10 prime numbers?\n\n'
    'Assistant:\n'
    '<thought> I need to find the first 10 prime numbers and sum them. Let me write Python code to do this. </thought>\n'
    '<execute>\n'
    'def is_prime(n):\n'
    '    if n < 2:\n'
    '        return False\n'
    '    for i in range(2, int(n**0.5) + 1):\n'
    '        if n % i == 0:\n'
    '            return False\n'
    '    return True\n'
    '\n'
    'primes = []\n'
    'num = 2\n'
    'while len(primes) < 10:\n'
    '    if is_prime(num):\n'
    '        primes.append(num)\n'
    '    num += 1\n'
    'print(f"First 10 primes: {primes}")\n'
    'print(f"Sum: {sum(primes)}")\n'
    '</execute>\n\n'
    'Observation:\n'
    'First 10 primes: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]\n'
    'Sum: 129\n'
    'You have 4 steps left and 2 chances to propose solution left.\n\n'
    'Assistant:\n'
    '<thought> I found that the first 10 primes are [2, 3, 5, 7, 11, 13, 17, 19, 23, 29] and their sum is 129. </thought>\n'
    'The answer is <solution> 129 </solution>.\n'
    '---'
)

IN_CONTEXT_EXAMPLE_SIMPLE = (
    '---\n'
    'Here is an example:\n\n'
    'Task: What is 15 factorial?\n\n'
    'Assistant:\n'
    '<thought> I need to calculate 15!. Let me use Python. </thought>\n'
    '<execute>\n'
    'import math\n'
    'result = math.factorial(15)\n'
    'print(result)\n'
    '</execute>\n\n'
    'Observation:\n'
    '1307674368000\n'
    'You have 4 steps left and 2 chances to propose solution left.\n\n'
    'Assistant:\n'
    '<thought> 15 factorial is 1307674368000. </thought>\n'
    'The answer is <solution> 1307674368000 </solution>.\n'
    '---'
)


# =============================================================================
# HISTORY REPRESENTATION STRATEGIES
# =============================================================================

def history_full(state: AgentState) -> List[Message]:
    """Include full conversation history as-is."""
    return state.history.copy()


def history_last_n(n: int) -> Callable[[AgentState], List[Message]]:
    """Include only the last N messages."""
    def _history(state: AgentState) -> List[Message]:
        return state.history[-n:] if len(state.history) > n else state.history.copy()
    return _history


def history_summarized(state: AgentState) -> List[Message]:
    """Summarize history into key findings."""
    if not state.history:
        return []

    summary_parts = []

    # Summarize tool results
    if state.tool_results:
        summary_parts.append("Previous computations:")
        for tr in state.tool_results[-3:]:  # Last 3 tool results
            summary_parts.append(f"- Code executed, output: {tr.output[:100]}...")

    # Include only the last assistant message and observation
    if len(state.history) >= 2:
        summary_parts.append("\nLast interaction:")
        for msg in state.history[-2:]:
            summary_parts.append(f"[{msg.role}]: {msg.content[:200]}...")

    if summary_parts:
        return [Message(role="user", content="\n".join(summary_parts))]
    return []


# =============================================================================
# PROMPT BUILDER CLASS
# =============================================================================

class PromptBuilder:
    """
    Builds prompts for MINT-compatible agents.

    Configuration options:
    - include_system: Include system prompt (default: True)
    - include_tool_desc: Include tool descriptions (default: True)
    - include_example: Include in-context example (default: True)
    - include_history: Include conversation history (default: True)
    - system_prompt: Custom system prompt template
    - tool_description: Custom tool description
    - in_context_example: Custom in-context example
    - history_strategy: Function to transform history (default: history_full)
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}

        # Templates
        self.system_prompt = self.config.get('system_prompt', DEFAULT_SYSTEM_PROMPT)
        self.tool_description = self.config.get('tool_description', TOOL_DESCRIPTION)
        self.in_context_example = self.config.get('in_context_example', IN_CONTEXT_EXAMPLE_MATH)

        # Representation strategies
        self.history_strategy: Callable[[AgentState], List[Message]] = self.config.get(
            'history_strategy', history_full
        )

    def build(
        self,
        state: AgentState,
        task: str,
        steps_left: Optional[int] = None,
        proposals_left: Optional[int] = None
    ) -> List[Message]:
        """
        Build the prompt messages for the LLM.

        Args:
            state: Current agent state with history
            task: The task description
            steps_left: Number of steps remaining
            proposals_left: Number of solution proposals remaining

        Returns:
            List of Message objects for the LLM
        """
        messages: List[Message] = []

        # Calculate defaults if not provided
        if steps_left is None:
            steps_left = state.max_turns - state.turn + 1
        if proposals_left is None:
            proposals_left = state.max_propose_solution - state.propose_solution_count

        # SYSTEM PROMPT
        if self.config.get('include_system', True):
            system_content = self.system_prompt.format(
                max_turns=state.max_turns,
                max_propose_solution=state.max_propose_solution
            )

            # Add tool description
            if self.config.get('include_tool_desc', True):
                system_content += '\n\n' + self.tool_description

            messages.append(Message(role='system', content=system_content))

        # IN-CONTEXT EXAMPLE (only on first turn)
        if self.config.get('include_example', True) and state.turn == 1:
            messages.append(Message(role='user', content=self.in_context_example))

        # TASK (only on first turn)
        if state.turn == 1:
            messages.append(Message(
                role='user',
                content=f'Task:\n{task}'
            ))

        # CONVERSATION HISTORY (using configured strategy)
        if self.config.get('include_history', True):
            history_messages = self.history_strategy(state)
            messages.extend(history_messages)

        return messages


# =============================================================================
# FACTORY FUNCTIONS FOR COMMON CONFIGURATIONS
# =============================================================================

def create_default_builder() -> PromptBuilder:
    """Create a PromptBuilder with default MINT settings."""
    return PromptBuilder({
        'include_system': True,
        'include_tool_desc': True,
        'include_example': True,
        'include_history': True,
        'history_strategy': history_full,
    })


def create_minimal_builder() -> PromptBuilder:
    """Create a minimal PromptBuilder without examples."""
    return PromptBuilder({
        'include_system': True,
        'include_tool_desc': True,
        'include_example': False,
        'include_history': True,
        'history_strategy': history_full,
    })


def create_summarized_history_builder() -> PromptBuilder:
    """Create a builder that summarizes history instead of full replay."""
    return PromptBuilder({
        'include_system': True,
        'include_tool_desc': True,
        'include_example': True,
        'include_history': True,
        'history_strategy': history_summarized,
    })


def create_custom_builder(
    system_prompt: Optional[str] = None,
    tool_description: Optional[str] = None,
    in_context_example: Optional[str] = None,
    history_strategy: Optional[Callable[[AgentState], List[Message]]] = None,
    **kwargs: Any
) -> PromptBuilder:
    """
    Create a PromptBuilder with custom configuration.

    Args:
        system_prompt: Custom system prompt (use {max_turns} and {max_propose_solution})
        tool_description: Custom tool description
        in_context_example: Custom in-context example
        history_strategy: Function to transform history (e.g., history_full, history_last_n(5))
        **kwargs: Additional config options (include_system, include_example, etc.)
    """
    config: Dict[str, Any] = {
        'include_system': True,
        'include_tool_desc': True,
        'include_example': True,
        'include_history': True,
    }
    config.update(kwargs)

    if system_prompt:
        config['system_prompt'] = system_prompt
    if tool_description:
        config['tool_description'] = tool_description
    if in_context_example:
        config['in_context_example'] = in_context_example
    if history_strategy:
        config['history_strategy'] = history_strategy

    return PromptBuilder(config)
