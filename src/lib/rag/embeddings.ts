/**
 * Wrapper embeddings on-device usando @xenova/transformers (MiniLM-L6-v2, 384-dim).
 * Niente API key, niente rete oltre il primo download del modello (cached).
 */

import { pipeline, env, type FeatureExtractionPipeline } from "@xenova/transformers";

// Permetti download remoto del modello al primo run
env.allowLocalModels = false;
env.useBrowserCache = false;

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    console.log(`[Embeddings] Caricamento modello ${MODEL_ID} (primo run scarica ~25MB)...`);
    extractorPromise = pipeline("feature-extraction", MODEL_ID) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

export async function embed(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  const vectors: number[][] = [];
  for (const text of texts) {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    vectors.push(Array.from(output.data as Float32Array));
  }
  return vectors;
}

export async function embedOne(text: string): Promise<number[]> {
  const [vec] = await embed([text]);
  return vec;
}

export const EMBEDDING_DIM = 384;
