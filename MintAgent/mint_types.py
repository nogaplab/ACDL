from dataclasses import dataclass, field
from typing import List
import sys
import io
import traceback


@dataclass
class Message:
    role: str   # "system" | "user" | "assistant" | "observation"
    content: str


@dataclass
class ToolResult:
    tool_name: str  # "python"
    input: str
    output: str


@dataclass
class AgentState:
    history: List[Message] = field(default_factory=list)
    tool_results: List[ToolResult] = field(default_factory=list)
    turn: int = 0
    max_turns: int = 5
    max_propose_solution: int = 2
    propose_solution_count: int = 0


class PythonTool:
    """Python interpreter tool that captures stdout and returns execution results."""
    name = "python"

    def __init__(self):
        self.global_env = {}

    def run(self, code: str) -> str:
        """Execute Python code and return output (stdout + last expression value)."""
        old_stdout = sys.stdout
        sys.stdout = captured_output = io.StringIO()

        try:
            # Try to compile as expression first (for things like "x + 1")
            try:
                result = eval(code, self.global_env, self.global_env)
                output = captured_output.getvalue()
                if result is not None:
                    if output:
                        return f"{output}Out: {result}"
                    return f"Out: {result}"
                return output if output else "[Executed Successfully with No Output]"
            except SyntaxError:
                pass

            # Execute as statements
            exec(code, self.global_env, self.global_env)
            output = captured_output.getvalue()
            return output if output else "[Executed Successfully with No Output]"

        except Exception as e:
            tb = traceback.format_exc()
            return f"{tb}"
        finally:
            sys.stdout = old_stdout

    def reset(self):
        """Reset the execution environment."""
        self.global_env = {}
