// "AI 초등학생에게 읽혀 보기"에서 쓰는 순수 함수 모음 (브라우저와 테스트에서 함께 쓴다)
//  - ruleChecks: AI 없이 규칙으로 바로 찾는 점
//  - buildMessages: 작은 AI 모델에게 줄 지시문
//  - parseKidAnswer: AI 답을 검사해서 설명에 실제로 있는 낱말만 남긴다

export const MODEL_ID = "Qwen3-1.7B-q4f16_1-MLC";
export const MODEL_LABEL = "Qwen3 1.7B";
export const MAX_AI_CHARS = 3000;

// 수업에서 자주 나오지만 초등학생은 모를 용어 (쓰면 바로 뒤에 쉬운 말로 풀어 주는 게 좋다)
const JARGON = [
  "파라미터", "매개변수", "가중치", "임베딩", "벡터", "토큰", "추론", "일반화", "과적합",
  "알고리즘", "손실", "경사", "함수", "프롬프트", "컨텍스트", "레이어", "신경망", "확률", "분포",
];

export const KID_SCHEMA = {
  type: "object",
  properties: {
    understood: { type: "string" },
    questions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    hard_words: { type: "array", items: { type: "string" }, maxItems: 5 },
  },
  required: ["understood", "questions", "hard_words"],
};

const uniq = (arr) => [...new Set(arr)];

export function splitSentences(text) {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// AI 없이 바로 알 수 있는 점. 결과는 [{ kind, text }]
export function ruleChecks({ original_text = "", easy_text = "" }) {
  const easy = easy_text.trim();
  const out = [];
  if (!easy) return [{ kind: "empty", text: "아직 '내 말로 풀어 쓰기'가 비어 있어요." }];

  const KNOWN = new Set(["AI", "TV", "OK", "PC"]); // 초등학생도 아는 영어 낱말은 넘어간다
  const english = uniq(easy.match(/[A-Za-z][A-Za-z0-9-]+/g) || []).filter((w) => !KNOWN.has(w.toUpperCase()));
  if (english.length) {
    out.push({ kind: "english", text: `영어 낱말이 남아 있어요: ${english.slice(0, 6).join(", ")}. 우리말로 바꾸거나 바로 뒤에 뜻을 붙여 보세요.` });
  }

  const jargon = JARGON.filter((w) => easy.includes(w));
  if (jargon.length) {
    out.push({ kind: "jargon", text: `어려운 용어: ${jargon.join(", ")}. 꼭 써야 한다면 바로 뒤에 쉬운 말로 풀어 주세요.` });
  }

  const long = splitSentences(easy).filter((s) => [...s].length > 80);
  if (long.length) {
    out.push({ kind: "long", text: `80자가 넘는 긴 문장이 ${long.length}개 있어요. 둘로 나눠 보세요.` });
  }

  const o = [...original_text.trim()].length;
  if (o >= 100 && [...easy].length < o * 0.3) {
    out.push({ kind: "short", text: "원문보다 아주 짧아요. 빠뜨린 내용이 없는지 원문과 한 번 더 비교해 보세요." });
  }

  return out;
}

// 제목·원문은 넘기지 않는다: 초등학생은 '내 말로 풀어 쓴 설명'만 읽고 반응해야 하기 때문
export function buildMessages({ easy_text = "" }) {
  let easy = easy_text.trim();
  let truncated = false;
  if ([...easy].length > MAX_AI_CHARS) {
    easy = [...easy].slice(0, MAX_AI_CHARS).join("");
    truncated = true;
  }
  const system = [
    "너는 열 살 초등학생이다. 어른이 쓴 설명을 읽고 초등학생 말투(반말)로 한국어로 답한다.",
    "understood: 네가 알아들은 내용을 너의 말로 한두 문장으로 다시 말한다. 설명의 문장을 그대로 베끼지 않는다. 모르겠으면 '잘 모르겠어'라고 쓴다.",
    "questions: 읽고 나서 궁금하거나 헷갈리는 점을 1~3개 묻는다. 모르는 낱말이 있으면 '○○이 뭐야?'처럼 묻는다.",
    "hard_words: 설명에 나온 낱말 가운데 초등학생이 뜻을 모를 낱말(영어, 전문 용어)을 설명에 쓰인 그대로 적는다.",
    "설명에 없는 내용을 지어내지 않는다. JSON으로만 답한다.",
  ].join("\n");
  const user = `[어른의 설명]\n${easy}\n\n위 설명만 읽고 답해.`;
  return { messages: [{ role: "system", content: system }, { role: "user", content: user }], truncated };
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// AI 답(JSON 글자)을 검사한다. 형식이 틀리면 오류를 던지고,
// hard_words는 설명에 실제로 들어 있는 낱말만 남긴다 (지어낸 낱말 제거).
export function parseKidAnswer(raw, easy_text) {
  let data;
  try {
    data = JSON.parse(String(raw).replace(/<think>[\s\S]*?<\/think>/g, "").trim());
  } catch {
    throw new Error("AI 답을 읽지 못했어요. 한 번 더 눌러 보세요.");
  }
  const understood = clean(data.understood).slice(0, 300);
  const questions = (Array.isArray(data.questions) ? data.questions : []).map(clean).filter(Boolean).slice(0, 3);
  if (!understood || !questions.length) throw new Error("AI 답이 비어 있어요. 한 번 더 눌러 보세요.");

  const easy = easy_text.replace(/\s+/g, " ");
  const offered = (Array.isArray(data.hard_words) ? data.hard_words : []).map((w) => clean(w).replace(/^["'“‘]|["'”’]$/g, ""));
  // 작은 모델은 '종이' 같은 쉬운 두 글자 낱말도 고르곤 해서, 영어·전문 용어가 아닌 두 글자 이하는 뺀다
  const plausible = (w) => /[A-Za-z]/.test(w) || JARGON.some((j) => w.includes(j)) || [...w.replace(/\s/g, "")].length >= 3;
  const hard_words = uniq(offered.filter((w) => w && [...w].length <= 20 && easy.includes(w) && plausible(w))).slice(0, 5);
  const dropped = offered.filter((w) => w && !hard_words.includes(w)).length;

  return { understood, questions, hard_words, dropped };
}
