// Builds the Express app. Kept separate from index.js so tests can
// create an app without starting a real server.
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import express from "express";
import { prettyJson } from "./api/middleware/prettyJson.js";
import { healthRoutes } from "./api/routes/health.js";
import { robotRoutes } from "./api/routes/robot.js";
import { missionRoutes } from "./api/routes/missions.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const VIEWER_DIR = path.resolve(here, "../../viewer");
// three.js is served from node_modules, so the viewer needs no CDN or build step
const THREE_DIR = path.resolve(path.dirname(createRequire(import.meta.url).resolve("three")), "..");

export function createApp({ bridge, robots, missions, telemetry }) {
  const app = express();
  app.use(express.json());
  app.use(prettyJson);

  const byId = new Map(robots.map((r) => [r.id, r]));
  const defaultRobot = robots[0];
  const oneRobot = robotRoutes({ telemetry, missions });

  app.use("/health", healthRoutes({ bridge }));

  // Fleet
  app.get("/robots", (_req, res) => {
    res.json({ count: robots.length, robots: robots.map((r) => r.status()) });
  });
  app.use(
    "/robots/:id",
    (req, res, next) => {
      req.robot = byId.get(req.params.id);
      if (!req.robot) return res.status(404).json({ error: `Unknown robot "${req.params.id}"` });
      next();
    },
    oneRobot
  );

  // Legacy single-robot routes -> default robot
  app.use("/robot", (req, _res, next) => { req.robot = defaultRobot; next(); }, oneRobot);

  app.use("/missions", missionRoutes({ missions, defaultRobotId: defaultRobot.id }));

  // 3D / VR viewer
  app.use("/viewer", express.static(VIEWER_DIR));
  app.use("/vendor/three", express.static(THREE_DIR));
  app.get("/", (_req, res) => res.redirect("/viewer/"));

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  // Malformed JSON bodies and anything unexpected
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}
