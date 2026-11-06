// All runtime configuration in one place. Override with environment variables.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  rosbridgeUrl: process.env.ROSBRIDGE_URL ?? "ws://localhost:9090",
  rosbridgeReconnectMs: Number(process.env.ROSBRIDGE_RECONNECT_MS ?? 2000),
};

// TurtleBot3 Burger hardware limits
export const LIMITS = {
  maxLinear: 0.22,     // m/s
  maxAngular: 2.84,    // rad/s
  maxDurationMs: 10_000,
};

export const ROBOT = {
  cmdRateHz: 10,       // republish rate for /cmd_vel while moving
  staleMs: 2000,       // no /odom for this long => state is "stale"
};
