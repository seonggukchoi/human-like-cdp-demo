// human-mouse.mjs
// CDP(Input.* 도메인)로 사람처럼 마우스 동작을 시뮬레이션한다.
//   - 이동(MoveTo) / 클릭(Click) / 호버(Hover) / 휠 스크롤(Wheel) / 드래그(Drag)
//   - 베지어 곡선 + smoothstep 진행도 + 양 끝 taper 노이즈 + 가변 속도
//   - 좌표계: CSS 픽셀 (Input.dispatchMouseEvent / getBoundingClientRect 공용)
//   - selector를 넘기면 Runtime.evaluate로 요소 중앙 좌표를 자동 계산
//   - 마지막 커서 위치를 모듈 차원에서 추적, 다음 호출의 시작점으로 사용
//   - 백그라운드 idle 떨림 토글: startIdleJitter / stopIdleJitter
//     → 다른 동작 중에는 자동으로 양보 (busyCount 기반)
//
// 사용:
//   import {
//     humanMoveTo, humanClick, humanHover, humanWheel, humanDrag,
//     startIdleJitter, stopIdleJitter,
//   } from "./human-mouse.mjs";
//   const send = (m, p) => cdpSession.send(m, p);

// ============================================================
// 유틸
// ============================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand  = (lo, hi) => lo + Math.random() * (hi - lo);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3;
}
function smoothstep(t) { return t * t * (3 - 2 * t); }

// ============================================================
// 모듈 상태
// ============================================================

let cursorPos  = { x: 100, y: 100 };
let busyCount  = 0;
let idleConfig = null;
let idleTimer  = null;

export function getCursorPos() { return { ...cursorPos }; }
export function setCursorPos(p) { cursorPos = { x: p.x, y: p.y }; }

// busyCount 기반 reentrant lock — idle jitter가 다른 동작과 충돌하지 않게
async function withBusy(fn) {
  busyCount++;
  try { return await fn(); }
  finally { busyCount--; }
}

// ============================================================
// selector → 좌표
// ============================================================

export async function getElementCenter(send, selector) {
  const { result } = await send("Runtime.evaluate", {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("element not found: " + ${JSON.stringify(selector)});
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`,
    returnByValue: true,
  });
  return result.value;
}

async function resolveTarget(send, target) {
  if (typeof target === "string") return await getElementCenter(send, target);
  return target;
}

// ============================================================
// 저수준: 자연스러운 이동
// ============================================================

/**
 * 사람처럼 자연스럽게 마우스 커서를 이동시킨다.
 *
 * @param {Function} send
 * @param {string|{x:number,y:number}} target
 * @param {object} [options]
 * @param {{x:number,y:number}} [options.start]                       시작 좌표 (기본: 마지막 위치)
 * @param {number} [options.duration]                                  총 이동 시간(ms)
 * @param {number} [options.fps=60]
 * @param {number} [options.jitter=1]                                  떨림 강도 (0=직선)
 * @param {"none"|"left"|"right"|"middle"} [options.button="none"]     드래그 시 "left"
 * @returns {Promise<{x:number,y:number}>}
 */
export async function humanMoveTo(send, target, options = {}) {
  return withBusy(async () => {
    const dst    = await resolveTarget(send, target);
    const start  = options.start  ?? cursorPos;
    const button = options.button ?? "none";

    const dx   = dst.x - start.x;
    const dy   = dst.y - start.y;
    const dist = Math.hypot(dx, dy);

    const totalMs = options.duration
      ?? clamp(dist * 2.2 + (Math.random() * 400 - 200), 350, 1800);

    const fps     = options.fps    ?? 60;
    const frameMs = 1000 / fps;
    const jitter  = options.jitter ?? 1;

    const sign  = Math.random() < 0.5 ? -1 : 1;
    const swing = (60 + Math.random() * 140) * sign;

    const cp1 = {
      x: start.x + dx * 0.33 + swing,
      y: start.y + dy * 0.33 - (60 + Math.random() * 120),
    };
    const cp2 = {
      x: start.x + dx * 0.72 - swing * 0.8,
      y: start.y + dy * 0.72 + (40 + Math.random() * 120),
    };

    const phase1 = Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;

    function point(t) {
      const e = smoothstep(t);
      const taper = Math.sin(Math.PI * e);
      const nx = 4   * Math.sin(5.2 * Math.PI * e + phase1) + 2 * Math.sin(13.1 * Math.PI * e);
      const ny = 3.5 * Math.cos(4.7 * Math.PI * e + phase2) + 2 * Math.sin(11.3 * Math.PI * e);
      return {
        x: cubic(start.x, cp1.x, cp2.x, dst.x, e) + taper * nx * jitter,
        y: cubic(start.y, cp1.y, cp2.y, dst.y, e) + taper * ny * jitter,
      };
    }

    let virtual  = 0;
    let lastTime = Date.now();

    while (virtual < 1) {
      const now = Date.now();
      const dt  = Math.min(40, now - lastTime);
      lastTime  = now;

      const speedMul =
        0.82 +
        0.22 * Math.sin(2 * Math.PI * virtual * 2.1 + phase1) +
        0.12 * Math.sin(2 * Math.PI * virtual * 5.3 + phase2);

      virtual += (dt / totalMs) * clamp(speedMul, 0.42, 1.35);

      const t = Math.min(1, virtual);
      const p = point(t);

      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: p.x, y: p.y,
        button,
        pointerType: "mouse",
      });

      cursorPos = p;
      await sleep(frameMs);
    }

    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: dst.x, y: dst.y,
      button,
      pointerType: "mouse",
    });
    cursorPos = dst;
    return dst;
  });
}

// ============================================================
// 클릭
// ============================================================

/**
 * 자연스럽게 이동한 뒤 클릭한다.
 *
 * @param {Function} send
 * @param {string|{x:number,y:number}} target
 * @param {object} [options]  humanMoveTo 옵션 포함
 * @param {"left"|"right"|"middle"} [options.button="left"]
 * @param {number} [options.clickCount=1]  더블클릭은 2
 */
export async function humanClick(send, target, options = {}) {
  return withBusy(async () => {
    const dst        = await humanMoveTo(send, target, options);
    const button     = options.button     ?? "left";
    const clickCount = options.clickCount ?? 1;

    await sleep(rand(60, 140));

    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: dst.x, y: dst.y,
      button, clickCount,
      pointerType: "mouse",
    });

    await sleep(rand(40, 80));

    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: dst.x, y: dst.y,
      button, clickCount,
      pointerType: "mouse",
    });

    return dst;
  });
}

// ============================================================
// 호버 (요소 위에서 머무름)
// ============================================================

/**
 * 요소 위로 이동한 뒤 일정 시간 머문다. 머무는 동안 미세하게 떨림.
 *
 * @param {Function} send
 * @param {string|{x:number,y:number}} target
 * @param {object} [options]
 * @param {number} [options.dwellMs]        머무는 시간(ms). 기본 500~1500 랜덤
 * @param {number} [options.hoverJitter=2]  떨림 반경(px)
 * @param {number} [options.tickMs=80]      떨림 간격
 */
export async function humanHover(send, target, options = {}) {
  return withBusy(async () => {
    const dst         = await humanMoveTo(send, target, options);
    const dwellMs     = options.dwellMs     ?? rand(500, 1500);
    const hoverJitter = options.hoverJitter ?? 2;
    const tickMs      = options.tickMs      ?? 80;

    const end = Date.now() + dwellMs;
    while (Date.now() < end) {
      const dx = (Math.random() - 0.5) * hoverJitter * 2;
      const dy = (Math.random() - 0.5) * hoverJitter * 2;
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: dst.x + dx, y: dst.y + dy,
        button: "none",
        pointerType: "mouse",
      });
      await sleep(tickMs * rand(0.7, 1.3));
    }

    // 정확한 위치로 복귀
    await send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: dst.x, y: dst.y,
      button: "none",
      pointerType: "mouse",
    });
    cursorPos = dst;
    return dst;
  });
}

// ============================================================
// 휠 스크롤
// ============================================================

/**
 * 사람처럼 자연스럽게 스크롤한다. 한 번의 큰 휠 이벤트가 아니라
 * 여러 tick으로 가속·감속하며 보내고, 가끔 중간 정지를 섞는다.
 *
 * @param {Function} send
 * @param {number} deltaY                              누적 스크롤 양(px). 양수=아래
 * @param {object} [options]
 * @param {number} [options.deltaX=0]
 * @param {string|{x:number,y:number}} [options.target]  스크롤 발생 좌표 (기본: 현재 커서)
 * @param {number} [options.ticks]                       나눠 보낼 횟수 (기본: 양에 따라 4~24)
 * @param {number} [options.duration]                    총 시간(ms)
 * @param {number} [options.pauseChance=0.12]            중간 정지 확률
 */
export async function humanWheel(send, deltaY, options = {}) {
  return withBusy(async () => {
    const deltaX = options.deltaX ?? 0;
    const pos = options.target
      ? await resolveTarget(send, options.target)
      : cursorPos;

    const totalAbs    = Math.max(1, Math.hypot(deltaX, deltaY));
    const ticks       = options.ticks       ?? clamp(Math.ceil(totalAbs / 70), 4, 24);
    const totalMs     = options.duration    ?? clamp(totalAbs * 1.4 + 280, 380, 2400);
    const pauseChance = options.pauseChance ?? 0.12;

    let sentX = 0;
    let sentY = 0;
    const frameMsBase = totalMs / ticks;

    for (let i = 1; i <= ticks; i++) {
      // smoothstep 누적 → 가속·감속
      const e = smoothstep(i / ticks);
      const targetX = deltaX * e;
      const targetY = deltaY * e;
      const dx = targetX - sentX;
      const dy = targetY - sentY;
      sentX = targetX;
      sentY = targetY;

      await send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: pos.x, y: pos.y,
        deltaX: dx, deltaY: dy,
        pointerType: "mouse",
      });

      let wait = frameMsBase * rand(0.6, 1.4);
      if (i < ticks && Math.random() < pauseChance) wait += rand(180, 600);
      await sleep(wait);
    }
  });
}

// ============================================================
// 드래그
// ============================================================

/**
 * 한 지점에서 다른 지점으로 사람처럼 자연스럽게 드래그한다.
 *
 * @param {Function} send
 * @param {string|{x:number,y:number}} fromTarget
 * @param {string|{x:number,y:number}} toTarget
 * @param {object} [options]  humanMoveTo 옵션 포함
 * @param {"left"|"right"|"middle"} [options.button="left"]
 */
export async function humanDrag(send, fromTarget, toTarget, options = {}) {
  return withBusy(async () => {
    const button = options.button ?? "left";
    const from   = await resolveTarget(send, fromTarget);

    // 1) 시작점으로 자연스럽게 이동
    await humanMoveTo(send, from, options);
    await sleep(rand(100, 220));

    // 2) 누르기
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: from.x, y: from.y,
      button, clickCount: 1,
      pointerType: "mouse",
    });
    await sleep(rand(60, 160));

    // 3) 누른 상태로 곡선 이동 (button 옵션 전달)
    const dst = await humanMoveTo(send, toTarget, { ...options, button, start: from });
    await sleep(rand(80, 180));

    // 4) 떼기
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: dst.x, y: dst.y,
      button, clickCount: 1,
      pointerType: "mouse",
    });

    return dst;
  });
}

// ============================================================
// idle 떨림 (백그라운드, 다른 동작과 자동 양보)
// ============================================================

function scheduleIdleTick() {
  if (!idleConfig) return;
  const { intervalMin, intervalMax } = idleConfig;
  idleTimer = setTimeout(idleTick, rand(intervalMin, intervalMax));
}

async function idleTick() {
  if (!idleConfig) return;
  // 다른 동작 중이면 이벤트는 안 보내고 다음 tick만 다시 스케줄
  if (busyCount === 0) {
    const { send, radius } = idleConfig;
    const dx = (Math.random() - 0.5) * radius * 2;
    const dy = (Math.random() - 0.5) * radius * 2;
    try {
      await send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: cursorPos.x + dx,
        y: cursorPos.y + dy,
        button: "none",
        pointerType: "mouse",
      });
    } catch {}
    // cursorPos는 변경하지 않음 — 떨림은 의도된 좌표를 흔들리게 만들지 않게
  }
  scheduleIdleTick();
}

/**
 * 백그라운드에서 미세 떨림을 주기적으로 발생시킨다. 다른 동작 중에는 자동 양보.
 *
 * @param {Function} send
 * @param {object} [options]
 * @param {number} [options.radius=2.5]        떨림 반경(px)
 * @param {number} [options.intervalMin=500]   tick 간격 최소(ms)
 * @param {number} [options.intervalMax=2000]  tick 간격 최대(ms)
 */
export function startIdleJitter(send, options = {}) {
  if (idleConfig) return;
  idleConfig = {
    send,
    radius:      options.radius      ?? 2.5,
    intervalMin: options.intervalMin ?? 500,
    intervalMax: options.intervalMax ?? 2000,
  };
  scheduleIdleTick();
}

export function stopIdleJitter() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  idleConfig = null;
}
