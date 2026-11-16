import { Router } from "express";
import { MissionError, serializeMission } from "../../missions/MissionManager.js";
import { validateCreateMission, validateMissionQuery } from "../validators/mission.js";

export function missionRoutes({ missions, defaultRobotId }) {
  const router = Router();
  const toJson = (m) => serializeMission(m, missions);

  // Create a "go to (x, y)" mission. robotId defaults to the only robot for now.
  router.post("/", (req, res, next) => {
    const { value, errors } = validateCreateMission(req.body, { defaultRobotId });
    if (errors) return res.status(400).json({ errors });
    try {
      res.status(201).json(toJson(missions.create(value)));
    } catch (e) {
      next(e);
    }
  });

  // List missions, newest first. Filters: ?state=active&robotId=tb3_0
  router.get("/", (req, res) => {
    const { value, errors } = validateMissionQuery(req.query);
    if (errors) return res.status(400).json({ errors });
    const list = missions.list(value).map(toJson);
    res.json({ count: list.length, missions: list });
  });

  router.get("/:id", (req, res) => {
    const mission = missions.get(req.params.id);
    if (!mission) return res.status(404).json({ error: `Mission "${req.params.id}" not found` });
    res.json(toJson(mission));
  });

  router.post("/:id/cancel", (req, res, next) => {
    try {
      const mission = missions.cancel(req.params.id);
      // An active mission finishes cancelling on the next tick; report the outcome.
      setImmediate(() => res.json(toJson(mission)));
    } catch (e) {
      next(e);
    }
  });

  // Turn MissionErrors into clean JSON responses
  router.use((err, _req, res, next) => {
    if (err instanceof MissionError) return res.status(err.status).json({ error: err.message });
    next(err);
  });

  return router;
}
