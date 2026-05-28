"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar, type DocListItem } from "@/components/Sidebar";
import { Editor, type DocFull } from "@/components/Editor";

export default function Home() {
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [current, setCurrent] = useState<DocFull | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshList = useCallback(async () => {
    const res = await fetch("/api/documents", { cache: "no-store" });
    const data = (await res.json()) as DocListItem[];
    setDocs(data);
    return data;
  }, []);

  useEffect(() => {
    refreshList().then((data) => {
      if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
    });
  }, [refreshList, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setCurrent(null);
      return;
    }
    setLoading(true);
    fetch(`/api/documents/${selectedId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: DocFull) => setCurrent(d))
      .finally(() => setLoading(false));
  }, [selectedId]);

  async function handleNew() {
    const title = prompt("Titolo nuovo documento?");
    if (!title) return;
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content: `# ${title}\n\n` }),
    });
    if (!res.ok) {
      alert("Errore creazione documento");
      return;
    }
    const created = (await res.json()) as DocFull;
    await refreshList();
    setSelectedId(created.id);
  }

  function handleSaved(updated: DocFull) {
    setCurrent(updated);
    refreshList();
  }

  return (
    <main className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        docs={docs}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNew={handleNew}
      />
      {current && !loading ? (
        <Editor doc={current} onSaved={handleSaved} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          {loading ? "Caricamento…" : "Seleziona o crea un documento"}
        </div>
      )}
    </main>
  );
}
