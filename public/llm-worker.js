// 브라우저 AI 모델을 화면과 다른 일꾼(Web Worker)에서 돌려 화면이 멈추지 않게 한다.
// 메모 내용은 이 브라우저 안에서만 처리되고 서버나 외부로 보내지 않는다 (모델 파일만 내려받음).
import { WebWorkerMLCEngineHandler } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.86/+esm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
