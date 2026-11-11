// Floating status board shown inside VR, where HTML overlays aren't visible.
import * as THREE from "three";
import { STATE_COLORS } from "./robot.js";

const W = 768;
const H = 384;

export class VRPanel {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.3),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true })
    );
    this.mesh.visible = false;
    this.lastDraw = 0;
  }

  draw(statuses, live, now = performance.now()) {
    if (!this.mesh.visible || now - this.lastDraw < 200) return; // ~5 Hz is plenty
    this.lastDraw = now;
    const c = this.ctx;

    c.clearRect(0, 0, W, H);
    roundRect(c, 0, 0, W, H, 28);
    c.fillStyle = "rgba(20, 24, 31, 0.88)";
    c.fill();

    c.fillStyle = "#e6e9ef";
    c.font = "600 40px -apple-system, Segoe UI, Roboto, sans-serif";
    c.fillText("RoboOps", 32, 62);
    c.fillStyle = live ? "#3fb950" : "#f85149";
    c.font = "600 26px -apple-system, Segoe UI, Roboto, sans-serif";
    c.fillText(live ? "● LIVE" : "● OFFLINE", W - 170, 58);

    const s = statuses[0];
    if (!s) {
      c.fillStyle = "#8a93a3";
      c.fillText("No robots", 32, 140);
    } else {
      const p = s.pose ?? {};
      const color = `#${(STATE_COLORS[s.state] ?? 0x8a93a3).toString(16).padStart(6, "0")}`;
      c.fillStyle = "#e6e9ef";
      c.font = "600 32px -apple-system, Segoe UI, Roboto, sans-serif";
      c.fillText(s.id, 32, 130);
      c.fillStyle = color;
      c.fillText(s.state.toUpperCase(), 220, 130);

      c.font = "30px ui-monospace, Menlo, monospace";
      c.fillStyle = "#8a93a3";
      const rows = [
        ["x", `${(p.x ?? 0).toFixed(2)} m`],
        ["y", `${(p.y ?? 0).toFixed(2)} m`],
        ["heading", `${(p.heading ?? 0).toFixed(1)}°`],
      ];
      rows.forEach(([k, v], i) => {
        const y = 190 + i * 52;
        c.fillStyle = "#8a93a3";
        c.fillText(k, 32, y);
        c.fillStyle = "#e6e9ef";
        c.fillText(v, 260, y);
      });
    }
    this.texture.needsUpdate = true;
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
