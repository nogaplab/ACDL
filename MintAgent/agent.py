"""
Multi-step Agent compatible with MINT benchmark.

This agent follows the MINT framework:
- Uses <thought>, <execute>, <solution> tags for structured output
- Supports multi-turn interaction with Python interpreter
- Can receive natural language feedback
"""

from typing import List, Dict, Any, Optional, Callable
import re
from mint_types import Message, ToolResult, AgentState, PythonTool


def parse_agent_response(response: str) -> Dict[str, Any]:
    """
    Parse the agent's response to extract thought, action type, and action input.

    Tags:
    - <thought>...</thought> for reasoning
    - <execute>...</execute> for Python code
    - <solution>...</solution> for final answer

    Returns:
        {
            "thought": str or None,
            "action": "execute" | "solution" | None,
            "action_input": str or None,
            "raw": str (original response)
        }
    """
    result = {
        "thought": None,
        "action": None,
        "action_input": None,
        "raw": response
    }

    # Extract thought
    thought_match = re.search(r'<thought>(.*?)</thought>', response, re.DOTALL)
    if thought_match:
        result["thought"] = thought_match.group(1).strip()

    # Extract execute (Python code)
    execute_match = re.search(r'<execute>(.*?)</execute>', response, re.DOTALL)
    if execute_match:
        result["action"] = "execute"
        result["action_input"] = execute_match.group(1).strip()
        return result

    # Extract solution (final answer)
    solution_match = re.search(r'<solution>(.*?)</solution>', response, re.DOTALL)
    if solution_match:
        result["action"] = "solution"
        result["action_input"] = solution_match.group(1).strip()
        return result

    return result


class MINTAgent:
    """
    Multi-step Agent compatible with MINT benchmark.

    The agent:
    1. Receives a task/question
    2. Can use Python interpreter via <execute> tags
    3. Proposes solutions via <solution> tags
    4. Receives observations and optional feedback
    5. Continues until solution is correct, max turns reached, or max proposals used
    """

    def __init__(
        self,
        llm_fn: Callable[[List[Dict[str, str]]], str],
        prompt_builder: Any,
        max_turns: int = 5,
        max_propose_solution: int = 2,
    ):
        """
        Args:
            llm_fn: Function that takes messages and returns LLM response string
            prompt_builder: PromptBuilder instance for constructing prompts
            max_turns: Maximum interaction turns allowed
            max_propose_solution: Maximum times agent can propose a solution
        """
        self.llm_fn = llm_fn
        self.prompt_builder = prompt_builder
        self.max_turns = max_turns
        self.max_propose_solution = max_propose_solution
        self.python_tool: PythonTool = PythonTool()

    def reset(self):
        """Reset the agent state and tool environment."""
        self.python_tool.reset()

    def run(
        self,
        task: str,
        check_solution: Optional[Callable[[str], bool]] = None,
        feedback_fn: Optional[Callable[[str, AgentState], str]] = None
    ) -> Dict[str, Any]:
        """
        Run the agent on a task.

        Args:
            task: The task description / question
            check_solution: Optional function to check if solution is correct
            feedback_fn: Optional function to provide natural language feedback

        Returns:
            {
                "success": bool,
                "solution": str or None,
                "turns_used": int,
                "history": List[Message],
                "final_state": AgentState
            }
        """
        self.reset()

        state = AgentState(
            max_turns=self.max_turns,
            max_propose_solution=self.max_propose_solution
        )

        for turn in range(1, self.max_turns + 1):
            state.turn = turn
            steps_left = self.max_turns - turn + 1
            proposals_left = self.max_propose_solution - state.propose_solution_count

            # Build prompt
            messages = self.prompt_builder.build(
                state=state,
                task=task,
                steps_left=steps_left,
                proposals_left=proposals_left
            )

            # Call LLM
            messages_for_llm = [{"role": m.role, "content": m.content} for m in messages]
            llm_response = self.llm_fn(messages_for_llm)

            # Parse response
            parsed = parse_agent_response(llm_response)

            # Log assistant message
            state.history.append(Message(
                role="assistant",
                content=llm_response
            ))

            # Handle action
            if parsed["action"] == "solution":
                state.propose_solution_count += 1
                solution = parsed["action_input"]

                # Check solution if checker provided
                if check_solution:
                    is_correct = check_solution(solution)
                    if is_correct:
                        state.history.append(Message(
                            role="user",
                            content="Good job! You have successfully solved the task!"
                        ))
                        return {
                            "success": True,
                            "solution": solution,
                            "turns_used": turn,
                            "history": state.history,
                            "final_state": state
                        }
                    else:
                        # Wrong answer
                        obs = "Your answer is wrong."
                        if proposals_left - 1 > 0:
                            obs += f"\nYou have {steps_left - 1} steps left and {proposals_left - 1} chances to propose solution left."

                        # Add feedback if available
                        if feedback_fn:
                            feedback = feedback_fn(llm_response, state)
                            if feedback:
                                obs += f"\n\nExpert feedback:\n{feedback}"

                        state.history.append(Message(role="user", content=obs))
                else:
                    # No checker - assume success
                    return {
                        "success": True,
                        "solution": solution,
                        "turns_used": turn,
                        "history": state.history,
                        "final_state": state
                    }

            elif parsed["action"] == "execute":
                code = parsed["action_input"]
                result = self.python_tool.run(code)

                state.tool_results.append(ToolResult(
                    tool_name="python",
                    input=code,
                    output=result
                ))

                # Build observation
                obs = f"Observation:\n{result}"
                obs += f"\nYou have {steps_left - 1} steps left and {proposals_left} chances to propose solution left."

                # Add reminder on last turn
                if turn == self.max_turns - 1 or steps_left == 2:
                    obs += "\nYou should take the last step to propose a solution."

                # Add feedback if available
                if feedback_fn:
                    feedback = feedback_fn(llm_response, state)
                    if feedback:
                        obs += f"\n\nExpert feedback:\n{feedback}"

                state.history.append(Message(role="user", content=obs))

            else:
                # Could not parse action - send error message
                error_msg = (
                    "I don't understand your input.\n"
                    "Available actions: execute, solution\n"
                    "- To execute Python code: <execute> YOUR_CODE </execute>\n"
                    "- To provide an answer: <solution> YOUR_ANSWER </solution>\n"
                    "For example: The answer is <solution> 42 </solution>."
                )

                obs = f"Observation:\n{error_msg}"
                obs += f"\nYou have {steps_left - 1} steps left and {proposals_left} chances to propose solution left."

                state.history.append(Message(role="user", content=obs))

        # Max turns exceeded
        return {
            "success": False,
            "solution": None,
            "turns_used": self.max_turns,
            "history": state.history,
            "final_state": state
        }

    def step(self, state: AgentState, task: str) -> tuple:
        """
        Execute a single step of the agent.

        Useful for external control of the agent loop (e.g., MINT evaluation).

        Returns:
            (parsed_response, observation, updated_state)
        """
        steps_left = state.max_turns - state.turn + 1
        proposals_left = state.max_propose_solution - state.propose_solution_count

        # Build prompt
        messages = self.prompt_builder.build(
            state=state,
            task=task,
            steps_left=steps_left,
            proposals_left=proposals_left
        )

        # Call LLM
        messages_for_llm = [{"role": m.role, "content": m.content} for m in messages]
        llm_response = self.llm_fn(messages_for_llm)

        # Parse response
        parsed = parse_agent_response(llm_response)

        # Log assistant message
        state.history.append(Message(
            role="assistant",
            content=llm_response
        ))

        observation = None

        if parsed["action"] == "execute":
            code = parsed["action_input"]
            result = self.python_tool.run(code)

            state.tool_results.append(ToolResult(
                tool_name="python",
                input=code,
                output=result
            ))

            observation = result

        elif parsed["action"] == "solution":
            state.propose_solution_count += 1
            observation = parsed["action_input"]

        state.turn += 1

        return parsed, observation, state
