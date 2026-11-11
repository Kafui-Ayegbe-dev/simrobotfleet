// Entry point: connect to rosbridge, create the robot, start the HTTP(S) server.
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import { config } from "./config/index.js";
import { RosBridge } from "./ros/rosbridge.js";
import { Robot } from "./robots/Robot.js";
import { createApp } from "./app.js";
import { attachRealtime } from "./realtime/socket.js";

const bridge = new RosBridge(config.rosbridgeUrl, { reconnectMs: config.rosbridgeReconnectMs });
bridge.on("connected", () => console.log(`[rosbridge] connected to ${config.rosbridgeUrl}`));
bridge.on("disconnected", () => console.warn("[rosbridge] disconnected, retrying..."));
bridge.on("error", (e) => console.warn(`[rosbridge] ${e.code ?? e.message}`));
bridge.connect();

const robot = new Robot("tb3_0", bridge);
const app = createApp({ bridge, robot });

const useHttps = Boolean(config.httpsKey && config.httpsCert);
const server = useHttps
  ? https.createServer({ key: fs.readFileSync(config.httpsKey), cert: fs.readFileSync(config.httpsCert) }, app)
  : http.createServer(app);

attachRealtime(server, { robots: [robot] });

server.listen(config.port, () => {
  const scheme = useHttps ? "https" : "http";
  console.log(`RoboOps server on ${scheme}://localhost:${config.port}`);
  console.log(`Viewer:          ${scheme}://localhost:${config.port}/viewer/`);
  for (const ip of lanAddresses()) console.log(`On your network: ${scheme}://${ip}:${config.port}/viewer/`);
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
}
