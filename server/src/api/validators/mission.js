import { WORLD } from "../../config/index.js";
import { FINAL_STATES } from "../../missions/MissionManager.js";

export const MISSION_STATES = ["queued", "active", ...FINAL_STATES];

/** Returns { value } on success or { errors: [...] } on failure. */
export function validateCreateMission(body = {}, { defaultRobotId }) {
  const { robotId = defaultRobotId, x, y } = body;
  const errors = [];
  const inWorld = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= WORLD.halfSize;

  if (typeof robotId !== "string" || !robotId) errors.push("robotId must be a non-empty string");
  if (!inWorld(x)) errors.push(`x must be a number in [-${WORLD.halfSize}, ${WORLD.halfSize}] m`);
  if (!inWorld(y)) errors.push(`y must be a number in [-${WORLD.halfSize}, ${WORLD.halfSize}] m`);

  return errors.length ? { errors } : { value: { robotId, goal: { x, y } } };
}

export function validateMissionQuery(query = {}) {
  const { state, robotId } = query;
  if (state && !MISSION_STATES.includes(state))
    return { errors: [`state must be one of: ${MISSION_STATES.join(", ")}`] };
  return { value: { state, robotId } };
}
