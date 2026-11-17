// .env의 [YOUR-PASSWORD] 자리에 DB 비밀번호를 넣는 도우미.
// 실행: node scripts/set-db-password.js  → 비밀번호를 입력해도 화면에 보이지 않습니다.
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const envPath = path.join(__dirname, "..", ".env");
const text = fs.readFileSync(envPath, "utf8");
const line = text.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line || !line.includes("postgres")) {
  console.log(".env에 DATABASE_URL 주소가 없습니다. Supabase Session pooler 주소를 먼저 붙여 넣으세요.");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); };
rl.question("Supabase DB 비밀번호를 입력하고 Enter (화면에 안 보입니다): ", (pw) => {
  rl.output.write("\n");
  rl.close();
  pw = pw.trim();
  if (!pw) { console.log("비밀번호가 비어 있어 바꾸지 않았습니다."); process.exit(1); }
  const enc = encodeURIComponent(pw); // 특수문자가 있어도 주소가 깨지지 않게 바꿔 넣는다
  const newLine = line.includes("[YOUR-PASSWORD]")
    ? line.replace("[YOUR-PASSWORD]", enc)
    : line.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]*(@)/, `$1${enc}$2`);
  fs.writeFileSync(envPath, text.replace(line, newLine));
  console.log("저장했습니다. 이제 채팅에 '완료'라고 알려 주세요.");
});
muted = true;
