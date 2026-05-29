"use client";

import { useState, useRef, useEffect } from "react";

type Source = {
  ref: number;
  documentId: string;
  title?: string;
  header_path?: string;
  score?: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

export function ChatDrawer({
  open,
  onClose,
  onOpenDocument,
}: {
  open: boolean;
  onClose: () => void;
  onOpenDocument: (id: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, sources: data.sources ?? [] },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Errore: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`fixed inset-y-0 right-0 w-[420px] bg-white border-l border-slate-200 shadow-xl flex flex-col transition-transform z-30 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="p-3 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Chatta con le Procedure</h2>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-900 text-lg"
          aria-label="Chiudi"
        >
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-slate-500">
            Fai una domanda sulle procedure HR attive. Es: <em>“Qual è la procedura per richiedere le ferie?”</em>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm rounded-lg px-3 py-2 ${
              m.role === "user"
                ? "bg-slate-900 text-white ml-8"
                : "bg-slate-100 text-slate-900 mr-8"
            }`}
          >
            <div className="whitespace-pre-wrap">{m.content}</div>
            {m.sources && m.sources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-300/50 text-xs text-slate-600">
                <div className="font-medium mb-1">Fonti:</div>
                <ul className="space-y-0.5">
                  {m.sources.map((s) => (
                    <li key={s.ref}>
                      <button
                        onClick={() => onOpenDocument(s.documentId)}
                        className="underline hover:text-slate-900 text-left"
                      >
                        [{s.ref}] {s.title ?? s.documentId}
                        {s.header_path && (
                          <span className="text-slate-500"> — {s.header_path}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-sm text-slate-500 italic">L&apos;assistente sta pensando…</div>
        )}
      </div>

      <div className="p-3 border-t border-slate-200 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Scrivi una domanda…"
          className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-slate-500"
          disabled={loading}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="bg-slate-900 text-white px-3 py-1.5 rounded text-sm disabled:opacity-40"
        >
          Invia
        </button>
      </div>
    </div>
  );
}
