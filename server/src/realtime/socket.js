// Pushes live robot status to connected clients (the viewer, later the dashboard).
//
// Events (server -> client):
//   "robots:status"  [status, ...]   every 1/statusHz seconds, and once on connect
//
// It sends an array even with one robot, so clients are ready for a fleet.
import { Server } from "socket.io";
import { REALTIME } from "../config/index.js";

export function attachRealtime(httpServer, { robots }) {
  const io = new Server(httpServer);
  const snapshot = () => robots.map((r) => r.status());

  io.on("connection", (socket) => {
    socket.emit("robots:status", snapshot());
  });

  const timer = setInterval(() => {
    if (io.engine.clientsCount > 0) io.emit("robots:status", snapshot());
  }, 1000 / REALTIME.statusHz);

  return {
    io,
    close: () => {
      clearInterval(timer);
      io.close();
    },
  };
}
