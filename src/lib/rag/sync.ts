/**
 * Sincronizzazione documento → ChromaDB.
 * - Chunking Markdown-aware (split sui header)
 * - Embedding locale con MiniLM
 * - Strategia upsert: cancella tutti i chunk del documento, reinserisce.
 */

import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { getCollection } from "./chroma";
import { embed } from "./embeddings";

const splitter = new MarkdownTextSplitter({
  chunkSize: 800,
  chunkOverlap: 100,
});

function extractHeaderPath(chunk: string): string {
  const headers = chunk.match(/^(#{1,4})\s+(.+)$/gm) ?? [];
  return headers
    .map((h) => h.replace(/^#+\s+/, "").trim())
    .slice(0, 3)
    .join(" › ");
}

export async function syncDocument(doc: {
  id: string;
  title: string;
  content: string;
  version: number;
}): Promise<{ chunks: number }> {
  console.log(
    `[RAG] ▶ Sync documento ${doc.id} v${doc.version} — "${doc.title}"`,
  );

  const collection = await getCollection();

  // 1. Rimuovi chunk precedenti per questo documentId
  await collection.delete({ where: { documentId: doc.id } });

  // 2. Chunking
  const chunks = await splitter.splitText(doc.content);
  if (chunks.length === 0) {
    console.log(`[RAG] ⚠ Nessun chunk generato per ${doc.id}`);
    return { chunks: 0 };
  }
  console.log(`[RAG]   ${chunks.length} chunk generati, calcolo embeddings...`);

  // 3. Embeddings
  const embeddings = await embed(chunks);

  // 4. Upsert
  const ids = chunks.map((_, i) => `${doc.id}__v${doc.version}__${i}`);
  const metadatas = chunks.map((chunk, i) => ({
    documentId: doc.id,
    version: doc.version,
    title: doc.title,
    chunkIndex: i,
    header_path: extractHeaderPath(chunk) || doc.title,
  }));

  await collection.upsert({
    ids,
    embeddings,
    metadatas,
    documents: chunks,
  });

  console.log(`[RAG] ✔ Sync completata — ${chunks.length} chunk in ChromaDB`);
  return { chunks: chunks.length };
}

export async function removeDocumentFromRAG(documentId: string): Promise<void> {
  const collection = await getCollection();
  await collection.delete({ where: { documentId } });
  console.log(`[RAG] ✔ Rimossi chunk per documento ${documentId}`);
}
