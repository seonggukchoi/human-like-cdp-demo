// bench.mjs — 타이핑 속도(분당 타수) 회귀 측정.
// fake send로 humanType을 실제 실행(sleep 포함)해 wall-clock으로 타/분을 잰다.
// 사용: node bench.mjs   (목표: 한국식 400~500 타/분)

import { performance } from "node:perf_hooks";
import { createPersona } from "./persona.mjs";
import * as kbd from "./human-keyboard.mjs";

const noopSend = async () => ({ result: { value: undefined } });

const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".split("");
const JONG = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ".split("")];
const JUNG_C = { "ㅘ":2,"ㅙ":2,"ㅚ":2,"ㅝ":2,"ㅞ":2,"ㅟ":2,"ㅢ":2 };
const JONG_C = { "ㄳ":2,"ㄵ":2,"ㄶ":2,"ㄺ":2,"ㄻ":2,"ㄼ":2,"ㄽ":2,"ㄾ":2,"ㄿ":2,"ㅀ":2,"ㅄ":2 };

// 한국식 "타": 영문 1글자=1타, 한글 자모 1개=1타
function strokeCount(text) {
  let n = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const code = c - 0xac00;
      const jung = JUNG[Math.floor((code % 588) / 28)];
      const jong = JONG[code % 28];
      n += 1 + (JUNG_C[jung] ?? 1) + (jong ? (JONG_C[jong] ?? 1) : 0);
    } else {
      n += 1;
    }
  }
  return n;
}

async function bench(label, text, seed) {
  const persona = createPersona(seed);
  kbd.setPersona(persona);
  const t0 = performance.now();
  await kbd.humanType(noopSend, text, { typoChance: 0 }); // 속도만 측정(오타 제외)
  const ms = performance.now() - t0;
  const strokes = strokeCount(text);
  const spm = strokes / (ms / 60000);
  console.log(`${label}: ${strokes}타 / ${(ms / 1000).toFixed(1)}s = ${spm.toFixed(0)} 타/분`);
  return spm;
}

const EN = "the quick brown fox jumps over the lazy dog and then types a short sentence";
const KO = "오늘 날씨가 정말 좋아서 한강에서 자전거를 타고 책을 읽었습니다";

const seeds = ["bench-1", "bench-2", "bench-3"];
let enSum = 0, koSum = 0;
for (const s of seeds) {
  enSum += await bench(`EN  ${s}`, EN, s);
  koSum += await bench(`KO  ${s}`, KO, s);
}
console.log(`\n평균: EN ${(enSum / seeds.length).toFixed(0)} 타/분, KO ${(koSum / seeds.length).toFixed(0)} 타/분  (목표 400~500)`);
