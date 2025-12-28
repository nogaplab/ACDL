import subprocess
from anthropic import Anthropic

# Initialize client
client = Anthropic(api_key="your-api-key-here")  # Or use env var


def read_file(path):
    try:
        with open(path, 'r') as f:
            return f.read()
    except FileNotFoundError:
        return f"Error: File {path} not found"
    except Exception as e:
        return f"Error reading file: {str(e)}"
    
def run_validator(content):
    try:
        result = subprocess.run(
            ['node', 'validator.js', content],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            return "Valid!"
        else:
            return result.stderr
    except Exception as e:
        return f"Validator error: {str(e)}"
    

def write_file(path, content):
    try:
        with open(path, 'w') as f:
            f.write(content)
        return f"Successfully wrote to {path}"
    except Exception as e:
        return f"Error writing file: {str(e)}"


def search_docs(query, pddl_content=None, error_message=None):
    """
    Use an LLM to search the language reference and provide guidance
    
    Args:
        query: What to look for (e.g., "how to fix brace errors")
        pddl_content: Optional - the actual PDDL file content with errors
        error_message: Optional - the error from the validator
    """
    # Read the language reference
    with open('../LANGUAGE_REFERENCE.md', 'r') as f:
        lang_ref = f.read()
    
    # Build a prompt for the LLM
    prompt = f"""You are a PDDL prompt language expert. 

Language Reference:
{lang_ref}

Error from validator: {error_message}

PDDL file content:
{pddl_content}

Query: {query}

Based on the language reference, explain what's wrong and how to fix it. Be specific about which rule was violated."""
    
    # Make LLM call
    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1024
    )
    
    return response.content[0].text
