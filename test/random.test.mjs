// human-random.mjs 단위 테스트
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashSeed, createRng, makeAR1, clamp } from "../human-random.mjs";

test("clamp: 경계로 절단", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test("hashSeed: 결정적, 숫자는 그대로(>>>0)", () => {
  assert.equal(hashSeed("abc"), hashSeed("abc"));
  assert.notEqual(hashSeed("abc"), hashSeed("abd"));
  assert.equal(hashSeed(42), 42);
  assert.equal(hashSeed(-1), 0xffffffff); // >>>0
});

test("createRng: 같은 시드 → 같은 수열(재현성)", () => {
  const a = createRng("seed-1");
  const b = createRng("seed-1");
  assert.equal(a.seed, b.seed);
  for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next());
});

test("createRng: 다른 시드 → 다른 수열", () => {
  const a = createRng("seed-1");
  const b = createRng("seed-2");
  let differ = false;
  for (let i = 0; i < 10; i++) if (a.next() !== b.next()) differ = true;
  assert.ok(differ);
});

test("range/int: 범위 안", () => {
  const rng = createRng("range-test");
  for (let i = 0; i < 1000; i++) {
    const r = rng.range(5, 9);
    assert.ok(r >= 5 && r < 9);
    const n = rng.int(3, 7);
    assert.ok(Number.isInteger(n) && n >= 3 && n <= 7);
  }
});

test("bool: 확률 근사", () => {
  const rng = createRng("bool-test");
  let cnt = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) if (rng.bool(0.3)) cnt++;
  assert.ok(Math.abs(cnt / N - 0.3) < 0.02, `ratio ${cnt / N}`);
});

test("gaussian: 평균≈0, 분산≈1", () => {
  const rng = createRng("gauss-test");
  const N = 50000;
  let sum = 0, sumSq = 0;
  for (let i = 0; i < N; i++) {
    const g = rng.gaussian();
    sum += g; sumSq += g * g;
  }
  const mean = sum / N;
  const variance = sumSq / N - mean * mean;
  assert.ok(Math.abs(mean) < 0.03, `mean ${mean}`);
  assert.ok(Math.abs(variance - 1) < 0.05, `variance ${variance}`);
});

test("logNormal: [min,max] 절단 + 양수", () => {
  const rng = createRng("logn-test");
  for (let i = 0; i < 5000; i++) {
    const v = rng.logNormal(100, 0.5, 50, 150);
    assert.ok(v >= 50 && v <= 150, `v ${v}`);
  }
});

test("logNormal: 중앙값이 median 근처", () => {
  const rng = createRng("logn-median");
  const xs = [];
  for (let i = 0; i < 20000; i++) xs.push(rng.logNormal(100, 0.4));
  xs.sort((a, b) => a - b);
  const median = xs[Math.floor(xs.length / 2)];
  assert.ok(Math.abs(median - 100) < 5, `median ${median}`);
});

test("makeAR1: [min,max] 절단 + 결정적 재현", () => {
  const a = makeAR1(createRng("ar1"), 80, { rho: 0.4, sigma: 0.3, min: 20, max: 300 });
  const b = makeAR1(createRng("ar1"), 80, { rho: 0.4, sigma: 0.3, min: 20, max: 300 });
  for (let i = 0; i < 200; i++) {
    const va = a(), vb = b();
    assert.equal(va, vb);           // 같은 시드 → 같은 시퀀스
    assert.ok(va >= 20 && va <= 300);
  }
});
