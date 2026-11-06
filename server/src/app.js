// Builds the Express app. Kept separate from index.js so tests can
// create an app without starting a real server.
import express from "express";
import { prettyJson } from "./api/middleware/prettyJson.js";
import { healthRoutes } from "./api/routes/health.js";
import { robotRoutes } from "./api/routes/robot.js";

export function createApp({ bridge, robot }) {
  const app = express();
  app.use(express.json());
  app.use(prettyJson);

  app.use("/health", healthRoutes({ bridge }));
  app.use("/robot", robotRoutes({ robot }));

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  return app;
}
