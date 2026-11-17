// DB 연결: DATABASE_URL이 있으면 Supabase(Postgres), 없으면 메모리 DB(pg-mem)로 동작한다.
// 메모리 모드는 개발·테스트용이며 서버를 끄면 데이터가 사라진다. 배포에서는 반드시 DATABASE_URL을 쓴다.
const fs = require("fs");
const path = require("path");

const SCHEMA = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
const SEED = fs.readFileSync(path.join(__dirname, "..", "db", "seed.sql"), "utf8");

function createMemoryPool({ seed = true } = {}) {
  const { newDb, DataType } = require("pg-mem");
  const mem = newDb();
  // pg-mem에 없는 Postgres 함수를 같은 동작으로 등록한다
  mem.public.registerFunction({
    name: "char_length", args: [DataType.text], returns: DataType.integer,
    implementation: (s) => [...s].length,
  });
  // pg-mem은 인덱스 정렬 방향 문법을 일부만 지원하므로 인덱스 줄은 빼고 만든다
  mem.public.none(SCHEMA.replace(/create index[^;]*;/gi, ""));
  if (seed) mem.public.none(SEED);
  const { Pool } = mem.adapters.createPg();
  return new Pool();
}

function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      // 배포에서 메모리 DB로 조용히 뜨면 데이터가 사라지므로 아예 시작하지 않는다
      throw new Error("DATABASE_URL이 없습니다. 배포 환경변수에 Supabase 연결 주소를 넣어 주세요.");
    }
    return { pool: createMemoryPool(), mode: "memory" };
  }
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }, // Supabase는 SSL 연결을 요구한다
    max: 5,
  });
  return { pool, mode: "postgres" };
}

// Postgres에 처음 연결할 때 표가 없으면 만들고, 표가 비어 있으면 시연 메모를 넣는다.
// schema.sql은 "if not exists"라서 여러 번 실행해도 기존 데이터는 그대로다.
async function initDatabase(pool) {
  await pool.query(SCHEMA);
  const { rows } = await pool.query("select count(*)::int as n from notes");
  if (rows[0].n === 0 && process.env.SEED_DEMO !== "false") {
    await pool.query(SEED);
    return { seeded: true };
  }
  return { seeded: false, count: rows[0].n };
}

module.exports = { createPool, createMemoryPool, initDatabase };
