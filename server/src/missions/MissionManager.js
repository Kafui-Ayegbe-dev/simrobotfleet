// Creates, queues and tracks missions. Each robot runs one mission at a time;
// the rest wait in a first-in, first-out queue.
//
// Lifecycle:  queued -> active -> succeeded | failed | cancelled
//             queued -> cancelled
//
// HOW A MISSION RUNS
// The manager doesn't know how to drive a robot. It hands the active mission
// to an `executor`:
//
//   executor(mission, { robot, signal }) -> Promise
//     resolve        => mission "succeeded"
//     reject(err)    => mission "failed" (err.message is kept)
//     signal aborted => mission was cancelled; stop the robot and return
//
// The server uses the go-to-goal executor (src/navigation/goToGoal.js), which
// actually drives the robot. The built-in default just waits until cancelled,
// which is handy in tests.
//
// Events:
//   "update" (mission)   whenever a mission is created or changes state
import { EventEmitter } from "node:events";
import { MISSIONS } from "../config/index.js";
import { iso } from "../utils/format.js";

export const FINAL_STATES = new Set(["succeeded", "failed", "cancelled"]);

const waitUntilCancelled = (_mission, { signal }) =>
  new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));

export class MissionError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export class MissionManager extends EventEmitter {
  constructor({ robots, executor = waitUntilCancelled, keepFinished = MISSIONS.keepFinished }) {
    super();
    this.robots = new Map(robots.map((r) => [r.id, r]));
    this.executor = executor;
    this.keepFinished = keepFinished;

    this.missions = new Map();   // id -> mission (insertion order = creation order)
    this.queues = new Map();     // robotId -> [missionId, ...]
    this.active = new Map();     // robotId -> { id, controller }
    this.seq = 0;
  }

  /** Queue a "go to (x, y)" mission. Starts immediately if the robot is free. */
  create({ robotId, goal }) {
    if (!this.robots.has(robotId)) throw new MissionError(`Unknown robot "${robotId}"`, 404);

    const now = Date.now();
    const mission = {
      id: `m-${String(++this.seq).padStart(4, "0")}`,
      robotId,
      type: "goto",
      goal: { x: goal.x, y: goal.y },
      state: "queued",
      createdAt: now,
      startedAt: null,
      endedAt: null,
      error: null,
      history: [{ state: "queued", at: now }],
    };
    this.missions.set(mission.id, mission);
    this.#queue(robotId).push(mission.id);
    this.emit("update", mission);

    this.#startNext(robotId);
    return mission;
  }

  get(id) {
    return this.missions.get(id) ?? null;
  }

  /** Newest first. Optional filters: state, robotId. */
  list({ state, robotId } = {}) {
    return [...this.missions.values()]
      .filter((m) => (!state || m.state === state) && (!robotId || m.robotId === robotId))
      .reverse();
  }

  /** Position in the robot's queue (1 = next up), or null if not queued. */
  queuePosition(mission) {
    if (mission.state !== "queued") return null;
    return this.#queue(mission.robotId).indexOf(mission.id) + 1;
  }

  cancel(id) {
    const mission = this.missions.get(id);
    if (!mission) throw new MissionError(`Mission "${id}" not found`, 404);
    if (FINAL_STATES.has(mission.state))
      throw new MissionError(`Mission "${id}" is already ${mission.state}`, 409);

    if (mission.state === "queued") {
      const q = this.#queue(mission.robotId);
      q.splice(q.indexOf(id), 1);
      this.#finish(mission, "cancelled");
    } else {
      // Active: abort the executor; #run() finishes it as cancelled.
      this.active.get(mission.robotId)?.controller.abort();
    }
    return mission;
  }

  /** The mission currently driving this robot, or null. */
  activeFor(robotId) {
    const a = this.active.get(robotId);
    return a ? this.missions.get(a.id) : null;
  }

  /** Emergency stop: cancel everything queued for this robot, then the active mission. */
  cancelAll(robotId) {
    const ids = [...this.#queue(robotId)];
    const active = this.active.get(robotId);
    for (const id of ids) this.cancel(id);
    if (active) this.cancel(active.id);
    return active ? [active.id, ...ids] : ids;
  }

  #queue(robotId) {
    if (!this.queues.has(robotId)) this.queues.set(robotId, []);
    return this.queues.get(robotId);
  }

  #startNext(robotId) {
    if (this.active.has(robotId)) return;
    const nextId = this.#queue(robotId).shift();
    if (!nextId) return;

    const mission = this.missions.get(nextId);
    const controller = new AbortController();
    this.active.set(robotId, { id: nextId, controller });
    this.#setState(mission, "active");
    mission.startedAt = mission.history.at(-1).at;
    this.emit("update", mission);

    this.#run(mission, controller);
  }

  async #run(mission, controller) {
    const robot = this.robots.get(mission.robotId);
    let outcome = "succeeded";
    let error = null;
    try {
      await this.executor(mission, { robot, signal: controller.signal });
      if (controller.signal.aborted) outcome = "cancelled";
    } catch (e) {
      outcome = controller.signal.aborted ? "cancelled" : "failed";
      error = outcome === "failed" ? (e?.message ?? String(e)) : null;
    }

    this.active.delete(mission.robotId);
    this.#finish(mission, outcome, error);
    this.#startNext(mission.robotId);
  }

  #finish(mission, state, error = null) {
    this.#setState(mission, state);
    mission.endedAt = mission.history.at(-1).at;
    mission.error = error;
    this.emit("update", mission);
    this.#prune();
  }

  #setState(mission, state) {
    mission.state = state;
    mission.history.push({ state, at: Date.now() });
  }

  // Keep memory bounded: drop the oldest finished missions beyond the limit.
  #prune() {
    const finished = [...this.missions.values()].filter((m) => FINAL_STATES.has(m.state));
    for (const m of finished.slice(0, Math.max(0, finished.length - this.keepFinished))) {
      this.missions.delete(m.id);
    }
  }
}

/** JSON shape for the API and Socket.IO. */
export function serializeMission(m, manager) {
  const out = {
    id: m.id,
    robotId: m.robotId,
    type: m.type,
    goal: m.goal,
    state: m.state,
    createdAt: iso(m.createdAt),
    startedAt: iso(m.startedAt),
    endedAt: iso(m.endedAt),
    history: m.history.map((h) => ({ state: h.state, at: iso(h.at) })),
  };
  const position = manager?.queuePosition(m);
  if (position) out.queuePosition = position;
  if (m.error) out.error = m.error;
  return out;
}
