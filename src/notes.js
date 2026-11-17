// 메모 입력 검사와 DB 조회. SQL은 모두 매개변수 바인딩($1, $2 …)으로 넣는다.

const STATUSES = ["new", "review", "done"];
const COLUMNS = "id, title, original_text, easy_text, one_liner, status, node, tags, created_at, updated_at";

class ValidationError extends Error {
  constructor(errors) {
    super("입력값을 확인해 주세요.");
    this.errors = errors;
  }
}

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

// 받은 값을 검사하고 DB에 넣을 모양으로 정리한다. 틀린 칸은 errors에 모아 한 번에 알려 준다.
function validateNote(body) {
  const b = body && typeof body === "object" ? body : {};
  const errors = {};
  const note = {
    title: str(b.title),
    original_text: str(b.original_text),
    easy_text: str(b.easy_text),
    one_liner: str(b.one_liner),
    status: b.status === undefined || b.status === "" ? "new" : b.status,
    node: b.node === undefined || b.node === null || b.node === "" ? null : Number(b.node),
    tags: [],
  };

  if (!note.title) errors.title = "제목을 적어 주세요.";
  else if (note.title.length > 120) errors.title = "제목은 120자까지 쓸 수 있어요.";

  if (!note.original_text) errors.original_text = "수업 메모 원문을 적어 주세요.";
  else if (note.original_text.length > 16000) errors.original_text = "원문은 16,000자까지 쓸 수 있어요.";

  if (note.easy_text.length > 16000) errors.easy_text = "풀어 쓴 내용은 16,000자까지 쓸 수 있어요.";
  if (note.one_liner.length > 200) errors.one_liner = "오늘의 한 줄은 200자까지 쓸 수 있어요.";
  if (!STATUSES.includes(note.status)) errors.status = "복습 상태가 올바르지 않아요.";
  if (note.node !== null && !(Number.isInteger(note.node) && note.node >= 0 && note.node <= 99)) {
    errors.node = "노드 번호는 0~99 사이 숫자로 적어 주세요.";
  }

  let rawTags = b.tags;
  if (typeof rawTags === "string") rawTags = rawTags.split(",");
  if (rawTags !== undefined && rawTags !== null && !Array.isArray(rawTags)) {
    errors.tags = "태그 형식이 올바르지 않아요.";
  } else if (Array.isArray(rawTags)) {
    const tags = [...new Set(rawTags.map((t) => str(String(t)).replace(/^#/, "")).filter(Boolean))];
    if (tags.length > 10) errors.tags = "태그는 10개까지 달 수 있어요.";
    else if (tags.some((t) => t.length > 30)) errors.tags = "태그 하나는 30자까지 쓸 수 있어요.";
    else note.tags = tags;
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return note;
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 && id < 2147483647 ? id : null;
}

function repo(pool) {
  return {
    async list({ q, status, node, tag } = {}) {
      const where = [];
      const params = [];
      const add = (sql, value) => {
        params.push(value);
        where.push(sql.replace("?", "$" + params.length));
      };
      if (q && String(q).trim()) add("lower(title) like ?", "%" + String(q).trim().toLowerCase() + "%");
      if (status && STATUSES.includes(status)) add("status = ?", status);
      if (node !== undefined && node !== "" && Number.isInteger(Number(node))) add("node = ?", Number(node));
      if (tag && String(tag).trim()) add("? = any(tags)", String(tag).trim().replace(/^#/, ""));
      const sql =
        `select ${COLUMNS} from notes` +
        (where.length ? " where " + where.join(" and ") : "") +
        " order by updated_at desc, id desc limit 200";
      const { rows } = await pool.query(sql, params);
      return rows;
    },

    async get(id) {
      const { rows } = await pool.query(`select ${COLUMNS} from notes where id = $1`, [id]);
      return rows[0] || null;
    },

    async create(n) {
      const { rows } = await pool.query(
        `insert into notes (title, original_text, easy_text, one_liner, status, node, tags)
         values ($1, $2, $3, $4, $5, $6, $7) returning ${COLUMNS}`,
        [n.title, n.original_text, n.easy_text, n.one_liner, n.status, n.node, n.tags]
      );
      return rows[0];
    },

    async update(id, n) {
      const { rows } = await pool.query(
        `update notes set title = $1, original_text = $2, easy_text = $3, one_liner = $4,
           status = $5, node = $6, tags = $7, updated_at = now()
         where id = $8 returning ${COLUMNS}`,
        [n.title, n.original_text, n.easy_text, n.one_liner, n.status, n.node, n.tags, id]
      );
      return rows[0] || null;
    },

    async remove(id) {
      const { rows } = await pool.query("delete from notes where id = $1 returning id", [id]);
      return rows.length > 0;
    },
  };
}

module.exports = { validateNote, parseId, repo, ValidationError, STATUSES };
