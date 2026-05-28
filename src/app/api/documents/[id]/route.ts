import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DocStatus } from "@prisma/client";

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

  // FASE 3 hook (stub): se passa ad active, sincronizza con ChromaDB
  if (nextStatus === "active" && existing.status !== "active") {
    console.log(`[RAG] (stub) sync attivazione documento ${id} v${nextVersion}`);
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await prisma.document.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
