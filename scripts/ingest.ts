/**
 * Pipeline multi-agente LangGraph per ingestione documenti HR grezzi.
 * Uso: npx tsx scripts/ingest.ts <percorso-file>
 *
 * Nodi:
 *   formatterNode   → testo grezzo → Markdown strutturato + frontmatter YAML
 *   normalizerNode  → normalizza terminologia tramite glossario + LLM
 *   auditNode       → rileva incongruenze, appende sezione Segnalazioni
 *   saveNode        → salva in PostgreSQL come draft v1
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";
import { StateGraph, END, START } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { llm } from "../src/lib/llm.js";
import { prisma } from "../src/lib/prisma.js";

// ---------------------------------------------------------------------------
// Stato del grafo
// ---------------------------------------------------------------------------

const IngestState = Annotation.Root({
  rawText: Annotation<string>(),
  formattedMarkdown: Annotation<string>(),
  normalizedMarkdown: Annotation<string>(),
  finalMarkdown: Annotation<string>(),
  frontmatter: Annotation<{
    codice_procedura?: string;
    data_approvazione?: string;
    approvatore?: string;
    [key: string]: unknown;
  }>(),
  title: Annotation<string>(),
});

// ---------------------------------------------------------------------------
// Glossario di normalizzazione
// ---------------------------------------------------------------------------

interface GlossaryEntry {
  from: string;
  to: string;
}

const glossaryPath = path.resolve("config/glossary.json");
const glossary: { replacements: GlossaryEntry[] } = JSON.parse(
  fs.readFileSync(glossaryPath, "utf-8"),
);

function applyGlossary(text: string): string {
  let result = text;
  for (const { from, to } of glossary.replacements) {
    const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    result = result.replace(re, to);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Nodo 1: Formatter
// ---------------------------------------------------------------------------

async function formatterNode(
  state: typeof IngestState.State,
): Promise<Partial<typeof IngestState.State>> {
  console.log("[LangGraph] ▶ Formatter — conversione in Markdown strutturato...");

  const prompt = `Sei un assistente specializzato in documentazione HR aziendale italiana.
Dato il testo grezzo di una procedura HR, trasformalo in Markdown ben strutturato.

REGOLE:
1. Crea un frontmatter YAML tra --- con i campi: codice_procedura, data_approvazione, approvatore.
   Estraili dal testo se presenti, altrimenti usa "N/D".
2. Il titolo principale diventa # Titolo.
3. Le sezioni numerate diventano ## N. Titolo Sezione.
4. Le sottosezioni diventano ### Sottosezione.
5. Gli elenchi puntati diventano veri elenchi Markdown (- item).
6. Mantieni tutto il contenuto originale, non aggiungere informazioni.
7. Restituisci SOLO il Markdown finale, senza spiegazioni aggiuntive.

TESTO GREZZO:
${state.rawText}`;

  const response = await llm.invoke([new HumanMessage(prompt)]);
  const formattedMarkdown = response.content as string;

  // Estrai frontmatter per metadati strutturati
  const parsed = matter(formattedMarkdown);
  const fm = parsed.data as typeof IngestState.State["frontmatter"];
  const title =
    parsed.content.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
    fm?.codice_procedura ??
    "Procedura senza titolo";

  console.log(
    `[LangGraph] ✓ Formatter completato — titolo: "${title}", codice: ${fm?.codice_procedura ?? "N/D"}`,
  );

  return { formattedMarkdown, frontmatter: fm, title };
}

// ---------------------------------------------------------------------------
// Nodo 2: Normalizer
// ---------------------------------------------------------------------------

async function normalizerNode(
  state: typeof IngestState.State,
): Promise<Partial<typeof IngestState.State>> {
  console.log(
    "[LangGraph] ▶ Normalizer — applicazione glossario e normalizzazione LLM...",
  );

  // Passo 1: sostituzioni deterministiche dal glossario
  const afterGlossary = applyGlossary(state.formattedMarkdown);

  // Passo 2: LLM per casi ambigui e uniformità stilistica
  const prompt = `Sei un editor HR per Il Sole 24 Ore. Revisiona questo documento Markdown applicando queste regole di normalizzazione:

1. Usa sempre "Direzione HR" (mai "Ufficio del Personale", "Risorse Umane", ecc.)
2. Usa sempre "HR Manager" per il responsabile HR
3. Usa "Il Sole 24 Ore" (con spazi) come nome aziendale
4. Standardizza i nomi dei moduli nel formato MOD-XXX/Y (es. MP-042/F → MOD-042/F)
5. Mantieni invariato il frontmatter YAML
6. NON aggiungere contenuti, NON rimuovere informazioni esistenti
7. Restituisci SOLO il Markdown modificato, senza commenti

DOCUMENTO:
${afterGlossary}`;

  const response = await llm.invoke([new HumanMessage(prompt)]);
  const normalizedMarkdown = response.content as string;

  console.log("[LangGraph] ✓ Normalizer completato");
  return { normalizedMarkdown };
}

// ---------------------------------------------------------------------------
// Nodo 3: Audit
// ---------------------------------------------------------------------------

async function auditNode(
  state: typeof IngestState.State,
): Promise<Partial<typeof IngestState.State>> {
  console.log(
    "[LangGraph] ▶ Audit — rilevamento incongruenze e problemi...",
  );

  const prompt = `Sei un auditor di qualità documentale HR. Analizza questo documento Markdown e identifica:

1. Riferimenti circolari (una procedura che cita sé stessa o crea loop)
2. Nomi di responsabili o ruoli che sembrano errati, obsoleti o inconsistenti
3. Riferimenti a moduli, procedure o normative inesistenti o contraddittori
4. Date o versioni inconsistenti
5. Istruzioni ambigue o contraddittorie

Restituisci il documento ORIGINALE con una sezione aggiunta in fondo:

## ⚠️ Segnalazioni e Modifiche Suggerite

Per ogni problema trovato, aggiungi un elemento così:
- **[TIPO]** Descrizione del problema e suggerimento di correzione.

Tipi validi: RIFERIMENTO_CIRCOLARE, RUOLO_ERRATO, RIFERIMENTO_MANCANTE, INCONGRUENZA, AMBIGUITÀ

Se non ci sono problemi, aggiungi ugualmente la sezione con:
- ✅ Nessuna segnalazione rilevata.

Restituisci SOLO il Markdown completo.

DOCUMENTO:
${state.normalizedMarkdown}`;

  const response = await llm.invoke([new HumanMessage(prompt)]);
  const finalMarkdown = response.content as string;

  const issues = (finalMarkdown.match(/^- \*\*\[/gm) ?? []).length;
  console.log(
    `[LangGraph] ✓ Audit completato — ${issues} segnalazione/i rilevata/e`,
  );

  return { finalMarkdown };
}

// ---------------------------------------------------------------------------
// Nodo 4: Save
// ---------------------------------------------------------------------------

async function saveNode(
  state: typeof IngestState.State,
): Promise<Partial<typeof IngestState.State>> {
  console.log("[LangGraph] ▶ Save — salvataggio in PostgreSQL...");

  const doc = await prisma.document.create({
    data: {
      title: state.title,
      content: state.finalMarkdown,
      status: "draft",
      version: 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      frontmatter: (state.frontmatter ?? {}) as any,
      versions: {
        create: {
          version: 1,
          title: state.title,
          content: state.finalMarkdown,
          status: "draft",
        },
      },
    },
  });

  console.log(`[LangGraph] ✔ Salvato — id=${doc.id} title="${doc.title}" status=draft v1`);
  return {};
}

// ---------------------------------------------------------------------------
// Costruzione grafo e run
// ---------------------------------------------------------------------------

const graph = new StateGraph(IngestState)
  .addNode("formatter", formatterNode)
  .addNode("normalizer", normalizerNode)
  .addNode("audit", auditNode)
  .addNode("save", saveNode)
  .addEdge(START, "formatter")
  .addEdge("formatter", "normalizer")
  .addEdge("normalizer", "audit")
  .addEdge("audit", "save")
  .addEdge("save", END)
  .compile();

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: npx tsx scripts/ingest.ts <percorso-file>");
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`File non trovato: ${absolutePath}`);
    process.exit(1);
  }

  const rawText = fs.readFileSync(absolutePath, "utf-8");
  console.log(
    `\n[LangGraph] 🚀 Avvio pipeline ingestione: ${path.basename(absolutePath)} (${rawText.length} caratteri)`,
  );
  console.log("[LangGraph] Pipeline: formatter → normalizer → audit → save\n");

  await graph.invoke({ rawText });

  console.log("\n[LangGraph] 🏁 Pipeline completata con successo.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[LangGraph] ❌ Errore fatale:", err);
  prisma.$disconnect();
  process.exit(1);
});
