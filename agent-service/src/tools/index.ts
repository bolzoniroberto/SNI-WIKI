/**
 * Tool definitions exposed to the Gemini model. The agent runs a tool-use
 * loop: it can call `search_pages`, `get_page`, `propose_edit`. Writes are
 * never executed automatically — propose_edit only stores a proposal in
 * `sni.agent_proposals`; an admin must approve via the UI to apply it.
 */
import type { FunctionDeclaration } from "@google/genai";
import { Type } from "@google/genai";
import { query } from "../db.js";
import { getPage, searchPages } from "../wikijs.js";

export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: "search_pages",
    description: "Cerca pagine del wiki per parola chiave o codice procedura.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Testo da cercare" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_page",
    description: "Recupera contenuto markdown completo di una pagina.",
    parameters: {
      type: Type.OBJECT,
      properties: { page_id: { type: Type.NUMBER } },
      required: ["page_id"],
    },
  },
  {
    name: "propose_edit",
    description:
      "Propone una modifica a una pagina. NON applica la modifica: la registra come proposta in attesa di approvazione admin.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        page_id: { type: Type.NUMBER },
        new_content: { type: Type.STRING, description: "Markdown completo aggiornato" },
        rationale: { type: Type.STRING, description: "Spiegazione della modifica" },
      },
      required: ["page_id", "new_content", "rationale"],
    },
  },
];

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { adminUser: string; requestText: string },
): Promise<unknown> {
  switch (name) {
    case "search_pages":
      return searchPages(String(args.query));

    case "get_page":
      return getPage(Number(args.page_id));

    case "propose_edit": {
      const pageId = Number(args.page_id);
      const before = await getPage(pageId);
      const proposal = await query<{ id: number }>(
        `INSERT INTO sni.agent_proposals (admin_user, request, diff, status)
         VALUES ($1, $2, $3::jsonb, 'pending') RETURNING id`,
        [
          ctx.adminUser,
          ctx.requestText,
          JSON.stringify([
            {
              page_id: pageId,
              path: before.path,
              before: before.content,
              after: String(args.new_content),
              rationale: String(args.rationale),
            },
          ]),
        ],
      );
      return { proposal_id: proposal.rows[0].id, status: "pending" };
    }

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
