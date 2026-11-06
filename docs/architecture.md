# Architecture

```
curl / dashboard ──HTTP──▶ Node server (:3000) ──WebSocket──▶ rosbridge (:9090) ──ROS 2──▶ turtlebot3_fake_node
                                   ▲                                                            │
                                   └─────────────────────────── /odom ◀─────────────────────────┘
```

Two processes:

- **Sim** (Docker, `sim/`): ROS 2 Humble with `turtlebot3_fake_node`, `robot_state_publisher`, rosbridge and RViz. It runs on Apple Silicon, where Gazebo doesn't.
- **Server** (on the host, `server/`): a Node.js backend that speaks the rosbridge JSON protocol and exposes a REST API.

## Server layers

Each layer only depends on the layers below it.

| Layer | Folder | Responsibility |
|---|---|---|
| API | `src/api/` | HTTP routes, request validation, response formatting. No ROS knowledge. |
| Domain | `src/robots/` | `Robot`: commands, state machine (`idle` / `moving` / `stale` / `disconnected`), latest pose. |
| ROS | `src/ros/` | `RosBridge` WebSocket client (reconnects automatically) and message helpers (`Twist`, `Odometry`). |
| Shared | `src/config/`, `src/utils/` | Settings, hardware limits, formatting helpers. |

`app.js` wires routes into an Express app, and `index.js` is the entry point that connects everything and starts listening. Keeping `app.js` separate lets tests run the full API against the mock bridge without a real server.

## Where future milestones go

| Milestone | Lands in |
|---|---|
| 2: Telemetry, missions, live updates | `src/missions/`, `src/telemetry/`, `src/realtime/` (Socket.IO), new routes in `src/api/routes/` |
| 3: Autonomous navigation | `src/navigation/` (go-to-goal controller) |
| 4: Dashboard | `dashboard/` (React + TypeScript) at the repo root |
| 5: Failure handling | `src/robots/` and `src/missions/` |
| 6: Multiple robots | `src/robots/RobotRegistry.js`, namespaced sims in `sim/launch/` |
