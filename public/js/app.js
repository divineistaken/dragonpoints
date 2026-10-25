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

const state = {
  data: null,
  route: null,
  lastKey: "",
};

/* ── Boot ─────────────────────────────────────────────────────────────── */

async function init() {
  wireHelpModal();
  window.addEventListener("hashchange", handleRoute);
  window.addEventListener("keydown", handleGlobalKeys);

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
  document.title = `${meta.guild} points · DragonPoints`;

  const edit = window.DP_CONFIG && window.DP_CONFIG.editUrl;
  const updated = `<span title="${esc(fmtDate(meta.updatedAt, { dateStyle: "medium", timeStyle: "short" }))}">Updated ${esc(timeAgo(meta.updatedAt))}</span>`;
  footerMeta.innerHTML = `${esc(meta.guild)} · ${state.data.members.length} members · ${updated}${
    edit ? ` · <a href="${esc(edit)}" target="_blank" rel="noopener noreferrer">Edit ledger</a>` : ""
  }`;
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
  const route = parseRoute();
  state.route = route;

  const navKey = route.name === "member" ? "leaderboard" : route.name;
  document.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === navKey) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  let html;
  let title = "DragonPoints";
  switch (route.name) {
    case "home":
      html = homeView();
      title = `${state.data.meta.guild} points · DragonPoints`;
      break;
    case "leaderboard":
      html = leaderboardView(route);
      title = `Leaderboard · ${state.data.meta.guild}`;
      break;
    case "member":
      html = profileView(route.id);
      title = `${route.id} · DragonPoints`;
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
      title = "Not found · DragonPoints";
  }

  view.innerHTML = html;
  document.title = title;

  const routeKey = `${route.name}/${route.id}`;
  if (routeKey !== state.lastKey) {
    window.scrollTo(0, 0);
    state.lastKey = routeKey;
  }

  if (route.name === "leaderboard") wireLeaderboardSearch();
  document.title = title;
}

function handleGlobalKeys(event) {
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

function homeView() {
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

function trapFocus(event) {
  const focusable = helpModal.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
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
