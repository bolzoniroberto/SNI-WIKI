import { GoogleGenAI, type Content } from "@google/genai";
import { config } from "./config.js";
import { runTool, toolDeclarations } from "./tools/index.js";

const SYSTEM = `Sei un assistente per amministratori di un wiki normativo
aziendale italiano. Aiuti l'admin a proporre modifiche guidate alle
procedure. Procedi sempre così:

1. Comprendi la richiesta in linguaggio naturale.
2. Usa search_pages per trovare i documenti coinvolti.
3. Per ciascun documento candidato, chiama get_page per leggerne il
   contenuto completo.
4. Genera la versione modificata e chiama propose_edit (mai modifiche
   dirette: l'admin approva manualmente).
5. Riassumi le proposte create elencando page_id, percorso e motivazione.

Sii conservativo: non riscrivere sezioni non pertinenti. Mantieni il
frontmatter YAML invariato salvo richiesta esplicita.`;

const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

export async function runAgent(
  history: ChatTurn[],
  userMessage: string,
  adminUser: string,
): Promise<{ reply: string; toolEvents: { name: string; args: unknown; result: unknown }[] }> {
  const contents: Content[] = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: "user" as const, parts: [{ text: userMessage }] },
  ];

  const toolEvents: { name: string; args: unknown; result: unknown }[] = [];

  for (let step = 0; step < 8; step++) {
    const resp = await client.models.generateContent({
      model: config.geminiModel,
      contents,
      config: {
        systemInstruction: SYSTEM,
        tools: [{ functionDeclarations: toolDeclarations }],
        temperature: 0.2,
      },
    });

    const candidate = resp.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);

    if (calls.length === 0) {
      const text = parts.map((p) => p.text ?? "").join("").trim();
      return { reply: text, toolEvents };
    }

    contents.push({ role: "model", parts });

    const responseParts = [];
    for (const c of calls) {
      const fc = c.functionCall!;
      const args = (fc.args ?? {}) as Record<string, unknown>;
      let result: unknown;
      try {
        result = await runTool(fc.name!, args, { adminUser, requestText: userMessage });
      } catch (e) {
        result = { error: (e as Error).message };
      }
      toolEvents.push({ name: fc.name!, args, result });
      responseParts.push({
        functionResponse: { name: fc.name!, response: { result } },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return {
    reply: "(loop interrotto: troppe iterazioni, controlla le proposte create)",
    toolEvents,
  };
}
