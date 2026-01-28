"""
MINT-Compatible Agent Adapter.

This module provides an adapter that allows the MultiStepRAGAgent to be evaluated
using MINT's official evaluation harness.

To use with MINT:
1. Copy this file to mint-bench/mint/agents/
2. Add the agent config to mint/configs/config_variables.py
3. Run MINT evaluation as usual

Note: MINT's environment handles <execute> and <solution> parsing/execution.
This adapter only needs to generate the LLM response text.
For <search>, we handle it ourselves since MINT doesn't have a search tool.
"""

import os
import re
from typing import List, Dict, Any, Optional

# MINT imports (available when running inside mint-bench)
try:
    from mint.agents.base import LMAgent
    from mint.datatypes import Action, State
    MINT_AVAILABLE = True
except ImportError:
    MINT_AVAILABLE = False
    # Stub classes for standalone testing
    class LMAgent:
        def __init__(self, config):
            self.config = config
            self.stop_words = ["\nObservation:", "\nTask:"]
        def lm_output_to_action(self, output: str) -> Any:
            use_tool = "<solution>" not in output.lower()
            return type('Action', (), {'value': output, 'use_tool': use_tool, 'error': None})()
    class State:
        history: List[Dict]
        token_counter: Dict[str, int]


class MINTRAGAgent(LMAgent):
    """
    MINT-compatible adapter for Multi-step RAG Agent.

    This agent:
    1. Uses OpenAI to generate responses with <thought>, <search>, <execute>, <solution> tags
    2. Handles <search> internally (MINT doesn't have search tool)
    3. Passes <execute> and <solution> to MINT's environment for execution

    Config options:
        model_name: OpenAI model to use (default: "gpt-3.5-turbo")
        max_tokens: Max tokens for generation (default: 1024)
        temperature: Sampling temperature (default: 0.0)
        enable_search: Whether to enable RAG search (default: True)
        search_k: Number of chunks to retrieve (default: 5)
        documents_path: Path to documents folder for RAG (optional)
        history_strategy: "full" | "last_n" | "summarized" (default: "full")
        rag_strategy: "per_search" | "merged" | "latest" (default: "per_search")
    """

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)

        self.model_name = config.get("model_name", "gpt-3.5-turbo")
        self.max_tokens = config.get("max_tokens", 1024)
        self.temperature = config.get("temperature", 0.0)
        self.enable_search = config.get("enable_search", True)
        self.search_k = config.get("search_k", 5)

        # RAG setup
        self.retriever = None
        self.search_history: List[Dict] = []

        if self.enable_search:
            self._setup_retriever(config)

        # OpenAI client
        self._setup_openai()

        # Add search-related stop words
        self.stop_words = ["\nObservation:", "\nTask:", "\nSearch results"]

    def _setup_openai(self):
        """Initialize OpenAI client."""
        try:
            from openai import OpenAI
            api_key = os.environ.get("OPENAI_API_KEY")
            self.client = OpenAI(api_key=api_key)
        except ImportError:
            raise ImportError("Please install openai: pip install openai")

    def _setup_retriever(self, config: Dict[str, Any]):
        """Setup RAG retriever if documents are provided."""
        documents_path = config.get("documents_path")

        if not documents_path:
            return

        try:
            # Import from MintAgent package
            import sys
            mint_agent_path = config.get("mint_agent_path", ".")
            if mint_agent_path not in sys.path:
                sys.path.insert(0, mint_agent_path)

            from Retriever import VectorIndex, AdvancedRetriever, chunk_document
            from Embedder import SentenceTransformerEmbedder
            from mint_types import Document

            # Load documents
            documents = []
            if os.path.isdir(documents_path):
                for filename in os.listdir(documents_path):
                    if filename.endswith('.txt'):
                        filepath = os.path.join(documents_path, filename)
                        with open(filepath, 'r', encoding='utf-8') as f:
                            text = f.read()
                        documents.append(Document(doc_id=filename, text=text))

            if documents:
                embedder = SentenceTransformerEmbedder()
                index = VectorIndex(embedder)
                for doc in documents:
                    chunks = chunk_document(doc, chunk_size=200, overlap=40)
                    index.add(chunks)
                self.retriever = AdvancedRetriever(index, k=self.search_k)
                print(f"[MINTRAGAgent] Loaded {len(documents)} documents for RAG")
        except Exception as e:
            print(f"[MINTRAGAgent] Warning: Could not setup retriever: {e}")
            self.retriever = None

    def _do_search(self, query: str) -> str:
        """Execute a search query and return formatted results."""
        if not self.retriever:
            return "Search is not available (no documents loaded)."

        try:
            # Get results from retriever
            if hasattr(self.retriever, 'index'):
                raw_results = self.retriever.index.search(query, self.search_k)
                chunks = [chunk for _, chunk in raw_results]
                scores = [score for score, _ in raw_results]
            else:
                chunks = self.retriever.retrieve(query, None)
                scores = [1.0] * len(chunks)

            if not chunks:
                return "No relevant documents found."

            # Store in search history
            self.search_history.append({
                "query": query,
                "chunks": chunks,
                "scores": scores
            })

            # Format results
            lines = [f"Found {len(chunks)} relevant passages:"]
            for i, (chunk, score) in enumerate(zip(chunks, scores)):
                lines.append(f"\n[{i+1}] (score: {score:.3f})")
                lines.append(chunk.text)

            return "\n".join(lines)

        except Exception as e:
            return f"Search error: {e}"

    def _call_llm(self, messages: List[Dict[str, str]]) -> str:
        """Call OpenAI API and return response."""
        # Convert any non-standard roles to user
        converted = []
        for m in messages:
            role = m["role"]
            if role not in ["system", "user", "assistant"]:
                role = "user"
            converted.append({"role": role, "content": m["content"]})

        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=converted,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            stop=self.stop_words,
        )

        return response.choices[0].message.content or ""

    def _handle_search_loop(self, messages: List[Dict[str, str]], max_searches: int = 3) -> str:
        """
        Handle multiple search iterations before returning final response.

        If the LLM outputs <search>, we execute it and continue.
        Once it outputs <execute> or <solution>, we return that response.
        """
        current_messages = messages.copy()

        for _ in range(max_searches):
            response = self._call_llm(current_messages)

            # Check if response contains <search>
            search_match = re.search(r'<search>(.*?)</search>', response, re.DOTALL)

            if search_match:
                query = search_match.group(1).strip()
                search_results = self._do_search(query)

                # Add assistant response and search results to messages
                current_messages.append({"role": "assistant", "content": response})
                current_messages.append({
                    "role": "user",
                    "content": f"Search results for '{query}':\n{search_results}"
                })
            else:
                # No search - return the response (contains <execute> or <solution>)
                return response

        # Max searches reached - force a response
        return response

    def act(self, state: State) -> Action:
        """
        Process MINT state and return an action.

        This method:
        1. Converts MINT state to messages
        2. Handles <search> internally (multiple iterations if needed)
        3. Returns response with <execute> or <solution> for MINT to handle
        """
        try:
            # Get message history from MINT state
            messages = list(state.history) if hasattr(state, 'history') else []

            # Handle search loop and get final response
            if self.enable_search and self.retriever:
                response = self._handle_search_loop(messages)
            else:
                response = self._call_llm(messages)

            # Update token counter if available
            if hasattr(state, 'token_counter'):
                # Approximate token count
                state.token_counter["prompt"] = state.token_counter.get("prompt", 0) + len(str(messages)) // 4
                state.token_counter["completion"] = state.token_counter.get("completion", 0) + len(response) // 4

            # Convert to MINT Action
            return self.lm_output_to_action(response)

        except Exception as e:
            # Return error action
            error_msg = f"Agent error: {str(e)}"
            return Action(value=error_msg, use_tool=False, error=error_msg)

    def reset(self):
        """Reset agent state between tasks."""
        self.search_history = []


# For standalone testing without MINT
def test_adapter():
    """Test the adapter without MINT framework."""
    print("Testing MINTRAGAgent adapter...")

    config = {
        "model_name": "gpt-3.5-turbo",
        "max_tokens": 512,
        "temperature": 0.0,
        "enable_search": False,  # No RAG for basic test
    }

    agent = MINTRAGAgent(config)

    # Create a mock state
    class MockState:
        history = [
            {"role": "system", "content": "You are a helpful assistant. Use <solution> tags for answers."},
            {"role": "user", "content": "What is 2 + 2? Answer with <solution> tags."}
        ]
        token_counter = {}

    state = MockState()
    action = agent.act(state)

    print(f"Response: {action.value}")
    print(f"Use tool: {action.use_tool}")
    print(f"Error: {action.error}")


if __name__ == "__main__":
    test_adapter()
