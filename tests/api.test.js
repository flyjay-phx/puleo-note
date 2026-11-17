// 실행: npm test  (메모리 DB로 실제 HTTP 요청을 보내 확인한다)
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createMemoryPool } = require("../src/db");
const { createApp } = require("../src/app");
const { validateNote, ValidationError } = require("../src/notes");

let server, base;
before(async () => {
  server = createApp(createMemoryPool({ seed: true })).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

const H = { "content-type": "application/json" };
async function call(path, { method = "GET", body, raw } = {}) {
  const res = await fetch(base + path, { method, headers: H, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}
const sample = { title: "테스트 메모", original_text: "원문", easy_text: "쉽게", one_liner: "한 줄", status: "review", node: 3, tags: "a, #b, a" };

test("시연 메모 3건이 최신순으로 나온다", async () => {
  const { status, data } = await call("/notes");
  assert.equal(status, 200);
  assert.ok(data.length >= 3);
  const times = data.map((n) => n.updated_at);
  assert.deepEqual(times, [...times].sort().reverse());
});

test("만들기 → 읽기 → 고치기 → 지우기", async () => {
  const c = await call("/notes", { method: "POST", body: sample });
  assert.equal(c.status, 201);
  assert.deepEqual(c.data.tags, ["a", "b"]); // # 제거, 중복 제거
  assert.equal(c.data.status, "review");
  assert.equal(c.data.node, 3);

  const g = await call(`/notes/${c.data.id}`);
  assert.equal(g.status, 200);
  assert.equal(g.data.easy_text, "쉽게");

  const u = await call(`/notes/${c.data.id}`, { method: "PUT", body: { ...sample, title: "고친 제목", status: "done", node: "" } });
  assert.equal(u.status, 200);
  assert.equal(u.data.title, "고친 제목");
  assert.equal(u.data.status, "done");
  assert.equal(u.data.node, null);
  assert.ok(new Date(u.data.updated_at) >= new Date(u.data.created_at));

  const d = await call(`/notes/${c.data.id}`, { method: "DELETE" });
  assert.equal(d.status, 204);
  assert.equal((await call(`/notes/${c.data.id}`)).status, 404);
  assert.equal((await call(`/notes/${c.data.id}`, { method: "DELETE" })).status, 404);
});

test("제목 검색과 상태·노드·태그 거르기", async () => {
  await call("/notes", { method: "POST", body: { ...sample, title: "거르기용 Zeta", status: "new", node: 42, tags: ["유일태그"] } });
  assert.equal((await call("/notes?q=zeta")).data.length, 1); // 대소문자 무시
  assert.ok((await call("/notes?status=new")).data.every((n) => n.status === "new"));
  assert.equal((await call("/notes?node=42")).data.length, 1);
  assert.equal((await call("/notes?tag=" + encodeURIComponent("#유일태그"))).data.length, 1);
  assert.equal((await call("/notes?q=" + encodeURIComponent("없는제목xyz"))).data.length, 0);
});

test("빈 제목·빈 원문·잘못된 값은 400과 칸별 이유", async () => {
  const r = await call("/notes", { method: "POST", body: { title: "  ", original_text: "", status: "x", node: 100, tags: Array(11).fill(0).map((_, i) => "t" + i) } });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.data.fields).sort(), ["node", "original_text", "status", "tags", "title"]);
});

test("길이 제한", () => {
  assert.throws(() => validateNote({ title: "가".repeat(121), original_text: "a" }), ValidationError);
  assert.throws(() => validateNote({ title: "a", original_text: "a", one_liner: "a".repeat(201) }), ValidationError);
  assert.doesNotThrow(() => validateNote({ title: "가".repeat(120), original_text: "a".repeat(16000) }));
});

test("없는 번호·이상한 번호는 404, 깨진 JSON은 400", async () => {
  assert.equal((await call("/notes/999999")).status, 404);
  assert.equal((await call("/notes/abc")).status, 404);
  assert.equal((await call("/notes/-1", { method: "PUT", body: sample })).status, 404);
  assert.equal((await call("/notes/999999", { method: "PUT", body: sample })).status, 404);
  assert.equal((await call("/notes", { method: "POST", raw: "{깨진" })).status, 400);
  assert.equal((await call("/nope")).status, 404);
});

test("SQL 주입 시도는 그냥 글자로 저장된다", async () => {
  const evil = "'); drop table notes; --";
  const c = await call("/notes", { method: "POST", body: { ...sample, title: evil } });
  assert.equal(c.status, 201);
  assert.equal(c.data.title, evil);
  assert.equal((await call("/notes")).status, 200); // 표가 그대로 있다
  assert.equal((await call("/notes?q=" + encodeURIComponent("' or 1=1 --"))).data.length, 0);
});
