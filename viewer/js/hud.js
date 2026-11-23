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
            <dt>mission</dt><dd>${s.mission ?? "–"}</dd>
          </dl>
        </section>`;
    })
    .join("");
}

const missionsEl = document.getElementById("missions");
const MAX_OPEN_SHOWN = 6;
const MAX_FINISHED_SHOWN = 3;

const missionRow = (m) => `
  <li class="mission mission--${m.state}" title="${m.error ?? ""}">
    <span class="mission__id">${m.id}</span>
    <span class="mission__goal">(${fmt(m.goal.x, 1)}, ${fmt(m.goal.y, 1)})</span>
    <span class="pill pill--${m.state}">${m.state}</span>
  </li>`;

export function renderMissions(list) {
  const open = list.filter((m) => m.state === "active" || m.state === "queued");
  const done = list.filter((m) => m.state !== "active" && m.state !== "queued").slice(0, MAX_FINISHED_SHOWN);
  if (!open.length && !done.length) {
    missionsEl.innerHTML = `<li class="empty">None yet. Double-click the floor.</li>`;
    return;
  }
  const hidden = open.length - MAX_OPEN_SHOWN;
  missionsEl.innerHTML =
    open.slice(0, MAX_OPEN_SHOWN).map(missionRow).join("") +
    (hidden > 0 ? `<li class="empty">+${hidden} more queued</li>` : "") +
    done.map(missionRow).join("");
}

const toastEl = document.getElementById("toast");
let toastTimer;
export function toast(text, kind = "info") {
  toastEl.textContent = text;
  toastEl.className = `toast toast--${kind} toast--show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("toast--show"), 2500);
}
