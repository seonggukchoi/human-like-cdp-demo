# human-like-cdp-demo

CDP(Chrome DevTools Protocol)로 마우스·키보드 입력을 사람처럼 흉내내는 ES 모듈과 시연 페이지.

## 구성

| 파일 | 내용 |
|---|---|
| `human-mouse.mjs` | 이동·클릭·호버·휠 스크롤·드래그·idle 떨림 |
| `human-keyboard.mjs` | ASCII 키 입력·한글 IME 자모 조합·특수 키·WPM 기반 자연 간격 |
| `demo.html` / `demo.mjs` | 기본 시연 (입력 + 클릭) |
| `demo-full.html` / `demo-full.mjs` | 풀 시나리오 (호버·드래그·스크롤 포함) |
| `AGENTS.md` | 두 모듈을 사용하는 AI 에이전트용 레퍼런스 |

## 핵심 아이디어

- **마우스**: 베지어 곡선 + smoothstep 진행도 + 양 끝 taper 노이즈 + 가변 속도. 시작·끝에서 떨림이 없고 중간만 흔들리도록 가중.
- **한글**: 두벌식으로 분해해 자모 단위로 `Input.imeSetComposition` → `Input.insertText`. keydown은 IME 표준 패턴(`keyCode: 229`, `key: "Process"`).
- **타이밍**: WPM 기반 평균에 jitter, 구두점/줄바꿈 후 가산 지연, 간헐적 긴 정지, 옵션으로 인접 키 오타 + 백스페이스 정정.

## 설치 & 실행

```bash
npm install
npx playwright install chromium
node demo-full.mjs
```

Chromium 창이 떠서 한글/영문 입력 → 호버 → 드래그앤드롭 → 휠 스크롤 시나리오가 자동 진행됩니다.

## 사용 예

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

await humanClick(send, "#name");
await humanType(send, "최성국");

await humanClick(send, "#email");
await humanType(send, "eric@flowlab.io", { typoChance: 0.04 });

await humanWheel(send, 400);
await humanHover(send, "#submit", { dwellMs: 600 });
await humanClick(send, "#submit");

stopIdleJitter();
await browser.close();
```

자세한 함수 시그니처·옵션·주의사항은 [`AGENTS.md`](./AGENTS.md) 참고.

## 라이선스

MIT
