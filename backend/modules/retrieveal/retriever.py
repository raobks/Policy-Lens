class PolicyRetriever:
    def __init__(self, faiss_index, chunks):
        """
        faiss_index : FAISS vector index
        chunks      : list of document text chunks
        """
        self.faiss_index = faiss_index
        self.chunks = chunks

    def get_relevant_context(self, query_embedding, top_k=3):
        """
        Returns the most relevant chunks for a query embedding.
        """

        distances, indices = self.faiss_index.search(query_embedding, top_k=top_k)

        results = []

        for i, idx in enumerate(indices):
            if idx == -1:
                continue

            if idx >= len(self.chunks):
                continue

            results.append(
                {
                    "index": int(idx),
                    "text": self.chunks[idx],
                    "score": float(distances[i])
                }
            )

        return results