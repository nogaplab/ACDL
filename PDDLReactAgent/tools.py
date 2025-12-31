import subprocess
from openai import OpenAI

with open('PDDLReactAgent/openai_key.txt', 'r') as f:
    api_key = f.read().strip()

# Initialize client with the key
client = OpenAI(api_key=api_key)

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
    with open('LANGUAGE_REFERENCE.md', 'r') as f:
        lang_ref = f.read()
    
    prompt = f"""You are a PDDL prompt language expert. 

Language Reference:
{lang_ref}

Error from validator: {error_message}

PDDL file content:
{pddl_content}

Query: {query}

Based on the language reference, explain what's wrong and how to fix it."""
    
    # OpenAI format
    response = client.chat.completions.create(
        model="gpt-4o",  # or "gpt-4-turbo" or "gpt-3.5-turbo"
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1024
    )
    
    return response.choices[0].message.content

