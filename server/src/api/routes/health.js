import { Router } from "express";

export function healthRoutes({ bridge }) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ ok: true, rosbridge: bridge.connected ? "connected" : "disconnected" });
  });

  return router;
}
