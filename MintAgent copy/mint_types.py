from dataclasses import dataclass, field
from typing import List, Dict
import sys
import io
import traceback


@dataclass
class Message:
    role: str   # "system" | "user" | "assistant" | "observation"
    content: str


@dataclass
class Document:
    doc_id: str
    text: str


@dataclass
class Chunk:
    chunk_id: str
    doc_id: str
    text: str
    metadata: dict


@dataclass
class SearchResult:
    """Result from a single search query."""
    query: str
    chunks: List[Chunk]
    scores: List[float]


@dataclass
class ToolResult:
    tool_name: str  # "search" | "python"
    input: str
    output: str


@dataclass
class AgentState:
    history: List[Message] = field(default_factory=list)
    search_history: List[SearchResult] = field(default_factory=list)  # All searches performed
    tool_results: List[ToolResult] = field(default_factory=list)
    turn: int = 0
    max_turns: int = 5
    max_propose_solution: int = 2
    propose_solution_count: int = 0

    @property
    def all_retrieved_chunks(self) -> List[Chunk]:
        """Get all unique chunks retrieved across all searches."""
        seen = set()
        chunks = []
        for sr in self.search_history:
            for chunk in sr.chunks:
                if chunk.chunk_id not in seen:
                    seen.add(chunk.chunk_id)
                    chunks.append(chunk)
        return chunks


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
