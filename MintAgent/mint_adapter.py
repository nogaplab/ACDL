"""
MINT-Compatible Agent Adapter.

This module provides an adapter that allows the MINTAgent to be evaluated
using MINT's official evaluation harness.

To use with MINT:
1. Copy this file to mint-bench/mint/agents/
2. Add the agent config to mint/configs/config_variables.py
3. Run MINT evaluation as usual

Note: MINT's environment handles <execute> and <solution> parsing/execution.
This adapter only needs to generate the LLM response text.
"""

import os
from typing import List, Dict, Any

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


class MINTAgentAdapter(LMAgent):
    """
    MINT-compatible adapter for our agent.

    This agent:
    1. Uses OpenAI to generate responses with <thought>, <execute>, <solution> tags
    2. Passes <execute> and <solution> to MINT's environment for execution

    Config options:
        model_name: OpenAI model to use (default: "gpt-3.5-turbo")
        max_tokens: Max tokens for generation (default: 1024)
        temperature: Sampling temperature (default: 0.0)
    """

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)

        self.model_name = config.get("model_name", "gpt-3.5-turbo")
        self.max_tokens = config.get("max_tokens", 1024)
        self.temperature = config.get("temperature", 0.0)

        # OpenAI client
        self._setup_openai()

        # Stop words for generation
        self.stop_words = ["\nObservation:", "\nTask:"]

    def _setup_openai(self):
        """Initialize OpenAI client."""
        try:
            from openai import OpenAI
            api_key = os.environ.get("OPENAI_API_KEY")
            self.client = OpenAI(api_key=api_key)
        except ImportError:
            raise ImportError("Please install openai: pip install openai")

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

    def act(self, state: State) -> Action:
        """
        Process MINT state and return an action.

        This method:
        1. Converts MINT state to messages
        2. Calls the LLM to generate a response
        3. Returns response with <execute> or <solution> for MINT to handle
        """
        try:
            # Get message history from MINT state
            messages = list(state.history) if hasattr(state, 'history') else []

            # Call LLM
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
        pass


# For standalone testing without MINT
def test_adapter():
    """Test the adapter without MINT framework."""
    print("Testing MINTAgentAdapter...")

    config = {
        "model_name": "gpt-3.5-turbo",
        "max_tokens": 512,
        "temperature": 0.0,
    }

    agent = MINTAgentAdapter(config)

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
