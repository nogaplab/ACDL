"""
Multi-step RAG Agent compatible with MINT benchmark.

This agent follows the MINT framework but adds agent-controlled search:
- Uses <thought>, <search>, <execute>, <solution> tags for structured output
- Agent decides WHEN and WHAT to search (multi-step RAG)
- Supports multi-turn interaction with search and Python interpreter
- Can receive natural language feedback
"""

from typing import List, Dict, Any, Optional, Callable
import re
from mint_types import Message, ToolResult, AgentState, PythonTool, SearchResult
from PromptBuilder import PromptBuilder
from Retriever import SimpleRetriever


def parse_agent_response(response: str) -> Dict[str, Any]:
    """
    Parse the agent's response to extract thought, action type, and action input.

    Tags:
    - <thought>...</thought> for reasoning
    - <search>...</search> for retrieval query
    - <execute>...</execute> for Python code
    - <solution>...</solution> for final answer

    Returns:
        {
            "thought": str or None,
            "action": "search" | "execute" | "solution" | None,
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

    # Extract search (RAG query) - check this first
    search_match = re.search(r'<search>(.*?)</search>', response, re.DOTALL)
    if search_match:
        result["action"] = "search"
        result["action_input"] = search_match.group(1).strip()
        return result

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


class MultiStepRAGAgent:
    """
    Multi-step RAG Agent compatible with MINT benchmark.

    The agent:
    1. Receives a task/question
    2. Can search the knowledge base via <search> tags (agent controls when/what)
    3. Can use Python interpreter via <execute> tags
    4. Proposes solutions via <solution> tags
    5. Receives observations and optional feedback
    6. Continues until solution is correct, max turns reached, or max proposals used
    """

    def __init__(
        self,
        llm_fn: Callable[[List[Dict[str, str]]], str],
        prompt_builder: PromptBuilder,
        retriever: Any = None,
        max_turns: int = 5,
        max_propose_solution: int = 2,
        enable_python: bool = True,
        search_k: int = 5
    ):
        """
        Args:
            llm_fn: Function that takes messages and returns LLM response string
            prompt_builder: PromptBuilder instance for constructing prompts
            retriever: Retriever with search(query, k) method
            max_turns: Maximum interaction turns allowed
            max_propose_solution: Maximum times agent can propose a solution
            enable_python: Whether to allow Python code execution
            search_k: Number of chunks to retrieve per search
        """
        self.llm_fn = llm_fn
        self.prompt_builder = prompt_builder
        self.retriever: Any = retriever or SimpleRetriever()
        self.max_turns = max_turns
        self.max_propose_solution = max_propose_solution
        self.enable_python = enable_python
        self.search_k = search_k
        self.python_tool: Optional[PythonTool] = PythonTool() if enable_python else None

    def reset(self):
        """Reset the agent state and tool environment."""
        if self.python_tool:
            self.python_tool.reset()

    def _do_search(self, query: str) -> SearchResult:
        """Execute a search query and return results."""
        # Get results from retriever
        if hasattr(self.retriever, 'index') and hasattr(self.retriever.index, 'search'):
            # AdvancedRetriever with VectorIndex
            raw_results = self.retriever.index.search(query, self.search_k)
            chunks = [chunk for _, chunk in raw_results]
            scores = [score for score, _ in raw_results]
        elif hasattr(self.retriever, 'retrieve'):
            # Any retriever with retrieve method
            chunks = self.retriever.retrieve(query, None)
            scores = [1.0] * len(chunks)  # No scores available
        else:
            chunks = []
            scores = []

        return SearchResult(query=query, chunks=chunks, scores=scores)

    def _format_search_results(self, search_result: SearchResult) -> str:
        """Format search results for observation."""
        if not search_result.chunks:
            return "No relevant documents found."

        lines = [f"Found {len(search_result.chunks)} relevant passages:"]
        for i, (chunk, score) in enumerate(zip(search_result.chunks, search_result.scores)):
            lines.append(f"\n[{i+1}] (score: {score:.3f})")
            lines.append(chunk.text)

        return "\n".join(lines)

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
                "search_history": List[SearchResult],
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
                            "search_history": state.search_history,
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
                        "search_history": state.search_history,
                        "final_state": state
                    }

            elif parsed["action"] == "search":
                query = parsed["action_input"]
                search_result = self._do_search(query)
                state.search_history.append(search_result)

                state.tool_results.append(ToolResult(
                    tool_name="search",
                    input=query,
                    output=self._format_search_results(search_result)
                ))

                # Build observation
                obs = f"Search results for '{query}':\n{self._format_search_results(search_result)}"
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

            elif parsed["action"] == "execute" and self.enable_python and self.python_tool:
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
                tools_available = "search, solution"
                if self.enable_python:
                    tools_available = "search, execute, solution"

                error_msg = (
                    "I don't understand your input.\n"
                    f"Available actions: {tools_available}\n"
                    "- To search the knowledge base: <search> YOUR_QUERY </search>\n"
                )
                if self.enable_python:
                    error_msg += "- To execute Python code: <execute> YOUR_CODE </execute>\n"
                error_msg += (
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
            "search_history": state.search_history,
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

        if parsed["action"] == "search":
            query = parsed["action_input"]
            search_result = self._do_search(query)
            state.search_history.append(search_result)

            state.tool_results.append(ToolResult(
                tool_name="search",
                input=query,
                output=self._format_search_results(search_result)
            ))

            observation = self._format_search_results(search_result)

        elif parsed["action"] == "execute" and self.enable_python and self.python_tool:
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


# Alias for backwards compatibility
MINTAgent = MultiStepRAGAgent
