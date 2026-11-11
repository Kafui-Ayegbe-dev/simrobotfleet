# Architecture

```
curl / viewer ────HTTP───▶ Node server (:3000) ──WebSocket──▶ rosbridge (:9090) ──ROS 2──▶ turtlebot3_fake_node
   viewer ◀──Socket.IO (10 Hz)──── │ ◀────────────────────────── /odom ◀─────────────────────────┘
```

Two processes:

- **Sim** (Docker, `sim/`): ROS 2 Humble with `turtlebot3_fake_node`, `robot_state_publisher`, rosbridge and RViz. It runs on Apple Silicon, where Gazebo doesn't.
- **Server** (on the host, `server/`): a Node.js backend that speaks the rosbridge JSON protocol, exposes a REST API, pushes live status over Socket.IO and serves the viewer.
- **Viewer** (`viewer/`): a plain Three.js + WebXR page with no build step. three.js is served from the server's `node_modules`. It works as a normal 3D view on desktop and as an immersive view in a headset.

## Server layers

Each layer only depends on the layers below it.

| Layer | Folder | Responsibility |
|---|---|---|
| API | `src/api/` | HTTP routes, request validation, response formatting. No ROS knowledge. |
| Realtime | `src/realtime/` | Socket.IO: broadcasts `robots:status` (an array, ready for a fleet) to viewers. |
| Domain | `src/robots/` | `Robot`: commands, state machine (`idle` / `moving` / `stale` / `disconnected`), latest pose. |
| ROS | `src/ros/` | `RosBridge` WebSocket client (reconnects automatically) and message helpers (`Twist`, `Odometry`). |
| Shared | `src/config/`, `src/utils/` | Settings, hardware limits, formatting helpers. |

`app.js` wires routes into an Express app, and `index.js` is the entry point that connects everything and starts listening. Keeping `app.js` separate lets tests run the full API against the mock bridge without a real server.

## Where future milestones go

| Milestone | Lands in |
|---|---|
| 2: Telemetry, missions, live updates | `src/missions/`, `src/telemetry/`, new events in `src/realtime/`, new routes in `src/api/routes/` |
| 3: Autonomous navigation | `src/navigation/` (go-to-goal controller) |
| 4: Dashboard | `dashboard/` (React + TypeScript) at the repo root, which can embed the 3D view from `viewer/` |
| 5: Failure handling | `src/robots/` and `src/missions/` |
| 6: Multiple robots | `src/robots/RobotRegistry.js`, namespaced sims in `sim/launch/` |

## Viewer coordinates

ROS uses x forward, y left, z up. three.js uses y up. The viewer maps ROS `(x, y)` to three `(x, 0, -y)`, and ROS yaw to `rotation.y`. See `viewer/js/scene.js`.
