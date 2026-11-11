// End-to-end API test against the mock rosbridge. Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startStack, sleep } from "./helpers.js";

let stack, base;
before(async () => {
  stack = await startStack({ mockPort: 19090 });
  base = stack.base;
});
after(() => stack.stop());

const post = (path, body) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("health reports rosbridge connected", async () => {
  const body = await (await fetch(`${base}/health`)).json();
  assert.equal(body.rosbridge, "connected");
});

test("robot starts idle at the origin", async () => {
  const s = await (await fetch(`${base}/robot/status`)).json();
  assert.equal(s.state, "idle");
  assert.deepEqual(s.pose, { x: 0, y: 0, heading: 0 });
});

test("rejects out-of-range speed", async () => {
  const res = await post("/robot/move", { linear: 5 });
  assert.equal(res.status, 400);
});

test("drives forward then stops on its own", async () => {
  const res = await post("/robot/move", { linear: 0.2, angular: 0, durationMs: 500 });
  assert.equal(res.status, 202);

  const moving = await (await fetch(`${base}/robot/status`)).json();
  assert.equal(moving.state, "moving");

  await sleep(800);
  const done = await (await fetch(`${base}/robot/status`)).json();
  assert.equal(done.state, "idle");
  assert.ok(done.pose.x > 0.05, `expected x > 0.05, got ${done.pose.x}`);
});
