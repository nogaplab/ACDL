"""
PromptBuilder for Multi-step RAG Agent (MINT-compatible).

This module handles prompt construction with configurable representations for:
- History: How past interactions are shown to the LLM
- RAG: How retrieved documents/chunks are presented

Designed for easy experimentation with different prompt strategies.
"""

from mint_types import Message, AgentState, SearchResult
from typing import List, Dict, Any, Optional, Callable


# =============================================================================
# SYSTEM PROMPT TEMPLATES
# =============================================================================

DEFAULT_SYSTEM_PROMPT = (
    'You are a helpful assistant that answers questions by searching a knowledge base.\n\n'
    'At each turn, you should first provide your step-by-step thinking for solving the task. '
    'Your thought process should be enclosed using "<thought>" tag, for example: '
    '<thought> I need to find information about X </thought>.\n\n'
    'After that, you have three options:\n\n'
    '1) Search the knowledge base to find relevant information. '
    'Your search query should be enclosed using "<search>" tag, for example: '
    '<search> your search query here </search>.\n'
    '2) Execute Python code for calculations or data processing. '
    'Your code should be enclosed using "<execute>" tag, for example: '
    '<execute> print(2 + 2) </execute>.\n'
    '3) Directly provide a solution based on the information you have gathered. '
    'Your solution should be enclosed using "<solution>" tag, for example: '
    'The answer is <solution> your answer </solution>.\n\n'
    'You have {max_turns} chances to interact with the environment or propose a solution. '
    'You can only propose a solution {max_propose_solution} times.\n\n'
    'Strategy: Search for relevant information first, then analyze the results to form your answer.'
)

SEARCH_ONLY_SYSTEM_PROMPT = (
    'You are a helpful assistant that answers questions by searching a knowledge base.\n\n'
    'At each turn, you should first provide your step-by-step thinking. '
    'Your thought process should be enclosed using "<thought>" tag.\n\n'
    'You have two options:\n\n'
    '1) Search the knowledge base: <search> your query </search>\n'
    '2) Provide your answer: <solution> your answer </solution>\n\n'
    'You have {max_turns} chances to search or propose a solution. '
    'You can only propose a solution {max_propose_solution} times.\n\n'
    'Search for relevant information before answering.'
)

TOOL_DESCRIPTION = (
    'Tools available:\n'
    '- Search: Query the knowledge base to find relevant passages\n'
    '- Python: Execute Python code for calculations'
)

SEARCH_ONLY_TOOL_DESCRIPTION = (
    'Tool available:\n'
    '- Search: Query the knowledge base to find relevant passages'
)


# =============================================================================
# IN-CONTEXT EXAMPLES
# =============================================================================

IN_CONTEXT_EXAMPLE_SEARCH = (
    '---\n'
    'Here is an example:\n\n'
    'Task: What year was the Eiffel Tower completed?\n\n'
    'Assistant:\n'
    '<thought> I need to search for information about the Eiffel Tower construction. </thought>\n'
    '<search> Eiffel Tower construction completion date </search>\n\n'
    'Search results for \'Eiffel Tower construction completion date\':\n'
    'Found 2 relevant passages:\n'
    '[1] (score: 0.85)\n'
    'The Eiffel Tower was constructed from 1887 to 1889 as the entrance arch for the 1889 World\'s Fair. '
    'It was completed on March 31, 1889.\n'
    '[2] (score: 0.72)\n'
    'Gustave Eiffel\'s company built the tower in just over two years.\n'
    'You have 4 steps left and 2 chances to propose solution left.\n\n'
    'Assistant:\n'
    '<thought> I found that the Eiffel Tower was completed on March 31, 1889. </thought>\n'
    'The answer is <solution> 1889 </solution>.\n'
    '---'
)

IN_CONTEXT_EXAMPLE_MULTI_SEARCH = (
    '---\n'
    'Here is an example with multiple searches:\n\n'
    'Task: Who was older when they died, Einstein or Newton?\n\n'
    'Assistant:\n'
    '<thought> I need to find the ages at death for both Einstein and Newton. Let me search for Einstein first. </thought>\n'
    '<search> Albert Einstein age at death </search>\n\n'
    'Search results for \'Albert Einstein age at death\':\n'
    'Found 1 relevant passage:\n'
    '[1] (score: 0.88)\n'
    'Albert Einstein died on April 18, 1955, at the age of 76.\n'
    'You have 4 steps left and 2 chances to propose solution left.\n\n'
    'Assistant:\n'
    '<thought> Einstein was 76 when he died. Now I need to find Newton\'s age at death. </thought>\n'
    '<search> Isaac Newton age at death </search>\n\n'
    'Search results for \'Isaac Newton age at death\':\n'
    'Found 1 relevant passage:\n'
    '[1] (score: 0.91)\n'
    'Sir Isaac Newton died on March 31, 1727, at the age of 84.\n'
    'You have 3 steps left and 2 chances to propose solution left.\n\n'
    'Assistant:\n'
    '<thought> Einstein was 76 and Newton was 84. Newton was older when he died. </thought>\n'
    'The answer is <solution> Newton </solution>.\n'
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
    """Summarize history into searches performed and key findings."""
    if not state.history:
        return []

    summary_parts = []

    # Summarize searches
    if state.search_history:
        summary_parts.append("Previous searches:")
        for sr in state.search_history:
            summary_parts.append(f"- Query: '{sr.query}' → {len(sr.chunks)} results")

    # Include only the last assistant message and observation
    if len(state.history) >= 2:
        summary_parts.append("\nLast interaction:")
        for msg in state.history[-2:]:
            summary_parts.append(f"[{msg.role}]: {msg.content[:200]}...")

    if summary_parts:
        return [Message(role="user", content="\n".join(summary_parts))]
    return []


def history_searches_only(state: AgentState) -> List[Message]:
    """Include only search queries and results, not full history."""
    if not state.search_history:
        return []

    parts = ["Previous searches:"]
    for sr in state.search_history:
        parts.append(f"\nQuery: '{sr.query}'")
        for i, chunk in enumerate(sr.chunks[:3]):  # Top 3 per search
            parts.append(f"  [{i+1}] {chunk.text[:150]}...")

    return [Message(role="user", content="\n".join(parts))]


# =============================================================================
# RAG REPRESENTATION STRATEGIES
# =============================================================================

def rag_per_search(search_history: List[SearchResult]) -> str:
    """Show results grouped by search query."""
    if not search_history:
        return ""

    parts = []
    for sr in search_history:
        parts.append(f"\n=== Search: '{sr.query}' ===")
        for i, (chunk, score) in enumerate(zip(sr.chunks, sr.scores)):
            parts.append(f"[{i+1}] (score: {score:.3f}) {chunk.text}")

    return "\n".join(parts)


def rag_merged_unique(search_history: List[SearchResult]) -> str:
    """Merge all unique chunks across searches, no duplicates."""
    if not search_history:
        return ""

    seen = set()
    unique_chunks: List[tuple] = []

    for sr in search_history:
        for chunk, score in zip(sr.chunks, sr.scores):
            if chunk.chunk_id not in seen:
                seen.add(chunk.chunk_id)
                unique_chunks.append((chunk, score))

    # Sort by score
    unique_chunks.sort(key=lambda x: x[1], reverse=True)

    parts = ["All retrieved information:"]
    for i, (chunk, score) in enumerate(unique_chunks):
        parts.append(f"[{i+1}] (score: {score:.3f}) {chunk.text}")

    return "\n".join(parts)


def rag_latest_only(search_history: List[SearchResult]) -> str:
    """Show only the most recent search results."""
    if not search_history:
        return ""

    sr = search_history[-1]
    parts = [f"Results for '{sr.query}':"]
    for i, (chunk, score) in enumerate(zip(sr.chunks, sr.scores)):
        parts.append(f"[{i+1}] (score: {score:.3f}) {chunk.text}")

    return "\n".join(parts)


def rag_with_source(search_history: List[SearchResult]) -> str:
    """Show results with document source IDs."""
    if not search_history:
        return ""

    parts = []
    for sr in search_history:
        parts.append(f"\n=== Search: '{sr.query}' ===")
        for i, (chunk, score) in enumerate(zip(sr.chunks, sr.scores)):
            parts.append(f"[{i+1}] [doc:{chunk.doc_id}] (score: {score:.3f})")
            parts.append(f"    {chunk.text}")

    return "\n".join(parts)


# =============================================================================
# PROMPT BUILDER CLASS
# =============================================================================

class PromptBuilder:
    """
    Builds prompts for Multi-step RAG agents.

    Configuration options:
    - include_system: Include system prompt (default: True)
    - include_tool_desc: Include tool descriptions (default: True)
    - include_example: Include in-context example (default: True)
    - include_history: Include conversation history (default: True)
    - include_rag_context: Include accumulated RAG context (default: False)
    - system_prompt: Custom system prompt template
    - tool_description: Custom tool description
    - in_context_example: Custom in-context example
    - history_strategy: Function to transform history (default: history_full)
    - rag_strategy: Function to format RAG results (default: rag_per_search)
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}

        # Templates
        self.system_prompt = self.config.get('system_prompt', DEFAULT_SYSTEM_PROMPT)
        self.tool_description = self.config.get('tool_description', TOOL_DESCRIPTION)
        self.in_context_example = self.config.get('in_context_example', IN_CONTEXT_EXAMPLE_SEARCH)

        # Representation strategies
        self.history_strategy: Callable[[AgentState], List[Message]] = self.config.get(
            'history_strategy', history_full
        )
        self.rag_strategy: Callable[[List[SearchResult]], str] = self.config.get(
            'rag_strategy', rag_per_search
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
            state: Current agent state with history and search results
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

        # ACCUMULATED RAG CONTEXT (optional - shows all retrieved info so far)
        if self.config.get('include_rag_context', False) and state.search_history:
            rag_text = self.rag_strategy(state.search_history)
            if rag_text:
                messages.append(Message(
                    role='user',
                    content=f'Retrieved information:\n{rag_text}'
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
    """Create a PromptBuilder with default multi-step RAG settings."""
    return PromptBuilder({
        'include_system': True,
        'include_tool_desc': True,
        'include_example': True,
        'include_history': True,
        'include_rag_context': False,
        'history_strategy': history_full,
        'rag_strategy': rag_per_search,
    })


def create_search_only_builder() -> PromptBuilder:
    """Create a PromptBuilder for search-only (no Python) agent."""
    return PromptBuilder({
        'include_system': True,
        'include_tool_desc': True,
        'include_example': True,
        'include_history': True,
        'include_rag_context': False,
        'system_prompt': SEARCH_ONLY_SYSTEM_PROMPT,
        'tool_description': SEARCH_ONLY_TOOL_DESCRIPTION,
        'in_context_example': IN_CONTEXT_EXAMPLE_SEARCH,
        'history_strategy': history_full,
        'rag_strategy': rag_per_search,
    })


def create_minimal_builder() -> PromptBuilder:
    """Create a minimal PromptBuilder without examples."""
    return PromptBuilder({
        'include_system': True,
        'include_tool_desc': True,
        'include_example': False,
        'include_history': True,
        'include_rag_context': False,
        'history_strategy': history_full,
    })


def create_summarized_history_builder() -> PromptBuilder:
    """Create a builder that summarizes history instead of full replay."""
    return PromptBuilder({
        'include_system': True,
        'include_tool_desc': True,
        'include_example': True,
        'include_history': True,
        'include_rag_context': True,
        'history_strategy': history_summarized,
        'rag_strategy': rag_merged_unique,
    })


def create_custom_builder(
    system_prompt: Optional[str] = None,
    tool_description: Optional[str] = None,
    in_context_example: Optional[str] = None,
    history_strategy: Optional[Callable[[AgentState], List[Message]]] = None,
    rag_strategy: Optional[Callable[[List[SearchResult]], str]] = None,
    **kwargs
) -> PromptBuilder:
    """
    Create a PromptBuilder with custom configuration.

    Args:
        system_prompt: Custom system prompt (use {max_turns} and {max_propose_solution})
        tool_description: Custom tool description
        in_context_example: Custom in-context example
        history_strategy: Function to transform history (e.g., history_full, history_last_n(5))
        rag_strategy: Function to format RAG results (e.g., rag_per_search, rag_merged_unique)
        **kwargs: Additional config options (include_system, include_example, etc.)
    """
    config: Dict[str, Any] = {
        'include_system': True,
        'include_tool_desc': True,
        'include_example': True,
        'include_history': True,
        'include_rag_context': False,
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
    if rag_strategy:
        config['rag_strategy'] = rag_strategy

    return PromptBuilder(config)
