// Spins up the full stack (mock rosbridge + bridge + robot + missions +
// telemetry + HTTP + Socket.IO) on free ports, for tests.
import http from "node:http";
import { once } from "node:events";
import { startMockRosbridge } from "../tools/mock-rosbridge.js";
import { RosBridge } from "../src/ros/rosbridge.js";
import { Robot } from "../src/robots/Robot.js";
import { MissionManager } from "../src/missions/MissionManager.js";
import { TelemetryBuffer } from "../src/telemetry/TelemetryBuffer.js";
import { createApp } from "../src/app.js";
import { attachRealtime } from "../src/realtime/socket.js";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startStack({ mockPort, executor } = {}) {
  const mock = startMockRosbridge(mockPort);
  const bridge = new RosBridge(`ws://localhost:${mockPort}`, { reconnectMs: 100 });
  bridge.connect();
  await once(bridge, "connected");

  const robot = new Robot("tb3_0", bridge);
  const robots = [robot];
  const telemetry = new TelemetryBuffer({ robots });
  const missions = new MissionManager({ robots, ...(executor && { executor }) });

  const server = http.createServer(createApp({ bridge, robots, missions, telemetry }));
  const realtime = attachRealtime(server, { robots, missions });
  server.listen(0);
  await once(server, "listening");
  await sleep(200); // let the first /odom arrive

  const base = `http://localhost:${server.address().port}`;

  const post = (path, body) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const get = async (path) => {
    const res = await fetch(base + path);
    return { status: res.status, body: await res.json() };
  };

  async function stop() {
    bridge.removeAllListeners();
    bridge.connect = () => {}; // stop the reconnect loop
    bridge.ws?.terminate();
    realtime.close();
    server.close();
    await mock.close();
  }

  return { base, robot, missions, telemetry, post, get, stop };
}
