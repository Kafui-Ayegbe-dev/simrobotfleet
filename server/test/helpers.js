// Spins up the full stack (mock rosbridge + bridge + robot + HTTP + Socket.IO)
// on free ports, for tests.
import http from "node:http";
import { once } from "node:events";
import { startMockRosbridge } from "../tools/mock-rosbridge.js";
import { RosBridge } from "../src/ros/rosbridge.js";
import { Robot } from "../src/robots/Robot.js";
import { createApp } from "../src/app.js";
import { attachRealtime } from "../src/realtime/socket.js";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startStack({ mockPort }) {
  const mock = startMockRosbridge(mockPort);
  const bridge = new RosBridge(`ws://localhost:${mockPort}`, { reconnectMs: 100 });
  bridge.connect();
  await once(bridge, "connected");

  const robot = new Robot("tb3_0", bridge);
  const server = http.createServer(createApp({ bridge, robot }));
  const realtime = attachRealtime(server, { robots: [robot] });
  server.listen(0);
  await once(server, "listening");
  await sleep(200); // let the first /odom arrive

  const base = `http://localhost:${server.address().port}`;

  async function stop() {
    bridge.removeAllListeners();
    bridge.connect = () => {}; // stop the reconnect loop
    bridge.ws?.terminate();
    realtime.close();
    server.close();
    await mock.close();
  }

  return { base, robot, stop };
}
