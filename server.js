// 실행: npm start  (DATABASE_URL이 있으면 Supabase, 없으면 메모리 DB)
try { process.loadEnvFile(); } catch { /* .env가 없으면 넘어간다 */ }

const { createPool, initDatabase } = require("./src/db");
const { createApp } = require("./src/app");

async function main() {
  const { pool, mode } = createPool();
  if (mode === "postgres") {
    const r = await initDatabase(pool); // 표가 없으면 만들고, 비어 있으면 시연 메모를 넣는다
    console.log(r.seeded ? "Supabase: 표를 확인했고 시연 메모 3건을 넣었습니다." : `Supabase: 표 확인, 저장된 메모 ${r.count}건`);
  }
  const port = Number(process.env.PORT) || 3200;
  createApp(pool, { mode }).listen(port, () => {
    const label = mode === "postgres" ? "Supabase(Postgres) 연결" : "메모리 DB — 서버를 끄면 데이터가 사라집니다";
    console.log(`풀어노트 실행 중: http://localhost:${port}  [${label}]`);
  });
}

main().catch((err) => {
  console.error("서버를 시작하지 못했습니다:", err.message);
  process.exit(1);
});
