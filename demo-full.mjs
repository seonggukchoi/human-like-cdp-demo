import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  humanClick, humanHover, humanWheel, humanDrag,
  startIdleJitter, stopIdleJitter,
} from "./human-mouse.mjs";
import { humanType } from "./human-keyboard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("Launching Chromium (headful)...");
const browser = await chromium.launch({
  headless: false,
  args: ["--window-size=920,820", "--window-position=80,40"],
});
const ctx  = await browser.newContext({ viewport: { width: 900, height: 800 } });
const page = await ctx.newPage();
const cdp  = await ctx.newCDPSession(page);
const send = (m, p) => cdp.send(m, p);

await page.goto("file://" + join(__dirname, "demo-full.html"));
await sleep(1000);

console.log("→ idle jitter ON");
startIdleJitter(send);
await sleep(700);

console.log("→ 한글 입력");
await humanClick(send, "#ko");
await humanType(send, "안녕하세요! 오늘 닭갈비 먹으러 갈래요?");
await sleep(500);

console.log("→ 영문 입력");
await humanClick(send, "#en");
await humanType(send, "eric@flowlab.io", { wpm: 320 });
await sleep(500);

console.log("→ 호버 (툴팁 노출)");
await humanHover(send, "#hover-btn", { dwellMs: 1500 });
await sleep(400);

console.log("→ 드래그 (card1 → zone-b)");
await humanDrag(send, "#card1", "#zone-b");
await sleep(700);

console.log("→ 휠 스크롤 ↓ 600px");
await humanWheel(send, 600);
await sleep(700);

console.log("→ 휠 스크롤 ↑ 250px (pauseChance 0.35)");
await humanWheel(send, -250, { pauseChance: 0.35 });
await sleep(800);

console.log("→ idle jitter OFF");
stopIdleJitter();

console.log("Demo done. Window stays open for 20s.");
await sleep(20000);
await browser.close();
