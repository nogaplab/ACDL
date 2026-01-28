"""
Run the MINT-compatible Agent with OpenAI.

This script demonstrates:
1. Creating the agent with different configurations
2. Running the agent on math/reasoning tasks
3. Experimenting with history representations
"""

import os
from typing import List, Dict, Optional

from agent import MINTAgent
from PromptBuilder import (
    create_default_builder,
    create_minimal_builder,
    create_summarized_history_builder,
    create_custom_builder,
    history_last_n,
    IN_CONTEXT_EXAMPLE_SIMPLE,
)


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


# =============================================================================
# EXAMPLE: Run agent on math task
# =============================================================================

def run_example():
    """Run an example math task."""

    # Create LLM
    llm_fn = create_openai_llm("gpt-3.5-turbo")

    # Choose a prompt builder configuration:
    # Option 1: Default (full history)
    prompt_builder = create_default_builder()

    # Option 2: Minimal (no in-context example)
    # prompt_builder = create_minimal_builder()

    # Option 3: Summarized history (reduces context length)
    # prompt_builder = create_summarized_history_builder()

    # Option 4: Custom configuration
    # prompt_builder = create_custom_builder(
    #     history_strategy=history_last_n(4),  # Only last 4 messages
    #     in_context_example=IN_CONTEXT_EXAMPLE_SIMPLE,
    # )

    # Create agent
    agent = MINTAgent(
        llm_fn=llm_fn,
        prompt_builder=prompt_builder,
        max_turns=5,
        max_propose_solution=2,
    )

    # Example task
    task = "What is the sum of the first 20 Fibonacci numbers?"

    def check_solution(solution: str) -> bool:
        # First 20 Fibonacci: 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765
        # Sum = 17710
        try:
            return "17710" in solution or int(solution.strip()) == 17710
        except ValueError:
            return False

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

    print("\n" + "=" * 60)
    print("Conversation History:")
    print("=" * 60)
    for msg in result['history']:
        print(f"\n[{msg.role.upper()}]")
        content = msg.content[:500] + "..." if len(msg.content) > 500 else msg.content
        print(content)

    return result


# =============================================================================
# EXAMPLE: Different history representation experiments
# =============================================================================

def run_representation_experiment():
    """
    Run the same task with different history representations.
    Useful for comparing how different representations affect performance.
    """
    llm_fn = create_openai_llm("gpt-3.5-turbo")

    configurations = [
        ("Full History", create_default_builder()),
        ("Summarized History", create_summarized_history_builder()),
        ("Last-4 History", create_custom_builder(
            history_strategy=history_last_n(4),
        )),
        ("Minimal (No Example)", create_minimal_builder()),
    ]

    task = "What is the product of the first 5 prime numbers?"

    def check_solution(solution: str) -> bool:
        # 2 * 3 * 5 * 7 * 11 = 2310
        try:
            return "2310" in solution or int(solution.strip()) == 2310
        except ValueError:
            return False

    for name, builder in configurations:
        print(f"\n{'=' * 60}")
        print(f"Configuration: {name}")
        print("=" * 60)

        agent = MINTAgent(
            llm_fn=llm_fn,
            prompt_builder=builder,
            max_turns=5,
            max_propose_solution=2,
        )

        result = agent.run(task=task, check_solution=check_solution)

        print(f"Success: {result['success']}")
        print(f"Turns: {result['turns_used']}")
        print(f"Solution: {result['solution']}")


if __name__ == "__main__":
    run_example()
    # run_representation_experiment()  # Uncomment to run experiments
