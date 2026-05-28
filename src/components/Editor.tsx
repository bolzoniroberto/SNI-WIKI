"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { DocStatus } from "@prisma/client";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

export type DocFull = {
  id: string;
  title: string;
  content: string;
  status: DocStatus;
  version: number;
  updatedAt: string;
};

export function Editor({
  doc,
  onSaved,
}: {
  doc: DocFull;
  onSaved: (updated: DocFull) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [status, setStatus] = useState<DocStatus>(doc.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(doc.title);
    setContent(doc.content);
    setStatus(doc.status);
    setError(null);
  }, [doc.id, doc.title, doc.content, doc.status]);

  const dirty =
    title !== doc.title || content !== doc.content || status !== doc.status;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = (await res.json()) as DocFull;
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full" data-color-mode="light">
      <div className="border-b border-slate-200 p-3 flex items-center gap-3 bg-white">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 text-lg font-semibold bg-transparent outline-none border-b border-transparent focus:border-slate-300"
          placeholder="Titolo procedura"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as DocStatus)}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value="draft">draft</option>
          <option value="active">active</option>
          <option value="archived">archived</option>
        </select>
        <span className="text-xs text-slate-500">v{doc.version}</span>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="bg-slate-900 text-white px-3 py-1.5 rounded text-sm disabled:opacity-40"
        >
          {saving ? "Salvataggio…" : "Salva"}
        </button>
      </div>
      {error && (
        <div className="p-2 text-sm text-red-700 bg-red-50 border-b border-red-200">
          Errore: {error}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <MDEditor
          value={content}
          onChange={(v) => setContent(v ?? "")}
          height="100%"
          preview="live"
          visibleDragbar={false}
        />
      </div>
    </div>
  );
}
