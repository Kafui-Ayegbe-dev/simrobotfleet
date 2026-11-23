// Go-to-goal navigation: drives a robot to a mission's (x, y) goal.
//
// It plugs into MissionManager as its executor:
//   new MissionManager({ robots, executor: createGoToGoalExecutor() })
//
// CONTROL LOOP (10 Hz)
//   1. Read the robot's pose from /odom.
//   2. distance = how far to the goal; headingError = angle between where the
//      robot faces and where the goal is (-pi..pi).
//   3. If headingError is large (> ~35°): turn on the spot.
//      Otherwise: drive forward, slowing as it nears the goal and as the
//      heading error grows, while steering to cancel the error.
//   4. Within goalTolerance (5 cm): stop -> mission succeeded.
//
// FAILURES (mission -> failed, with a reason)
//   - timed out:     took far longer than the straight-line drive should
//   - no progress:   didn't get 2 cm closer for 5 s (stuck, or circling)
//   - lost contact:  robot disconnected or stopped reporting odom for 3 s
//
// Cancelling the mission (or an emergency stop) aborts the loop, and the
// robot is always stopped when the loop exits, whatever the reason.
import { NAVIGATION } from "../config/index.js";

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, max) => Math.max(-max, Math.min(max, v));

const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

/** One control step: pose + goal -> { linear, angular, distance }. Pure, for testing. */
export function computeCommand(pose, goal, cfg = NAVIGATION) {
  const dx = goal.x - pose.x;
  const dy = goal.y - pose.y;
  const distance = Math.hypot(dx, dy);
  const headingError = wrap(Math.atan2(dy, dx) - pose.yaw);

  const angular = clamp(cfg.kAngular * headingError, cfg.maxAngular);
  const linear =
    Math.abs(headingError) > cfg.rotateInPlaceAbove
      ? 0
      : Math.min(cfg.maxLinear, cfg.kLinear * distance) * Math.cos(headingError);

  return { linear, angular, distance, headingError };
}

export function createGoToGoalExecutor(options = {}) {
  const cfg = { ...NAVIGATION, ...options };
  const tickMs = 1000 / cfg.rateHz;

  return async function goToGoal(mission, { robot, signal }) {
    const goal = mission.goal;
    const startedAt = Date.now();
    let deadline = null;
    let best = Infinity;
    let bestAt = startedAt;
    let unhealthySince = null;

    robot.missionId = mission.id;
    try {
      while (!signal.aborted) {
        const now = Date.now();

        // Can we trust the pose?
        if (!robot.healthy || !robot.pose) {
          unhealthySince ??= now;
          if (now - unhealthySince > cfg.lostContactMs) throw new Error("lost contact with robot");
          robot.setVelocity(0, 0);
          await sleep(tickMs, signal);
          continue;
        }
        unhealthySince = null;

        const cmd = computeCommand(robot.pose, goal, cfg);

        if (cmd.distance <= cfg.goalTolerance) return; // arrived

        // Set the timeout from the first good reading
        deadline ??= now + (cmd.distance / cfg.maxLinear) * 1000 * cfg.timeoutFactor + cfg.timeoutPaddingMs;
        if (now > deadline) throw new Error(`timed out ${cmd.distance.toFixed(2)} m from the goal`);

        if (cmd.distance < best - cfg.stuckMinProgress) {
          best = cmd.distance;
          bestAt = now;
        } else if (now - bestAt > cfg.stuckWindowMs) {
          throw new Error(`no progress for ${cfg.stuckWindowMs / 1000} s, ${cmd.distance.toFixed(2)} m from the goal`);
        }

        robot.setVelocity(cmd.linear, cmd.angular);
        await sleep(tickMs, signal);
      }
    } finally {
      robot.stop();
      robot.missionId = null;
    }
  };
}
