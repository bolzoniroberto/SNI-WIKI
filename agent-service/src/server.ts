import express from "express";
import { z } from "zod";
import { config } from "./config.js";
import { query } from "./db.js";
import { runAgent, type ChatTurn } from "./gemini.js";
import { requireAdmin } from "./auth.js";
import { updatePage } from "./wikijs.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

const ChatSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string() }))
    .default([]),
});

app.post("/chat", requireAdmin, async (req, res) => {
  const parsed = ChatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  try {
    const out = await runAgent(
      parsed.data.history as ChatTurn[],
      parsed.data.message,
      req.auth!.user,
    );
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get("/proposals", requireAdmin, async (_req, res) => {
  const r = await query(
    `SELECT id, admin_user, request, status, created_at, decided_at
     FROM sni.agent_proposals ORDER BY id DESC LIMIT 100`,
  );
  res.json(r.rows);
});

app.get("/proposals/:id", requireAdmin, async (req, res) => {
  const r = await query(
    `SELECT * FROM sni.agent_proposals WHERE id=$1`,
    [Number(req.params.id)],
  );
  if (!r.rows.length) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(r.rows[0]);
});

app.post("/proposals/:id/approve", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const r = await query<{ diff: { page_id: number; after: string }[]; status: string }>(
    `SELECT diff, status FROM sni.agent_proposals WHERE id=$1 FOR UPDATE`,
    [id],
  );
  if (!r.rows.length) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (r.rows[0].status !== "pending") {
    res.status(409).json({ error: `proposal already ${r.rows[0].status}` });
    return;
  }
  try {
    for (const change of r.rows[0].diff) {
      await updatePage(change.page_id, change.after);
    }
    await query(
      `UPDATE sni.agent_proposals SET status='applied', decided_at=now() WHERE id=$1`,
      [id],
    );
    res.json({ status: "applied" });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post("/proposals/:id/reject", requireAdmin, async (req, res) => {
  await query(
    `UPDATE sni.agent_proposals SET status='rejected', decided_at=now()
     WHERE id=$1 AND status='pending'`,
    [Number(req.params.id)],
  );
  res.json({ status: "rejected" });
});

app.listen(config.port, () => {
  console.log(`agent-service listening on :${config.port}`);
});
