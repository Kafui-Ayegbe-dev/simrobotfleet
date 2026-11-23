// End-to-end: missions drive the (mock) robot via the go-to-goal executor,
// plus the /robots/:id routes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createGoToGoalExecutor } from "../src/navigation/goToGoal.js";
import { startStack, sleep } from "./helpers.js";

let s;
before(async () => {
  // Faster than the real robot so the tests stay quick; the mock doesn't mind.
  const executor = createGoToGoalExecutor({ maxLinear: 0.6, maxAngular: 4, kLinear: 2 });
  s = await startStack({ mockPort: 19093, executor });
});
after(() => s.stop());

async function waitFor(fn, { timeoutMs = 10_000, everyMs = 100 } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(everyMs);
  }
  throw new Error("timed out waiting");
}
const missionState = async (id) => (await s.get(`/missions/${id}`)).body.state;

// ---------- /robots/:id ----------

test("GET /robots lists the fleet", async () => {
  const { body } = await s.get("/robots");
  assert.equal(body.count, 1);
  assert.equal(body.robots[0].id, "tb3_0");
});

test("/robots/:id routes work and unknown robots get 404", async () => {
  assert.equal((await s.get("/robots/tb3_0/status")).body.id, "tb3_0");
  assert.equal((await s.get("/robots/tb3_0/telemetry?limit=1")).body.robotId, "tb3_0");
  assert.equal((await s.get("/robots/ghost/status")).status, 404);
  assert.equal((await s.post("/robots/ghost/move", { linear: 0.1 })).status, 404);
  // legacy alias still works
  assert.equal((await s.get("/robot/status")).body.id, "tb3_0");
});

// ---------- Autonomous missions ----------

test("a mission drives the robot to its goal and succeeds", async () => {
  const m = await (await s.post("/missions", { x: 0.6, y: 0.4 })).json();
  assert.equal(m.state, "active");

  await waitFor(async () => (await missionState(m.id)) === "succeeded");
  const { body: status } = await s.get("/robots/tb3_0/status");
  assert.ok(Math.hypot(status.pose.x - 0.6, status.pose.y - 0.4) <= 0.06, `ended at ${JSON.stringify(status.pose)}`);
  assert.equal(status.state, "idle");
  assert.equal(status.mission, undefined);
});

test("queued missions run one after another until all are done", async () => {
  const goals = [{ x: 0.2, y: 0.6 }, { x: -0.3, y: 0.3 }, { x: 0, y: 0 }];
  const ids = [];
  for (const g of goals) ids.push((await (await s.post("/missions", g)).json()).id);

  const { body: during } = await s.get("/robots/tb3_0/status");
  assert.equal(during.mission, ids[0], "status shows the active mission");

  await waitFor(async () => (await missionState(ids.at(-1))) === "succeeded", { timeoutMs: 20_000 });
  for (const id of ids) assert.equal(await missionState(id), "succeeded");

  // They ran in order: each started after the previous one ended
  const ms = await Promise.all(ids.map(async (id) => (await s.get(`/missions/${id}`)).body));
  for (let i = 1; i < ms.length; i++) {
    assert.ok(Date.parse(ms[i].startedAt) >= Date.parse(ms[i - 1].endedAt));
  }
});

test("manual move is refused while a mission is running", async () => {
  const m = await (await s.post("/missions", { x: 1.5, y: 0 })).json();
  const res = await s.post("/robots/tb3_0/move", { linear: 0.1, durationMs: 500 });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, new RegExp(m.id));
  await s.post(`/missions/${m.id}/cancel`);
});

test("stop is an emergency stop: halts the robot and cancels all its missions", async () => {
  const a = await (await s.post("/missions", { x: -1.5, y: 1 })).json();
  const b = await (await s.post("/missions", { x: 1, y: 1 })).json();
  await sleep(300); // let it start driving

  const res = await (await s.post("/robots/tb3_0/stop")).json();
  assert.equal(res.stopped, true);
  assert.deepEqual(res.cancelledMissions.sort(), [a.id, b.id].sort());

  await sleep(300);
  assert.equal(await missionState(a.id), "cancelled");
  assert.equal(await missionState(b.id), "cancelled");
  const { body: status } = await s.get("/robots/tb3_0/status");
  assert.equal(status.state, "idle");
  assert.ok(Math.abs(status.velocity.linear) < 0.01, "robot should have stopped");
});
