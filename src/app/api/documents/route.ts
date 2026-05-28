import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const docs = await prisma.document.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, status: true, version: true, updatedAt: true },
  });
  return NextResponse.json(docs);
}

const CreateSchema = z.object({
  title: z.string().min(1),
  content: z.string().default(""),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { title, content } = parsed.data;
  const doc = await prisma.document.create({
    data: {
      title,
      content,
      status: "draft",
      version: 1,
      versions: {
        create: { version: 1, title, content, status: "draft" },
      },
    },
  });
  return NextResponse.json(doc, { status: 201 });
}
