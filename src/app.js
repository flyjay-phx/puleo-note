// Express 앱: /api/notes CRUD 5개 + 화면 파일 제공
const path = require("path");
const express = require("express");
const { validateNote, parseId, repo, ValidationError } = require("./notes");

function createApp(pool, { mode = "memory" } = {}) {
  const notes = repo(pool);
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  // 비동기 라우트의 오류를 아래 오류 처리기로 넘긴다
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  app.get("/api/health", (req, res) => res.json({ ok: true, mode }));

  app.get("/api/notes", wrap(async (req, res) => {
    const { q, status, node, tag } = req.query;
    res.json(await notes.list({ q, status, node, tag }));
  }));

  app.post("/api/notes", wrap(async (req, res) => {
    const note = await notes.create(validateNote(req.body));
    res.status(201).json(note);
  }));

  app.get("/api/notes/:id", wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const note = id && (await notes.get(id));
    if (!note) return res.status(404).json({ error: "메모를 찾을 수 없어요." });
    res.json(note);
  }));

  app.put("/api/notes/:id", wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(404).json({ error: "메모를 찾을 수 없어요." });
    const note = await notes.update(id, validateNote(req.body));
    if (!note) return res.status(404).json({ error: "메모를 찾을 수 없어요." });
    res.json(note);
  }));

  app.delete("/api/notes/:id", wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id || !(await notes.remove(id))) return res.status(404).json({ error: "메모를 찾을 수 없어요." });
    res.status(204).end();
  }));

  app.use("/api", (req, res) => res.status(404).json({ error: "없는 주소예요." }));

  // 오류 처리: 입력 오류는 400, JSON 형식 오류는 400, 나머지는 500(내부 내용은 숨김)
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message, fields: err.errors });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "요청 형식이 올바르지 않아요." });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "내용이 너무 길어요." });
    console.error(err);
    res.status(500).json({ error: "서버에서 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요." });
  });

  return app;
}

module.exports = { createApp };
