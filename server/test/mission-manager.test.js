// Unit tests for the mission lifecycle and queue (no ROS, no HTTP).
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { MissionManager, MissionError } from "../src/missions/MissionManager.js";

const tick = () => new Promise((r) => setImmediate(r));
const fakeRobot = (id = "r1") => Object.assign(new EventEmitter(), { id });

/** Executor you finish by hand: controls.get(missionId).resolve() / .reject(err) */
function manualExecutor() {
  const controls = new Map();
  const executor = (mission, { signal }) =>
    new Promise((resolve, reject) => {
      controls.set(mission.id, { resolve, reject });
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  return { executor, controls };
}

test("first mission starts immediately, the next one queues", () => {
  const m = new MissionManager({ robots: [fakeRobot()], executor: manualExecutor().executor });
  const a = m.create({ robotId: "r1", goal: { x: 1, y: 0 } });
  const b = m.create({ robotId: "r1", goal: { x: 2, y: 0 } });
  assert.equal(a.state, "active");
  assert.equal(b.state, "queued");
  assert.equal(m.queuePosition(b), 1);
});

test("success hands the robot to the next queued mission", async () => {
  const { executor, controls } = manualExecutor();
  const m = new MissionManager({ robots: [fakeRobot()], executor });
  const a = m.create({ robotId: "r1", goal: { x: 1, y: 0 } });
  const b = m.create({ robotId: "r1", goal: { x: 2, y: 0 } });

  controls.get(a.id).resolve();
  await tick();
  assert.equal(a.state, "succeeded");
  assert.ok(a.endedAt >= a.startedAt);
  assert.equal(b.state, "active");
  assert.deepEqual(a.history.map((h) => h.state), ["queued", "active", "succeeded"]);
});

test("executor errors mark the mission failed with the reason", async () => {
  const { executor, controls } = manualExecutor();
  const m = new MissionManager({ robots: [fakeRobot()], executor });
  const a = m.create({ robotId: "r1", goal: { x: 1, y: 0 } });
  controls.get(a.id).reject(new Error("path blocked"));
  await tick();
  assert.equal(a.state, "failed");
  assert.equal(a.error, "path blocked");
});

test("cancelling a queued mission removes it from the queue", () => {
  const m = new MissionManager({ robots: [fakeRobot()], executor: manualExecutor().executor });
  m.create({ robotId: "r1", goal: { x: 1, y: 0 } });
  const b = m.create({ robotId: "r1", goal: { x: 2, y: 0 } });
  const c = m.create({ robotId: "r1", goal: { x: 3, y: 0 } });

  m.cancel(b.id);
  assert.equal(b.state, "cancelled");
  assert.equal(m.queuePosition(c), 1);
});

test("cancelling the active mission aborts it and starts the next", async () => {
  const m = new MissionManager({ robots: [fakeRobot()], executor: manualExecutor().executor });
  const a = m.create({ robotId: "r1", goal: { x: 1, y: 0 } });
  const b = m.create({ robotId: "r1", goal: { x: 2, y: 0 } });
  m.cancel(a.id);
  await tick();
  assert.equal(a.state, "cancelled");
  assert.equal(b.state, "active");
});

test("default executor keeps a mission active until cancelled", async () => {
  const m = new MissionManager({ robots: [fakeRobot()] });
  const a = m.create({ robotId: "r1", goal: { x: 1, y: 0 } });
  await tick();
  assert.equal(a.state, "active");
  m.cancel(a.id);
  await tick();
  assert.equal(a.state, "cancelled");
});

test("rejects unknown robots, unknown missions and double cancels", async () => {
  const m = new MissionManager({ robots: [fakeRobot()] });
  assert.throws(() => m.create({ robotId: "nope", goal: { x: 0, y: 0 } }), (e) => e instanceof MissionError && e.status === 404);
  assert.throws(() => m.cancel("m-9999"), (e) => e.status === 404);

  const a = m.create({ robotId: "r1", goal: { x: 1, y: 0 } });
  m.cancel(a.id);
  await tick();
  assert.throws(() => m.cancel(a.id), (e) => e.status === 409);
});

test("emits an update for every state change", async () => {
  const { executor, controls } = manualExecutor();
  const m = new MissionManager({ robots: [fakeRobot()], executor });
  const seen = [];
  m.on("update", (x) => seen.push(`${x.id}:${x.state}`));
  const a = m.create({ robotId: "r1", goal: { x: 1, y: 0 } });
  controls.get(a.id).resolve();
  await tick();
  assert.deepEqual(seen, [`${a.id}:queued`, `${a.id}:active`, `${a.id}:succeeded`]);
});

test("keeps memory bounded by dropping the oldest finished missions", () => {
  const m = new MissionManager({ robots: [fakeRobot()], keepFinished: 2 });
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const x = m.create({ robotId: "r1", goal: { x: i, y: 0 } });
    ids.push(x.id);
  }
  // first is active; cancel the three queued ones
  for (const id of ids.slice(1)) m.cancel(id);
  assert.equal(m.get(ids[1]), null, "oldest finished mission should be dropped");
  assert.ok(m.get(ids[2]) && m.get(ids[3]));
  assert.equal(m.get(ids[0]).state, "active", "unfinished missions are never dropped");
});
