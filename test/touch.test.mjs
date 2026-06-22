// human-touch.mjs 테스트 — CDP 터치 시퀀스 정합성 + 재현성
// (fake send로 발사된 이벤트를 기록해 검증. 실제 브라우저 불필요)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPersona } from "../persona.mjs";
import * as touch from "../human-touch.mjs";

function makeRecorder() {
  const events = [];
  const send = async (method, params) => {
    events.push({ method, params });
    return { result: { value: undefined } };
  };
  return { events, send };
}
const touchOnly = (events) =>
  events.filter((e) => e.method === "Input.dispatchTouchEvent");

test("humanTap: touchStart(1포인트) → … → touchEnd(0포인트)", async () => {
  touch.setPersona(createPersona("tap-seed"));
  const { events, send } = makeRecorder();
  await touch.humanTap(send, { x: 100, y: 200 });

  const te = touchOnly(events);
  assert.ok(te.length >= 2, "최소 start+end");
  assert.equal(te[0].params.type, "touchStart");
  assert.equal(te[0].params.touchPoints.length, 1);
  const last = te[te.length - 1];
  assert.equal(last.params.type, "touchEnd");
  assert.equal(last.params.touchPoints.length, 0); // CDP 규약: end는 비어야 함
  // 중간은 모두 touchMove(1포인트)
  for (let i = 1; i < te.length - 1; i++) {
    assert.equal(te[i].params.type, "touchMove");
    assert.equal(te[i].params.touchPoints.length, 1);
  }
});

test("humanTap: 좌표 정수 + force/radius 유효", async () => {
  touch.setPersona(createPersona("tap-seed2"));
  const { events, send } = makeRecorder();
  await touch.humanTap(send, { x: 100.7, y: 200.3 });

  const tp = touchOnly(events)[0].params.touchPoints[0];
  assert.ok(Number.isInteger(tp.x) && Number.isInteger(tp.y), "정수 좌표");
  assert.ok(tp.force > 0 && tp.force <= 1, `force ${tp.force}`);
  assert.ok(tp.radiusX > 0 && tp.radiusY > 0, "양수 반경");
});

test("humanTap: 직접 좌표는 분산 없이 그대로(정밀 좌표용)", async () => {
  touch.setPersona(createPersona("exact"));
  const { events, send } = makeRecorder();
  await touch.humanTap(send, { x: 137, y: 251 });
  const tp = touchOnly(events)[0].params.touchPoints[0];
  assert.equal(tp.x, 137);
  assert.equal(tp.y, 251);
});

test("enableTouch: setTouchEmulationEnabled 호출", async () => {
  const { events, send } = makeRecorder();
  await touch.enableTouch(send, { maxTouchPoints: 5 });
  const e = events.find((x) => x.method === "Emulation.setTouchEmulationEnabled");
  assert.ok(e, "Emulation.setTouchEmulationEnabled 발사");
  assert.equal(e.params.enabled, true);
  assert.equal(e.params.maxTouchPoints, 5);
  assert.equal(touch.isTouchEnabled(), true);
});

test("humanSwipe: touchStart → touchMove×N → touchEnd", async () => {
  touch.setPersona(createPersona("swipe-seed"));
  const { events, send } = makeRecorder();
  await touch.humanSwipe(send, { x: 100, y: 600 }, { x: 100, y: 200 });

  const te = touchOnly(events);
  assert.equal(te[0].params.type, "touchStart");
  assert.equal(te[te.length - 1].params.type, "touchEnd");
  assert.equal(te[te.length - 1].params.touchPoints.length, 0);
  const moves = te.filter((e) => e.params.type === "touchMove");
  assert.ok(moves.length >= 6, `touchMove ${moves.length}개`);
});

test("재현성: 같은 시드 → 같은 이벤트 수", async () => {
  touch.setPersona(createPersona("repro"));
  const r1 = makeRecorder();
  await touch.humanTap(r1.send, { x: 50, y: 50 });

  touch.setPersona(createPersona("repro"));
  const r2 = makeRecorder();
  await touch.humanTap(r2.send, { x: 50, y: 50 });

  assert.equal(r1.events.length, r2.events.length);
});
