import { Router } from "express";
import { validateMove } from "../validators/move.js";
import { validateTelemetryQuery } from "../validators/telemetry.js";
import { iso } from "../../utils/format.js";

export function robotRoutes({ robot, telemetry }) {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json(robot.status());
  });

  // Recent pose history. ?since=<ISO or ms>&limit=<n>
  router.get("/telemetry", (req, res) => {
    const { value, errors } = validateTelemetryQuery(req.query);
    if (errors) return res.status(400).json({ errors });
    const samples = telemetry.query(robot.id, value).map((s) => ({ ...s, t: iso(s.t) }));
    res.json({ robotId: robot.id, count: samples.length, samples });
  });

  router.post("/move", (req, res) => {
    const { value, errors } = validateMove(req.body);
    if (errors) return res.status(400).json({ errors });

    try {
      const command = robot.move(value.linear, value.angular, value.durationMs);
      res.status(202).json({ accepted: true, command });
    } catch (e) {
      res.status(503).json({ error: e.message });
    }
  });

  router.post("/stop", (_req, res) => {
    const sent = robot.stop();
    res.status(sent ? 200 : 503).json({ stopped: sent });
  });

  return router;
}
