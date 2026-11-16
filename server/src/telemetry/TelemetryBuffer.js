// Rolling history of robot poses. Listens to each robot's "odom" events and
// keeps one sample every 1/sampleHz seconds, up to `capacity` per robot
// (oldest dropped first). Memory stays fixed however long the server runs.
import { TELEMETRY } from "../config/index.js";
import { round, toHeadingDeg } from "../utils/format.js";

class RingBuffer {
  constructor(capacity) {
    this.items = new Array(capacity);
    this.capacity = capacity;
    this.start = 0;
    this.length = 0;
  }

  push(item) {
    const end = (this.start + this.length) % this.capacity;
    this.items[end] = item;
    if (this.length < this.capacity) this.length++;
    else this.start = (this.start + 1) % this.capacity;
  }

  /** Oldest -> newest */
  toArray() {
    const out = new Array(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.items[(this.start + i) % this.capacity];
    return out;
  }
}

export class TelemetryBuffer {
  constructor({ robots, sampleHz = TELEMETRY.sampleHz, capacity = TELEMETRY.capacity }) {
    this.intervalMs = 1000 / sampleHz;
    this.buffers = new Map();
    this.lastSampleAt = new Map();

    for (const robot of robots) {
      this.buffers.set(robot.id, new RingBuffer(capacity));
      robot.on("odom", ({ pose, velocity, at }) => this.#record(robot.id, pose, velocity, at));
    }
  }

  #record(robotId, pose, velocity, at) {
    const last = this.lastSampleAt.get(robotId);
    if (last && at - last < this.intervalMs) return;
    this.lastSampleAt.set(robotId, at);
    this.buffers.get(robotId).push({
      t: at,
      x: round(pose.x),
      y: round(pose.y),
      heading: round(toHeadingDeg(pose.yaw), 1),
      linear: round(velocity.linear),
      angular: round(velocity.angular),
    });
  }

  has(robotId) {
    return this.buffers.has(robotId);
  }

  /**
   * Samples for one robot, oldest first.
   *   since: only samples strictly after this time (ms epoch)
   *   limit: at most this many, keeping the most recent
   */
  query(robotId, { since, limit } = {}) {
    let samples = this.buffers.get(robotId)?.toArray() ?? [];
    if (since != null) samples = samples.filter((s) => s.t > since);
    if (limit != null && samples.length > limit) samples = samples.slice(-limit);
    return samples;
  }
}
