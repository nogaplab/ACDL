"""
Test 2: DocBot - Document Q&A Agent with RAG
Implements ACDL spec with list iteration, retrieval functions, and named variables.
"""

from dataclasses import dataclass, field
from typing import List, Optional


# =============================================================================
# Template Constants
# =============================================================================

QA_INSTRUCTIONS = """You are a document Q&A assistant.
Answer questions based on the provided context documents.
Always cite your sources using the document IDs provided."""

CITATION_FORMAT = """When citing sources, use this format: [DocID]
Example: According to the documentation [DOC-001], the feature works by..."""

CONTEXT_HEADER = """=== RELEVANT DOCUMENTS ==="""

QUESTION_HEADER = """=== USER QUESTION ==="""

PREVIOUS_CITATIONS_HEADER = """=== PREVIOUSLY CITED DOCUMENTS ===
The following documents have been referenced earlier in this conversation:"""


# =============================================================================
# Template Functions
# =============================================================================

def DOCUMENT_BLOCK(id: str, title: str, snippet: str) -> str:
    """Template function for formatting a document block."""
    return f"[{id}] {title}\n{snippet}"


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class Document:
    """Represents a retrieved document."""
    id: str
    title: str
    snippet: str


@dataclass
class TurnHistory:
    """Stores a single turn of Q&A history."""
    question: str
    answer: Optional[str] = None
    retrieved_docs: List[Document] = field(default_factory=list)


@dataclass
class AgentState:
    """Stores the complete agent state."""
    history: List[TurnHistory]
    cited_documents: List[Document] = field(default_factory=list)
    cited_doc_count: int = 0


# =============================================================================
# Helper Functions
# =============================================================================

def retrieve_documents(query: str, k: int) -> List[Document]:
    """
    Retrieve relevant documents for a query.

    Args:
        query: The search query
        k: Number of documents to retrieve

    Returns:
        List of relevant documents
    """
    # TODO: Implement retrieval logic (e.g., vector search, BM25, etc.)
    pass


# =============================================================================
# Message Builder
# =============================================================================

def build_messages(turn: int, state: AgentState, current_question: str) -> List[dict]:
    """
    Build the messages array for the LLM API call.

    Args:
        turn: Current turn number (1-indexed)
        state: Agent state containing history and cited documents
        current_question: The current user question

    Returns:
        List of message dictionaries for the LLM API
    """
    messages = []

    # S: { QA_INSTRUCTIONS, CITATION_FORMAT }
    system_content = QA_INSTRUCTIONS + "\n\n" + CITATION_FORMAT
    messages.append({"role": "system", "content": system_content})

    # ForEach(@t: range(1, @T)) - Previous Q&A turns
    for t in range(1, turn):
        turn_data = state.history[t-1]

        # U: { CONTEXT_HEADER, ForEach(doc: sys.retrieved_docs[@t]), QUESTION_HEADER, env.question[@t] }
        user_content = CONTEXT_HEADER + "\n"

        # ForEach(doc: sys.retrieved_docs[@t])
        for doc in turn_data.retrieved_docs:
            user_content += DOCUMENT_BLOCK(doc.id, doc.title, doc.snippet) + "\n\n"

        user_content += QUESTION_HEADER + "\n" + turn_data.question

        messages.append({"role": "user", "content": user_content})

        # A: resp.answer[@t]
        messages.append({"role": "assistant", "content": turn_data.answer})

    # Current turn with fresh retrieval
    # U: { CONTEXT_HEADER, Name docs := retrieve_documents(...), ForEach(doc: $docs), ... }
    user_content = CONTEXT_HEADER + "\n"

    # Name docs := retrieve_documents(env.question[@T], 5)
    docs = retrieve_documents(current_question, 5)

    # ForEach(doc: $docs)
    if docs:
        for doc in docs:
            user_content += DOCUMENT_BLOCK(doc.id, doc.title, doc.snippet) + "\n\n"

    # If sys.cited_doc_count[@T] > 0
    if state.cited_doc_count > 0:
        user_content += PREVIOUS_CITATIONS_HEADER + "\n"
        # ForEach(cite: sys.cited_documents[@T])
        for cite in state.cited_documents:
            user_content += cite.id + "\n"
        user_content += "\n"

    user_content += QUESTION_HEADER + "\n" + current_question

    messages.append({"role": "user", "content": user_content})

    return messages


# =============================================================================
# Usage Example
# =============================================================================

if __name__ == "__main__":
    # Mock the retrieve_documents function for demonstration
    def retrieve_documents(query: str, k: int) -> List[Document]:
        """Mock retrieval function for demo."""
        return [
            Document(
                id="DOC-101",
                title="Python Data Classes",
                snippet="Data classes in Python provide a decorator for automatically generating special methods..."
            ),
            Document(
                id="DOC-102",
                title="Type Hints in Python",
                snippet="Type hints allow developers to indicate expected types for function parameters..."
            ),
        ]

    # Patch the function
    import sys
    current_module = sys.modules[__name__]
    current_module.retrieve_documents = retrieve_documents

    # Create sample state with conversation history
    state = AgentState(
        history=[
            TurnHistory(
                question="What are data classes in Python?",
                answer="Data classes are a feature in Python 3.7+ that automatically generate special methods. [DOC-101]",
                retrieved_docs=[
                    Document(
                        id="DOC-001",
                        title="Data Classes Overview",
                        snippet="Python data classes reduce boilerplate code by auto-generating __init__, __repr__, etc."
                    )
                ]
            ),
        ],
        cited_documents=[
            Document(id="DOC-001", title="Data Classes Overview", snippet="...")
        ],
        cited_doc_count=1
    )

    # Build messages for turn 2
    current_question = "How do I add type hints to data class fields?"
    messages = build_messages(turn=2, state=state, current_question=current_question)

    # Print the messages
    print("Generated Messages:")
    print("=" * 60)
    for i, msg in enumerate(messages):
        print(f"\n[{i}] Role: {msg['role']}")
        print(f"Content:\n{msg['content'][:300]}..." if len(msg['content']) > 300 else f"Content:\n{msg['content']}")

    # Example API call (commented out)
    # from openai import OpenAI
    # client = OpenAI()
    # response = client.chat.completions.create(model="gpt-4", messages=messages)
