// Fake rosbridge for testing the API without Docker/ROS.
// Integrates /cmd_vel into a pose and publishes /odom at 20 Hz.
// Run: npm run mock   (then npm start in another terminal)
import { WebSocketServer } from "ws";

const PORT = Number(process.env.MOCK_PORT ?? 9090);
const wss = new WebSocketServer({ port: PORT });
const state = { x: 0, y: 0, yaw: 0, v: 0, w: 0, lastCmd: 0 };
const subscribers = new Set();
const DT = 0.05;

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.op === "subscribe" && m.topic === "/odom") subscribers.add(ws);
    if (m.op === "publish" && m.topic === "/cmd_vel") {
      state.v = m.msg.linear.x;
      state.w = m.msg.angular.z;
      state.lastCmd = Date.now();
    }
  });
  ws.on("close", () => subscribers.delete(ws));
});

setInterval(() => {
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

console.log(`Mock rosbridge on ws://localhost:${PORT}`);
