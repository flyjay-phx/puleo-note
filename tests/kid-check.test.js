// "AI 초등학생에게 읽혀 보기"의 규칙 검사와 AI 답 검사 (실제 AI 모델은 부르지 않는다)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "public", "kid-check.mjs")).href);

test("규칙 검사: 영어 낱말·어려운 용어·긴 문장·너무 짧은 설명을 찾는다", async () => {
  const { ruleChecks } = await load();
  const long = "가".repeat(85) + ".";
  const r = ruleChecks({ original_text: "원".repeat(400), easy_text: `GPT는 토큰을 셉니다. ${long}` });
  const kinds = r.map((x) => x.kind);
  assert.deepEqual(kinds, ["english", "jargon", "long", "short"]);
  assert.match(r[0].text, /GPT/);
  assert.match(r[1].text, /토큰/);
});

test("규칙 검사: 쉬운 설명이면 걸리는 것이 없고, 비어 있으면 알려 준다", async () => {
  const { ruleChecks } = await load();
  assert.deepEqual(ruleChecks({ original_text: "짧은 원문", easy_text: "시험 문제 답만 외우면 새 문제를 못 풀어요." }), []);
  assert.equal(ruleChecks({ original_text: "x", easy_text: "  " })[0].kind, "empty");
});

test("지시문: 설명만 넘기고 원문은 넘기지 않으며, 너무 길면 자른다", async () => {
  const { buildMessages, MAX_AI_CHARS } = await load();
  const { messages, truncated } = buildMessages({ title: "제목", easy_text: "가".repeat(MAX_AI_CHARS + 10) });
  assert.equal(truncated, true);
  assert.equal(messages[1].content.includes("가".repeat(MAX_AI_CHARS + 1)), false);
  assert.equal(messages.length, 2);
});

test("AI 답 검사: 설명에 없는 낱말은 빼고, 생각 표시와 공백을 정리한다", async () => {
  const { parseKidAnswer } = await load();
  const raw = '<think>음</think>{"understood":"  답만 외우면  안 돼요 ","questions":["왜요?",""," 어떻게 나눠요? "],"hard_words":["일반화","양자역학","\\"확인용\\"","문제","LLM","토큰"]}';
  const r = parseKidAnswer(raw, "LLM 모델이 일반화를 못 해요. 확인용 문제로 봐요. 토큰도 세요.");
  assert.equal(r.understood, "답만 외우면 안 돼요");
  assert.deepEqual(r.questions, ["왜요?", "어떻게 나눠요?"]);
  assert.deepEqual(r.hard_words, ["일반화", "확인용", "LLM", "토큰"]); // '양자역학'(설명에 없음)·'문제'(쉬운 두 글자)는 뺌
  assert.equal(r.dropped, 2);
});

test("AI 답 검사: 깨진 JSON이나 빈 답은 오류로 알린다", async () => {
  const { parseKidAnswer } = await load();
  assert.throws(() => parseKidAnswer("{깨짐", "x"), /읽지 못했어요/);
  assert.throws(() => parseKidAnswer('{"understood":"","questions":[],"hard_words":[]}', "x"), /비어 있어요/);
});
