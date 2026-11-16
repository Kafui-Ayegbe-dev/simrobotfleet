// Pushes live data to connected clients (the viewer, later the dashboard).
//
// Events (server -> client):
//   "robots:status"    [status, ...]    every 1/statusHz seconds, and once on connect
//   "missions:snapshot" [mission, ...]  once on connect: all queued + active missions
//   "missions:update"   mission         whenever a mission is created or changes state
//
// Robot status is always an array, even with one robot, so clients are ready for a fleet.
import { Server } from "socket.io";
import { REALTIME } from "../config/index.js";
import { serializeMission } from "../missions/MissionManager.js";

export function attachRealtime(httpServer, { robots, missions }) {
  const io = new Server(httpServer);
  const snapshot = () => robots.map((r) => r.status());
  const openMissions = () =>
    missions
      ? missions.list().filter((m) => m.state === "queued" || m.state === "active").map((m) => serializeMission(m, missions))
      : [];

  io.on("connection", (socket) => {
    socket.emit("robots:status", snapshot());
    socket.emit("missions:snapshot", openMissions());
  });

  const timer = setInterval(() => {
    if (io.engine.clientsCount > 0) io.emit("robots:status", snapshot());
  }, 1000 / REALTIME.statusHz);

  const onMission = (m) => io.emit("missions:update", serializeMission(m, missions));
  missions?.on("update", onMission);

  return {
    io,
    close: () => {
      clearInterval(timer);
      missions?.off("update", onMission);
      io.close();
    },
  };
}
