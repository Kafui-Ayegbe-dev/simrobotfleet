# RoboOps

Robot fleet management with Node.js + ROS 2. Milestone 1: drive one simulated TurtleBot3 over HTTP and read back its pose.

```
curl / browser ──HTTP──▶ Node (Express, :3000) ──WebSocket──▶ rosbridge (:9090) ──ROS 2──▶ turtlebot3_fake_node
                                    ▲                                                          │
                                    └──────────────────────── /odom ◀──────────────────────────┘
```

Runs on Apple Silicon. It uses `turtlebot3_fake_node` (a kinematic sim) because Gazebo doesn't run on ARM64.

## Setup (one time)

Requires Docker Desktop and Node 18+.

```bash
# from the repo root
docker compose build          # bakes ROS packages into the image (~5 min first time)
cd server && npm install
```

## Run

**1. Start the container**
```bash
docker compose up -d
```

**2. Start the sim.** Open http://localhost:6080, open a terminal in the desktop, and run:
```bash
start-sim                     # fake node + robot_state_publisher + rosbridge + RViz
```
You should see the burger robot in RViz and `Rosbridge WebSocket server started on port 9090` in the logs.

**3. Start the server.** In a Mac terminal:
```bash
cd server && npm start        # expect: [rosbridge] connected to ws://localhost:9090
```

**4. Drive it.**
```bash
curl localhost:3000/robot/status

curl -X POST localhost:3000/robot/move \
  -H 'Content-Type: application/json' \
  -d '{"linear":0.2,"angular":0,"durationMs":2000}'     # forward ~0.4 m

curl -X POST localhost:3000/robot/move \
  -H 'Content-Type: application/json' \
  -d '{"linear":0,"angular":1.57,"durationMs":1000}'    # turn ~90°

curl -X POST localhost:3000/robot/stop
```

Milestone 1 is done when the robot moves in RViz and `/robot/status` shows the new pose.

**Stop everything:** `docker compose down` (the image is kept, so the next `up` is instant).

## API

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/health` | | Server and rosbridge connection |
| GET | `/robot/status` | | `state`: `idle` / `moving` / `stale` / `disconnected`, plus pose (x, y, yaw) and velocity |
| POST | `/robot/move` | `{linear, angular, durationMs}` | Limits: ±0.22 m/s, ±2.84 rad/s, ≤10 s. Publishes at 10 Hz, then sends a zero Twist. A new move replaces the current one. Returns 503 if the bridge is down |
| POST | `/robot/stop` | | Immediate zero Twist |

## Testing without ROS

```bash
cd server
npm run mock      # terminal 1: fake rosbridge that simulates /odom
npm start         # terminal 2
```

## Troubleshooting

- **Server says `ECONNREFUSED`**: rosbridge isn't up. Check that `start-sim` is running and port 9090 is mapped (`docker ps`).
- **`stale` state**: the bridge is connected but no `/odom` is arriving, so the fake node isn't running.
- **Robot doesn't move in RViz**: set Fixed Frame to `odom` in RViz.
- **Changed the Dockerfile or launch file?** Run `docker compose build && docker compose up -d --force-recreate`.

## Layout

```
sim/       Dockerfile + roboops_sim.launch.py (the ROS side)
server/    Node backend: rosbridge client, Robot model, Express API, mock bridge
```
# robotfleet
