// End-to-end tests for /missions, /robot/telemetry and mission events.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { startStack, sleep } from "./helpers.js";

let s;
before(async () => { s = await startStack({ mockPort: 19092 }); });
after(() => s.stop());

// ---------- Missions ----------

test("POST /missions validates the goal", async () => {
  const missing = await s.post("/missions", { x: 1 });
  assert.equal(missing.status, 400);

  const outside = await s.post("/missions", { x: 99, y: 0 });
  assert.equal(outside.status, 400);
  assert.match((await outside.json()).errors[0], /x must be/);

  const robot = await s.post("/missions", { robotId: "ghost", x: 1, y: 1 });
  assert.equal(robot.status, 404);
});

test("mission lifecycle over HTTP: create, queue, cancel, advance", async () => {
  const resA = await s.post("/missions", { x: 1, y: 0.5 });
  assert.equal(resA.status, 201);
  const a = await resA.json();
  assert.equal(a.state, "active");
  assert.equal(a.robotId, "tb3_0");
  assert.deepEqual(a.goal, { x: 1, y: 0.5 });

  const b = await (await s.post("/missions", { x: -1, y: 0 })).json();
  assert.equal(b.state, "queued");
  assert.equal(b.queuePosition, 1);

  const cancelled = await (await s.post(`/missions/${a.id}/cancel`)).json();
  assert.equal(cancelled.state, "cancelled");

  const { body: bNow } = await s.get(`/missions/${b.id}`);
  assert.equal(bNow.state, "active", "queued mission should take over");
  assert.equal(bNow.queuePosition, undefined);

  const again = await s.post(`/missions/${a.id}/cancel`);
  assert.equal(again.status, 409);

  await s.post(`/missions/${b.id}/cancel`); // tidy up
});

test("GET /missions lists newest first and filters by state", async () => {
  const { body: all } = await s.get("/missions");
  assert.ok(all.count >= 2);
  const ids = all.missions.map((m) => m.id);
  assert.deepEqual(ids, [...ids].sort().reverse());

  const { body: cancelled } = await s.get("/missions?state=cancelled");
  assert.ok(cancelled.missions.every((m) => m.state === "cancelled"));

  const bad = await s.get("/missions?state=flying");
  assert.equal(bad.status, 400);

  const missing = await s.get("/missions/m-9999");
  assert.equal(missing.status, 404);
});

test("mission changes are pushed over Socket.IO", async () => {
  const client = io(s.base, { transports: ["websocket"] });
  const updates = [];
  let snapshot = null;
  client.on("missions:snapshot", (list) => { snapshot = list; });
  client.on("missions:update", (m) => updates.push(`${m.id}:${m.state}`));
  try {
    await sleep(200);
    assert.ok(Array.isArray(snapshot));
    const m = await (await s.post("/missions", { x: 0.5, y: 0.5 })).json();
    await s.post(`/missions/${m.id}/cancel`);
    await sleep(200);
    assert.deepEqual(updates, [`${m.id}:queued`, `${m.id}:active`, `${m.id}:cancelled`]);
  } finally {
    client.close();
  }
});

test("invalid JSON gets a 400, not a crash", async () => {
  const res = await fetch(`${s.base}/missions`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{ x: 1",
  });
  assert.equal(res.status, 400);
});

// ---------- Telemetry ----------

test("telemetry records the robot's path while it drives", async () => {
  const startedAt = Date.now();
  s.robot.move(0.2, 0, 1000);
  await sleep(1300);

  const { body } = await s.get(`/robot/telemetry?since=${startedAt}`);
  assert.equal(body.robotId, "tb3_0");
  assert.ok(body.count >= 4, `expected ~5 samples at 5 Hz, got ${body.count}`);
  const xs = body.samples.map((p) => p.x);
  assert.ok(xs.at(-1) > xs[0], "x should increase along the path");
  assert.ok(body.samples.every((p) => Date.parse(p.t) > startedAt));
  assert.ok(["x", "y", "heading", "linear", "angular", "t"].every((k) => k in body.samples[0]));
});

test("telemetry supports limit, ISO since, and validates input", async () => {
  const { body } = await s.get("/robot/telemetry?limit=3");
  assert.equal(body.count, 3);

  const future = new Date(Date.now() + 60_000).toISOString();
  const { body: none } = await s.get(`/robot/telemetry?since=${encodeURIComponent(future)}`);
  assert.equal(none.count, 0);

  assert.equal((await s.get("/robot/telemetry?limit=0")).status, 400);
  assert.equal((await s.get("/robot/telemetry?since=yesterday")).status, 400);
});
