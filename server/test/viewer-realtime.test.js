// Live status push + viewer static files. Run: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { startStack, sleep } from "./helpers.js";

let stack, base;
before(async () => {
  stack = await startStack({ mockPort: 19091 });
  base = stack.base;
});
after(() => stack.stop());

test("viewer page and three.js are served", async () => {
  const page = await fetch(`${base}/viewer/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /RoboOps Viewer/);

  const three = await fetch(`${base}/vendor/three/build/three.module.js`);
  assert.equal(three.status, 200);
  assert.match(three.headers.get("content-type"), /javascript/);

  const root = await fetch(base, { redirect: "manual" });
  assert.equal(root.status, 302);
});

test("pushes robot status over Socket.IO, including movement", async () => {
  const client = io(base, { transports: ["websocket"] });
  const updates = [];
  client.on("robots:status", (s) => updates.push(s));
  try {
    await sleep(300);
    assert.ok(updates.length >= 2, `expected several updates, got ${updates.length}`);
    assert.equal(updates.at(-1)[0].id, "tb3_0");

    stack.robot.move(0.2, 0, 400);
    await sleep(700);
    const last = updates.at(-1)[0];
    assert.ok(last.pose.x > 0.03, `expected the pushed pose to move, got x=${last.pose.x}`);
    assert.ok(updates.some((u) => u[0].state === "moving"), "expected a 'moving' update");
  } finally {
    client.close();
  }
});
