// human-keyboard.mjs 한글 분해 테스트
import { test } from "node:test";
import assert from "node:assert/strict";
import { isHangulSyllable, syllableToSteps } from "../human-keyboard.mjs";

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

test("isHangulSyllable: 완성형 음절만 true", () => {
  assert.equal(isHangulSyllable("가"), true);
  assert.equal(isHangulSyllable("힣"), true);
  assert.equal(isHangulSyllable("ㄱ"), false); // 자모 단독은 아님
  assert.equal(isHangulSyllable("ㅏ"), false);
  assert.equal(isHangulSyllable("a"), false);
  assert.equal(isHangulSyllable("1"), false);
  assert.equal(isHangulSyllable("!"), false);
});

test("syllableToSteps: 마지막 step은 항상 원래 음절(round-trip, 전체 11172자)", () => {
  for (let c = HANGUL_BASE; c <= HANGUL_LAST; c++) {
    const ch = String.fromCharCode(c);
    const steps = syllableToSteps(ch);
    assert.equal(steps[steps.length - 1], ch, `last step != ${ch}`);
    // 첫 step은 초성 자모(조합 시작), 이후 step은 모두 완성형 음절이어야 함
    assert.ok(!isHangulSyllable(steps[0]), `${ch}: first step ${steps[0]} should be a jamo`);
    for (let i = 1; i < steps.length; i++) {
      assert.ok(isHangulSyllable(steps[i]), `${ch}: step[${i}]=${steps[i]} not syllable`);
    }
  }
});

test("syllableToSteps: 분해 단계 수", () => {
  assert.equal(syllableToSteps("가").length, 2); // ㄱ + 가
  assert.equal(syllableToSteps("각").length, 3); // ㄱ + 가 + 각
  assert.equal(syllableToSteps("과").length, 3); // ㄱ + 고 + 과 (복합 모음 ㅘ)
  assert.equal(syllableToSteps("값").length, 4); // ㄱ + 가 + 갑 + 값 (복합 받침 ㅄ)
  assert.equal(syllableToSteps("왕").length, 4); // ㅇ + 오 + 와 + 왕
});

test("syllableToSteps: 복합 모음/받침이 단계적으로 누적", () => {
  assert.deepEqual(syllableToSteps("과"), ["ㄱ", "고", "과"]);
  assert.deepEqual(syllableToSteps("값"), ["ㄱ", "가", "갑", "값"]);
  assert.deepEqual(syllableToSteps("의"), ["ㅇ", "으", "의"]);
});
