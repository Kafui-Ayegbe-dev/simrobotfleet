// End-to-end API test against the mock rosbridge. Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { startMockRosbridge } from "../tools/mock-rosbridge.js";
import { RosBridge } from "../src/ros/rosbridge.js";
import { Robot } from "../src/robots/Robot.js";
import { createApp } from "../src/app.js";

const MOCK_PORT = 19090;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mock, bridge, server, base;

before(async () => {
  mock = startMockRosbridge(MOCK_PORT);
  bridge = new RosBridge(`ws://localhost:${MOCK_PORT}`, { reconnectMs: 100 });
  bridge.connect();
  await once(bridge, "connected");

  const robot = new Robot("tb3_0", bridge);
  server = createApp({ bridge, robot }).listen(0);
  await once(server, "listening");
  base = `http://localhost:${server.address().port}`;
  await sleep(200); // let first /odom arrive
});

after(async () => {
  bridge.removeAllListeners();
  bridge.connect = () => {}; // stop reconnect loop
  bridge.ws?.terminate();
  server.close();
  await mock.close();
});

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
