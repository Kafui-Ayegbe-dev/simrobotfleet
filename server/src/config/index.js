// All runtime configuration in one place. Override with environment variables.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  rosbridgeUrl: process.env.ROSBRIDGE_URL ?? "ws://localhost:9090",
  rosbridgeReconnectMs: Number(process.env.ROSBRIDGE_RECONNECT_MS ?? 2000),

  // Optional HTTPS. VR headsets only allow WebXR on https:// (or localhost),
  // so set both to serve the viewer to a headset over your network.
  httpsKey: process.env.HTTPS_KEY,
  httpsCert: process.env.HTTPS_CERT,
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

// Goals must fall inside this square around the odom origin (metres).
// Matches the 10 m x 10 m floor in the viewer.
export const WORLD = {
  halfSize: 5,
};

export const MISSIONS = {
  keepFinished: 200,   // finished missions kept in memory (oldest dropped first)
};

// Go-to-goal controller (see src/navigation/goToGoal.js)
export const NAVIGATION = {
  rateHz: 10,               // control loop rate
  goalTolerance: 0.05,      // m: "arrived" when this close to the goal
  maxLinear: 0.2,           // m/s, kept under the Burger's 0.22 limit
  maxAngular: 1.5,          // rad/s
  kLinear: 0.8,             // forward speed per metre of distance remaining
  kAngular: 2.5,            // turn speed per radian of heading error
  rotateInPlaceAbove: 0.6,  // rad (~35°): turn on the spot before driving if more off than this
  stuckWindowMs: 5000,      // fail if not 2 cm closer within this window
  stuckMinProgress: 0.02,   // m
  timeoutFactor: 3,         // timeout = 3x the straight-line drive time...
  timeoutPaddingMs: 10_000, // ...plus 10 s
  lostContactMs: 3000,      // fail if the robot is disconnected/stale this long
};

export const TELEMETRY = {
  sampleHz: 5,         // poses recorded per second per robot
  capacity: 3000,      // samples kept per robot (3000 at 5 Hz = 10 minutes)
  maxQueryLimit: 3000,
};

export const REALTIME = {
  statusHz: 10,        // how often robot status is pushed to connected viewers
};
