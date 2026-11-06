// Entry point: connect to rosbridge, create the robot, start the HTTP server.
import { config } from "./config/index.js";
import { RosBridge } from "./ros/rosbridge.js";
import { Robot } from "./robots/Robot.js";
import { createApp } from "./app.js";

const bridge = new RosBridge(config.rosbridgeUrl, { reconnectMs: config.rosbridgeReconnectMs });
bridge.on("connected", () => console.log(`[rosbridge] connected to ${config.rosbridgeUrl}`));
bridge.on("disconnected", () => console.warn("[rosbridge] disconnected, retrying..."));
bridge.on("error", (e) => console.warn(`[rosbridge] ${e.code ?? e.message}`));
bridge.connect();

const robot = new Robot("tb3_0", bridge);
const app = createApp({ bridge, robot });

app.listen(config.port, () => console.log(`RoboOps server on http://localhost:${config.port}`));
