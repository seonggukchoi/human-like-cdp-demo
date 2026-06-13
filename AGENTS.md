# CDP Human Input Modules — 에이전트 가이드

CDP(Chrome DevTools Protocol)로 사람처럼 마우스/키보드 입력을 시뮬레이션하는 모듈 묶음.

- `human-random.mjs` — 시드 PRNG + 로그정규/가우시안 분포 + AR(1) 리듬
- `persona.mjs` — 세션 = 한 사람. 성향(속도·곡선·오타율·리듬)을 시드로 고정
- `stealth.mjs` — 자동화 1차 신호 차단(`navigator.webdriver` 등)
- `human-mouse.mjs` — 이동/클릭/호버/휠/드래그/idle 떨림
- `human-keyboard.mjs` — ASCII 키 입력/한글 IME 조합/특수 키/자연 간격

## 공통 규약

- 모든 동작 함수의 첫 인자는 CDP `send` — `(method, params) => Promise<any>`.
- 좌표계는 CSS 픽셀(viewport 기준). selector를 받는 함수는 `Runtime.evaluate`로 좌표를 계산한다.
- `target` 인자는 `string`(CSS selector) 또는 `{x, y}`(절대 좌표)를 받는다. 일부는 `getElementBox` 결과(bbox)도 받는다.
- **페르소나를 먼저 주입**한다. 안 하면 각 모듈이 첫 호출 때 랜덤 페르소나를 lazy 생성한다(세션 일관성을 위해 명시 주입 권장).

```js
import { createPersona } from "./persona.mjs";
import * as mouse from "./human-mouse.mjs";
import * as kbd from "./human-keyboard.mjs";

const persona = createPersona("session-seed");  // 시드 고정 → 재현 가능
mouse.setPersona(persona);
kbd.setPersona(persona);

// send 어댑터
const cdp  = await page.context().newCDPSession(page);   // Playwright
const send = (m, p) => cdp.send(m, p);
```

> 마우스와 키보드는 **같은 persona 인스턴스**를 공유해야 한 사람처럼 보인다. 두 모듈에 각각 `setPersona(persona)` 호출.

## human-mouse.mjs

### 함수 시그니처

| 함수 | 반환 | 용도 |
|---|---|---|
| `humanMoveTo(send, target, opts?)` | `{x,y}` | 이동 (오버슈트 보정 포함) |
| `humanClick(send, target, opts?)` | `{x,y}` | 이동 후 클릭 (요소 내 가우시안 분산) |
| `humanHover(send, target, opts?)` | `{x,y}` | 이동 후 머무름 (미세 떨림) |
| `humanWheel(send, deltaY, opts?)` | `void` | 휠 스크롤 (분할 + 가속·감속) |
| `humanDrag(send, from, to, opts?)` | `{x,y}` | 누른 채로 곡선 이동 |
| `startIdleJitter(send, opts?)` / `stopIdleJitter()` | `void` | 백그라운드 미세 떨림 |
| `getElementBox(send, selector)` | bbox | `{x,y,width,height,cx,cy}` |
| `getElementCenter(send, selector)` | `{x,y}` | 중앙 좌표 |
| `getCursorPos()` / `setCursorPos(p)` | | 마지막 커서 위치 |
| `setPersona(p)` / `getPersona()` | | 페르소나 주입/조회 |

### 옵션 요약

기본값은 대부분 **페르소나에서 결정**된다. 아래는 호출 시 override 가능한 것들.

**humanMoveTo** (Click/Hover/Drag가 상속)
- `start: {x,y}` — 시작 좌표 (기본: 마지막 커서 위치)
- `duration: number` — 총 이동 시간 ms (기본: 페르소나 `moveDuration(dist)`)
- `jitter: number` — 떨림 강도 override (기본: 페르소나 `mouse.jitter`)
- `button: "none"|"left"|"right"|"middle"` — 드래그 중에는 "left"
- `overshoot: boolean` — 오버슈트 강제 on/off (기본: 거리>140 && 페르소나 확률)

**humanClick** (+ moveTo)
- `button: "left"|"right"|"middle"` (기본 "left")
- `clickCount: number` (더블클릭 2)
- 클릭 지점은 selector/bbox면 요소 안에서 가우시안 분산. `{x,y}` 직접 지정이면 그대로.

**humanHover** (+ moveTo)
- `dwellMs: number` (기본: 페르소나 `readPause`)
- `hoverJitter: number` 떨림 반경 px (기본: 페르소나 `idleRadius`)

**humanWheel**
- `deltaY: number` — 양수=아래, 음수=위
- `deltaX: number` (기본 0)
- `target: selector|{x,y}` — 스크롤 발생 좌표 (기본: 현재 커서)
- `ticks: number` / `duration: number` (기본: 양에 비례)
- `pauseChance: number` 중간 정지 확률 (기본 0.12)

**startIdleJitter**
- `radius: number` (기본: 페르소나 `idleRadius`)
- `intervalMin`/`intervalMax` ms (기본 600/2400)

### 의사결정 가이드

| 하려는 것 | 함수 |
|---|---|
| 버튼/링크 클릭 | `humanClick(send, "#submit")` |
| 더블클릭 / 우클릭 | `humanClick(send, "...", { clickCount: 2 })` / `{ button: "right" }` |
| 툴팁 띄우기 | `humanHover(send, "...", { dwellMs: 1000 })` |
| 아래로/위로 스크롤 | `humanWheel(send, 600)` / `humanWheel(send, -300, { pauseChance: 0.35 })` |
| 엘리먼트 드래그 | `humanDrag(send, "#card", "#zone-b")` |
| 봇 탐지 회피 강화 | `startIdleJitter(send)` … `stopIdleJitter()` |

### 주의사항

- **HTML5 native drag 미지원**: `humanDrag`는 `mousedown→mousemove→mouseup` 기반에만 작동. `dragstart`/`drop` 의존 페이지는 별도 처리.
- **클릭 분산**: 정중앙을 원하면 `getElementCenter`로 좌표를 받아 `{x,y}`로 전달(직접 좌표는 분산 안 함).
- **idle jitter 충돌 방지**: 내장 `busyCount`로 다른 동작 중엔 떨림을 보내지 않는다.
- **viewport 외부**: 화면 밖 selector는 `humanWheel`로 먼저 스크롤 후 호출.

## human-keyboard.mjs

### 함수 시그니처

| 함수 | 반환 | 용도 |
|---|---|---|
| `humanType(send, text, opts?)` | `void` | 문자열 자연 입력 (한글+영문 혼용 OK) |
| `typeChar(send, ch)` | `void` | ASCII/기호 한 글자 |
| `typeHangulSyllable(send, syllable, opts?)` | `void` | 한글 음절 한 글자 (IME 조합) |
| `pressKey(send, name, modifierOpts?)` | `void` | 특수 키 (Enter/Tab/Backspace/Arrow*/Esc/Home/End/PageUp/PageDown/Delete) |
| `isHangulSyllable(ch)` / `syllableToSteps(s)` | | 유틸 |
| `setPersona(p)` / `getPersona()` | | 페르소나 주입/조회 |

### 옵션 요약

속도·리듬·오타율은 **페르소나가 결정**한다. `humanType` opts는 override만.

**humanType**
- `typoChance: number` — 오타 후 정정 확률 (기본: 페르소나 `typoRate`). 인접 키 + transposition(순서 바뀜) 두 유형.
- `rollover: boolean` — 키 롤오버 on/off (기본 true). 빠른 연타 시 이전 키를 떼기 전에 다음 키를 누른다.

**pressKey의 modifierOpts**
- `{ shift, ctrl, alt, meta }` — boolean, 비트마스크로 합쳐짐.

### 의사결정 가이드

| 하려는 것 | 코드 |
|---|---|
| 일반 입력 | `humanType(send, "Hello, 안녕")` |
| 오타까지 내기 | `humanType(send, "...", { typoChance: 0.05 })` |
| 롤오버 끄기(또박또박) | `humanType(send, "...", { rollover: false })` |
| Enter / 화살표 | `pressKey(send, "Enter")` / `pressKey(send, "ArrowDown")` |
| Shift+Tab | `pressKey(send, "Tab", { shift: true })` |

> **속도 조정**: 분당 타수는 페르소나의 `strokesPerMin`(기본 420~490)에서 온다. 전 세션을 바꾸려면 `persona.mjs`의 범위를, 한 번만 바꾸려면 `createPersona` 후 객체를 직접 손본다(아래 페르소나 섹션).

> **모디파이어 조합 주의**: `pressKey`는 `SPECIAL` 테이블의 키만 지원. `Ctrl+A` 같은 문자 단축키는 별도 처리가 필요(`pressKey` 확장 권장).

### 주의사항

- **한글 keydown은 `keyCode: 229`, `key: "Process"`** — OS IME 표준 패턴. `event.key`로 자모를 받으려는 페이지는 동작 안 함(실제 IME도 동일).
- **호환 자모 단독(`ㅋㅋㅋ`)·이모지** — `isHangulSyllable`이 false라 `Input.insertText`로 폴백, `composition*` 이벤트 없음.
- **typoChance는 영문에만 적용** — 한글 음절은 자모 분해 단계라 오타 미적용.
- **입력 전 포커스 필수** — `humanClick`으로 입력 요소를 먼저 포커스.

## persona.mjs

```js
const persona = createPersona(seed?);  // seed 생략 시 매번 다른 사람
```

반환 객체:

| 경로 | 의미 |
|---|---|
| `persona.seed` | 해석된 32비트 시드 |
| `persona.rng` | 전용 RNG (`range/int/bool/pick/gaussian/normal/logNormal/gaussian2D`) |
| `persona.mouse` | `msPerPx, minDuration, maxDuration, curviness, jitter, overshootProb, overshootScale, clickPrecision, pressDrift, pollMs` |
| `persona.keyboard` | `strokesPerMin, baseDelay, holdMedian, rhythmRho, rhythmSigma, rolloverProb, typoRate, pauseChance, punctPause` |
| `persona.behavior` | `readMedian, betweenActions, idleRadius` |
| `persona.moveDuration(dist)` | 거리 → 이동 시간(ms) |
| `persona.readPause(scale?)` / `actionGap(scale?)` | 읽기/동작 간 텀 |
| `persona.typingRhythm()` | AR(1) 키 간격 생성기(세션 상태 유지) |

한 번만 속도를 바꾸는 예:

```js
const p = createPersona("eric");
p.keyboard.strokesPerMin = 600;                       // 빠르게
p.keyboard.baseDelay = 60000 / 600 - p.keyboard.holdMedian;
mouse.setPersona(p); kbd.setPersona(p);
```

## stealth.mjs

```js
import { applyStealth, applyStealthCDP, STEALTH_LAUNCH_ARGS } from "./stealth.mjs";

const browser = await chromium.launch({ args: STEALTH_LAUNCH_ARGS });
const ctx = await browser.newContext();
await applyStealth(ctx);          // Playwright page/context, goto 전
// 또는 CDP 직접: await applyStealthCDP(send);
```

- `applyStealth(pageOrContext)` — `addInitScript`로 새 문서마다 주입(`navigator.webdriver`/`languages`/`plugins`/`permissions`/WebGL/`cdc_` 흔적).
- `applyStealthCDP(send)` — `Page.addScriptToEvaluateOnNewDocument`로 동일 주입.
- **만능 아님**: 상용 안티봇은 수백 신호를 종합한다. 진지한 용도는 `playwright-extra` + stealth 플러그인 병행.

## 발생 이벤트 시퀀스 (검증·디버깅용)

| 동작 | 이벤트 순서 |
|---|---|
| ASCII `'a'` | `keydown(KeyA, kc=65)` → `keypress` → `input` → `keyup` |
| 빠른 롤오버 `'as'` | `keydown(a)` → `keydown(s)` → `keyup(a)` → `keyup(s)` (겹침) |
| 한글 `'안'` (ㅇ/ㅏ/ㄴ 3타) | `keydown(KeyD, kc=229)` → `compositionstart` → `compositionupdate "ㅇ"` → `keyup(KeyD, kc=68)` → (2회 더) → `compositionend "안"` + `input` |
| 클릭 | `mouseMoved × N`(정수좌표, 오버슈트 시 보정 leg 포함) → `mousedown` → (press 드리프트) → `mouseup` → `click` |
| 휠 | `wheel × ticks` (보통 4~26회, 로그정규 간격) |
| 드래그 | `mousedown → mouseMoved × N (button:left) → mouseup` |

## 함께 쓰기 — 전형적 시나리오

```js
import { createPersona } from "./persona.mjs";
import { applyStealth, STEALTH_LAUNCH_ARGS } from "./stealth.mjs";
import * as mouse from "./human-mouse.mjs";
import * as kbd from "./human-keyboard.mjs";

const persona = createPersona("eric-2026");
mouse.setPersona(persona);
kbd.setPersona(persona);

const browser = await chromium.launch({ headless: false, args: STEALTH_LAUNCH_ARGS });
const ctx = await browser.newContext();
await applyStealth(ctx);
const page = await ctx.newPage();
const cdp  = await ctx.newCDPSession(page);
const send = (m, p) => cdp.send(m, p);

await page.goto("https://example.com/form");
mouse.startIdleJitter(send);

await mouse.humanClick(send, "#name");
await kbd.humanType(send, "최성국");

await mouse.humanClick(send, "#email");
await kbd.humanType(send, "eric@flowlab.io", { typoChance: 0.04 });

await mouse.humanWheel(send, 400);
await mouse.humanHover(send, "#submit", { dwellMs: 600 });
await mouse.humanClick(send, "#submit");

mouse.stopIdleJitter();
await browser.close();
```

## 빠른 트러블슈팅

| 증상 | 원인/해결 |
|---|---|
| 한글이 안 들어감 | 포커스 없음 → `humanClick`으로 입력 요소 선포커스 |
| keydown 핸들러가 한글에 안 걸림 | `keyCode: 229`(IME) 패턴이라 정상. `composition*`로 분기 |
| 동작마다 다른 사람 같음 | 페르소나 미주입 → `setPersona`로 같은 인스턴스 공유 |
| 타이핑이 너무 빠름/느림 | 페르소나 `strokesPerMin` 조정 (위 persona 섹션) |
| 클릭이 항상 정중앙 아님 | 의도된 가우시안 분산. 정중앙은 `getElementCenter` 좌표 전달 |
| 드래그가 안 됨 | HTML5 drag API 기반 → mouse 이벤트 기반으로 바꾸거나 별도 처리 |
| 휠로 스크롤 안 됨 | 스크롤 컨테이너 지정 → `humanWheel(send, dy, { target: "#scrollable" })` |
| `navigator.webdriver`가 true | `applyStealth`를 `page.goto` **전에** 호출했는지 확인 |
