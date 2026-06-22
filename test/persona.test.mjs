// persona.mjs 테스트 — 재현성과 파라미터 범위
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPersona } from "../persona.mjs";

test("createPersona: 같은 시드 → 같은 성향(재현성)", () => {
  const a = createPersona("eric");
  const b = createPersona("eric");
  assert.equal(a.seed, b.seed);
  assert.equal(a.keyboard.strokesPerMin, b.keyboard.strokesPerMin);
  assert.equal(a.keyboard.baseDelay, b.keyboard.baseDelay);
  assert.equal(a.mouse.msPerPx, b.mouse.msPerPx);
  assert.equal(a.mouse.curviness, b.mouse.curviness);
});

test("createPersona: 시드 다르면 성향 다름", () => {
  const a = createPersona("p1");
  const b = createPersona("p2");
  assert.notEqual(a.keyboard.strokesPerMin, b.keyboard.strokesPerMin);
});

test("keyboard: 타수·간격 파라미터 범위", () => {
  for (const seed of ["s1", "s2", "s3", "s4", "s5"]) {
    const p = createPersona(seed);
    assert.ok(p.keyboard.strokesPerMin >= 420 && p.keyboard.strokesPerMin <= 490);
    assert.ok(p.keyboard.baseDelay >= 22 && p.keyboard.baseDelay <= 360);
    assert.ok(p.keyboard.holdMedian >= 38 && p.keyboard.holdMedian <= 66);
    assert.ok(p.keyboard.typoRate >= 0 && p.keyboard.typoRate <= 0.05);
  }
});

test("mouse: 파라미터 범위", () => {
  const p = createPersona("mouse-seed");
  assert.ok(p.mouse.clickPrecision > 0 && p.mouse.clickPrecision < 1);
  assert.ok(p.mouse.overshootProb >= 0 && p.mouse.overshootProb <= 1);
  assert.ok(p.mouse.pollMs >= 6 && p.mouse.pollMs <= 11);
});

test("moveDuration: [minDuration, maxDuration] 범위", () => {
  const p = createPersona("move-seed");
  for (const dist of [10, 100, 500, 2000]) {
    for (let i = 0; i < 200; i++) {
      const d = p.moveDuration(dist);
      assert.ok(d >= p.mouse.minDuration && d <= p.mouse.maxDuration, `d ${d} dist ${dist}`);
    }
  }
});

test("typingRhythm: 양수, 상한 안", () => {
  const p = createPersona("rhythm-seed");
  for (let i = 0; i < 500; i++) {
    const g = p.typingRhythm();
    assert.ok(g > 0 && g <= p.keyboard.baseDelay * 3.5);
  }
});
