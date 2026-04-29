class PolicyRetriever:
    def __init__(self, faiss_index, chunks):
        self.faiss_index = faiss_index
        self.chunks = chunks  # This is the list of strings from the segmenter

    def get_relevant_context(self, query_embedding, top_k: int = 3):
        distances, indices = self.faiss_index.search(query_embedding, top_k=top_k)

        results = []
        for idx in indices:
            if idx != -1 and idx < len(self.chunks):
                results.append(
                    {
                        "index": int(idx),
                        "text": self.chunks[idx],
                    }
                )

        return results

