import assert from "node:assert/strict";
import test from "node:test";
import { gain, netFlows, timeWeighted } from "../app/src/lib/performance.ts";

const close = (actual: number[] | null, expected: number[]) => {
  assert.ok(actual);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-9, `${i}: ${v}`));
};

test("a deposit raises the value but not the return", () => {
  const rows = [
    { nav: 100_000, flow: 0 },
    { nav: 110_000, flow: 0 },
    { nav: 160_000, flow: 50_000 },
    { nav: 176_000, flow: 0 },
  ];
  close(timeWeighted(rows), [0, 0.1, 0.1, 0.21]);
  assert.equal(gain(rows), 26_000);
  assert.equal(netFlows(rows), 50_000);
});

test("a withdrawal doesn't read as a loss", () => {
  const rows = [
    { nav: 200, flow: null },
    { nav: 100, flow: -100 },
  ];
  close(timeWeighted(rows), [0, 0]);
  assert.equal(gain(rows), 0);
});

test("the first day's flow is already in its value", () => {
  close(
    timeWeighted([
      { nav: 50, flow: 1_000 },
      { nav: 55, flow: 0 },
    ]),
    [0, 0.1],
  );
});

test("a day without starting capital leaves the chain unchanged", () => {
  const rows = [
    { nav: 0, flow: 0 },
    { nav: 1_000, flow: 1_000 },
    { nav: 1_100, flow: 0 },
  ];
  close(timeWeighted(rows), [0, 0, 0.1]);
});

test("an unreported flow leaves performance unknown", () => {
  const rows = [
    { nav: 100, flow: 0 },
    { nav: 150, flow: null },
  ];
  assert.equal(timeWeighted(rows), null);
  assert.equal(gain(rows), null);
});
