// 실행: npm start  (DATABASE_URL이 있으면 Supabase, 없으면 메모리 DB)
try { process.loadEnvFile(); } catch { /* .env가 없으면 넘어간다 */ }

const { createPool } = require("./src/db");
const { createApp } = require("./src/app");

const { pool, mode } = createPool();
const port = Number(process.env.PORT) || 3200;

createApp(pool, { mode }).listen(port, () => {
  const label = mode === "postgres" ? "Supabase(Postgres) 연결" : "메모리 DB — 서버를 끄면 데이터가 사라집니다";
  console.log(`풀어노트 실행 중: http://localhost:${port}  [${label}]`);
});
