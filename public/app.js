// 풀어노트 화면: 해시 주소로 화면을 바꾼다
//   #/              목록
//   #/new           새 메모
//   #/note/:id      상세
//   #/note/:id/edit 수정
"use strict";

const STATUS = {
  new: { label: "처음 봄" },
  review: { label: "다시 볼 것" },
  done: { label: "이해 완료" },
};
const view = document.getElementById("view");
const filters = { q: "", status: "", node: "", tag: "" };

// ---------- 작은 도우미 ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c))); // 글자는 항상 텍스트로 넣어 HTML 주입을 막는다
  }
  return el;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 2600);
}

async function api(path, options = {}) {
  let res;
  try {
    res = await fetch("/api" + path, {
      headers: { "content-type": "application/json" },
      ...options,
    });
  } catch {
    throw Object.assign(new Error("서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요."), { status: 0 });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "요청을 처리하지 못했어요."), { status: res.status, fields: data.fields });
  return data;
}

const fmt = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};
const nodeLabel = (n) => `노드 ${String(n).padStart(2, "0")}`;

function badges(note, { clickableTags = false } = {}) {
  return [
    h("span", { class: "badge " + note.status }, STATUS[note.status].label),
    note.node !== null ? h("span", { class: "badge node" }, nodeLabel(note.node)) : null,
    ...note.tags.map((t) =>
      clickableTags
        ? h("button", { class: "tag", type: "button", onclick: (e) => { e.preventDefault(); e.stopPropagation(); filters.tag = t; location.hash = "#/"; render(); } }, "#" + t)
        : h("span", { class: "tag" }, "#" + t)
    ),
  ];
}

function showError(err) {
  view.replaceChildren(
    h("div", { class: "empty-box" },
      h("h2", {}, err.status === 404 ? "메모를 찾을 수 없어요" : "문제가 생겼어요"),
      h("p", {}, err.message),
      h("a", { href: "#/", class: "btn" }, "목록으로")
    )
  );
}

// ---------- 목록 ----------
let allNodes = [];
async function renderList() {
  document.title = "풀어노트 — 수업 직후, 내 말로 다시 풀기";
  // 노드 고르기 목록을 먼저 채운 뒤 화면을 한 번만 그린다 (다시 그리면서 클릭이 사라지는 것을 막음)
  const counts = { "": 0, new: 0, review: 0, done: 0 };
  try {
    const all = await api("/notes");
    allNodes = [...new Set(all.map((n) => n.node).filter((n) => n !== null))].sort((a, b) => a - b);
    counts[""] = all.length;
    for (const n of all) counts[n.status]++;
  } catch { /* 아래 목록 불러오기에서 오류를 알려 준다 */ }

  // 맨 위 진행 요약: 전체 중 얼마나 이해했는지 막대로 보여 준다
  const total = counts[""];
  const pct = (n) => (total ? (n / total) * 100 : 0);
  const summary = h("section", { class: "summary" },
    h("h1", {}, counts.review
      ? ["다시 볼 메모가 ", h("span", { class: "hl" }, `${counts.review}개`), " 있어요"]
      : total ? ["전부 ", h("span", { class: "hl" }, "한 번씩 풀어 봤어요")] : "오늘 배운 걸 풀어 볼까요"),
    total ? h("div", { class: "progress", role: "img", "aria-label": `전체 ${total}개 중 이해 완료 ${counts.done}개, 다시 볼 것 ${counts.review}개` },
      h("div", { class: "nums" }, h("span", {}, "이해 완료"), h("b", {}, `${counts.done} / ${total}`)),
      h("div", { class: "bar" },
        h("i", { class: "done", style: `width:${pct(counts.done)}%` }),
        h("i", { class: "review", style: `width:${pct(counts.review)}%` }))
    ) : null
  );

  const search = h("input", {
    class: "search", type: "search", placeholder: "제목으로 찾기", value: filters.q, "aria-label": "제목 검색",
  });
  let debounce;
  search.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { filters.q = search.value; loadCards(); }, 250);
  });

  const statusChips = [["", "전체"], ["new", "처음 봄"], ["review", "다시 볼 것"], ["done", "이해 완료"]].map(([v, label]) =>
    h("button", {
      class: "chip" + (v ? " s-" + v : ""), type: "button", "aria-pressed": String(filters.status === v),
      onclick: () => { filters.status = v; renderList(); },
    }, label, h("span", { class: "n" }, counts[v]))
  );

  const nodeSelect = h("select", { "aria-label": "노드로 거르기", onchange: (e) => { filters.node = e.target.value; loadCards(); } },
    h("option", { value: "" }, "모든 노드"),
    ...allNodes.map((n) => h("option", { value: String(n), selected: String(n) === filters.node }, nodeLabel(n)))
  );

  const tagInfo = filters.tag
    ? h("span", { class: "active-tag" }, `#${filters.tag} 메모만 보는 중 `,
        h("button", { type: "button", onclick: () => { filters.tag = ""; renderList(); } }, "해제"))
    : null;

  const count = h("p", { class: "count" });
  const grid = h("div", { class: "grid" });
  view.replaceChildren(summary, h("section", { class: "tools" }, search, h("div", { class: "filters" }, ...statusChips, nodeSelect, tagInfo)), count, grid);

  async function loadCards() {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v !== "") p.set(k, v);
    grid.replaceChildren(h("p", { class: "loading" }, "불러오는 중…"));
    let notes;
    try {
      notes = await api("/notes?" + p.toString());
    } catch (err) {
      grid.replaceChildren();
      count.textContent = "";
      return toast(err.message, true);
    }
    const anyFilter = Object.values(filters).some((v) => v !== "");
    count.textContent = notes.length && anyFilter ? `조건에 맞는 메모 ${notes.length}개` : "";
    if (!notes.length) {
      grid.replaceChildren(
        h("div", { class: "empty-box", style: "grid-column: 1 / -1" },
          h("h2", {}, anyFilter ? "조건에 맞는 메모가 없어요" : "아직 메모가 없어요"),
          h("p", {}, anyFilter ? "검색어나 거르기 조건을 바꿔 보세요." : "오늘 수업에서 들은 걸 적고, 내 말로 한 번 풀어 써 보세요."),
          anyFilter ? null : h("a", { class: "btn primary", href: "#/new" }, "+ 첫 메모 쓰기")
        )
      );
      return;
    }
    grid.replaceChildren(...notes.map((n) =>
      h("a", { class: "card", href: `#/note/${n.id}` },
        n.one_liner ? h("div", { class: "liner" }, h("span", { class: "hl" }, n.one_liner)) : h("div", { class: "liner empty" }, "오늘의 한 줄을 아직 안 적었어요"),
        h("div", { class: "title" }, n.title),
        h("div", { class: "meta" }, ...badges(n, { clickableTags: true }), h("span", { class: "date" }, fmt(n.updated_at)))
      )
    ));
  }
  await loadCards();
}

// ---------- 상세 ----------
async function renderDetail(id) {
  view.replaceChildren(h("p", { class: "loading" }, "불러오는 중…"));
  let note;
  try { note = await api("/notes/" + id); } catch (err) { return showError(err); }
  document.title = `${note.title} — 풀어노트`;

  const delBtn = h("button", { class: "btn danger", type: "button" }, "삭제");
  delBtn.addEventListener("click", async () => {
    if (!confirm(`'${note.title}' 메모를 지울까요? 지우면 되돌릴 수 없어요.`)) return;
    delBtn.disabled = true;
    try {
      await api("/notes/" + id, { method: "DELETE" });
      toast("메모를 지웠어요.");
      location.hash = "#/";
    } catch (err) {
      delBtn.disabled = false;
      toast(err.message, true);
    }
  });

  const switches = Object.entries(STATUS).map(([v, { label }]) => {
    const b = h("button", { class: "chip", type: "button", "aria-pressed": String(note.status === v) }, label);
    b.addEventListener("click", async () => {
      if (note.status === v) return;
      switches.forEach((s) => (s.disabled = true));
      try {
        note = await api("/notes/" + id, { method: "PUT", body: JSON.stringify({ ...note, status: v }) });
        toast(`'${label}'(으)로 바꿨어요.`);
        renderDetail(id);
      } catch (err) {
        switches.forEach((s) => (s.disabled = false));
        toast(err.message, true);
      }
    });
    return b;
  });

  const easyBody = note.easy_text
    ? h("div", { class: "body" }, note.easy_text)
    : h("div", { class: "body empty" }, "아직 풀어 쓰지 않았어요. '수정'을 눌러 초등학생도 알아듣게 다시 써 보세요.");

  view.replaceChildren(
    h("a", { href: "#/", class: "back" }, "← 목록"),
    h("article", { class: "panel" },
      h("div", { class: "detail-head" },
        h("div", {}, h("h1", {}, note.title), h("div", { class: "meta" }, ...badges(note))),
        h("div", { class: "actions" }, h("a", { class: "btn", href: `#/note/${id}/edit` }, "수정"), delBtn)
      ),
      note.one_liner ? h("div", { class: "liner-box" }, h("small", {}, "오늘의 한 줄"), h("span", { class: "hl" }, note.one_liner)) : null,
      h("div", { class: "pair" },
        h("section", { class: "pane" }, h("h2", {}, "수업 메모 원문"), h("div", { class: "body" }, note.original_text)),
        h("section", { class: "pane easy" }, h("h2", {}, "내 말로 풀어 쓰기"), easyBody)
      ),
      kidSection(note, easyBody),
      h("div", { class: "status-switch" }, h("span", {}, "복습 상태"), ...switches),
      h("p", { class: "times" }, `만든 날 ${fmt(note.created_at)} · 고친 날 ${fmt(note.updated_at)}`)
    )
  );
}

// ---------- AI 초등학생에게 읽혀 보기 (키 없이 브라우저 안에서 도는 AI) ----------
// 메모는 서버나 외부로 보내지 않는다. 모델 파일(약 1GB)만 처음 한 번 내려받아 브라우저에 보관된다.
const WEB_LLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm";
let kidEngine = null;
let kidEngineLoading = null;
let kidProgress = () => {};
const kidResults = new Map(); // 메모 id → { easy_text, result } (같은 설명이면 다시 보여 준다)
const loadKidCheck = () => import("./kid-check.mjs");

async function webGpuReady() {
  try { return !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch { return false; }
}

function getKidEngine() {
  if (kidEngine) return Promise.resolve(kidEngine);
  if (!kidEngineLoading) {
    kidEngineLoading = (async () => {
      const [kc, wl] = await Promise.all([loadKidCheck(), import(WEB_LLM_URL)]);
      const worker = new Worker("llm-worker.js", { type: "module" });
      kidEngine = await wl.CreateWebWorkerMLCEngine(worker, kc.MODEL_ID, { initProgressCallback: (p) => kidProgress(p) });
      return kidEngine;
    })().catch((err) => { kidEngineLoading = null; throw err; });
  }
  return kidEngineLoading;
}

// 설명 안의 어려운 낱말에 물결 밑줄을 친다 (글자는 텍스트로만 넣는다)
function markWords(el, text, words) {
  if (!words.length) return el.replaceChildren(text);
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const parts = text.split(new RegExp(`(${esc.join("|")})`, "g"));
  el.replaceChildren(...parts.map((p) => (words.includes(p) ? h("mark", { class: "hard" }, p) : p)));
}

function kidSection(note, easyBody) {
  const box = h("section", { class: "kid", "aria-labelledby": "kid-title" });
  const rulesList = h("ul", { class: "kid-rules" });
  const aiArea = h("div", { class: "kid-ai", "aria-live": "polite" });
  const btn = h("button", { class: "btn primary", type: "button" });
  const status = h("p", { class: "kid-status" });

  box.append(
    h("div", { class: "kid-head" },
      h("div", {},
        h("h2", { id: "kid-title" }, "AI 초등학생에게 읽혀 보기"),
        h("p", {}, "'내 말로' 쓴 설명만 읽고, 알아들은 대로 다시 말하고 모르는 걸 물어봐요.")),
      btn),
    h("div", { class: "kid-grid" },
      h("div", {}, h("h3", {}, "바로 보이는 점"), rulesList),
      h("div", {}, h("h3", {}, "AI 초등학생의 반응"), aiArea)),
    status
  );

  loadKidCheck().then((kc) => {
    const rules = kc.ruleChecks(note);
    rulesList.replaceChildren(...(rules.length
      ? rules.map((r) => h("li", { class: "rule " + r.kind }, r.text))
      : [h("li", { class: "rule ok" }, "규칙 검사에서 걸린 곳이 없어요.")]));
  });

  const showResult = (res, kc) => {
    aiArea.replaceChildren(...[
      h("div", { class: "kid-said" }, h("small", {}, "알아들은 내용"), res.understood),
      h("small", { class: "kid-label" }, "궁금한 점"),
      h("ul", { class: "kid-questions" }, ...res.questions.map((q) => h("li", {}, q))),
      res.hard_words.length
        ? h("div", { class: "kid-words" }, h("small", { class: "kid-label" }, "모르는 말"), ...res.hard_words.map((w) => h("mark", { class: "hard" }, w)))
        : null,
    ].filter(Boolean));
    markWords(easyBody, note.easy_text, res.hard_words);
    status.textContent = `${kc.MODEL_LABEL} · 이 브라우저 안에서 실행 · ${res.sec}초`
      + (res.dropped ? ` · 설명에 없거나 너무 쉬운 낱말 ${res.dropped}개는 뺐어요` : "")
      + (res.truncated ? " · 설명이 길어 앞부분만 읽었어요" : "")
      + " · 작은 AI라 엉뚱한 말을 할 수 있어요. 참고만 하세요.";
    btn.textContent = "다시 읽혀 보기";
  };

  if (!note.easy_text.trim()) {
    btn.textContent = "읽혀 보기";
    btn.disabled = true;
    aiArea.replaceChildren(h("p", { class: "muted" }, "'내 말로 풀어 쓰기'를 먼저 적으면 읽혀 볼 수 있어요."));
    return box;
  }

  const saved = kidResults.get(note.id);
  if (saved && saved.easy_text === note.easy_text) {
    loadKidCheck().then((kc) => showResult(saved.result, kc));
  } else {
    btn.textContent = kidEngine ? "읽혀 보기" : "AI 모델 받고 읽혀 보기";
    aiArea.replaceChildren(h("p", { class: "muted" }, kidEngine
      ? "버튼을 누르면 기기에 따라 10초~1분 동안 읽어요."
      : "처음 한 번 AI 모델(약 1GB)을 이 기기에 내려받아요. 와이파이에서 눌러 주세요. 메모는 서버나 외부로 보내지 않고 이 브라우저 안에서만 읽어요. PC의 크롬·엣지 최신판에서 돼요."));
  }

  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    const bar = h("i");
    const label = h("span", {}, "준비하는 중…");
    try {
      if (!(await webGpuReady())) {
        throw new Error("이 브라우저에서는 브라우저 AI를 쓸 수 없어요. PC의 크롬이나 엣지 최신판에서 열어 주세요. (폰은 아직 대부분 안 돼요)");
      }
      const kc = await loadKidCheck();
      aiArea.replaceChildren(h("div", { class: "kid-progress" }, h("div", { class: "bar" }, bar), label));
      kidProgress = (p) => {
        const pct = Math.round((p.progress || 0) * 100);
        bar.style.width = pct + "%";
        label.textContent = pct >= 100 ? "모델을 준비하는 중…"
          : `AI 모델 준비 중 ${pct}% (처음엔 약 1GB를 받고, 다음부터는 저장해 둔 것을 불러와요)`;
      };
      const engine = await getKidEngine();
      bar.style.width = "100%";
      label.textContent = "AI가 설명을 읽는 중… (기기에 따라 10초~1분)";
      const { messages, truncated } = kc.buildMessages(note);
      const t0 = performance.now();
      const reply = await engine.chat.completions.create({
        messages, temperature: 0.4, max_tokens: 400,
        response_format: { type: "json_object", schema: JSON.stringify(kc.KID_SCHEMA) },
        extra_body: { enable_thinking: false },
      });
      const res = kc.parseKidAnswer(reply.choices[0].message.content, note.easy_text);
      res.sec = ((performance.now() - t0) / 1000).toFixed(1);
      res.truncated = truncated;
      kidResults.set(note.id, { easy_text: note.easy_text, result: res });
      if (box.isConnected) showResult(res, kc);
    } catch (err) {
      aiArea.replaceChildren(h("p", { class: "kid-error" }, err.message || "AI를 실행하지 못했어요."));
      btn.textContent = kidEngine ? "다시 해 보기" : "AI 모델 받고 읽혀 보기";
    } finally {
      kidProgress = () => {};
      btn.disabled = false;
    }
  });
  return box;
}

// ---------- 작성·수정 ----------
async function renderForm(id) {
  let note = { title: "", original_text: "", easy_text: "", one_liner: "", status: "new", node: null, tags: [] };
  if (id) {
    view.replaceChildren(h("p", { class: "loading" }, "불러오는 중…"));
    try { note = await api("/notes/" + id); } catch (err) { return showError(err); }
  }
  document.title = (id ? "메모 수정" : "새 메모") + " — 풀어노트";

  const field = (name, label, control, { hint, max, cls } = {}) => {
    const err = h("div", { class: "err", id: `err-${name}` });
    const counter = max ? h("div", { class: "counter" }) : null;
    if (max) {
      const upd = () => (counter.textContent = `${[...control.value].length} / ${max.toLocaleString()}`);
      control.addEventListener("input", upd); upd();
    }
    control.setAttribute("aria-describedby", `err-${name}`);
    control.id = `f-${name}`;
    return h("div", { class: "field " + (cls || ""), "data-field": name },
      h("label", { for: `f-${name}` }, label, hint ? h("span", { class: "hint" }, " " + hint) : null), control, err, counter);
  };

  const title = h("input", { name: "title", value: note.title, maxlength: 120, placeholder: "예: 컨텍스트 창과 토큰", required: true });
  const node = h("input", { name: "node", type: "number", min: 0, max: 99, inputmode: "numeric", value: note.node ?? "", placeholder: "예: 5" });
  const tags = h("input", { name: "tags", value: note.tags.join(", "), placeholder: "예: LLM, 토큰" });
  const original = h("textarea", { name: "original_text", maxlength: 16000, placeholder: "수업에서 들은 그대로, 받아 적은 그대로 붙여 넣으세요.", required: true }, note.original_text);
  const easy = h("textarea", { name: "easy_text", maxlength: 16000, placeholder: "초등학생 동생에게 설명한다고 생각하고, 어려운 말 없이 다시 써 보세요." }, note.easy_text);
  const liner = h("input", { name: "one_liner", value: note.one_liner, maxlength: 200, placeholder: "오늘 배운 걸 한 문장으로" });
  const seg = h("div", { class: "seg", role: "radiogroup", "aria-label": "복습 상태" },
    ...Object.entries(STATUS).map(([v, { label }]) =>
      h("label", {}, h("input", { type: "radio", name: "status", value: v, checked: note.status === v }), h("span", { class: v }, label)))
  );

  const saveBtn = h("button", { class: "btn primary", type: "submit" }, id ? "고친 내용 저장" : "저장");
  const form = h("form", { class: "panel", novalidate: true },
    h("h1", {}, id ? "메모 고치기" : "새 메모"),
    id ? null : h("div", { class: "tip" }, "원문을 적은 뒤, 오른쪽에 '내 말로' 다시 풀어 써 보세요. 막히는 곳이 아직 이해 못 한 곳이에요."),
    field("title", "제목", title, { max: 120 }),
    h("div", { class: "row" },
      field("node", "노드 번호", node, { hint: "0~99, 선택" }),
      field("tags", "태그", tags, { hint: "쉼표로 구분, 10개까지" }),
      h("div", { class: "field" }, h("label", {}, "복습 상태"), seg)
    ),
    h("div", { class: "pair form-pair" },
      field("original_text", "수업 메모 원문", original, { max: 16000 }),
      field("easy_text", "내 말로 풀어 쓰기", easy, { max: 16000, cls: "easy", hint: "초등학생도 알아듣게" })
    ),
    field("one_liner", "오늘의 한 줄", liner, { max: 200 }),
    h("div", { class: "form-actions" },
      h("a", { class: "btn", href: id ? `#/note/${id}` : "#/" }, "취소"),
      saveBtn
    )
  );

  formDirty = false;
  form.addEventListener("input", (e) => {
    formDirty = true;
    const f = e.target.closest(".field.invalid"); // 고치기 시작하면 그 칸의 오류 표시를 지운다
    if (f) { f.classList.remove("invalid"); f.querySelector(".err").textContent = ""; }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (saveBtn.disabled) return; // 처리 중 중복 저장 방지
    form.querySelectorAll(".field").forEach((f) => { f.classList.remove("invalid"); const er = f.querySelector(".err"); if (er) er.textContent = ""; });

    const body = {
      title: title.value, node: node.value, tags: tags.value,
      original_text: original.value, easy_text: easy.value, one_liner: liner.value,
      status: form.querySelector('input[name="status"]:checked')?.value || "new",
    };
    // 화면에서 먼저 막을 수 있는 빈칸은 바로 알려 준다 (서버도 똑같이 다시 검사한다)
    const local = {};
    if (!body.title.trim()) local.title = "제목을 적어 주세요.";
    if (!body.original_text.trim()) local.original_text = "수업 메모 원문을 적어 주세요.";
    if (Object.keys(local).length) return showFieldErrors(local);

    saveBtn.disabled = true;
    saveBtn.textContent = "저장하는 중…";
    try {
      const saved = id
        ? await api("/notes/" + id, { method: "PUT", body: JSON.stringify(body) })
        : await api("/notes", { method: "POST", body: JSON.stringify(body) });
      formDirty = false;
      toast(id ? "고친 내용을 저장했어요." : "메모를 저장했어요.");
      location.hash = `#/note/${saved.id}`;
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = id ? "고친 내용 저장" : "저장";
      if (err.fields) showFieldErrors(err.fields);
      toast(err.message, true);
    }
  });

  function showFieldErrors(fields) {
    let first;
    for (const [name, msg] of Object.entries(fields)) {
      const f = form.querySelector(`[data-field="${name}"]`);
      if (!f) continue;
      f.classList.add("invalid");
      f.querySelector(".err").textContent = msg;
      first = first || f.querySelector("input, textarea");
    }
    if (first) first.focus();
  }

  leaveGuard = () => !formDirty || confirm("저장하지 않은 내용이 있어요. 나갈까요?");
  view.replaceChildren(form);
  title.focus();
}

// ---------- 주소에 따라 화면 고르기 ----------
let leaveGuard = null;
let formDirty = false;
let lastHash = location.hash;

function render() {
  const hash = location.hash || "#/";
  let m;
  if (hash === "#/" || hash === "#") renderList();
  else if (hash === "#/new") renderForm(null);
  else if ((m = hash.match(/^#\/note\/(\d+)\/edit$/))) renderForm(m[1]);
  else if ((m = hash.match(/^#\/note\/(\d+)$/))) renderDetail(m[1]);
  else showError({ status: 404, message: "없는 화면이에요." });
  document.getElementById("newBtn").style.visibility = hash === "#/new" ? "hidden" : "visible";
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", () => {
  if (leaveGuard && !leaveGuard()) {
    history.replaceState(null, "", lastHash); // 나가기를 취소하면 주소를 되돌린다
    return;
  }
  leaveGuard = null;
  formDirty = false;
  lastHash = location.hash;
  render();
});
window.addEventListener("beforeunload", (e) => {
  if (formDirty) e.preventDefault(); // 쓰던 내용이 있으면 새로고침·창 닫기 전에 브라우저가 한 번 묻는다
});

render();
