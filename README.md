# human-like-cdp-demo

CDP(Chrome DevTools Protocol)로 마우스·키보드 입력을 사람처럼 흉내내는 ES 모듈과 통합 시연.

## 구성

| 파일 | 내용 |
|---|---|
| `human-random.mjs` | 시드 PRNG + 로그정규/가우시안 분포 + AR(1) 리듬 |
| `persona.mjs` | 세션 = 한 사람. 속도·곡선·정밀도·오타율·리듬 성향을 시드로 고정 |
| `stealth.mjs` | `navigator.webdriver` 등 자동화 1차 신호 차단 + 권장 launch args |
| `human-mouse.mjs` | 이동·클릭·호버·휠·드래그·idle 떨림 (오버슈트·정수좌표·클릭 분산) |
| `human-keyboard.mjs` | ASCII 키 입력·한글 IME 자모 조합·특수 키·롤오버·자연 간격 |
| `human-touch.mjs` | 탭·롱프레스·스와이프·터치 스크롤 + touch-capable 컨텍스트 셋업. 모바일 전용 요소(`touchstart`만 받는 위젯 등)용 |
| `demo.html` / `demo.mjs` | 통합 시연 (입력·호버·클릭 분산·드래그·스크롤) |
| `AGENTS.md` | 모듈을 사용하는 AI 에이전트용 레퍼런스 |
| `test/` · `bench.mjs` | node:test 단위 테스트(자모 분해·분포·재현성) / 타이핑 속도(타·분) 회귀 측정 |

## 핵심 아이디어

- **페르소나**: 세션 = 한 사람. 모든 동작이 한 시드에서 파생된 일관된 성향(속도·곡선·오타율·리듬)을 공유한다. `createPersona(seed)`로 재현 가능.
- **분포**: 균등분포 대신 로그정규(간격)와 AR(1)(리듬, 자기상관)을 사용 — 히스토그램이 사람에 가깝다.
- **마우스**: 베지어 곡선 + 양 끝 taper 노이즈 + 가변 속도에 더해, 목표를 살짝 지나쳤다 보정하는 오버슈트(submovement), 거리 대비 곡률 상한, 정수 좌표(중복 스킵), 클릭 위치 가우시안 분산, press 중 드리프트. selector를 받는 동작은 요소 등장을 기다리고 화면 밖이면 휠로 자동 스크롤한다.
- **터치**: 모바일 페이지의 일부 요소는 mouse가 아니라 `touchstart/touchend`에만 리스너를 단다(키패드 등). 이런 곳엔 mouse 좌표가 정확해도 입력이 안 들어간다. `enableTouch`로 컨텍스트를 touch-capable로 만들고(`navigator.maxTouchPoints>0`) `Input.dispatchTouchEvent`로 탭/스와이프를 발사한다.
- **한글**: 두벌식 자모 단위로 `Input.imeSetComposition` → `Input.insertText`. keydown은 IME 표준 패턴(`keyCode: 229`, `key: "Process"`). 오타(인접 자모) → 백스페이스 → 정타도 지원.
- **타이핑 속도**: 분당 타수(`strokesPerMin`) 기반. 기본 페르소나는 약 400~500타/분(한국식 "타", 영문 1글자=1타·한글 자모 1개=1타).
- **stealth**: 입력이 자연스러워도 `navigator.webdriver=true`면 무의미. 1차 신호를 가린다(만능 아님 — 아래 한계 참고).

## 설치 & 실행

```bash
npm install
npx playwright install chromium
node demo.mjs
```

테스트는 `npm test`(자모 분해·분포·재현성), 타이핑 속도 측정은 `npm run bench`(목표 400~500 타/분).

Chromium 창이 떠서 한글/영문 입력 → 호버 → 클릭 분산 → 드래그앤드롭 → 휠 스크롤이 자동 진행된다. 상단 패널에 이번 세션 페르소나(시드·타/분·곡선·오버슈트·오타율)와 `navigator.webdriver` 상태가 표시된다.

다른 사람으로 재현:

```bash
PERSONA_SEED=원하는값 node demo.mjs
```

## 사용 예

```js
import { chromium } from "playwright";
import { createPersona } from "./persona.mjs";
import { applyStealth, STEALTH_LAUNCH_ARGS } from "./stealth.mjs";
import * as mouse from "./human-mouse.mjs";
import * as kbd from "./human-keyboard.mjs";

// 세션 = 한 사람 (시드 고정 → 재현 가능)
const persona = createPersona("eric-2026");
mouse.setPersona(persona);
kbd.setPersona(persona);

const browser = await chromium.launch({ headless: false, args: STEALTH_LAUNCH_ARGS });
const ctx     = await browser.newContext();
await applyStealth(ctx);            // page.goto 전에 주입

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

자세한 함수 시그니처·옵션·주의사항은 [`AGENTS.md`](./AGENTS.md) 참고.

## 한계

상용 안티봇(DataDome, HUMAN 등)은 수백 개 신호를 종합한다. 이 저장소는 입력 행동과 1차 자동화 신호를 다룰 뿐, 모든 탐지를 우회하지 못한다. 진지한 용도라면 `playwright-extra` + stealth 플러그인과 병행을 권장한다.

## 라이선스

MIT
