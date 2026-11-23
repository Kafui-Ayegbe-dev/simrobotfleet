// Unit tests for the go-to-goal controller (no ROS, no HTTP).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCommand, createGoToGoalExecutor } from "../src/navigation/goToGoal.js";

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test("drives straight at a goal dead ahead", () => {
  const c = computeCommand({ x: 0, y: 0, yaw: 0 }, { x: 2, y: 0 });
  assert.ok(c.linear > 0.19, `expected near max speed, got ${c.linear}`);
  assert.ok(close(c.angular, 0));
});

test("turns on the spot when the goal is behind", () => {
  const c = computeCommand({ x: 0, y: 0, yaw: 0 }, { x: -1, y: 0.01 });
  assert.equal(c.linear, 0);
  assert.ok(Math.abs(c.angular) > 1, "should turn hard");
});

test("turns toward the goal's side (left = positive)", () => {
  assert.ok(computeCommand({ x: 0, y: 0, yaw: 0 }, { x: 1, y: 0.3 }).angular > 0);
  assert.ok(computeCommand({ x: 0, y: 0, yaw: 0 }, { x: 1, y: -0.3 }).angular < 0);
});

test("slows down near the goal", () => {
  const far = computeCommand({ x: 0, y: 0, yaw: 0 }, { x: 2, y: 0 });
  const near = computeCommand({ x: 0, y: 0, yaw: 0 }, { x: 0.1, y: 0 });
  assert.ok(near.linear < far.linear / 2);
});

// ---------- Executor with a fake robot ----------

/** Minimal robot: integrates velocity commands in-process (or not, if frozen). */
function fakeRobot({ frozen = false, healthy = true } = {}) {
  const r = {
    id: "fake",
    pose: { x: 0, y: 0, yaw: 0 },
    healthy,
    missionId: null,
    stops: 0,
    cmd: { linear: 0, angular: 0 },
    setVelocity(linear, angular) { r.cmd = { linear, angular }; return true; },
    stop() { r.cmd = { linear: 0, angular: 0 }; r.stops++; return true; },
  };
  r.timer = setInterval(() => {
    if (frozen) return;
    const dt = 0.02;
    r.pose.yaw += r.cmd.angular * dt;
    r.pose.x += r.cmd.linear * Math.cos(r.pose.yaw) * dt;
    r.pose.y += r.cmd.linear * Math.sin(r.pose.yaw) * dt;
  }, 20);
  r.dispose = () => clearInterval(r.timer);
  return r;
}

const fast = { maxLinear: 0.6, maxAngular: 4, kLinear: 2, rateHz: 50 };

test("reaches the goal, then stops the robot", async () => {
  const robot = fakeRobot();
  try {
    const run = createGoToGoalExecutor(fast);
    await run({ id: "m1", goal: { x: 0.4, y: 0.3 } }, { robot, signal: new AbortController().signal });
    assert.ok(Math.hypot(robot.pose.x - 0.4, robot.pose.y - 0.3) <= 0.05);
    assert.equal(robot.stops, 1);
    assert.equal(robot.missionId, null);
  } finally {
    robot.dispose();
  }
});

test("fails with 'no progress' when the robot can't move", async () => {
  const robot = fakeRobot({ frozen: true });
  try {
    const run = createGoToGoalExecutor({ ...fast, stuckWindowMs: 300 });
    await assert.rejects(
      run({ id: "m1", goal: { x: 1, y: 0 } }, { robot, signal: new AbortController().signal }),
      /no progress/
    );
    assert.equal(robot.stops, 1, "robot must be stopped on failure");
  } finally {
    robot.dispose();
  }
});

test("fails with 'lost contact' when odom stops", async () => {
  const robot = fakeRobot({ healthy: false });
  try {
    const run = createGoToGoalExecutor({ ...fast, lostContactMs: 200 });
    await assert.rejects(
      run({ id: "m1", goal: { x: 1, y: 0 } }, { robot, signal: new AbortController().signal }),
      /lost contact/
    );
  } finally {
    robot.dispose();
  }
});

test("stops promptly when aborted", async () => {
  const robot = fakeRobot();
  try {
    const controller = new AbortController();
    const run = createGoToGoalExecutor({ maxLinear: 0.05 }); // slow, so it's mid-drive
    const done = run({ id: "m1", goal: { x: 3, y: 0 } }, { robot, signal: controller.signal });
    setTimeout(() => controller.abort(), 150);
    const t0 = Date.now();
    await done;
    assert.ok(Date.now() - t0 < 400, "should exit soon after abort");
    assert.equal(robot.cmd.linear, 0);
    assert.equal(robot.stops, 1);
  } finally {
    robot.dispose();
  }
});
