// Helpers for building and reading ROS 2 messages.

export const TYPES = {
  twist: "geometry_msgs/msg/Twist",
  odometry: "nav_msgs/msg/Odometry",
};

export const twist = (linear = 0, angular = 0) => ({
  linear: { x: linear, y: 0, z: 0 },
  angular: { x: 0, y: 0, z: angular },
});

export function yawFromQuaternion({ x, y, z, w }) {
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

/** nav_msgs/Odometry -> { pose: {x, y, yaw}, velocity: {linear, angular} } */
export function parseOdometry(msg) {
  const p = msg.pose.pose;
  return {
    pose: { x: p.position.x, y: p.position.y, yaw: yawFromQuaternion(p.orientation) },
    velocity: { linear: msg.twist.twist.linear.x, angular: msg.twist.twist.angular.z },
  };
}
