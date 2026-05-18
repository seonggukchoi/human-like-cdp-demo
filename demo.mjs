import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// === 유틸 ===
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3;
}
function smoothstep(t) { return t*t*(3-2*t); }

// === 한글 자모 ===
const HANGUL_BASE = 0xAC00;
const CHO  = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".split("");
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".split("");
const JONG = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ".split("")];
const JUNG_COMPOUND = {
  "ㅘ":["ㅗ","ㅏ"], "ㅙ":["ㅗ","ㅐ"], "ㅚ":["ㅗ","ㅣ"],
  "ㅝ":["ㅜ","ㅓ"], "ㅞ":["ㅜ","ㅔ"], "ㅟ":["ㅜ","ㅣ"],
  "ㅢ":["ㅡ","ㅣ"],
};
const JONG_COMPOUND = {
  "ㄳ":["ㄱ","ㅅ"], "ㄵ":["ㄴ","ㅈ"], "ㄶ":["ㄴ","ㅎ"],
  "ㄺ":["ㄹ","ㄱ"], "ㄻ":["ㄹ","ㅁ"], "ㄼ":["ㄹ","ㅂ"],
  "ㄽ":["ㄹ","ㅅ"], "ㄾ":["ㄹ","ㅌ"], "ㄿ":["ㄹ","ㅍ"],
  "ㅀ":["ㄹ","ㅎ"], "ㅄ":["ㅂ","ㅅ"],
};
const JUNG_REV = Object.fromEntries(Object.entries(JUNG_COMPOUND).map(([k,v]) => [v.join(""), k]));
const JONG_REV = Object.fromEntries(Object.entries(JONG_COMPOUND).map(([k,v]) => [v.join(""), k]));

const DUBEOLSIK = {
  "ㄱ":{code:"KeyR",kc:82}, "ㄴ":{code:"KeyS",kc:83}, "ㄷ":{code:"KeyE",kc:69},
  "ㄹ":{code:"KeyF",kc:70}, "ㅁ":{code:"KeyA",kc:65}, "ㅂ":{code:"KeyQ",kc:81},
  "ㅅ":{code:"KeyT",kc:84}, "ㅇ":{code:"KeyD",kc:68}, "ㅈ":{code:"KeyW",kc:87},
  "ㅊ":{code:"KeyC",kc:67}, "ㅋ":{code:"KeyZ",kc:90}, "ㅌ":{code:"KeyX",kc:88},
  "ㅍ":{code:"KeyV",kc:86}, "ㅎ":{code:"KeyG",kc:71},
  "ㄲ":{code:"KeyR",kc:82,shift:true}, "ㄸ":{code:"KeyE",kc:69,shift:true},
  "ㅃ":{code:"KeyQ",kc:81,shift:true}, "ㅆ":{code:"KeyT",kc:84,shift:true},
  "ㅉ":{code:"KeyW",kc:87,shift:true},
  "ㅏ":{code:"KeyK",kc:75}, "ㅑ":{code:"KeyI",kc:73}, "ㅓ":{code:"KeyJ",kc:74},
  "ㅕ":{code:"KeyU",kc:85}, "ㅗ":{code:"KeyH",kc:72}, "ㅛ":{code:"KeyY",kc:89},
  "ㅜ":{code:"KeyN",kc:78}, "ㅠ":{code:"KeyB",kc:66}, "ㅡ":{code:"KeyM",kc:77},
  "ㅣ":{code:"KeyL",kc:76}, "ㅐ":{code:"KeyO",kc:79}, "ㅔ":{code:"KeyP",kc:80},
  "ㅒ":{code:"KeyO",kc:79,shift:true}, "ㅖ":{code:"KeyP",kc:80,shift:true},
};

function isHangulSyllable(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0xAC00 && c <= 0xD7A3;
}

function syllableToSteps(syllable) {
  const code = syllable.charCodeAt(0) - HANGUL_BASE;
  const choIdx = Math.floor(code / 588);
  const jungIdx = Math.floor((code % 588) / 28);
  const jongIdx = code % 28;
  const steps = [CHO[choIdx]];
  const jungSeq = JUNG_COMPOUND[JUNG[jungIdx]] ?? [JUNG[jungIdx]];
  let acc = "";
  for (const j of jungSeq) {
    acc += j;
    const cur = JUNG.includes(acc) ? acc : JUNG_REV[acc];
    steps.push(String.fromCharCode(HANGUL_BASE + choIdx * 588 + JUNG.indexOf(cur) * 28));
  }
  if (jongIdx > 0) {
    const jongSeq = JONG_COMPOUND[JONG[jongIdx]] ?? [JONG[jongIdx]];
    let jacc = "";
    for (const j of jongSeq) {
      jacc += j;
      const cur = JONG.includes(jacc) ? jacc : JONG_REV[jacc];
      steps.push(String.fromCharCode(HANGUL_BASE + choIdx * 588 + jungIdx * 28 + JONG.indexOf(cur)));
    }
  }
  return steps;
}

// === 마우스 ===
let cursorPos = { x: 60, y: 60 };

async function humanMoveTo(send, target, opts = {}) {
  const dst = target;
  const start = opts.start ?? cursorPos;
  const dx = dst.x - start.x;
  const dy = dst.y - start.y;
  const dist = Math.hypot(dx, dy);
  const totalMs = opts.duration ?? clamp(dist * 2.2 + (Math.random() * 400 - 200), 400, 1800);
  const fps = opts.fps ?? 60;
  const frameMs = 1000 / fps;
  const jitter = opts.jitter ?? 1;
  const sign = Math.random() < 0.5 ? -1 : 1;
  const swing = (60 + Math.random() * 140) * sign;
  const cp1 = { x: start.x + dx*0.33 + swing, y: start.y + dy*0.33 - (60 + Math.random()*120) };
  const cp2 = { x: start.x + dx*0.72 - swing*0.8, y: start.y + dy*0.72 + (40 + Math.random()*120) };
  const phase1 = Math.random()*Math.PI*2;
  const phase2 = Math.random()*Math.PI*2;
  function point(t) {
    const e = smoothstep(t);
    const taper = Math.sin(Math.PI * e);
    const nx = 4*Math.sin(5.2*Math.PI*e + phase1) + 2*Math.sin(13.1*Math.PI*e);
    const ny = 3.5*Math.cos(4.7*Math.PI*e + phase2) + 2*Math.sin(11.3*Math.PI*e);
    return {
      x: cubic(start.x, cp1.x, cp2.x, dst.x, e) + taper*nx*jitter,
      y: cubic(start.y, cp1.y, cp2.y, dst.y, e) + taper*ny*jitter,
    };
  }
  let virtual = 0;
  let lastTime = Date.now();
  while (virtual < 1) {
    const now = Date.now();
    const dt = Math.min(40, now - lastTime);
    lastTime = now;
    const speedMul = 0.82 + 0.22*Math.sin(2*Math.PI*virtual*2.1 + phase1) + 0.12*Math.sin(2*Math.PI*virtual*5.3 + phase2);
    virtual += (dt / totalMs) * clamp(speedMul, 0.42, 1.35);
    const t = Math.min(1, virtual);
    const p = point(t);
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved", x: p.x, y: p.y, button: "none", pointerType: "mouse",
    });
    cursorPos = p;
    await sleep(frameMs);
  }
  await send("Input.dispatchMouseEvent", {
    type: "mouseMoved", x: dst.x, y: dst.y, button: "none", pointerType: "mouse",
  });
  cursorPos = dst;
  return dst;
}

async function humanClick(send, target) {
  await humanMoveTo(send, target);
  await sleep(rand(60, 140));
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1, pointerType: "mouse",
  });
  await sleep(rand(40, 80));
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1, pointerType: "mouse",
  });
}

// === 키보드 ===
const SYM = {
  " ":{code:"Space",kc:32}, "-":{code:"Minus",kc:189}, "=":{code:"Equal",kc:187},
  "[":{code:"BracketLeft",kc:219}, "]":{code:"BracketRight",kc:221},
  "\\":{code:"Backslash",kc:220}, ";":{code:"Semicolon",kc:186},
  "'":{code:"Quote",kc:222}, ",":{code:"Comma",kc:188},
  ".":{code:"Period",kc:190}, "/":{code:"Slash",kc:191},
  "`":{code:"Backquote",kc:192},
};
const SHIFTED = {
  "!":"1","@":"2","#":"3","$":"4","%":"5","^":"6","&":"7","*":"8","(":"9",")":"0",
  "_":"-","+":"=","{":"[","}":"]","|":"\\",":":";",'"':"'","<":",",">":".","?":"/","~":"`",
};

function charToKey(ch) {
  if (/^[a-z]$/.test(ch)) return { key: ch, code: `Key${ch.toUpperCase()}`, kc: ch.toUpperCase().charCodeAt(0), text: ch };
  if (/^[A-Z]$/.test(ch)) return { key: ch, code: `Key${ch}`, kc: ch.charCodeAt(0), text: ch, shift: true };
  if (/^[0-9]$/.test(ch)) return { key: ch, code: `Digit${ch}`, kc: ch.charCodeAt(0), text: ch };
  if (SYM[ch]) return { key: ch, ...SYM[ch], text: ch };
  if (SHIFTED[ch]) {
    const base = SHIFTED[ch];
    const info = SYM[base] ?? { code: `Digit${base}`, kc: base.charCodeAt(0) };
    return { key: ch, ...info, text: ch, shift: true };
  }
  return { insertOnly: true, text: ch };
}

async function typeChar(send, ch) {
  const info = charToKey(ch);
  if (info.insertOnly) { await send("Input.insertText", { text: ch }); return; }
  const modifiers = info.shift ? 8 : 0;
  const base = {
    key: info.key, code: info.code,
    windowsVirtualKeyCode: info.kc, nativeVirtualKeyCode: info.kc,
    modifiers,
  };
  await send("Input.dispatchKeyEvent", { ...base, type: "keyDown", text: info.text, unmodifiedText: info.text });
  await sleep(rand(20, 70));
  await send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
}

const SPECIAL = {
  Enter:{code:"Enter",kc:13,text:"\r"},
  Tab:{code:"Tab",kc:9,text:"\t"},
  Backspace:{code:"Backspace",kc:8},
};

async function pressKey(send, name) {
  const s = SPECIAL[name];
  const base = {
    key: name, code: s.code,
    windowsVirtualKeyCode: s.kc, nativeVirtualKeyCode: s.kc,
    modifiers: 0,
  };
  await send("Input.dispatchKeyEvent", { ...base, type: "keyDown", ...(s.text ? { text: s.text, unmodifiedText: s.text } : {}) });
  await sleep(rand(25, 70));
  await send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
}

async function typeHangulSyllable(send, syllable, opts = {}) {
  const baseDelay = opts.baseDelay ?? 60000 / 280;
  const jitter = opts.jitter ?? 0.6;
  const code = syllable.charCodeAt(0) - HANGUL_BASE;
  const choIdx = Math.floor(code / 588);
  const jungIdx = Math.floor((code % 588) / 28);
  const jongIdx = code % 28;

  const jamos = [CHO[choIdx]];
  jamos.push(...(JUNG_COMPOUND[JUNG[jungIdx]] ?? [JUNG[jungIdx]]));
  if (jongIdx > 0) {
    const jong = JONG[jongIdx];
    jamos.push(...(JONG_COMPOUND[jong] ?? [jong]));
  }
  const steps = syllableToSteps(syllable);

  for (let i = 0; i < jamos.length; i++) {
    const jamo = jamos[i];
    const k = DUBEOLSIK[jamo];
    if (!k) continue;
    const modifiers = k.shift ? 8 : 0;

    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Process", code: k.code,
      windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229,
      modifiers,
    });
    await send("Input.imeSetComposition", {
      text: steps[i], selectionStart: steps[i].length, selectionEnd: steps[i].length,
    });
    await sleep(rand(20, 60));
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: jamo, code: k.code,
      windowsVirtualKeyCode: k.kc, nativeVirtualKeyCode: k.kc,
      modifiers,
    });

    if (i < jamos.length - 1) {
      await sleep(baseDelay * rand(1 - jitter, 1 + jitter));
    }
  }
  await send("Input.insertText", { text: syllable });
}

async function humanType(send, text, opts = {}) {
  const wpm = opts.wpm ?? 280;
  const jitter = opts.jitter ?? 0.55;
  const pauseChance = opts.pauseChance ?? 0.05;
  const baseDelay = 60000 / wpm;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (isHangulSyllable(ch)) {
      await typeHangulSyllable(send, ch, { baseDelay, jitter });
    } else if (ch === "\n") {
      await pressKey(send, "Enter");
    } else if (ch === "\t") {
      await pressKey(send, "Tab");
    } else {
      await typeChar(send, ch);
    }
    let delay = baseDelay * rand(1 - jitter, 1 + jitter);
    if (/[ ,.!?;:)]/.test(ch)) delay += rand(40, 160);
    if (ch === "\n") delay += rand(120, 400);
    if (Math.random() < pauseChance) delay += rand(300, 1100);
    await sleep(Math.max(8, delay));
  }
}

// === 시연 ===
console.log("Launching Chromium (headful)...");
const browser = await chromium.launch({
  headless: false,
  args: ["--window-size=920,820", "--window-position=80,40"],
});
const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const send = (method, params) => cdp.send(method, params);

await page.goto("file://" + join(__dirname, "demo.html"));
await sleep(1200);

console.log("→ moving to 한글 textarea");
const koBox = await page.locator("#ko").boundingBox();
await humanClick(send, { x: koBox.x + koBox.width * 0.3, y: koBox.y + koBox.height / 2 });
await sleep(400);

console.log("→ typing 한글");
await humanType(send, "안녕하세요, 에릭입니다.\n오늘 닭갈비 먹으러 갈래요? 좋아요!");
await sleep(700);

console.log("→ moving to 영문 input");
const enBox = await page.locator("#en").boundingBox();
await humanClick(send, { x: enBox.x + enBox.width * 0.3, y: enBox.y + enBox.height / 2 });
await sleep(400);

console.log("→ typing 영문");
await humanType(send, "Hello, world! eric@flowlab.io", { wpm: 320 });
await sleep(700);

console.log("→ moving to button");
const btnBox = await page.locator("#target").boundingBox();
await humanClick(send, { x: btnBox.x + btnBox.width / 2, y: btnBox.y + btnBox.height / 2 });
await sleep(800);

console.log("→ wandering off");
await humanMoveTo(send, { x: 760, y: 120 });
await humanMoveTo(send, { x: 200, y: 700 });

console.log("Demo done. Window stays open for 30s — close it manually or wait.");
await sleep(30000);
await browser.close();
