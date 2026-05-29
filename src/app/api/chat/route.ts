import { NextResponse } from "next/server";
import { z } from "zod";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getCollection } from "@/lib/rag/chroma";
import { embedOne } from "@/lib/rag/embeddings";
import { llm } from "@/lib/llm";

const BodySchema = z.object({
  message: z.string().min(1),
  topK: z.number().int().min(1).max(20).optional(),
});

type ChunkMeta = {
  documentId?: string;
  version?: number;
  title?: string;
  header_path?: string;
  chunkIndex?: number;
};

export async function POST(req: Request) {
  const json = await req.json();
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { message, topK = 5 } = parsed.data;

  console.log(`[Chat] Query: "${message}"`);

  // 1. Embed query e similarity search filtrata su status=active.
  //    Nota: il filtro su status non serve, perché in Chroma ci finiscono SOLO
  //    documenti active (cf. sync.ts). Lo lasciamo implicito.
  const queryEmbedding = await embedOne(message);
  const collection = await getCollection();
  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
  });

  const docs = results.documents?.[0] ?? [];
  const metas = (results.metadatas?.[0] ?? []) as ChunkMeta[];
  const distances = results.distances?.[0] ?? [];

  if (docs.length === 0) {
    return NextResponse.json({
      answer:
        "Non ho trovato procedure pertinenti. Verifica che ci siano documenti in stato 'active' nella wiki.",
      sources: [],
    });
  }

  console.log(`[Chat] ${docs.length} chunk recuperati`);

  // 2. Costruisci contesto numerato
  const contextBlocks = docs.map((doc, i) => {
    const m = metas[i] ?? {};
    return `[${i + 1}] (${m.title ?? "Documento"} — ${m.header_path ?? ""})\n${doc}`;
  });

  const system = new SystemMessage(
    `Sei l'assistente HR del Sole 24 Ore. Rispondi in italiano basandoti ESCLUSIVAMENTE sulle procedure fornite nel CONTESTO. ` +
      `Se la risposta non è nel contesto, dichiaralo esplicitamente. ` +
      `Cita le fonti usando i numeri tra parentesi quadre, es. [1], [2]. ` +
      `Sii conciso e operativo: l'utente vuole sapere COSA fare, non leggere la procedura intera.`,
  );

  const userPrompt = `CONTESTO:\n\n${contextBlocks.join("\n\n---\n\n")}\n\nDOMANDA: ${message}`;

  const response = await llm.invoke([system, new HumanMessage(userPrompt)]);
  const answer = response.content as string;

  // 3. Dedupe sources per documentId
  const seen = new Set<string>();
  const sources = metas
    .map((m, i) => ({
      ref: i + 1,
      documentId: m.documentId,
      title: m.title,
      header_path: m.header_path,
      score: distances[i],
    }))
    .filter((s) => {
      if (!s.documentId) return false;
      if (seen.has(s.documentId)) return false;
      seen.add(s.documentId);
      return true;
    });

  return NextResponse.json({ answer, sources });
}
