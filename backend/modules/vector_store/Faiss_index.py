import faiss
import numpy as np
import os


class FaissIndex:
    def __init__(self, dimension: int = 384):
        """
        Initializes a FAISS Index.

        The 'all-MiniLM-L6-v2' embedding model produces 384-dimension vectors.
        """
        self.dimension = dimension
        self.index = faiss.IndexFlatL2(self.dimension)

    def add_vectors(self, embeddings):
        """Adds embeddings to the FAISS index."""
        if embeddings is None or len(embeddings) == 0:
            return

        vectors = np.array(embeddings).astype("float32")

        # safety check
        if vectors.shape[1] != self.dimension:
            raise ValueError(
                f"Embedding dimension mismatch. Expected {self.dimension}, got {vectors.shape[1]}"
            )

        self.index.add(vectors)

    def search(self, query_vector, top_k: int = 3):
        """
        Searches the index for the most similar vectors.

        Returns
        -------
        distances : similarity distances
        indices   : indices of matching chunks
        """

        query_vector = np.array([query_vector]).astype("float32")

        distances, indices = self.index.search(query_vector, top_k)

        return distances[0], indices[0]

    def save_index(self, folder_path: str, index_name: str = "policy_index"):
        """Saves the index to disk."""
        if not os.path.exists(folder_path):
            os.makedirs(folder_path)

        path = os.path.join(folder_path, f"{index_name}.index")

        faiss.write_index(self.index, path)

    def load_index(self, file_path: str):
        """Loads a saved FAISS index."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Index file not found: {file_path}")

        self.index = faiss.read_index(file_path)