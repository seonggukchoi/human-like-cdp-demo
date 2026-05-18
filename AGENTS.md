# CDP Human Input Modules — 에이전트 가이드

사람처럼 자연스러운 마우스/키보드 입력을 CDP(Chrome DevTools Protocol)로 시뮬레이션하는 두 ES 모듈의 사용법.

- `human-mouse.mjs` — 이동/클릭/호버/휠/드래그/idle 떨림
- `human-keyboard.mjs` — ASCII 키 입력/한글 IME 조합/특수 키/WPM 기반 자연 간격

## 공통 규약

모든 함수의 첫 인자는 CDP `send` 함수 — `(method, params) => Promise<any>` 시그니처.
좌표계는 CSS 픽셀(viewport 기준). selector를 받는 함수는 내부에서 `Runtime.evaluate`로 중앙 좌표를 계산한다.

```js
// Playwright
const cdp  = await page.context().newCDPSession(page);
const send = (m, p) => cdp.send(m, p);

// Puppeteer
const cdp  = await page.target().createCDPSession();
const send = (m, p) => cdp.send(m, p);

// chrome-remote-interface
import CDP from "chrome-remote-interface";
const client = await CDP();
const send = (m, p) => client.send(m, p);
```

`target` 인자는 모두 `string`(CSS selector) 또는 `{ x: number, y: number }`(절대 좌표) 둘 다 받는다.

## human-mouse.mjs

### 함수 시그니처

| 함수 | 시그니처 | 용도 |
|---|---|---|
| `humanMoveTo(send, target, opts?)` | → `{x,y}` | 클릭 없이 이동 |
| `humanClick(send, target, opts?)` | → `{x,y}` | 이동 후 클릭 (더블/우클릭 옵션) |
| `humanHover(send, target, opts?)` | → `{x,y}` | 이동 후 일정 시간 머무름 (미세 떨림) |
| `humanWheel(send, deltaY, opts?)` | → `void` | 휠 스크롤 (분할 + 가속·감속) |
| `humanDrag(send, from, to, opts?)` | → `{x,y}` | 누른 채로 곡선 이동 |
| `startIdleJitter(send, opts?)` | → `void` | 백그라운드 미세 떨림 시작 |
| `stopIdleJitter()` | → `void` | 떨림 중단 |
| `getCursorPos()` / `setCursorPos(p)` | | 마지막 커서 위치 조회/지정 |
| `getElementCenter(send, selector)` | → `{x,y}` | selector → 중앙 좌표 |

### 옵션 요약

**humanMoveTo (다른 함수들이 모두 상속)**
- `start: {x,y}` — 시작 좌표 (기본: 마지막 커서 위치)
- `duration: number` — 총 이동 시간 ms (기본: 거리 비례, 350~1800)
- `fps: number` — 초당 이벤트 수 (기본 60)
- `jitter: number` — 떨림 강도 (0=직선, 1=기본)
- `button: "none"|"left"|"right"|"middle"` — 드래그 시에만 "left", 보통은 "none"

**humanClick 추가**
- `button: "left"|"right"|"middle"` (기본 "left")
- `clickCount: number` (더블클릭은 2)

**humanHover 추가**
- `dwellMs: number` (기본 500~1500 랜덤)
- `hoverJitter: number` — 떨림 반경 px (기본 2)
- `tickMs: number` — 떨림 간격 (기본 80)

**humanWheel**
- `deltaY: number` — 양수=아래, 음수=위
- `deltaX: number` (기본 0)
- `target: selector|{x,y}` — 스크롤 발생 좌표 (기본: 현재 커서)
- `ticks: number` — 나눠 보낼 횟수
- `duration: number` — 총 시간
- `pauseChance: number` — 중간 정지 확률 (기본 0.12)

**startIdleJitter**
- `radius: number` (기본 2.5px)
- `intervalMin: number`, `intervalMax: number` (기본 500/2000ms)

### 의사결정 가이드

| 하려는 것 | 함수 |
|---|---|
| 버튼/링크 클릭 | `humanClick(send, "#submit")` |
| 더블클릭 | `humanClick(send, "...", { clickCount: 2 })` |
| 우클릭(컨텍스트 메뉴) | `humanClick(send, "...", { button: "right" })` |
| 툴팁 띄우기 | `humanHover(send, "...", { dwellMs: 1000 })` |
| 페이지 아래로 스크롤 | `humanWheel(send, 600)` |
| 페이지 위로 천천히 | `humanWheel(send, -300, { pauseChance: 0.35 })` |
| 카드/엘리먼트 드래그 | `humanDrag(send, "#card", "#zone-b")` |
| 봇 탐지 회피 강화 | `startIdleJitter(send)` (시작 시) + `stopIdleJitter()` (종료 시) |

### 주의사항

- **HTML5 native drag API 미지원**: `humanDrag`는 `mousedown` → `mousemove` → `mouseup` 이벤트 기반 드래그에만 작동한다. `dragstart`/`dragover`/`drop` 이벤트 의존 페이지는 별도 처리 필요.
- **selector vs 좌표**: 동적 페이지에서 selector를 쓰면 매 호출마다 좌표를 다시 계산한다. 같은 위치를 여러 번 쓸 거면 한 번 `getElementCenter`로 좌표를 받아 캐싱.
- **idle jitter 충돌 방지**: 내장 `busyCount`로 다른 동작 중엔 떨림 이벤트를 보내지 않으므로 별도 토글 불필요.
- **viewport 외부 좌표**: selector가 화면 밖에 있으면 `humanWheel`로 먼저 스크롤한 뒤 selector를 호출.

## human-keyboard.mjs

### 함수 시그니처

| 함수 | 시그니처 | 용도 |
|---|---|---|
| `humanType(send, text, opts?)` | → `void` | 문자열 한 줄 자연 입력 |
| `typeChar(send, ch)` | → `void` | ASCII/기호 한 글자 |
| `typeHangulSyllable(send, syllable, opts?)` | → `void` | 한글 음절 한 글자 (IME 조합) |
| `pressKey(send, name, modifierOpts?)` | → `void` | 특수 키 (Enter/Tab/Backspace/Arrow*/Esc/Home/End/PageUp/PageDown/Delete) |
| `isHangulSyllable(ch)` / `syllableToSteps(s)` | | 유틸 |

### 옵션 요약

**humanType**
- `wpm: number` — 분당 글자 수 (기본 280, 사람 평균 250~400)
- `jitter: number` — 글자 간격 변동폭 (기본 0.55, 0=등속)
- `pauseChance: number` — 간헐적 긴 정지 확률 (기본 0.04)
- `typoChance: number` — 영문 오타 후 백스페이스 정정 확률 (기본 0)

**pressKey의 modifierOpts**
- `{ shift, ctrl, alt, meta }` — boolean, 비트마스크로 합쳐짐

### 의사결정 가이드

| 하려는 것 | 코드 |
|---|---|
| 일반 문자열 입력 | `humanType(send, "Hello, 안녕")` |
| 빠르게 입력 | `humanType(send, "...", { wpm: 360 })` |
| 사람티 더 내기 (오타+정정) | `humanType(send, "...", { typoChance: 0.04 })` |
| Enter 키 | `pressKey(send, "Enter")` |
| Ctrl+A (전체 선택) | `pressKey(send, "a", { ctrl: true })` — ❌ 안 됨, 아래 참고 |
| Shift+Tab | `pressKey(send, "Tab", { shift: true })` |
| 화살표로 이동 | `pressKey(send, "ArrowDown")` |

> **모디파이어 조합 주의**: `pressKey`는 `SPECIAL` 테이블의 키만 지원한다. `Ctrl+A` 같은 일반 문자 단축키는 `typeChar`를 직접 modifier 추가해 호출하거나 별도 함수가 필요. 자주 쓸 거면 `pressKey`를 확장하길 권장.

### 주의사항

- **한글 입력 시 keydown은 `keyCode: 229`, `key: "Process"`**: OS IME 표준 패턴. `event.key`로 한글 자모를 받으려는 페이지는 동작 안 함 (실제 IME도 동일).
- **호환 자모 단독(`ㅋㅋㅋ`)·이모지**: `isHangulSyllable`이 false라 `Input.insertText`로 폴백. `composition*` 이벤트 발생 안 함.
- **typoChance는 영문에만 적용**: 한글 음절은 자모 분해 단계라 오타 시뮬레이션 적용 안 됨.
- **입력 전 포커스 필수**: 타이핑하기 전에 `humanClick`으로 입력 요소를 먼저 클릭/포커스.

## 발생 이벤트 시퀀스 (검증·디버깅용)

| 동작 | 이벤트 순서 |
|---|---|
| ASCII `'a'` | `keydown(KeyA, kc=65)` → `keypress` → `input` → `keyup` |
| 한글 `'안'` (ㅇ/ㅏ/ㄴ 3타) | `keydown(KeyD, kc=229)` → `compositionstart` → `compositionupdate "ㅇ"` → `keyup(KeyD, kc=68)` → (2회 더) → `compositionend "안"` + `input` |
| 클릭 | `mouseMoved × N` → `mousedown` → `mouseup` → `click` |
| 휠 스크롤 | `wheel × ticks` (보통 4~24회) |
| 드래그 | `mouseMoved → mousedown → mouseMoved × N (button:left) → mouseup` |
| 호버 | `mouseMoved × N` (도착 후 `dwellMs` 동안 미세 떨림) |

## 함께 쓰기 — 전형적 시나리오

```js
import { chromium } from "playwright";
import {
  humanClick, humanHover, humanWheel, humanDrag,
  startIdleJitter, stopIdleJitter,
} from "./human-mouse.mjs";
import { humanType, pressKey } from "./human-keyboard.mjs";

const browser = await chromium.launch({ headless: false });
const page    = await browser.newPage();
const cdp     = await page.context().newCDPSession(page);
const send    = (m, p) => cdp.send(m, p);

await page.goto("https://example.com/form");

startIdleJitter(send);

// 폼 작성
await humanClick(send, "#name");
await humanType(send, "최성국");

await humanClick(send, "#email");
await humanType(send, "eric@flowlab.io", { typoChance: 0.04 });

await pressKey(send, "Tab");
await humanType(send, "오늘은 날씨가 좋네요.");

// 스크롤해서 제출 버튼 찾기
await humanWheel(send, 400);
await humanHover(send, "#submit", { dwellMs: 600 });
await humanClick(send, "#submit");

stopIdleJitter();
await browser.close();
```

## 빠른 트러블슈팅

| 증상 | 원인/해결 |
|---|---|
| 한글이 안 들어감 | 포커스 없음 → `humanClick`으로 입력 요소 선포커스 |
| keydown 핸들러가 한글에 안 걸림 | `keyCode: 229`(IME) 패턴이라 정상. `composition*` 이벤트로 분기할 것 |
| 드래그가 안 됨 | 페이지가 HTML5 drag API 기반 → mouse 이벤트 기반으로 바꾸거나 별도 처리 |
| 휠로 스크롤이 안 일어남 | 스크롤 컨테이너가 따로 있음 → `humanWheel(send, dy, { target: "#scrollable" })` |
| 좌표가 어긋남 | viewport 외부거나 fixed 요소 가림 → 먼저 스크롤 후 호출 |
| 너무 빠름/느림 | `humanType`의 `wpm` / `humanMoveTo`의 `duration` 조정 |
