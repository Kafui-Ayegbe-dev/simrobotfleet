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
| Realtime | `src/realtime/` | Socket.IO: broadcasts `robots:status` (an array, ready for a fleet) and mission events to clients. |
| Missions | `src/missions/` | `MissionManager`: per-robot FIFO queue, lifecycle (`queued → active → succeeded/failed/cancelled`), emits `update`. |
| Navigation | `src/navigation/` | Go-to-goal controller, plugged into `MissionManager` as its executor. Streams velocity commands at 10 Hz and decides success or failure. |
| Telemetry | `src/telemetry/` | `TelemetryBuffer`: fixed-size ring buffer of poses per robot, sampled at 5 Hz from the robot's `odom` events. |
| Domain | `src/robots/` | `Robot`: commands, state machine (`idle` / `moving` / `stale` / `disconnected`), latest pose. |
| ROS | `src/ros/` | `RosBridge` WebSocket client (reconnects automatically) and message helpers (`Twist`, `Odometry`). |
| Shared | `src/config/`, `src/utils/` | Settings, hardware limits, formatting helpers. |

`app.js` wires routes into an Express app, and `index.js` is the entry point that connects everything and starts listening. Keeping `app.js` separate lets tests run the full API against the mock bridge without a real server.

## Where future milestones go

| Milestone | Lands in |
|---|---|
| 4: Dashboard | `dashboard/` (React + TypeScript) at the repo root, which can embed the 3D view from `viewer/` |
| 5: Failure handling | `src/robots/` and `src/missions/` |
| 6: Multiple robots | `src/robots/RobotRegistry.js`, namespaced sims in `sim/launch/` |

## Viewer coordinates

ROS uses x forward, y left, z up. three.js uses y up. The viewer maps ROS `(x, y)` to three `(x, 0, -y)`, and ROS yaw to `rotation.y`. See `viewer/js/scene.js`.

## How missions drive the robot

`MissionManager` doesn't know how to move a robot. It hands each active mission to an **executor**:

```js
executor(mission, { robot, signal }) -> Promise
// resolve       -> mission succeeded
// reject(err)   -> mission failed (err.message kept)
// signal abort  -> mission cancelled: stop the robot and return
```

The server passes in `createGoToGoalExecutor()` from `src/navigation/goToGoal.js`. (`MissionManager`'s built-in default just waits until cancelled, which tests use.) A smarter planner later, for example one with obstacle avoidance, would be another executor, and nothing else would need to change.

**Who controls `/cmd_vel`:** while a mission runs, the navigation loop owns the robot. Manual `/move` returns 409, and `/stop` acts as an emergency stop that cancels the robot's missions.
