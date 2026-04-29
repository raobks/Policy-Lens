from sentence_transformers import SentenceTransformer
import torch

class EmbeddingEngine:
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2'):
        """
        Initializes the embedding model.
        It will automatically use your GPU if available (CUDA), 
        otherwise, it defaults to CPU.
        """
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.model = SentenceTransformer(model_name, device=self.device)

    def get_embeddings(self, text_chunks: list) -> list:
        """
        Converts a list of text chunks into numerical vectors.
        
        Args:
            text_chunks (list): List of strings from the segmenter.
            
        Returns:
            list: A list of numpy arrays (embeddings).
        """
        if not text_chunks:
            return []
            
        # convert_to_numpy=True makes it easier to feed into FAISS later
        embeddings = self.model.encode(text_chunks, convert_to_numpy=True)
        return embeddings

# Quick Test
if __name__ == "__main__":
    engine = EmbeddingEngine()
    test_data = ["This is a legal clause about data privacy.", "Automatic renewal applies."]
    vectors = engine.get_embeddings(test_data)
    print(f"Generated {len(vectors)} vectors with dimension: {vectors[0].shape}")