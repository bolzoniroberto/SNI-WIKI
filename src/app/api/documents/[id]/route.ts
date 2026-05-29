import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DocStatus } from "@prisma/client";
import { syncDocument, removeDocumentFromRAG } from "@/lib/rag/sync";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(doc);
}

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  status: z.nativeEnum(DocStatus).optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.document.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const nextTitle = parsed.data.title ?? existing.title;
  const nextContent = parsed.data.content ?? existing.content;
  const nextStatus = parsed.data.status ?? existing.status;

  const contentChanged =
    parsed.data.content !== undefined && parsed.data.content !== existing.content;
  const titleChanged =
    parsed.data.title !== undefined && parsed.data.title !== existing.title;
  const shouldBumpVersion = contentChanged || titleChanged;
  const nextVersion = shouldBumpVersion ? existing.version + 1 : existing.version;

  const updated = await prisma.document.update({
    where: { id },
    data: {
      title: nextTitle,
      content: nextContent,
      status: nextStatus,
      version: nextVersion,
      ...(shouldBumpVersion && {
        versions: {
          create: {
            version: nextVersion,
            title: nextTitle,
            content: nextContent,
            status: nextStatus,
          },
        },
      }),
    },
  });

  // Sync RAG: chunki + upsert quando il documento diventa attivo o viene
  // aggiornato mentre già attivo. Rimuovi dai chunk se passa fuori da active.
  try {
    if (nextStatus === "active") {
      await syncDocument({
        id: updated.id,
        title: updated.title,
        content: updated.content,
        version: updated.version,
      });
    } else if (existing.status === "active") {
      await removeDocumentFromRAG(updated.id);
    }
  } catch (err) {
    console.error("[RAG] Errore durante sync (documento salvato comunque):", err);
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.document.delete({ where: { id } });
  try {
    await removeDocumentFromRAG(id);
  } catch (err) {
    console.error("[RAG] Errore rimozione chunk:", err);
  }
  return NextResponse.json({ ok: true });
}
