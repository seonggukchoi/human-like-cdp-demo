import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createPersona } from "./persona.mjs";
import { applyStealth, STEALTH_LAUNCH_ARGS } from "./stealth.mjs";
import * as mouse from "./human-mouse.mjs";
import * as kbd from "./human-keyboard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 세션 = 한 사람. 시드 고정 → 재현 가능한 페르소나
const persona = createPersona(process.env.PERSONA_SEED ?? "eric-demo-2026");
mouse.setPersona(persona);
kbd.setPersona(persona);

console.log("Launching Chromium (headful, stealth)...");
const browser = await chromium.launch({
  headless: false,
  args: [...STEALTH_LAUNCH_ARGS, "--window-size=940,860", "--window-position=70,30"],
});
const ctx  = await browser.newContext({ viewport: { width: 920, height: 840 } });
await applyStealth(ctx); // goto 전에 주입

const page = await ctx.newPage();
const cdp  = await ctx.newCDPSession(page);
const send = (m, p) => cdp.send(m, p);

await page.goto("file://" + join(__dirname, "demo.html"));
await sleep(900);

// 페르소나 성향을 패널에 표시
await page.evaluate((p) => {
  document.getElementById("p-seed").textContent  = p.seed;
  document.getElementById("p-wpm").textContent   = Math.round(p.wpm);
  document.getElementById("p-curvy").textContent = p.curvy.toFixed(2);
  document.getElementById("p-over").textContent  = Math.round(p.over * 100) + "%";
  document.getElementById("p-typo").textContent  = (p.typo * 100).toFixed(1) + "%";
}, {
  seed: persona.seed,
  wpm: persona.keyboard.baseWpm,
  curvy: persona.mouse.curviness,
  over: persona.mouse.overshootProb,
  typo: persona.keyboard.typoRate,
});

console.log(`persona seed=${persona.seed} 타/분=${Math.round(persona.keyboard.baseWpm)} ` +
            `curvy=${persona.mouse.curviness.toFixed(2)} overshoot=${(persona.mouse.overshootProb*100|0)}% ` +
            `typo=${(persona.keyboard.typoRate*100).toFixed(1)}%`);

mouse.startIdleJitter(send);
await sleep(600);

console.log("→ 한글 입력");
await mouse.humanClick(send, "#ko");
await sleep(persona.readPause());
await kbd.humanType(send, "안녕하세요! 오늘 닭갈비 먹으러 갈래요? 좋아요 👍");
await sleep(persona.actionGap());

console.log("→ 영문 입력 (롤오버 + 오타 정정)");
await mouse.humanClick(send, "#en");
await sleep(persona.readPause());
await kbd.humanType(send, "the quick brown fox jumps over eric@flowlab.io", { typoChance: 0.06 });
await sleep(persona.actionGap());

console.log("→ 호버");
await mouse.humanHover(send, "#hover-btn", { dwellMs: 1300 });
await sleep(persona.actionGap());

console.log("→ 클릭 분산 (같은 버튼 5회)");
for (let i = 0; i < 5; i++) {
  await mouse.humanClick(send, "#click-target");
  await sleep(persona.actionGap(0.7));
}

console.log("→ 드래그 (card1 → zone-b)");
await mouse.humanDrag(send, "#card1", "#zone-b");
await sleep(persona.actionGap());

console.log("→ 휠 스크롤 ↓ 520");
await mouse.humanWheel(send, 520);
await sleep(persona.actionGap());
console.log("→ 휠 스크롤 ↑ 240");
await mouse.humanWheel(send, -240, { pauseChance: 0.35 });
await sleep(600);

mouse.stopIdleJitter();
const wd = await page.evaluate(() => navigator.webdriver);
console.log(`navigator.webdriver = ${wd}`);

console.log("Demo done. Window stays open for 20s.");
await sleep(20000);
await browser.close();
