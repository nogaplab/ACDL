"""
Retrieval system for RAG (Retrieval-Augmented Generation).

This module provides:
- SimpleRetriever: No-op retriever for tasks without RAG
- VectorIndex + AdvancedRetriever: Full RAG with embeddings (requires numpy + sentence-transformers)
"""

from typing import List, Optional, Any, TYPE_CHECKING
from mint_types import Document, Chunk, AgentState


class QueryRewriter:
    """Base class for query rewriters."""
    def rewrite(self, query: str, state: AgentState) -> str:
        return query


class LastTurnRewriter(QueryRewriter):
    """Appends last conversation turn to query for better context."""
    def rewrite(self, query: str, state: AgentState) -> str:
        if state.history:
            return query + " " + state.history[-1].content
        return query


class RetrievalPostProcessor:
    """Base class for post-processing retrieval results."""
    def process(self, results: List[tuple]) -> List[Chunk]:
        return [chunk for _, chunk in results]


class DeduplicateDocs(RetrievalPostProcessor):
    """Remove duplicate documents from results."""
    def process(self, results: List[tuple]) -> List[Chunk]:
        seen_docs = set()
        unique = []
        for score, chunk in results:
            if chunk.doc_id not in seen_docs:
                seen_docs.add(chunk.doc_id)
                unique.append(chunk)
        return unique


class ScoreThresholdFilter(RetrievalPostProcessor):
    """Filter results below a score threshold."""
    def __init__(self, threshold: float = 0.1):
        self.threshold = threshold

    def process(self, results: List[tuple]) -> List[Chunk]:
        return [chunk for score, chunk in results if score is None or score >= self.threshold]


class SimpleRetriever:
    """Simple retriever that returns empty results (for tasks without RAG)."""
    def retrieve(self, query: str, state: Optional[AgentState] = None) -> List[Chunk]:
        return []


class VectorIndex:
    """
    Simple vector index using cosine similarity.

    Requires: numpy, sentence-transformers (via Embedder)
    """
    def __init__(self, embedder: Any):
        try:
            import numpy as np
            self._np = np
        except ImportError:
            raise ImportError("VectorIndex requires numpy: pip install numpy")

        self.embedder = embedder
        self.vectors: List[Any] = []
        self.chunks: List[Chunk] = []

    def add(self, chunks: List[Chunk]):
        """Add chunks to the index."""
        if not chunks:
            return
        embeddings = self.embedder.embed([c.text for c in chunks])
        for emb, chunk in zip(embeddings, chunks):
            self.vectors.append(self._np.array(emb))
            self.chunks.append(chunk)

    def search(self, query: str, k: int) -> List[tuple]:
        """Search for top-k similar chunks."""
        if not self.vectors:
            return []

        q_emb = self._np.array(self.embedder.embed([query])[0])

        scores = []
        for vec, chunk in zip(self.vectors, self.chunks):
            score = float(self._np.dot(q_emb, vec))
            scores.append((score, chunk))

        scores.sort(key=lambda x: x[0], reverse=True)
        return scores[:k]


class AdvancedRetriever:
    """Retriever with query rewriting and post-processing capabilities."""
    def __init__(
        self,
        index: VectorIndex,
        query_rewriter: Optional[QueryRewriter] = None,
        post_processors: Optional[List[RetrievalPostProcessor]] = None,
        k: int = 5
    ):
        self.index = index
        self.query_rewriter = query_rewriter
        self.post_processors = post_processors or []
        self.k = k

    def retrieve(self, query: str, state: Optional[AgentState] = None) -> List[Chunk]:
        """Retrieve relevant chunks for a query."""
        if self.query_rewriter and state:
            query = self.query_rewriter.rewrite(query, state)

        results = self.index.search(query, self.k)

        for pp in self.post_processors:
            results = [(None, c) for c in pp.process(results)]

        return [c for _, c in results]


def chunk_document(
    doc: Document,
    chunk_size: int = 200,
    overlap: int = 40
) -> List[Chunk]:
    """Split a document into overlapping chunks."""
    words = doc.text.split()
    chunks = []

    i = 0
    idx = 0
    while i < len(words):
        chunk_words = words[i:i + chunk_size]
        chunk_text = " ".join(chunk_words)

        chunks.append(
            Chunk(
                chunk_id=f"{doc.doc_id}_{idx}",
                doc_id=doc.doc_id,
                text=chunk_text,
                metadata={"start": i}
            )
        )

        i += chunk_size - overlap
        idx += 1

    return chunks
