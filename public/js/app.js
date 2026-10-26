import {
  loadData,
  ranked,
  rankFor,
  memberChange,
  memberAchievementStats,
  achievementStats,
  ledgerStats,
  seasonProgress,
  recentActivityFor,
  pollTotal,
  RANGE_LABELS,
} from "./api.js";
import {
  esc,
  fmt,
  fmtDate,
  monthLabel,
  monthLong,
  timeAgo,
  daysUntil,
  avatar,
  roleBadge,
  trend,
  checkIcon,
  crownIcon,
} from "./ui.js";

const view = document.getElementById("view");
const seasonChip = document.getElementById("season-chip");
const footerMeta = document.getElementById("footer-meta");
const helpModal = document.getElementById("help-modal");
const unlockModal = document.getElementById("unlock-modal");

const config = window.DP_CONFIG || {};
const SNEAK_PEEK = Boolean(config.sneakPeek);
const OWNER_KEY = "omen_owner_access";

const state = {
  data: null,
  route: null,
  lastKey: "",
};

let ownerSession = false;
let pendingHash = "";

/* ── Access gate ──────────────────────────────────────────────────────── */

function hasOwnerAccess() {
  if (!SNEAK_PEEK) return true;
  if (ownerSession) return true;
  try {
    return localStorage.getItem(OWNER_KEY) === "1";
  } catch {
    return false;
  }
}

function isLocked() {
  return SNEAK_PEEK && !hasOwnerAccess();
}

function applyAccessState() {
  const locked = isLocked();
  document.body.classList.toggle("peek", locked);
  const lockBtn = document.getElementById("lock-btn");
  if (lockBtn) lockBtn.hidden = !(SNEAK_PEEK && !locked);
}

/* ── Boot ─────────────────────────────────────────────────────────────── */

async function init() {
  wireHelpModal();
  wireUnlockModal();
  applyAccessState();
  window.addEventListener("hashchange", handleRoute);
  window.addEventListener("keydown", handleGlobalKeys);
  view.addEventListener("pointermove", handleLandingPointer);
  view.addEventListener("pointerleave", resetLandingTilt);

  try {
    state.data = await loadData();
    applyMeta();
    handleRoute();
  } catch (error) {
    console.error(error);
    renderLoadError(error);
  }
}

function applyMeta() {
  const { meta } = state.data;
  const shortSeason = meta.season.split("·")[0].trim();
  seasonChip.textContent = shortSeason;
  seasonChip.title = meta.season;

  const edit = window.DP_CONFIG && window.DP_CONFIG.editUrl;
  const updated = `<span title="${esc(fmtDate(meta.updatedAt, { dateStyle: "medium", timeStyle: "short" }))}">Updated ${esc(timeAgo(meta.updatedAt))}</span>`;
  footerMeta.innerHTML = `${esc(meta.guild)} ledger · ${state.data.members.length} members · ${updated}${
    edit ? ` · <a href="${esc(edit)}" target="_blank" rel="noopener noreferrer">Edit ledger</a>` : ""
  }`;
}

function discordInvite() {
  const url = window.DP_CONFIG && window.DP_CONFIG.discordUrl;
  return url || "https://discord.gg/";
}

/* ── Routing ──────────────────────────────────────────────────────────── */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const segments = pathPart.split("/").filter(Boolean).map(decodeURIComponent);
  return {
    name: segments[0] || "home",
    id: segments[1] || "",
    query: new URLSearchParams(queryPart || ""),
  };
}

function handleRoute() {
  if (!state.data) return;
  let route = parseRoute();

  if (isLocked() && route.name !== "home") {
    pendingHash = location.hash || "#/points";
    history.replaceState(null, "", "#/");
    route = parseRoute();
    openUnlock();
  }

  if (!isLocked() && route.name === "owner") {
    location.replace("#/points");
    return;
  }

  state.route = route;
  applyAccessState();

  const navKey = route.name === "member" ? "leaderboard" : route.name;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === navKey) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  let html;
  let title = "OMEN";
  switch (route.name) {
    case "home":
      html = landingView();
      title = "OMEN — Only the best";
      break;
    case "points":
      html = pointsView();
      title = `Points overview · ${state.data.meta.guild}`;
      break;
    case "leaderboard":
      html = leaderboardView(route);
      title = `Leaderboard · ${state.data.meta.guild}`;
      break;
    case "member":
      html = profileView(route.id);
      title = `${route.id} · ${state.data.meta.guild}`;
      break;
    case "achievements":
      html = achievementsView();
      title = `Achievements · ${state.data.meta.guild}`;
      break;
    case "polls":
      html = pollsView();
      title = `Polls · ${state.data.meta.guild}`;
      break;
    default:
      html = notFoundView();
      title = "Not found · OMEN";
  }

  stopStorm();
  view.innerHTML = html;
  document.title = title;

  const routeKey = `${route.name}/${route.id}`;
  if (routeKey !== state.lastKey) {
    window.scrollTo(0, 0);
    state.lastKey = routeKey;
  }

  if (route.name === "leaderboard") wireLeaderboardSearch();
  if (route.name === "home") startStorm();
  document.title = title;
}

function handleGlobalKeys(event) {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "o") {
    event.preventDefault();
    if (isLocked()) openUnlock();
    else location.hash = "#/points";
    return;
  }
  if (event.key === "/" && !isTyping(event.target)) {
    const search = document.getElementById("member-search");
    if (search) {
      event.preventDefault();
      search.focus();
      search.select();
    }
  }
}

function isTyping(el) {
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

function handleLandingPointer(event) {
  if (!state.route || state.route.name !== "home") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const mark = view.querySelector(".omen-mark");
  if (!mark) return;
  const rect = mark.getBoundingClientRect();
  const dx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
  const dy = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
  mark.style.setProperty("--mx", `${(dx * 9).toFixed(2)}px`);
  mark.style.setProperty("--my", `${(dy * 9).toFixed(2)}px`);
  mark.style.setProperty("--ry", `${(dx * 7).toFixed(2)}deg`);
  mark.style.setProperty("--rx", `${(-dy * 7).toFixed(2)}deg`);
}

function resetLandingTilt() {
  const mark = view.querySelector(".omen-mark");
  if (!mark) return;
  mark.style.setProperty("--mx", "0px");
  mark.style.setProperty("--my", "0px");
  mark.style.setProperty("--ry", "0deg");
  mark.style.setProperty("--rx", "0deg");
}

/* ── Shared fragments ─────────────────────────────────────────────────── */

function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
}

function pointsSuffix() {
  return esc(state.data.meta.currency);
}

function seasonBanner() {
  const { meta } = state.data;
  const stats = ledgerStats(state.data);
  const season = seasonProgress(meta);
  const progress = season
    ? `<div class="hero-progress">
        <div class="hero-progress-label"><span>Season progress</span><strong>${season.daysLeft} days left</strong></div>
        <div class="meter"><div class="meter-fill" style="width:${season.pct}%"></div></div>
      </div>`
    : "";

  return `<section class="hero">
    <div class="hero-content">
      <p class="eyebrow">${esc(meta.season)}</p>
      <h1>The ledger of <em>${esc(meta.guild)}</em></h1>
      <p class="lede">Every event, puzzle and act of help in the keep — counted, ranked and remembered.</p>
    </div>
    <div class="hero-strip">
      <div class="hero-metric"><strong>${fmt(stats.totalPoints)}</strong><span>points earned</span></div>
      <div class="hero-metric"><strong>${fmt(stats.memberCount)}</strong><span>members</span></div>
      ${progress}
    </div>
  </section>`;
}

function kpiGrid() {
  const data = state.data;
  const stats = ledgerStats(data);
  const monthLeader = ranked(data, "month")[0];
  const tiles = [
    {
      label: "Total points",
      value: fmt(stats.totalPoints),
      foot: `+${fmt(stats.monthPoints)} this month`,
    },
    {
      label: "Members",
      value: fmt(stats.memberCount),
      foot: `${stats.activeWeek} active this week`,
    },
    {
      label: "Achievements",
      value: `${stats.unlocked}<small>/${stats.possibleAchievements}</small>`,
      foot: `${data.achievements.length} to chase`,
    },
    {
      label: "Monthly leader",
      value: monthLeader ? esc(monthLeader.member.name) : "—",
      foot: monthLeader ? `${fmt(monthLeader.value)} ${pointsSuffix()} this month` : "No points yet",
    },
  ];
  return `<div class="kpi-grid">${tiles
    .map(
      (tile) => `<article class="kpi">
        <p class="kpi-label">${esc(tile.label)}</p>
        <p class="kpi-value">${tile.value}</p>
        <p class="kpi-foot">${tile.foot}</p>
      </article>`
    )
    .join("")}</div>`;
}

function podium(rows, range) {
  const top = rows.slice(0, 3);
  const order = [1, 0, 2];
  const cards = [];
  order.forEach((index) => {
    const row = top[index];
    if (!row) {
      cards.push(`<div class="podium-card" style="opacity:.35" aria-hidden="true"><p class="podium-rank">—</p><span class="avatar md">·</span><p class="podium-name">Open slot</p><p class="podium-points">0</p></div>`);
      return;
    }
    const first = index === 0;
    cards.push(`<a class="podium-card${first ? " first" : ""}" href="#/member/${esc(row.member.id)}">
      ${first ? crownIcon() : ""}
      <p class="podium-rank">${ordinal(row.rank)}</p>
      ${avatar(row.member, first ? "lg" : "md", { ring: true })}
      <p class="podium-name">${esc(row.member.name)}</p>
      <p class="podium-points">${fmt(row.value)}</p>
      <p class="podium-sub">${esc(RANGE_LABELS[range])} · ${row.member.streak}d streak</p>
    </a>`);
  });
  return `<div class="podium">${cards.join("")}</div>`;
}

function raceList(rows, range) {
  const top = rows.slice(0, 5);
  const max = top[0] ? top[0].value : 1;
  if (!top.length || max <= 0) return `<p class="faint">No points logged yet.</p>`;
  return `<div class="race-list">${top
    .map((row) => {
      const width = Math.max(4, Math.round((row.value / max) * 100));
      return `<div class="race-row">
        <span class="race-rank">${row.rank}</span>
        ${avatar(row.member, "sm")}
        <div class="race-main">
          <a class="race-name" href="#/member/${esc(row.member.id)}">${esc(row.member.name)}</a>
          <div class="race-bar"><span style="width:${width}%"></span></div>
        </div>
        <div class="race-points">${fmt(row.value)}<small>${esc(RANGE_LABELS[range].toLowerCase())}</small></div>
      </div>`;
    })
    .join("")}</div>`;
}

function feed(entries, { limit = 8 } = {}) {
  const rows = entries.slice(0, limit);
  if (!rows.length) return `<p class="faint">The keep is quiet. No points logged yet.</p>`;
  return `<div class="feed">${rows
    .map((entry) => {
      const member = state.data.memberMap.get(entry.memberId);
      if (!member) return "";
      const delta = entry.delta >= 0 ? `+${fmt(entry.delta)}` : `−${fmt(Math.abs(entry.delta))}`;
      return `<div class="feed-item">
        ${avatar(member, "sm")}
        <div class="feed-text">
          <a href="#/member/${esc(member.id)}">${esc(member.name)}</a>
          <div class="feed-reason" title="${esc(entry.reason)}">${esc(entry.reason)}</div>
        </div>
        <div class="feed-delta ${entry.delta < 0 ? "danger" : ""}">${delta}<span class="feed-time">${esc(timeAgo(entry.at))}</span></div>
      </div>`;
    })
    .join("")}</div>`;
}

function goalsPanel() {
  const goals = state.data.goals;
  if (!goals.length) return `<p class="faint">No community goals this season.</p>`;
  return `<div class="goal-list">${goals
    .map((goal, index) => {
      const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
      const variant = ["", "violet", "green"][index % 3];
      const left = daysUntil(goal.endsAt);
      return `<div class="goal">
        <div class="goal-head">
          <span class="goal-icon" aria-hidden="true">${esc(goal.icon)}</span>
          <div class="goal-text">
            <p class="goal-name">${esc(goal.name)}</p>
            <p class="goal-desc">${esc(goal.description || "")}</p>
          </div>
          <span class="goal-count"><strong>${fmt(goal.current)}</strong> / ${fmt(goal.target)}</span>
        </div>
        <div class="meter"><div class="meter-fill ${variant}" style="width:${pct}%"></div></div>
        <div class="goal-meta"><span>${pct}% complete</span>${left !== null ? `<span>${left ? `${left} days left` : "Ending today"}</span>` : ""}</div>
      </div>`;
    })
    .join("")}</div>`;
}

function achievementItem(member, achievement) {
  const progress = Math.min(achievement.target, Number(member.achievements[achievement.id]) || 0);
  const done = progress >= achievement.target;
  const pct = Math.min(100, Math.round((progress / achievement.target) * 100));
  return `<div class="ach-item${done ? " done" : ""}">
    <span class="ach-icon" aria-hidden="true">${esc(achievement.icon)}</span>
    <div class="ach-body">
      <p class="ach-name">${esc(achievement.name)}</p>
      <p class="ach-desc">${esc(achievement.description)}</p>
      <div class="ach-bar"><span style="width:${pct}%"></span></div>
    </div>
    <div class="ach-status">
      ${done ? `<span class="done-pill">${checkIcon()} Unlocked</span>` : `<div class="ach-bonus">+${fmt(achievement.bonus)}</div>`}
      <div class="ach-progress">${fmt(progress)} / ${fmt(achievement.target)}</div>
    </div>
  </div>`;
}

function emptyRow(message) {
  return `<tr class="empty-row" id="lb-empty" hidden><td colspan="7">${esc(message)}</td></tr>`;
}

/* ── Views ────────────────────────────────────────────────────────────── */

function omenMark() {
  return `<div class="omen-mark">
    <span class="omen-orbit" aria-hidden="true"></span>
    <span class="omen-pulse" aria-hidden="true"></span>
    <div class="omen-mark-inner">
      <img class="omen-emblem" src="./img/omen-icon-256.png" alt="OMEN clan crest" width="256" height="256">
    </div>
  </div>`;
}

function embers() {
  return Array.from({ length: 18 }, (_, index) => {
    const left = (index * 37 + 9) % 100;
    const duration = 7 + (index % 7) * 1.4;
    const delay = -(index * 1.1);
    const size = 2 + (index % 3);
    const drift = (index % 2 === 0 ? 1 : -1) * (12 + (index % 5) * 9);
    return `<span class="ember" style="--x:${left}%;--dur:${duration}s;--delay:${delay}s;--size:${size}px;--drift:${drift}px"></span>`;
  }).join("");
}

/* ── Lightning ────────────────────────────────────────────────────────── */

let stormTimer = 0;
let stormFlashTimer = 0;
let stormRaf = 0;
let stormResize = null;
let stormVisibility = null;
let stormRun = 0;

function stormAllowed() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function stopStorm() {
  clearTimeout(stormTimer);
  clearTimeout(stormFlashTimer);
  stormTimer = 0;
  stormFlashTimer = 0;
  stormRun += 1;
  if (stormRaf) cancelAnimationFrame(stormRaf);
  stormRaf = 0;
  if (stormResize) {
    stormResize.disconnect();
    stormResize = null;
  }
  if (stormVisibility) {
    document.removeEventListener("visibilitychange", stormVisibility);
    stormVisibility = null;
  }
  const landing = view.querySelector(".landing");
  if (landing) landing.classList.remove("is-storm");
}

function boltChannel(width, startX, startY, endY, height) {
  const points = [{ x: startX, y: startY }];
  let x = startX;
  let y = startY;
  let drift = (Math.random() - 0.5) * width * 0.02;

  while (y < endY) {
    y += height * (0.022 + Math.random() * 0.04);
    drift = drift * 0.58 + (Math.random() - 0.5) * width * 0.058;
    x = Math.min(width * 0.94, Math.max(width * 0.06, x + drift));
    points.push({ x, y });
  }

  return points;
}

function forkFrom(origin, width, length, direction, steps) {
  const points = [{ x: origin.x, y: origin.y }];
  let x = origin.x;
  let y = origin.y;
  for (let step = 1; step <= steps; step += 1) {
    const spread = width * (0.007 + Math.random() * 0.02) * (1 - step / (steps + 1));
    x += direction * spread + (Math.random() - 0.5) * width * 0.016;
    y += (length / steps) * (0.6 + Math.random() * 0.8);
    points.push({ x, y });
  }
  return points;
}

function makeBolt(width, height) {
  const startX = width * (0.16 + Math.random() * 0.68);
  const endY = height * (0.46 + Math.random() * 0.32);
  const main = boltChannel(width, startX, -height * 0.05, endY, height);

  const branches = [];
  const forks = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < forks; i += 1) {
    const origin = main[1 + Math.floor(Math.random() * Math.max(1, main.length - 3))];
    const direction = Math.random() < 0.5 ? -1 : 1;
    const length = height * (0.07 + Math.random() * 0.16);
    const points = forkFrom(origin, width, length, direction, 4 + Math.floor(Math.random() * 4));
    branches.push({ points, weight: 0.55 });

    if (Math.random() < 0.55 && points.length > 3) {
      const subOrigin = points[1 + Math.floor(Math.random() * (points.length - 2))];
      branches.push({
        points: forkFrom(subOrigin, width, length * (0.35 + Math.random() * 0.3), Math.random() < 0.5 ? direction : -direction, 3),
        weight: 0.28,
      });
    }
  }

  const secondary =
    Math.random() < 0.45
      ? boltChannel(width, width * (0.08 + Math.random() * 0.84), -height * 0.04, height * (0.2 + Math.random() * 0.3), height)
      : null;

  return { main, branches, secondary };
}

function strokeBolt(ctx, points, alpha, weight) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.globalAlpha = alpha * 0.46;
  ctx.strokeStyle = "rgba(154, 136, 255, .95)";
  ctx.lineWidth = 22 * weight;
  ctx.shadowColor = "rgba(145, 124, 255, 1)";
  ctx.shadowBlur = 62;
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.68;
  ctx.strokeStyle = "rgba(245, 185, 66, .95)";
  ctx.lineWidth = 10 * weight;
  ctx.shadowColor = "rgba(245, 185, 66, 1)";
  ctx.shadowBlur = 36;
  ctx.stroke();

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgba(255, 255, 255, 1)";
  ctx.lineWidth = 3.2 * weight;
  ctx.shadowColor = "rgba(255, 255, 255, 1)";
  ctx.shadowBlur = 16;
  ctx.stroke();
}

function strikeAlpha(time) {
  const frames = [
    [0, 0],
    [20, 1],
    [90, 0.35],
    [140, 0.92],
    [240, 0.2],
    [360, 0.62],
    [500, 0.08],
    [700, 0],
  ];
  for (let i = 1; i < frames.length; i += 1) {
    if (time <= frames[i][0]) {
      const [prevTime, prevAlpha] = frames[i - 1];
      const [nextTime, nextAlpha] = frames[i];
      const progress = (time - prevTime) / (nextTime - prevTime);
      return prevAlpha + (nextAlpha - prevAlpha) * progress;
    }
  }
  return 0;
}

function startStorm() {
  stopStorm();
  if (!stormAllowed()) return;

  const landing = view.querySelector(".landing");
  const storm = landing && landing.querySelector(".storm");
  const canvas = storm && storm.querySelector(".storm-canvas");
  if (!landing || !canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const layer = document.createElement("canvas");
  const layerCtx = layer.getContext("2d");
  if (!layerCtx) return;

  const run = ++stormRun;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let bolt = null;

  const fit = () => {
    const rect = storm.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    layer.width = canvas.width;
    layer.height = canvas.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layerCtx.lineCap = "round";
    layerCtx.lineJoin = "round";
    bolt = null;
  };

  stormResize = new ResizeObserver(fit);
  stormResize.observe(storm);
  fit();

  const render = () => {
    layerCtx.clearRect(0, 0, width, height);
    if (!bolt) return;

    layerCtx.globalCompositeOperation = "lighter";
    const source = bolt.main[0];
    const sheet = layerCtx.createRadialGradient(source.x, 0, 0, source.x, 0, height * 0.75);
    sheet.addColorStop(0, "rgba(220, 212, 255, .3)");
    sheet.addColorStop(0.35, "rgba(145, 126, 255, .12)");
    sheet.addColorStop(1, "rgba(0, 0, 0, 0)");
    layerCtx.globalAlpha = 1;
    layerCtx.fillStyle = sheet;
    layerCtx.fillRect(0, 0, width, height);

    if (bolt.secondary) strokeBolt(layerCtx, bolt.secondary, 0.5, 0.65);
    strokeBolt(layerCtx, bolt.main, 1, 1);
    bolt.branches.forEach((branch) => strokeBolt(layerCtx, branch.points, 0.74, branch.weight));
  };

  const draw = (alpha) => {
    ctx.clearRect(0, 0, width, height);
    if (alpha <= 0.01 || !bolt) return;
    ctx.globalAlpha = alpha;
    ctx.drawImage(layer, 0, 0, width, height);
    ctx.globalAlpha = 1;
  };

  const schedule = (delay) => {
    clearTimeout(stormTimer);
    stormTimer = window.setTimeout(() => {
      if (run !== stormRun) return;
      if (document.hidden) {
        schedule(2400);
        return;
      }

      bolt = makeBolt(width, height);
      render();
      landing.classList.remove("is-storm");
      void landing.offsetWidth;
      landing.classList.add("is-storm");
      clearTimeout(stormFlashTimer);
      stormFlashTimer = window.setTimeout(() => {
        if (run === stormRun) landing.classList.remove("is-storm");
      }, 1020);

      const started = performance.now();
      const duration = 780;
      let lastPaint = 0;
      const frame = (now) => {
        if (run !== stormRun) return;
        const time = now - started;
        if (time - lastPaint >= 28) {
          draw(strikeAlpha(time));
          lastPaint = time;
        }
        if (time < duration) {
          stormRaf = requestAnimationFrame(frame);
        } else {
          ctx.clearRect(0, 0, width, height);
          stormRaf = 0;
        }
      };
      stormRaf = requestAnimationFrame(frame);
      schedule(5400 + Math.random() * 4800);
    }, delay);
  };

  stormVisibility = () => {
    if (document.hidden) {
      clearTimeout(stormTimer);
      clearTimeout(stormFlashTimer);
      if (stormRaf) cancelAnimationFrame(stormRaf);
      stormRaf = 0;
      landing.classList.remove("is-storm");
      ctx.clearRect(0, 0, width, height);
    } else if (run === stormRun) {
      schedule(1800 + Math.random() * 1400);
    }
  };
  document.addEventListener("visibilitychange", stormVisibility);

  schedule(1800 + Math.random() * 1600);
}

function landingView() {
  const { meta } = state.data;
  const season = meta.season.split("·")[0].trim();
  return `<section class="landing">
    <div class="landing-art" aria-hidden="true"></div>
    <div class="landing-aura" aria-hidden="true"></div>
    <div class="landing-embers" aria-hidden="true">${embers()}</div>
    <div class="storm" aria-hidden="true"><canvas class="storm-canvas"></canvas></div>
    <div class="landing-inner">
      ${omenMark()}
      <p class="landing-kicker">We are</p>
      <h1 class="landing-name" aria-label="OMEN"><span>O</span><span>M</span><span>E</span><span>N</span></h1>
      <p class="landing-tagline"><span class="tag-o">O</span>nly the best</p>
      <p class="landing-desc">OMEN is where skilled players group up, execute clean strategies, and win.</p>

      <div class="landing-stats">
        <div class="landing-stat"><strong>31,457</strong><span>peak points</span></div>
        <div class="landing-stat"><strong>Top 1</strong><span>contest wins</span></div>
        <div class="landing-stat"><strong>Highest</strong><span>average skill</span></div>
        <div class="landing-stat"><strong>1,700+</strong><span>community</span></div>
      </div>

      <ul class="landing-features" aria-label="What OMEN offers">
        <li>Training system</li>
        <li>Fair performance ranking</li>
        <li>Coordinated grinds</li>
        <li>High-level matches</li>
        <li>Events</li>
        <li>Zero drama</li>
        <li>Always a squad</li>
      </ul>

      <p class="landing-motto"><span class="motto-label">Play smart</span> Add <strong>[OMEN]</strong> to your name. Queue with us. Win more.</p>

      <div class="landing-actions">
        <a class="discord-btn" href="${esc(discordInvite())}" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5c1.7.4 3.2 1 4.6 1.8a18.2 18.2 0 0 0-15.4 0c1.4-.9 3-1.5 4.7-1.9L8.6 3a19.8 19.8 0 0 0-4.9 1.5C.5 9-.3 13.5.1 18c1.9 1.4 3.9 2.4 5.9 3.1l.5-.8c-.7-.3-1.3-.6-1.9-1l.1-.1c3.9 1.8 8.2 1.8 12.1 0l.1.1c-.6.4-1.2.7-1.9 1l.5.8c2-.7 4-1.7 5.9-3.1.5-5.2-.8-9.7-3.5-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4 0-1.3 1-2.4 2.2-2.4 1.2 0 2.2 1.1 2.2 2.4 0 1.3-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4 0-1.3 1-2.4 2.2-2.4 1.2 0 2.2 1.1 2.2 2.4 0 1.3-1 2.4-2.2 2.4Z"/></svg>
          Join OMEN today
        </a>
      </div>
      <a class="landing-ledger" href="#/points">Enter the points ledger <span aria-hidden="true">→</span></a>
    </div>
    <div class="storm-flash" aria-hidden="true"></div>
    <p class="landing-season">${esc(season)} · invite only</p>
  </section>`;
}

function pointsView() {
  const data = state.data;
  const allTime = ranked(data, "total");
  const monthly = ranked(data, "month");
  const stats = ledgerStats(data);

  return `<div class="shell">
    ${seasonBanner()}
    ${kpiGrid()}

    <section class="section">
      <div class="section-head">
        <div>
          <p class="eyebrow">Standings</p>
          <h2>The keep's finest</h2>
        </div>
        <a class="section-link" href="#/leaderboard">Full leaderboard →</a>
      </div>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-title"><h3>All-time podium</h3><span class="hint">${fmt(stats.totalPoints)} ${pointsSuffix()} awarded</span></div>
          ${podium(allTime, "total")}
        </div>
        <div class="panel">
          <div class="panel-title"><h3>This month's race</h3><span class="hint">${fmt(stats.monthPoints)} ${pointsSuffix()} this month</span></div>
          ${raceList(monthly, "month")}
          <a class="section-link" style="display:inline-block;margin-top:14px" href="#/leaderboard?range=month">See the full month →</a>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="grid-2">
        <div class="panel">
          <div class="panel-title"><h3>Community goals</h3><span class="hint">${esc(data.meta.season)}</span></div>
          ${goalsPanel()}
        </div>
        <div class="panel">
          <div class="panel-title"><h3>Live from the keep</h3><span class="hint">Latest points</span></div>
          ${feed(data.activity)}
        </div>
      </div>
    </section>
  </div>`;
}

function leaderboardView(route) {
  const data = state.data;
  const requested = route.query.get("range");
  const range = ["total", "month", "week"].includes(requested) ? requested : "total";
  const rows = ranked(data, range);

  const rowsHtml = rows
    .map((row) => {
      const member = row.member;
      const achievements = memberAchievementStats(data, member);
      const delta = memberChange(member, range);
      const searchKey = `${member.name} ${member.id}`.toLowerCase();
      return `<tr data-search="${esc(searchKey)}">
        <td class="rank-cell${row.rank <= 3 ? " top" : ""}">${row.rank}</td>
        <td>
          <div class="member-cell">
            ${avatar(member, "sm")}
            <div class="name-wrap">
              <a class="member-name" href="#/member/${esc(member.id)}">${esc(member.name)}</a>
              <div class="member-tag">Joined ${esc(fmtDate(member.joined, { month: "short", year: "numeric" }))}</div>
            </div>
          </div>
        </td>
        <td class="hide-sm">${roleBadge(member)}</td>
        <td class="num points-cell">${fmt(row.value)}</td>
        <td class="num hide-sm">${trend(delta)}</td>
        <td class="center hide-sm">${member.streak} days</td>
        <td class="center hide-sm">${achievements.count}/${achievements.total}</td>
      </tr>`;
    })
    .join("");

  return `<div class="shell">
    <header class="page-head">
      <div>
        <p class="eyebrow">Leaderboard</p>
        <h1>Who is carrying the keep?</h1>
        <p class="lede">${fmt(data.members.length)} members, ranked by points. Search by name to find anyone instantly.</p>
      </div>
      <a class="btn btn-ghost" href="#/achievements">Browse achievements</a>
    </header>

    <div class="toolbar">
      <div class="tabs" role="navigation" aria-label="Time range">
        ${["total", "month", "week"]
          .map(
            (key) =>
              `<a href="#/leaderboard?range=${key}" ${key === range ? 'aria-current="page"' : ""}>${RANGE_LABELS[key]}</a>`
          )
          .join("")}
      </div>
      <div class="search">
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="m13.5 13.5 3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <input id="member-search" type="search" placeholder="Search the keep…" aria-label="Search members" autocomplete="off">
      </div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="panel-title"><h3>${esc(RANGE_LABELS[range])} podium</h3><span class="hint">Ties break by streak</span></div>
      ${podium(rows, range)}
    </div>

    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <caption class="sr-only">Members ranked by ${esc(RANGE_LABELS[range].toLowerCase())} points</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Member</th>
              <th scope="col" class="hide-sm">Role</th>
              <th scope="col" class="num">Points</th>
              <th scope="col" class="num hide-sm">${range === "week" ? "Vs. pace" : "Change"}</th>
              <th scope="col" class="center hide-sm">Streak</th>
              <th scope="col" class="center hide-sm">Achievements</th>
            </tr>
          </thead>
          <tbody id="lb-body">
            ${rowsHtml}
            ${emptyRow("No member matches that search.")}
          </tbody>
        </table>
      </div>
      <div class="table-foot">
        <span id="lb-count">Showing ${rows.length} members</span>
        <span>${esc(RANGE_LABELS[range])} · press <kbd>/</kbd> to search</span>
      </div>
    </div>
  </div>`;
}

function wireLeaderboardSearch() {
  const input = document.getElementById("member-search");
  const body = document.getElementById("lb-body");
  const count = document.getElementById("lb-count");
  if (!input || !body || !count) return;
  const rows = () => [...body.querySelectorAll("tr[data-search]")];
  const total = rows().length;

  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    let shown = 0;
    rows().forEach((row) => {
      const match = !query || row.dataset.search.includes(query);
      row.hidden = !match;
      if (match) shown += 1;
    });
    const empty = document.getElementById("lb-empty");
    if (empty) empty.hidden = shown !== 0;
    count.textContent = query ? `${shown} of ${total} members` : `Showing ${total} members`;
  });
}

function profileView(memberId) {
  const data = state.data;
  const member = data.memberMap.get(String(memberId).toLowerCase());
  if (!member) return notFoundView(`No member called “${memberId}” lives in this ledger.`);

  const allTime = rankFor(data, member.id, "total");
  const monthly = rankFor(data, member.id, "month");
  const ach = memberAchievementStats(data, member);
  const history = member.history.slice(-6);
  const maxPoints = Math.max(...history.map((row) => row.points), 1);
  const recent = recentActivityFor(data, member.id, 8);
  const achievements = [...data.achievements].sort((a, b) => {
    const aDone = (Number(member.achievements[a.id]) || 0) >= a.target;
    const bDone = (Number(member.achievements[b.id]) || 0) >= b.target;
    return Number(bDone) - Number(aDone);
  });

  const stats = [
    { val: fmt(member.total), lbl: "All-time points" },
    { val: fmt(member.month), lbl: "This month" },
    { val: fmt(member.week), lbl: "This week" },
    { val: `${member.streak}d`, lbl: "Check-in streak" },
    { val: `${ach.count}/${ach.total}`, lbl: "Achievements" },
    { val: `+${fmt(ach.bonus)}`, lbl: "Bonus points" },
  ];

  return `<div class="shell">
    <a class="back-link" href="#/leaderboard">
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3 5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Back to the leaderboard
    </a>

    <header class="profile-head">
      ${avatar(member, "xl", { ring: true })}
      <div class="profile-identity">
        <div class="profile-name-row">
          <h1 class="profile-name">${esc(member.name)}</h1>
          ${roleBadge(member)}
        </div>
        ${member.bio ? `<p class="profile-bio">${esc(member.bio)}</p>` : ""}
        <div class="profile-meta">
          <span>Member since ${esc(fmtDate(member.joined, { month: "long", year: "numeric" }))}</span>
          ${monthly ? `<span>#${monthly.rank} this month</span>` : ""}
          <span>${esc(member.history.length ? monthLong(member.history[member.history.length - 1].month) : "No history yet")}</span>
        </div>
      </div>
      <div class="profile-rank-box">
        <div class="rank">${allTime ? `#${allTime.rank}` : "—"}</div>
        <div class="lbl">All-time rank</div>
      </div>
    </header>

    <div class="stat-grid">
      ${stats
        .map(
          (stat) => `<div class="stat"><div class="val">${stat.val}</div><div class="lbl">${esc(stat.lbl)}</div></div>`
        )
        .join("")}
    </div>

    <section class="section">
      <div class="grid-2">
        <div class="panel">
          <div class="chart-head">
            <h3>Points, month by month</h3>
            <span class="hint">Last ${history.length} months</span>
          </div>
          ${
            history.length
              ? `<div class="chart-wrap">
                  <div class="bars">
                    ${history
                      .map((row, index) => {
                        const current = index === history.length - 1;
                        const height = Math.max(3, Math.round((row.points / maxPoints) * 100));
                        return `<div class="bar-col${current ? " current" : ""}" title="${esc(monthLong(row.month))}: ${fmt(row.points)} points">
                          <span class="bar-value">${fmt(row.points)}</span>
                          <div class="bar-track"><div class="bar${current ? " current" : ""}" style="height:${height}%"></div></div>
                          <span class="bar-label">${esc(monthLabel(row.month))}</span>
                        </div>`;
                      })
                      .join("")}
                  </div>
                </div>`
              : `<p class="faint">No monthly history yet.</p>`
          }
        </div>

        <div class="panel">
          <div class="panel-title"><h3>Recent points</h3><span class="hint">${recent.length} ${recent.length === 1 ? "entry" : "entries"}</span></div>
          ${feed(recent, { limit: 8 })}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div>
          <p class="eyebrow">Milestones</p>
          <h2>Achievements</h2>
        </div>
        <span class="muted" style="font-size:.8rem">${ach.count} of ${ach.total} unlocked · ${ach.pct}%</span>
      </div>
      <div class="panel">
        <div class="ach-list">${achievements.map((a) => achievementItem(member, a)).join("")}</div>
      </div>
    </section>
  </div>`;
}

function achievementsView() {
  const data = state.data;
  const totalMembers = data.members.length;
  const stats = data.achievements.map((achievement) => ({ achievement, ...achievementStats(data, achievement) }));
  const unlocked = stats.reduce((sum, row) => sum + row.unlocked, 0);
  const possible = totalMembers * data.achievements.length;
  const claimed = data.members.reduce(
    (sum, member) => sum + memberAchievementStats(data, member).bonus,
    0
  );

  return `<div class="shell">
    <header class="page-head">
      <div>
        <p class="eyebrow">Milestones</p>
        <h1>Earn your place in the story</h1>
        <p class="lede">Achievements pay a one-time bonus and stay on your profile forever. Here is how the keep is progressing.</p>
      </div>
    </header>

    <div class="summary-strip">
      <div class="summary-tile"><div class="val">${unlocked}<small style="font-size:1rem;color:var(--muted)">/${possible}</small></div><div class="lbl">Achievements unlocked</div></div>
      <div class="summary-tile"><div class="val">${possible ? Math.round((unlocked / possible) * 100) : 0}%</div><div class="lbl">Guild-wide completion</div></div>
      <div class="summary-tile"><div class="val">${fmt(claimed)}</div><div class="lbl">Bonus ${pointsSuffix()} claimed</div></div>
    </div>

    <div class="big-ach-grid">
      ${stats
        .map(({ achievement, holders, unlocked: count, pct }) => {
          const complete = count === totalMembers;
          return `<article class="big-ach${complete ? " complete" : ""}">
            <div class="big-ach-head">
              <span class="big-ach-icon" aria-hidden="true">${esc(achievement.icon)}</span>
              <div>
                <p class="big-ach-title">${esc(achievement.name)}</p>
                <p class="big-ach-cat">${esc(achievement.category)} · +${fmt(achievement.bonus)} ${pointsSuffix()}</p>
              </div>
            </div>
            <p class="big-ach-desc">${esc(achievement.description)}</p>
            <div class="ach-bar"><span style="width:${pct}%"></span></div>
            <div class="big-ach-foot">
              <div class="holders">
                ${holders
                  .slice(0, 5)
                  .map((member) => avatar(member, "xs"))
                  .join("")}
                ${holders.length > 5 ? `<span class="more">+${holders.length - 5}</span>` : ""}
                ${holders.length === 0 ? `<span class="faint" style="font-size:.74rem">No one yet — be first.</span>` : ""}
              </div>
              <span class="unlock-count"><strong>${count}</strong> / ${totalMembers} unlocked</span>
            </div>
          </article>`;
        })
        .join("")}
    </div>
  </div>`;
}

function pollsView() {
  const data = state.data;
  const polls = [...data.polls].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return new Date(a.closesAt || 0) - new Date(b.closesAt || 0);
  });

  const openCount = polls.filter((poll) => poll.status === "open").length;

  return `<div class="shell">
    <header class="page-head">
      <div>
        <p class="eyebrow">Guild votes</p>
        <h1>Speak, and the keep listens</h1>
        <p class="lede">${openCount} open ${openCount === 1 ? "poll" : "polls"}. Cast your vote in the server — results are mirrored here.</p>
      </div>
    </header>

    <div class="poll-grid">
      ${polls
        .map((poll) => {
          const total = pollTotal(poll);
          const closed = poll.status === "closed";
          const left = poll.closesAt ? daysUntil(poll.closesAt) : null;
          return `<article class="poll-card${closed ? " closed" : ""}">
            <div class="poll-top">
              <div>
                <p class="poll-question">${esc(poll.question)}</p>
                <div class="poll-meta">
                  <span class="pill ${closed ? "closed" : "open"}">${closed ? "Closed" : "Open"}</span>
                  ${poll.council ? `<span class="pill council">Council vote</span>` : ""}
                </div>
              </div>
            </div>
            ${poll.description ? `<p class="poll-desc">${esc(poll.description)}</p>` : ""}
            <div class="poll-options">
              ${poll.options
                .map((option) => {
                  const pct = total ? Math.round((option.votes / total) * 100) : 0;
                  return `<div class="poll-option">
                    <div class="poll-option-head"><span class="label">${esc(option.label)}</span><span class="pct">${pct}% · ${fmt(option.votes)}</span></div>
                    <div class="poll-track"><div class="poll-fill" style="width:${pct}%"></div></div>
                  </div>`;
                })
                .join("")}
            </div>
            <div class="poll-foot">
              <span>${fmt(total)} total votes</span>
              <span>${closed ? `Closed ${esc(fmtDate(poll.closesAt, { month: "short", day: "numeric" }))}` : left !== null ? `${left} days left` : "No deadline"}</span>
            </div>
          </article>`;
        })
        .join("")}
    </div>
  </div>`;
}

function notFoundView(message = "That page is not in the ledger.") {
  return `<div class="shell error-shell">
    <p class="eyebrow">Lost in the keep</p>
    <h1>Nothing here</h1>
    <p class="lede">${esc(message)}</p>
    <a class="btn btn-primary" href="#/">Return to the overview</a>
  </div>`;
}

/* ── Errors / modal ───────────────────────────────────────────────────── */

function renderLoadError(error) {
  view.innerHTML = `<div class="shell error-shell">
    <p class="eyebrow">Ledger offline</p>
    <h1>The ledger would not open</h1>
    <p class="lede">${esc(error.message || "Unknown error loading the data.")}</p>
    <button class="btn btn-primary" type="button" onclick="location.reload()">Try again</button>
  </div>`;
  footerMeta.textContent = "Ledger unavailable.";
}

let lastFocused = null;

async function sha256Hex(value) {
  if (!window.crypto || !window.crypto.subtle) throw new Error("Web Crypto unavailable");
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setUnlockError(message) {
  const error = document.getElementById("unlock-error");
  const input = document.getElementById("unlock-pass");
  if (error) {
    error.textContent = message || "";
    error.hidden = !message;
  }
  if (input) {
    input.classList.toggle("invalid", Boolean(message));
    if (message) {
      input.focus();
      input.select();
    }
  }
}

function wireUnlockModal() {
  const lockBtn = document.getElementById("lock-btn");
  if (lockBtn) lockBtn.addEventListener("click", lockOwnerView);
  if (!unlockModal) return;

  unlockModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-unlock]")) closeUnlock();
  });

  const form = document.getElementById("unlock-form");
  if (form) form.addEventListener("submit", submitUnlock);

  document.addEventListener("keydown", (event) => {
    if (unlockModal.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeUnlock();
    }
    if (event.key === "Tab") trapFocus(event, unlockModal);
  });
}

function openUnlock() {
  if (!unlockModal || !isLocked()) return;
  unlockModal.hidden = false;
  document.body.style.overflow = "hidden";
  setUnlockError("");
  const input = document.getElementById("unlock-pass");
  if (input) {
    input.value = "";
    setTimeout(() => input.focus(), 30);
  }
}

function closeUnlock() {
  if (!unlockModal) return;
  unlockModal.hidden = true;
  document.body.style.overflow = "";
  setUnlockError("");
  pendingHash = "";
}

async function submitUnlock(event) {
  event.preventDefault();
  if (isLocked() === false) {
    closeUnlock();
    return;
  }
  const form = event.currentTarget;
  const input = document.getElementById("unlock-pass");
  const button = form.querySelector('button[type="submit"]');
  const passphrase = input ? input.value.trim() : "";
  if (!passphrase) {
    setUnlockError("Enter the passphrase to continue.");
    return;
  }

  const label = button ? button.textContent : "";
  if (button) {
    button.disabled = true;
    button.textContent = "Checking…";
  }
  setUnlockError("");

  try {
    const hash = await sha256Hex(passphrase);
    const expected = String(config.ownerHash || "").toLowerCase();
    if (expected && hash === expected) {
      ownerSession = true;
      try {
        localStorage.setItem(OWNER_KEY, "1");
      } catch {
        /* session-only access */
      }
      const target = !pendingHash || pendingHash === "#/owner" ? "#/points" : pendingHash;
      pendingHash = "";
      closeUnlock();
      applyAccessState();
      state.lastKey = "";
      if (location.hash !== target) location.hash = target;
      else handleRoute();
    } else {
      await new Promise((resolve) => setTimeout(resolve, 450));
      setUnlockError("That passphrase does not match.");
    }
  } catch {
    setUnlockError("Could not verify on this browser.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = label;
    }
  }
}

function lockOwnerView() {
  ownerSession = false;
  try {
    localStorage.removeItem(OWNER_KEY);
  } catch {
    /* ignore */
  }
  location.hash = "#/";
  location.reload();
}

function wireHelpModal() {
  const openBtn = document.getElementById("help-btn");
  if (!openBtn || !helpModal) return;
  openBtn.addEventListener("click", openHelp);
  helpModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal]")) closeHelp();
  });
  document.addEventListener("keydown", (event) => {
    if (helpModal.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeHelp();
    }
    if (event.key === "Tab") trapFocus(event);
  });
}

function openHelp() {
  lastFocused = document.activeElement;
  helpModal.hidden = false;
  document.body.style.overflow = "hidden";
  const close = helpModal.querySelector(".modal-close");
  if (close) close.focus();
}

function closeHelp() {
  helpModal.hidden = true;
  document.body.style.overflow = "";
  if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
}

function trapFocus(event, modal = helpModal) {
  const focusable = modal.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

init();
