from modules.llm.llama_client import LlamaClient

llm = LlamaClient()

response = llm.ask("Summarize: AI is transforming the world")

print("\n--- RESPONSE ---\n")
print(response)