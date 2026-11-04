import express from "express";
import { RosBridge } from "./rosbridge.js";
import { Robot, LIMITS } from "./robot.js";

const PORT = Number(process.env.PORT ?? 3000);
const ROSBRIDGE_URL = process.env.ROSBRIDGE_URL ?? "ws://localhost:9090";

const bridge = new RosBridge(ROSBRIDGE_URL);
bridge.on("connected", () => console.log(`[rosbridge] connected to ${ROSBRIDGE_URL}`));
bridge.on("disconnected", () => console.warn("[rosbridge] disconnected, retrying..."));
bridge.on("error", (e) => console.warn(`[rosbridge] ${e.code ?? e.message}`));
bridge.connect();

const robot = new Robot("tb3_0", bridge);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, rosbridge: bridge.connected ? "connected" : "disconnected" });
});

app.get("/robot/status", (_req, res) => {
  res.json(robot.status());
});

app.post("/robot/move", (req, res) => {
  const { linear = 0, angular = 0, durationMs = 1000 } = req.body ?? {};
  const errors = [];
  if (typeof linear !== "number" || Math.abs(linear) > LIMITS.maxLinear)
    errors.push(`linear must be a number in [-${LIMITS.maxLinear}, ${LIMITS.maxLinear}] m/s`);
  if (typeof angular !== "number" || Math.abs(angular) > LIMITS.maxAngular)
    errors.push(`angular must be a number in [-${LIMITS.maxAngular}, ${LIMITS.maxAngular}] rad/s`);
  if (!Number.isInteger(durationMs) || durationMs <= 0 || durationMs > LIMITS.maxDurationMs)
    errors.push(`durationMs must be an integer in (0, ${LIMITS.maxDurationMs}]`);
  if (errors.length) return res.status(400).json({ errors });

  try {
    const command = robot.move(linear, angular, durationMs);
    res.status(202).json({ accepted: true, command });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.post("/robot/stop", (_req, res) => {
  const sent = robot.stop();
  res.status(sent ? 200 : 503).json({ stopped: sent });
});

app.listen(PORT, () => console.log(`RoboOps server on http://localhost:${PORT}`));
