"""
Embedding models for the retrieval system.
"""

from typing import List


class Embedder:
    """Base class for text embedders."""

    def embed(self, texts: List[str]) -> List[List[float]]:
        raise NotImplementedError


class SentenceTransformerEmbedder(Embedder):
    """Embedder using sentence-transformers library."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            raise ImportError(
                "Please install sentence-transformers: pip install sentence-transformers"
            )

        self.model = SentenceTransformer(model_name)

    def embed(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True
        )
        return embeddings.tolist()


class DummyEmbedder(Embedder):
    """Dummy embedder for testing (returns random-ish embeddings)."""

    def __init__(self, dim: int = 384):
        self.dim = dim

    def embed(self, texts: List[str]) -> List[List[float]]:
        import hashlib

        result = []
        for text in texts:
            # Create deterministic "embeddings" based on text hash
            h = hashlib.md5(text.encode()).hexdigest()
            vec = [int(h[i:i+2], 16) / 255.0 for i in range(0, min(len(h), self.dim * 2), 2)]
            # Pad to dim if needed
            vec.extend([0.0] * (self.dim - len(vec)))
            result.append(vec[:self.dim])
        return result
