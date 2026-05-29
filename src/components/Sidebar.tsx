"use client";

import type { DocStatus } from "@prisma/client";

export type DocListItem = {
  id: string;
  title: string;
  status: DocStatus;
  version: number;
  updatedAt: string;
};

const statusStyle: Record<DocStatus, string> = {
  draft: "bg-amber-100 text-amber-800 border-amber-200",
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  archived: "bg-slate-100 text-slate-600 border-slate-200",
};

export function Sidebar({
  docs,
  selectedId,
  onSelect,
  onNew,
}: {
  docs: DocListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-slate-200 bg-slate-50 flex flex-col h-full">
      <div className="p-3 border-b border-slate-200 flex items-center justify-between">
        <h1 className="font-semibold text-slate-800">Procedure HR</h1>
        <button
          onClick={onNew}
          className="text-sm bg-slate-900 text-white px-2 py-1 rounded hover:bg-slate-700"
        >
          + Nuovo
        </button>
      </div>
      <ul className="overflow-y-auto flex-1">
        {docs.length === 0 && (
          <li className="p-4 text-sm text-slate-500">
            Nessun documento. Creane uno.
          </li>
        )}
        {docs.map((d) => (
          <li key={d.id}>
            <button
              onClick={() => onSelect(d.id)}
              className={`w-full text-left px-3 py-2 border-b border-slate-200 hover:bg-slate-100 ${
                selectedId === d.id ? "bg-white" : ""
              }`}
            >
              <div className="text-sm font-medium text-slate-800 truncate">
                {d.title}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${statusStyle[d.status]}`}
                >
                  {d.status}
                </span>
                <span className="text-[10px] text-slate-500">v{d.version}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
