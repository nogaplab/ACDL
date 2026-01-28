"""
Run the Multi-step RAG Agent with OpenAI.

This script demonstrates:
1. Setting up a knowledge base with documents
2. Creating the RAG retriever
3. Running the agent with different configurations
4. Experimenting with history/RAG representations
"""

import os
from typing import List, Dict, Optional

from agent import MultiStepRAGAgent
from PromptBuilder import (
    create_default_builder,
    create_search_only_builder,
    create_summarized_history_builder,
    create_custom_builder,
    history_full,
    history_last_n,
    history_summarized,
    history_searches_only,
    rag_per_search,
    rag_merged_unique,
    rag_latest_only,
    rag_with_source,
)
from Retriever import VectorIndex, AdvancedRetriever, chunk_document
from Embedder import SentenceTransformerEmbedder
from mint_types import Document


def create_openai_llm(model: str = "gpt-3.5-turbo", api_key: Optional[str] = None):
    """
    Create an LLM function using OpenAI API.

    Args:
        model: OpenAI model name (e.g., "gpt-3.5-turbo", "gpt-4")
        api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
    """
    from openai import OpenAI

    client = OpenAI(api_key=api_key or os.environ.get("OPENAI_API_KEY"))

    def llm_fn(messages: List[Dict[str, str]]) -> str:
        # Convert observation role to user role for OpenAI
        converted = []
        for m in messages:
            role = m["role"]
            if role == "observation":
                role = "user"
            converted.append({"role": role, "content": m["content"]})

        response = client.chat.completions.create(
            model=model,
            messages=converted,
            temperature=0.0,
        )
        return response.choices[0].message.content or ""

    return llm_fn


def create_gpt4_feedback_provider(api_key: Optional[str] = None):
    """
    Create a feedback provider using GPT-4 (as used in the MINT paper).
    """
    from openai import OpenAI

    client = OpenAI(api_key=api_key or os.environ.get("OPENAI_API_KEY"))

    def feedback_fn(agent_response: str, state) -> str:
        history_text = "\n".join([
            f"{m.role}: {m.content}" for m in state.history[-6:]
        ])

        prompt = f"""You are an expert tasked with evaluating and providing feedback on an assistant's performance.

The assistant is working on a problem and just provided this response:
{agent_response}

Recent conversation history:
{history_text}

Please provide concise and constructive feedback. Your role is similar to a teacher - guide the assistant toward understanding how to arrive at the correct answer without giving away the solution.

Start your feedback with "This is GOOD." if the approach is correct, or "This is BAD." if there are issues.

Expert feedback:"""

        response = client.chat.completions.create(
            model="gpt-4",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=500,
        )
        return response.choices[0].message.content or ""

    return feedback_fn


def create_retriever(documents: List[Document], k: int = 5) -> AdvancedRetriever:
    """
    Create a RAG retriever with the given documents.

    Args:
        documents: List of Document objects to index
        k: Number of chunks to retrieve per query

    Returns:
        AdvancedRetriever ready to use
    """
    embedder = SentenceTransformerEmbedder()
    index = VectorIndex(embedder)

    for doc in documents:
        chunks = chunk_document(doc, chunk_size=200, overlap=40)
        index.add(chunks)

    return AdvancedRetriever(index, k=k)


def load_documents_from_folder(folder_path: str) -> List[Document]:
    """Load all .txt files from a folder as documents."""
    documents = []
    for filename in os.listdir(folder_path):
        if filename.endswith('.txt'):
            filepath = os.path.join(folder_path, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                text = f.read()
            documents.append(Document(doc_id=filename, text=text))
    return documents


# =============================================================================
# EXAMPLE: Run agent with sample knowledge base
# =============================================================================

def run_example():
    """Run an example with a small knowledge base."""

    # Create sample knowledge base
    documents = [
        Document(
            doc_id="einstein",
            text="Albert Einstein was born on March 14, 1879, in Ulm, Germany. "
                 "He developed the theory of relativity and won the Nobel Prize in Physics in 1921. "
                 "Einstein died on April 18, 1955, at the age of 76 in Princeton, New Jersey."
        ),
        Document(
            doc_id="newton",
            text="Sir Isaac Newton was born on January 4, 1643, in Woolsthorpe, England. "
                 "He formulated the laws of motion and universal gravitation. "
                 "Newton died on March 31, 1727, at the age of 84 in London."
        ),
        Document(
            doc_id="eiffel",
            text="The Eiffel Tower is a wrought-iron lattice tower in Paris, France. "
                 "It was constructed from 1887 to 1889 as the entrance arch for the 1889 World's Fair. "
                 "The tower was completed on March 31, 1889, and stands 330 meters tall."
        ),
        Document(
            doc_id="python",
            text="Python is a high-level programming language created by Guido van Rossum. "
                 "It was first released in 1991. Python emphasizes code readability and simplicity. "
                 "It supports multiple programming paradigms including procedural, object-oriented, and functional."
        ),
    ]

    # Create retriever
    print("Creating retriever and indexing documents...")
    retriever = create_retriever(documents, k=3)

    # Create LLM
    llm_fn = create_openai_llm("gpt-3.5-turbo")

    # Choose a prompt builder configuration:
    # Option 1: Default (full history, search results per query)
    prompt_builder = create_default_builder()

    # Option 2: Search-only (no Python execution)
    # prompt_builder = create_search_only_builder()

    # Option 3: Summarized history (reduces context length)
    # prompt_builder = create_summarized_history_builder()

    # Option 4: Custom configuration
    # prompt_builder = create_custom_builder(
    #     history_strategy=history_last_n(4),  # Only last 4 messages
    #     rag_strategy=rag_merged_unique,      # Merge all results, no duplicates
    #     include_rag_context=True,            # Show accumulated RAG context
    # )

    # Create agent
    agent = MultiStepRAGAgent(
        llm_fn=llm_fn,
        prompt_builder=prompt_builder,
        retriever=retriever,
        max_turns=5,
        max_propose_solution=2,
        enable_python=True,  # Set to False for search-only
        search_k=3,
    )

    # Example task
    task = "Who was older when they died, Einstein or Newton?"

    def check_solution(solution: str) -> bool:
        return "newton" in solution.lower()

    print("=" * 60)
    print(f"Task: {task}")
    print("=" * 60)

    result = agent.run(
        task=task,
        check_solution=check_solution,
        feedback_fn=None,  # Set to create_gpt4_feedback_provider() for feedback
    )

    print(f"\nSuccess: {result['success']}")
    print(f"Turns used: {result['turns_used']}")
    print(f"Solution: {result['solution']}")
    print(f"Searches performed: {len(result['search_history'])}")

    print("\n" + "=" * 60)
    print("Search History:")
    print("=" * 60)
    for i, sr in enumerate(result['search_history']):
        print(f"\n[Search {i+1}] Query: '{sr.query}'")
        print(f"  Results: {len(sr.chunks)} chunks")

    print("\n" + "=" * 60)
    print("Conversation History:")
    print("=" * 60)
    for msg in result['history']:
        print(f"\n[{msg.role.upper()}]")
        content = msg.content[:500] + "..." if len(msg.content) > 500 else msg.content
        print(content)

    return result


# =============================================================================
# EXAMPLE: Different history/RAG representation experiments
# =============================================================================

def run_representation_experiment():
    """
    Run the same task with different history/RAG representations.
    Useful for comparing how different representations affect performance.
    """
    documents = [
        Document(doc_id="fact1", text="The capital of France is Paris."),
        Document(doc_id="fact2", text="Paris has a population of about 2.1 million people."),
        Document(doc_id="fact3", text="The Eiffel Tower is located in Paris and is 330 meters tall."),
    ]

    retriever = create_retriever(documents, k=2)
    llm_fn = create_openai_llm("gpt-3.5-turbo")

    configurations = [
        ("Full History + Per-Search RAG", create_default_builder()),
        ("Summarized History + Merged RAG", create_summarized_history_builder()),
        ("Last-4 History + Latest RAG", create_custom_builder(
            history_strategy=history_last_n(4),
            rag_strategy=rag_latest_only,
        )),
    ]

    task = "What is the height of the Eiffel Tower and in which city is it located?"

    for name, builder in configurations:
        print(f"\n{'=' * 60}")
        print(f"Configuration: {name}")
        print("=" * 60)

        agent = MultiStepRAGAgent(
            llm_fn=llm_fn,
            prompt_builder=builder,
            retriever=retriever,
            max_turns=5,
            max_propose_solution=2,
            enable_python=False,
            search_k=2,
        )

        result = agent.run(task=task)

        print(f"Success: {result['success']}")
        print(f"Turns: {result['turns_used']}")
        print(f"Searches: {len(result['search_history'])}")
        print(f"Solution: {result['solution']}")


if __name__ == "__main__":
    run_example()
    # run_representation_experiment()  # Uncomment to run experiments