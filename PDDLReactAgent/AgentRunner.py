from anthropic import Anthropic
from tools import read_file, run_validator, search_docs, write_file

# Initialize client
client = Anthropic(api_key="your-api-key")  # Or from env

# Tool definitions for Anthropic API
tools = [
    {
        "name": "read_file",
        "description": "Read a PDDL prompt file from disk",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to file"}
            },
            "required": ["path"]
        }
    },
    {
        "name": "run_validator",
        "description": "Validate PDDL file content using the parser",
        "input_schema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "PDDL file content"}
            },
            "required": ["content"]
        }
    },
    {
        "name": "search_docs",
        "description": "Search language reference for help fixing errors",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to search for"},
                "pddl_content": {"type": "string", "description": "The PDDL file content"},
                "error_message": {"type": "string", "description": "Error from validator"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "write_file",
        "description": "Write corrected PDDL file to disk",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path"},
                "content": {"type": "string", "description": "File content"}
            },
            "required": ["path", "content"]
        }
    }
]

# Tool executor
tool_executor = {
    "read_file": read_file,
    "run_validator": run_validator,
    "search_docs": search_docs,
    "write_file": write_file
}

# Main ReAct loop
def react_loop(user_question):
    messages = [{"role": "user", "content": user_question}]
    
    while True:
        # Call LLM
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4096,
            messages=messages,
            tools=tools
        )
        
        # Check stop reason
        if response.stop_reason == "tool_use":
            # Extract tool uses
            tool_uses = [block for block in response.content if block.type == "tool_use"]
            
            # Add assistant response to messages
            messages.append({"role": "assistant", "content": response.content})
            
            # Execute tools and collect results
            tool_results = []
            for tool_use in tool_uses:
                tool_name = tool_use.name
                tool_input = tool_use.input
                
                # Execute
                result = tool_executor[tool_name](**tool_input)
                
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": result
                })
            
            # Add tool results to messages
            messages.append({"role": "user", "content": tool_results})
            
        elif response.stop_reason == "end_turn":
            # Final answer
            final_text = next((block.text for block in response.content if hasattr(block, 'text')), None)
            return final_text
        else:
            return f"Unexpected stop reason: {response.stop_reason}"

# Run it
if __name__ == "__main__":
    result = react_loop("Please validate the file Prompts/bad_prompt.pddl and fix any errors")
    print(result)
