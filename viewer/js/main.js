// RoboOps 3D / VR viewer.
// Desktop: orbit camera + HTML HUD.  Headset: "Enter VR" puts you next to the robot.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { buildEnvironment } from "./scene.js";
import { RobotView } from "./robot.js";
import { renderRobots, setConnection } from "./hud.js";
import { VRPanel } from "./vrPanel.js";

// ---------- Renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1116);
scene.fog = new THREE.Fog(0x0e1116, 4, 9);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0.9, 0.75, 1.0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.08, 0);
controls.enableDamping = true;
controls.minDistance = 0.25;
controls.maxDistance = 8;
controls.maxPolarAngle = Math.PI / 2 - 0.02; // don't go under the floor
controls.update();

// Everything lives in `world`, so VR can shift it in front of the viewer.
const world = buildEnvironment();
scene.add(world);

const vrPanel = new VRPanel();
scene.add(vrPanel.mesh);

// ---------- Robots ----------
const robots = new Map(); // id -> RobotView
let latest = [];
let live = false;

function getRobot(id) {
  let view = robots.get(id);
  if (!view) {
    view = new RobotView(id);
    world.add(view.group, view.trail);
    robots.set(id, view);
  }
  return view;
}

// ---------- Live data from the server ----------
const socket = io();
socket.on("connect", () => { live = true; setConnection(true); });
socket.on("disconnect", () => { live = false; setConnection(false); });
socket.on("robots:status", (statuses) => {
  latest = statuses;
  for (const s of statuses) getRobot(s.id).update(s);
  renderRobots(statuses);
});

// ---------- Follow mode (desktop) ----------
const followBox = document.getElementById("follow");
const lastFollowPos = new THREE.Vector3();
let following = false;
followBox.addEventListener("change", () => {
  following = followBox.checked;
  const first = robots.values().next().value;
  if (following && first) lastFollowPos.copy(first.group.position);
});

function applyFollow() {
  const first = robots.values().next().value;
  if (!following || !first) return;
  const delta = first.group.position.clone().sub(lastFollowPos);
  camera.position.add(delta);
  controls.target.add(delta);
  lastFollowPos.copy(first.group.position);
}

// ---------- VR session: place the robot area in front of the user ----------
renderer.xr.addEventListener("sessionstart", () => {
  world.position.set(0, 0, -1.0);          // odom origin 1 m ahead of where you stand
  vrPanel.mesh.position.set(0.55, 1.1, -1.3);
  vrPanel.mesh.rotation.set(-0.25, -0.35, 0, "YXZ"); // turned toward you, tilted back
  vrPanel.mesh.visible = true;
  document.body.classList.add("in-vr");
});
renderer.xr.addEventListener("sessionend", () => {
  world.position.set(0, 0, 0);
  vrPanel.mesh.visible = false;
  document.body.classList.remove("in-vr");
});

// ---------- Render loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  for (const r of robots.values()) r.tick(dt);
  if (!renderer.xr.isPresenting) {
    applyFollow();
    controls.update();
  }
  vrPanel.draw(latest, live);
  renderer.render(scene, camera);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Handy from the browser console while debugging
window.roboops = { scene, camera, controls, robots, clearTrails: () => robots.forEach((r) => r.clearTrail()) };
