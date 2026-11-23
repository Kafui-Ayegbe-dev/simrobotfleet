// Routes for ONE robot. Mounted twice in app.js:
//   /robots/:id/...   the robot named in the URL
//   /robot/...        the default robot (kept so older commands still work)
// Either way, a middleware has already put the robot on req.robot.
import { Router } from "express";
import { validateMove } from "../validators/move.js";
import { validateTelemetryQuery } from "../validators/telemetry.js";
import { iso } from "../../utils/format.js";

export function robotRoutes({ telemetry, missions }) {
  const router = Router();

  router.get("/status", (req, res) => {
    res.json(req.robot.status());
  });

  // Recent pose history. ?since=<ISO or ms>&limit=<n>
  router.get("/telemetry", (req, res) => {
    const { value, errors } = validateTelemetryQuery(req.query);
    if (errors) return res.status(400).json({ errors });
    const { robot } = req;
    const samples = telemetry.query(robot.id, value).map((s) => ({ ...s, t: iso(s.t) }));
    res.json({ robotId: robot.id, count: samples.length, samples });
  });

  // Manual drive. Refused while a mission is driving the robot, so the two
  // don't fight over /cmd_vel.
  router.post("/move", (req, res) => {
    const { robot } = req;
    const active = missions?.activeFor(robot.id);
    if (active) {
      return res.status(409).json({
        error: `Robot ${robot.id} is running mission ${active.id}. Cancel it first, or POST /robots/${robot.id}/stop.`,
      });
    }

    const { value, errors } = validateMove(req.body);
    if (errors) return res.status(400).json({ errors });

    try {
      const command = robot.move(value.linear, value.angular, value.durationMs);
      res.status(202).json({ accepted: true, command });
    } catch (e) {
      res.status(503).json({ error: e.message });
    }
  });

  // Emergency stop: halts the robot and cancels its active and queued missions.
  router.post("/stop", (req, res) => {
    const { robot } = req;
    const cancelledMissions = missions ? missions.cancelAll(robot.id) : [];
    const sent = robot.stop();
    res.status(sent ? 200 : 503).json({ stopped: sent, cancelledMissions });
  });

  return router;
}
