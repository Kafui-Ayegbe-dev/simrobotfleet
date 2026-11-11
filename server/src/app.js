// Builds the Express app. Kept separate from index.js so tests can
// create an app without starting a real server.
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import express from "express";
import { prettyJson } from "./api/middleware/prettyJson.js";
import { healthRoutes } from "./api/routes/health.js";
import { robotRoutes } from "./api/routes/robot.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const VIEWER_DIR = path.resolve(here, "../../viewer");
// three.js is served from node_modules, so the viewer needs no CDN or build step
const THREE_DIR = path.resolve(path.dirname(createRequire(import.meta.url).resolve("three")), "..");

export function createApp({ bridge, robot }) {
  const app = express();
  app.use(express.json());
  app.use(prettyJson);

  app.use("/health", healthRoutes({ bridge }));
  app.use("/robot", robotRoutes({ robot }));

  // 3D / VR viewer
  app.use("/viewer", express.static(VIEWER_DIR));
  app.use("/vendor/three", express.static(THREE_DIR));
  app.get("/", (_req, res) => res.redirect("/viewer/"));

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  return app;
}
