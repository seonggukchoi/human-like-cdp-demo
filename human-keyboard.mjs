// human-keyboard.mjs
// CDP(Input.* 도메인)로 사람처럼 키보드 입력을 시뮬레이션한다.
//
//   - ASCII : keyDown + keyUp (text 필드로 글자 삽입)
//   - 한글  : 두벌식 자모 단위로 IME 표준 keydown(keyCode 229) + imeSetComposition + insertText
//   - 특수키: Enter, Tab, Backspace, 화살표 등
//   - 간격  : WPM 기반 + jitter + 구두점/줄바꿈 후 추가 지연 + 간헐적 정지
//   - 옵션  : typoChance로 인접 키 오타 후 백스페이스 정정
//
// 사용:
//   import { humanType, pressKey } from "./human-keyboard.mjs";
//   const send = (m, p) => cdpSession.send(m, p);
//   await humanType(send, "안녕하세요, Eric입니다.");
//   await pressKey(send, "Enter");

// ============================================================
// 유틸
// ============================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand  = (lo, hi) => lo + Math.random() * (hi - lo);

// modifiers 비트마스크: Alt=1, Ctrl=2, Meta=4, Shift=8
function mods({ shift, ctrl, alt, meta } = {}) {
  return (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
}

// ============================================================
// ASCII / 기호 키 매핑
// ============================================================

const SYM = {
  " ":  { code: "Space",        kc: 32  },
  "-":  { code: "Minus",        kc: 189 },
  "=":  { code: "Equal",        kc: 187 },
  "[":  { code: "BracketLeft",  kc: 219 },
  "]":  { code: "BracketRight", kc: 221 },
  "\\": { code: "Backslash",    kc: 220 },
  ";":  { code: "Semicolon",    kc: 186 },
  "'":  { code: "Quote",        kc: 222 },
  ",":  { code: "Comma",        kc: 188 },
  ".":  { code: "Period",       kc: 190 },
  "/":  { code: "Slash",        kc: 191 },
  "`":  { code: "Backquote",    kc: 192 },
};

// Shift 조합으로 입력되는 기호 → 기반 키
const SHIFTED = {
  "!":"1","@":"2","#":"3","$":"4","%":"5","^":"6","&":"7","*":"8","(":"9",")":"0",
  "_":"-","+":"=","{":"[","}":"]","|":"\\",":":";",'"':"'","<":",",">":".","?":"/","~":"`",
};

function charToKey(ch) {
  if (/^[a-z]$/.test(ch)) return { key: ch, code: `Key${ch.toUpperCase()}`, kc: ch.toUpperCase().charCodeAt(0), text: ch };
  if (/^[A-Z]$/.test(ch)) return { key: ch, code: `Key${ch}`, kc: ch.charCodeAt(0), text: ch, shift: true };
  if (/^[0-9]$/.test(ch)) return { key: ch, code: `Digit${ch}`, kc: ch.charCodeAt(0), text: ch };
  if (SYM[ch])     return { key: ch, ...SYM[ch], text: ch };
  if (SHIFTED[ch]) {
    const base = SHIFTED[ch];
    const info = SYM[base] ?? { code: `Digit${base}`, kc: base.charCodeAt(0) };
    return { key: ch, ...info, text: ch, shift: true };
  }
  // 호환 자모(ㅋㅋ), 이모지 등 — IME 없이 텍스트만 삽입
  return { insertOnly: true, text: ch };
}

// ============================================================
// 특수 키
// ============================================================

const SPECIAL = {
  Enter:      { code: "Enter",      kc: 13, text: "\r" },
  Tab:        { code: "Tab",        kc: 9,  text: "\t" },
  Backspace:  { code: "Backspace",  kc: 8  },
  Delete:     { code: "Delete",     kc: 46 },
  Escape:     { code: "Escape",     kc: 27 },
  ArrowLeft:  { code: "ArrowLeft",  kc: 37 },
  ArrowRight: { code: "ArrowRight", kc: 39 },
  ArrowUp:    { code: "ArrowUp",    kc: 38 },
  ArrowDown:  { code: "ArrowDown",  kc: 40 },
  Home:       { code: "Home",       kc: 36 },
  End:        { code: "End",        kc: 35 },
  PageUp:     { code: "PageUp",     kc: 33 },
  PageDown:   { code: "PageDown",   kc: 34 },
};

// ============================================================
// 한글 자모 / 두벌식
// ============================================================

const HANGUL_BASE = 0xAC00;
const HANGUL_LAST = 0xD7A3;

const CHO  = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".split("");
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".split("");
const JONG = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ".split("")];

// 두벌식에서 두 타에 걸쳐 입력되는 복합 자모
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
const JUNG_REV = Object.fromEntries(Object.entries(JUNG_COMPOUND).map(([k, v]) => [v.join(""), k]));
const JONG_REV = Object.fromEntries(Object.entries(JONG_COMPOUND).map(([k, v]) => [v.join(""), k]));

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

export function isHangulSyllable(ch) {
  const c = ch.charCodeAt(0);
  return c >= HANGUL_BASE && c <= HANGUL_LAST;
}

/** 음절 → 단계별 화면 표시 시퀀스. 예: "안" → ["ㅇ","아","안"] */
export function syllableToSteps(syllable) {
  const code    = syllable.charCodeAt(0) - HANGUL_BASE;
  const choIdx  = Math.floor(code / 588);
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

// ============================================================
// 오타 시뮬레이션
// ============================================================

const NEIGHBORS = {
  a:"sqwz", b:"vghn", c:"xdfv", d:"serfcx", e:"wsdr", f:"drtgvc", g:"ftyhbv",
  h:"gyujnb", i:"ujko", j:"huiknm", k:"jiolm", l:"kop", m:"njk", n:"bhjm",
  o:"iklp", p:"ol", q:"wa", r:"edft", s:"awedxz", t:"rfgy", u:"yhji",
  v:"cfgb", w:"qase", x:"zsdc", y:"tghu", z:"asx",
};

function neighborTypo(ch) {
  const pool = NEIGHBORS[ch.toLowerCase()];
  if (!pool) return null;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return ch === ch.toUpperCase() ? pick.toUpperCase() : pick;
}

// ============================================================
// 저수준: 단일 키 입력
// ============================================================

/** ASCII / 기호 한 글자 입력 (keyDown + keyUp). 비ASCII는 Input.insertText로 폴백. */
export async function typeChar(send, ch) {
  const info = charToKey(ch);
  if (info.insertOnly) {
    await send("Input.insertText", { text: ch });
    return;
  }

  const modifiers = mods({ shift: info.shift });
  const base = {
    key: info.key, code: info.code,
    windowsVirtualKeyCode: info.kc, nativeVirtualKeyCode: info.kc,
    modifiers,
  };

  await send("Input.dispatchKeyEvent", {
    ...base, type: "keyDown",
    text: info.text, unmodifiedText: info.text,
  });
  await sleep(rand(20, 80)); // 키가 눌려있는 시간
  await send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
}

/** 특수 키 한 번 누름 (Enter / Backspace / Arrow* 등). modifierOpts에 { shift, ctrl, alt, meta } 전달 가능 */
export async function pressKey(send, name, modifierOpts = {}) {
  const s = SPECIAL[name];
  if (!s) throw new Error(`unknown key: ${name}`);
  const modifiers = mods(modifierOpts);
  const base = {
    key: name, code: s.code,
    windowsVirtualKeyCode: s.kc, nativeVirtualKeyCode: s.kc,
    modifiers,
  };
  await send("Input.dispatchKeyEvent", {
    ...base, type: "keyDown",
    ...(s.text ? { text: s.text, unmodifiedText: s.text } : {}),
  });
  await sleep(rand(25, 70));
  await send("Input.dispatchKeyEvent", { ...base, type: "keyUp" });
}

/**
 * 한글 음절 한 글자를 두벌식 자모 단위로 IME 조합 후 확정.
 * 발생 이벤트: keydown(keyCode=229) × N → compositionstart → compositionupdate × N → compositionend + input
 */
export async function typeHangulSyllable(send, syllable, opts = {}) {
  const baseDelay = opts.baseDelay ?? 60000 / 280;
  const jitter    = opts.jitter    ?? 0.6;

  const code    = syllable.charCodeAt(0) - HANGUL_BASE;
  const choIdx  = Math.floor(code / 588);
  const jungIdx = Math.floor((code % 588) / 28);
  const jongIdx = code % 28;

  // 실제로 누르는 자모 키 시퀀스 (복합 자모는 두 타로 쪼갬)
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
    const modifiers = mods({ shift: k.shift });

    // 1) IME 표준 keyDown: code는 물리 두벌식 키, keyCode는 229("IME 처리 중")
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Process",
      code: k.code,
      windowsVirtualKeyCode: 229,
      nativeVirtualKeyCode: 229,
      modifiers,
    });

    // 2) compositionstart / compositionupdate
    await send("Input.imeSetComposition", {
      text: steps[i],
      selectionStart: steps[i].length,
      selectionEnd: steps[i].length,
    });

    await sleep(rand(20, 60));

    // 3) keyUp — IME가 처리한 자모를 노출
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: jamo,
      code: k.code,
      windowsVirtualKeyCode: k.kc,
      nativeVirtualKeyCode: k.kc,
      modifiers,
    });

    if (i < jamos.length - 1) {
      await sleep(baseDelay * rand(1 - jitter, 1 + jitter));
    }
  }

  // 4) compositionend + input — 음절 확정
  await send("Input.insertText", { text: syllable });
}

// ============================================================
// 고수준: 사람처럼 문자열 입력
// ============================================================

/**
 * 사람처럼 자연스러운 간격으로 텍스트를 타이핑한다.
 *
 * @param {Function} send  CDP send 함수 — (method, params) => Promise
 * @param {string}   text
 * @param {object}   [opts]
 * @param {number}   [opts.wpm=280]          분당 글자 수 (사람 평균 250~400)
 * @param {number}   [opts.jitter=0.55]      글자 간격 변동폭 (0=등속, 1=강함)
 * @param {number}   [opts.pauseChance=0.04] "잠깐 멈춤" 발생 확률
 * @param {number}   [opts.typoChance=0]     영문 오타 후 백스페이스 정정 확률
 */
export async function humanType(send, text, opts = {}) {
  const wpm         = opts.wpm         ?? 280;
  const jitter      = opts.jitter      ?? 0.55;
  const pauseChance = opts.pauseChance ?? 0.04;
  const typoChance  = opts.typoChance  ?? 0;
  const baseDelay   = 60000 / wpm;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (isHangulSyllable(ch)) {
      await typeHangulSyllable(send, ch, { baseDelay, jitter });
    } else if (ch === "\n") {
      await pressKey(send, "Enter");
    } else if (ch === "\t") {
      await pressKey(send, "Tab");
    } else {
      // 영문 오타 → 인지 지연 → 백스페이스 → 정정
      if (typoChance > 0 && /[a-zA-Z]/.test(ch) && Math.random() < typoChance) {
        const typo = neighborTypo(ch);
        if (typo) {
          await typeChar(send, typo);
          await sleep(rand(180, 480));
          await pressKey(send, "Backspace");
          await sleep(rand(70, 180));
        }
      }
      await typeChar(send, ch);
    }

    let delay = baseDelay * rand(1 - jitter, 1 + jitter);
    if (/[ ,.!?;:)]/.test(ch))       delay += rand(40, 160);
    if (ch === "\n")                  delay += rand(120, 400);
    if (Math.random() < pauseChance)  delay += rand(300, 1100);

    await sleep(Math.max(8, delay));
  }
}
