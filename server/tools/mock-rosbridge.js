// Fake rosbridge for testing the API without Docker/ROS.
// Integrates /cmd_vel into a pose and publishes /odom at 20 Hz.
// Run standalone: npm run mock   (then npm start in another terminal)
// Or import startMockRosbridge() from tests.
import { WebSocketServer } from "ws";
import { fileURLToPath } from "node:url";

const DT = 0.05;

export function startMockRosbridge(port = 9090) {
  const wss = new WebSocketServer({ port });
  const state = { x: 0, y: 0, yaw: 0, v: 0, w: 0 };
  const subscribers = new Set();

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.op === "subscribe" && m.topic === "/odom") subscribers.add(ws);
      if (m.op === "publish" && m.topic === "/cmd_vel") {
        state.v = m.msg.linear.x;
        state.w = m.msg.angular.z;
      }
    });
    ws.on("close", () => subscribers.delete(ws));
  });

  const tick = setInterval(() => {
    state.yaw += state.w * DT;
    state.x += state.v * Math.cos(state.yaw) * DT;
    state.y += state.v * Math.sin(state.yaw) * DT;
    const msg = {
      op: "publish",
      topic: "/odom",
      msg: {
        pose: { pose: {
          position: { x: state.x, y: state.y, z: 0 },
          orientation: { x: 0, y: 0, z: Math.sin(state.yaw / 2), w: Math.cos(state.yaw / 2) },
        } },
        twist: { twist: { linear: { x: state.v, y: 0, z: 0 }, angular: { x: 0, y: 0, z: state.w } } },
      },
    };
    for (const ws of subscribers) ws.send(JSON.stringify(msg));
  }, DT * 1000);

  return {
    wss,
    close: () => new Promise((resolve) => { clearInterval(tick); wss.close(resolve); }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.MOCK_PORT ?? 9090);
  startMockRosbridge(port);
  console.log(`Mock rosbridge on ws://localhost:${port}`);
}
