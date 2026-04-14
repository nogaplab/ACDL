sys = {}
resp1 = {}
resp2 = {}
env = {}

def run_agent():
    sys["foo"] = 1
    i=1
    while True:
        resp2[i] = LLMCall2()
        sys["foo"] += 1
        input = BuildCall1Prompt(i)
        print(input)
        resp1[i] = InvokeLLM1(input)
        sys["foo"] += 1
        if resp1[i] == "DONE":
            break
        i+=1

def BuildCall1Prompt(i):
    messages = []

    instructions = "INSTRUCTIONS"
    messages.append({"role": "system", "content": instructions})

    messages.append({"role": "assistant", "content": resp2[i]})

    messages.append({"role": "user", "content": sys["foo"]})

    if sys["foo"] >= 5:
        return "DONE"
    
    return messages

def InvokeLLM1(messages):
    if messages == "DONE":
        return "DONE"
    return "response"
    


def LLMCall2(): 
    return sys["foo"]

def main():
    run_agent()

if __name__ == "__main__":
    main()