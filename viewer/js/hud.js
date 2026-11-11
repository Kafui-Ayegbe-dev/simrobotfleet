// HTML status panel for the desktop view.
const connEl = document.getElementById("conn");
const robotsEl = document.getElementById("robots");

export function setConnection(live) {
  connEl.textContent = live ? "live" : "offline";
  connEl.className = `pill ${live ? "pill--live" : "pill--off"}`;
}

const fmt = (n, dp = 2) => (n == null ? "–" : n.toFixed(dp));

export function renderRobots(statuses) {
  if (!statuses.length) {
    robotsEl.innerHTML = `<div class="empty">No robots</div>`;
    return;
  }
  robotsEl.innerHTML = statuses
    .map((s) => {
      const p = s.pose ?? {};
      const v = s.velocity ?? {};
      return `
        <section class="robot">
          <div class="robot__head">
            <span class="robot__id">${s.id}</span>
            <span class="pill pill--${s.state}">${s.state}</span>
          </div>
          <dl class="robot__grid">
            <dt>x</dt><dd>${fmt(p.x)} m</dd>
            <dt>y</dt><dd>${fmt(p.y)} m</dd>
            <dt>heading</dt><dd>${fmt(p.heading, 1)}°</dd>
            <dt>speed</dt><dd>${fmt(v.linear)} m/s</dd>
            <dt>turn</dt><dd>${fmt(v.angular)} rad/s</dd>
          </dl>
        </section>`;
    })
    .join("");
}
