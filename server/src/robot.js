// One robot: turns HTTP-level commands into ROS messages and
// keeps the latest known state from /odom.

// TurtleBot3 Burger hardware limits
export const LIMITS = { maxLinear: 0.22, maxAngular: 2.84, maxDurationMs: 10_000 };

const CMD_RATE_HZ = 10; // republish rate while moving, like a real teleop
const STALE_MS = 2000;  // no odom for this long => status is "stale"

function yawFromQuaternion({ x, y, z, w }) {
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

const twist = (linear = 0, angular = 0) => ({
  linear: { x: linear, y: 0, z: 0 },
  angular: { x: 0, y: 0, z: angular },
});

export class Robot {
  constructor(id, bridge, { namespace = "" } = {}) {
    this.id = id;
    this.bridge = bridge;
    this.cmdTopic = `${namespace}/cmd_vel`;
    this.odomTopic = `${namespace}/odom`;

    this.pose = null;      // { x, y, yaw }
    this.velocity = null;  // { linear, angular } as reported by odom
    this.lastOdomAt = null;
    this.activeMove = null; // { linear, angular, endsAt, timer }

    bridge.advertise(this.cmdTopic, "geometry_msgs/msg/Twist");
    bridge.subscribe(this.odomTopic, "nav_msgs/msg/Odometry", (msg) => this.#onOdom(msg));
  }

  #onOdom(msg) {
    const p = msg.pose.pose;
    this.pose = { x: p.position.x, y: p.position.y, yaw: yawFromQuaternion(p.orientation) };
    this.velocity = { linear: msg.twist.twist.linear.x, angular: msg.twist.twist.angular.z };
    this.lastOdomAt = Date.now();
  }

  /** Drive at (linear, angular) for durationMs, then stop. A new move replaces the old one. */
  move(linear, angular, durationMs) {
    if (!this.bridge.connected) throw new Error("ROS bridge not connected");
    this.#clearMove();

    const send = () => this.bridge.publish(this.cmdTopic, twist(linear, angular));
    send();
    const timer = setInterval(send, 1000 / CMD_RATE_HZ);
    const endsAt = Date.now() + durationMs;
    this.activeMove = { linear, angular, endsAt, timer };

    setTimeout(() => {
      if (this.activeMove?.timer === timer) this.stop();
    }, durationMs);

    return { linear, angular, durationMs, endsAt: new Date(endsAt).toISOString() };
  }

  stop() {
    this.#clearMove();
    return this.bridge.publish(this.cmdTopic, twist(0, 0));
  }

  #clearMove() {
    if (this.activeMove) clearInterval(this.activeMove.timer);
    this.activeMove = null;
  }

  status() {
    const now = Date.now();
    let state;
    if (!this.bridge.connected) state = "disconnected";
    else if (!this.lastOdomAt || now - this.lastOdomAt > STALE_MS) state = "stale";
    else if (this.activeMove) state = "moving";
    else state = "idle";

    return {
      id: this.id,
      state,
      bridgeConnected: this.bridge.connected,
      pose: this.pose,
      velocity: this.velocity,
      activeCommand: this.activeMove && {
        linear: this.activeMove.linear,
        angular: this.activeMove.angular,
        endsAt: new Date(this.activeMove.endsAt).toISOString(),
      },
      lastUpdate: this.lastOdomAt && new Date(this.lastOdomAt).toISOString(),
    };
  }
}
