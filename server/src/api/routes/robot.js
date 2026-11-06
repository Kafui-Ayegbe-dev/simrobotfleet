import { Router } from "express";
import { validateMove } from "../validators/move.js";

export function robotRoutes({ robot }) {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json(robot.status());
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
