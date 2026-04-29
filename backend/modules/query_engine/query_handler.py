class QueryHandler:
    def __init__(self, embedding_engine, retriever, llama_client):
        self.embedding_engine = embedding_engine
        self.retriever = retriever
        self.llama_client = llama_client

    def handle_query(self, user_query: str):
        # 1. Embed query
        query_vec = self.embedding_engine.get_embeddings([user_query])[0]
        
        # 2. Retrieve chunks
        sources = self.retriever.get_relevant_context(query_vec)
        context_text = "\n\n---\n\n".join(src["text"] for src in sources)
        
        # 3. Build Prompt
        prompt = f"""
        You are a legal assistant analyzing a policy document. 
        Use the following retrieved clauses to answer the user's question accurately.
        If the answer is not in the context, say you don't know.

        CONTEXT:
        {context_text}

        QUESTION: {user_query}

        ANSWER (including the specific clause reference):
        """
        
        answer = self.llama_client.ask(prompt)
        return answer, sources