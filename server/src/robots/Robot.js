// One robot: turns API-level commands into ROS messages and
// keeps the latest known state from /odom.
//
// Events:
//   "odom" ({ pose, velocity, at })  every time a new /odom message arrives
import { EventEmitter } from "node:events";
import { ROBOT } from "../config/index.js";
import { TYPES, twist, parseOdometry } from "../ros/messages.js";
import { round, toHeadingDeg, iso } from "../utils/format.js";

export class Robot extends EventEmitter {
  constructor(id, bridge, { namespace = "" } = {}) {
    super();
    this.id = id;
    this.bridge = bridge;
    this.cmdTopic = `${namespace}/cmd_vel`;
    this.odomTopic = `${namespace}/odom`;

    this.pose = null;       // { x, y, yaw }
    this.velocity = null;   // { linear, angular } as reported by odom
    this.lastOdomAt = null;
    this.activeMove = null; // { linear, angular, endsAt, timer }  (timed /move)
    this.lastCmd = null;    // { linear, angular, at }  (streamed by navigation)
    this.missionId = null;  // set while a mission is driving this robot

    bridge.advertise(this.cmdTopic, TYPES.twist);
    bridge.subscribe(this.odomTopic, TYPES.odometry, (msg) => {
      Object.assign(this, parseOdometry(msg));
      this.lastOdomAt = Date.now();
      this.emit("odom", { pose: this.pose, velocity: this.velocity, at: this.lastOdomAt });
    });
  }

  /** Drive at (linear, angular) for durationMs, then stop. A new move replaces the old one. */
  move(linear, angular, durationMs) {
    if (!this.bridge.connected) throw new Error("ROS bridge not connected");
    this.#clearMove();

    const send = () => this.bridge.publish(this.cmdTopic, twist(linear, angular));
    send();
    const timer = setInterval(send, 1000 / ROBOT.cmdRateHz);
    const endsAt = Date.now() + durationMs;
    this.activeMove = { linear, angular, endsAt, timer };

    setTimeout(() => {
      if (this.activeMove?.timer === timer) this.stop();
    }, durationMs);

    return { linear, angular, durationMs, endsAt: iso(endsAt) };
  }

  /**
   * Send one velocity command, with no timer. Used by navigation, which calls
   * this every control tick, so if the caller stops calling, the robot gets no
   * new commands. Returns false if the bridge is down.
   */
  setVelocity(linear, angular) {
    this.#clearMove();
    this.lastCmd = { linear, angular, at: Date.now() };
    return this.bridge.publish(this.cmdTopic, twist(linear, angular));
  }

  stop() {
    this.#clearMove();
    this.lastCmd = null;
    return this.bridge.publish(this.cmdTopic, twist(0, 0));
  }

  #clearMove() {
    if (this.activeMove) clearInterval(this.activeMove.timer);
    this.activeMove = null;
  }

  /** True if odom is arriving and the bridge is up. */
  get healthy() {
    return this.bridge.connected && !!this.lastOdomAt && Date.now() - this.lastOdomAt <= ROBOT.staleMs;
  }

  get state() {
    if (!this.bridge.connected) return "disconnected";
    if (!this.healthy) return "stale";
    const streaming = this.lastCmd && Date.now() - this.lastCmd.at < 500 && (this.lastCmd.linear || this.lastCmd.angular);
    return this.activeMove || streaming ? "moving" : "idle";
  }

  status() {
    const out = {
      id: this.id,
      state: this.state,
      connected: this.bridge.connected,
      pose: this.pose && {
        x: round(this.pose.x),
        y: round(this.pose.y),
        heading: round(toHeadingDeg(this.pose.yaw), 1),
      },
      velocity: this.velocity && {
        linear: round(this.velocity.linear),
        angular: round(this.velocity.angular),
      },
      lastUpdate: iso(this.lastOdomAt),
    };

    if (this.missionId) out.mission = this.missionId;
    if (this.activeMove) {
      out.command = {
        linear: this.activeMove.linear,
        angular: this.activeMove.angular,
        remainingMs: Math.max(0, this.activeMove.endsAt - Date.now()),
      };
    }
    return out;
  }
}
