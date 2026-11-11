# Roadmap

Guiding principle: get the core working quickly, then improve incrementally. No paid infrastructure, and no dashboard before the robot works.

- [x] **1. One robot moving**: an HTTP request drives the simulated TurtleBot3, and the API reports pose and status
- [x] **Extra: 3D / VR viewer**: live Three.js + WebXR view of the robot, pushed over Socket.IO
- [ ] **2. Backend**: telemetry history, mission model, Socket.IO live updates, `/robots/:id` routes
- [ ] **3. Autonomous missions**: go-to-goal navigation to an (x, y) target
- [ ] **4. Real-time dashboard**: React + TypeScript view of position, status and mission progress
- [ ] **5. Failure handling**: command timeouts, disconnections, failed missions, recovery
- [ ] **6. Multiple robots**: mission assignment, coordination, scheduling
- [ ] **7. Polish and publish**: architecture write-up, demo video, LinkedIn
