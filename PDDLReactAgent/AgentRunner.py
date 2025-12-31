from tools import read_file, run_validator, search_docs, write_file
import json
from openai import OpenAI

with open('PDDLReactAgent/openai_key.txt', 'r') as f:
    api_key = f.read().strip()

# Initialize client with the key
client = OpenAI(api_key=api_key)

# Tool definitions for OpenAI API
tools = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a PDDL prompt file from disk",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to file"}
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_validator",
            "description": "Validate PDDL file content using the parser",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "PDDL file content"}
                },
                "required": ["content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_docs",
            "description": "Search language reference for help fixing errors",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "What to search for"},
                    "pddl_content": {"type": "string", "description": "The PDDL file content"},
                    "error_message": {"type": "string", "description": "Error from validator"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write corrected PDDL file to disk",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path"},
                    "content": {"type": "string", "description": "File content"}
                },
                "required": ["path", "content"]
            }
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
        # Call LLM with tools
        response = client.chat.completions.create(
            model="gpt-4o",  # or "gpt-4-turbo"
            messages=messages,
            tools=tools,
            max_tokens=4096
        )
        
        message = response.choices[0].message
        
        # Check if tool calls exist
        if message.tool_calls:
            # Add assistant message
            messages.append(message)
            
            # Execute tools
            for tool_call in message.tool_calls:
                tool_name = tool_call.function.name
                tool_input = json.loads(tool_call.function.arguments)
                
                result = tool_executor[tool_name](**tool_input)
                
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result
                })
        else:
            # Final answer
            return message.content


# Run it
if __name__ == "__main__":
    result = react_loop("Please validate the file Prompts/bad_prompt.pddl and fix any errors")
    print(result)
