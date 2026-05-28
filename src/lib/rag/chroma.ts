import { ChromaClient, type Collection } from "chromadb";

export const COLLECTION_NAME = "procedures";

const url = new URL(process.env.CHROMA_URL ?? "http://localhost:8000");

export const chroma = new ChromaClient({
  host: url.hostname,
  port: Number(url.port) || 8000,
  ssl: url.protocol === "https:",
});

let collectionPromise: Promise<Collection> | null = null;

export function getCollection(): Promise<Collection> {
  if (!collectionPromise) {
    collectionPromise = chroma.getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { description: "Procedure HR Il Sole 24 Ore — chunk per RAG" },
    });
  }
  return collectionPromise;
}
