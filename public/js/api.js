const LOCAL_DATA_URL = "./data/dragonpoints.json";

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMember(member) {
  return {
    ...member,
    id: String(member.id || member.name || "unknown").toLowerCase(),
    name: member.name || "Unknown member",
    role: member.role || "member",
    total: asNumber(member.total),
    month: asNumber(member.month),
    week: asNumber(member.week),
    streak: asNumber(member.streak),
    history: Array.isArray(member.history)
      ? member.history
          .map((row) => ({ month: String(row.month || ""), points: asNumber(row.points) }))
          .filter((row) => row.month)
          .sort((a, b) => a.month.localeCompare(b.month))
      : [],
    achievements: member.achievements && typeof member.achievements === "object" ? member.achievements : {},
  };
}

function validate(raw) {
  if (!raw || typeof raw !== "object") throw new Error("The ledger returned no data.");
  if (!Array.isArray(raw.members) || raw.members.length === 0) throw new Error("The ledger has no members.");
  if (!Array.isArray(raw.achievements)) raw.achievements = [];
  if (!Array.isArray(raw.goals)) raw.goals = [];
  if (!Array.isArray(raw.polls)) raw.polls = [];
  if (!Array.isArray(raw.activity)) raw.activity = [];
  raw.meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

export async function loadData() {
  const configured = window.DP_CONFIG && window.DP_CONFIG.dataUrl ? window.DP_CONFIG.dataUrl : "";
  const sources = [...new Set([configured, LOCAL_DATA_URL].filter(Boolean))];
  let lastError;

  for (const url of sources) {
    try {
      const raw = await fetchJson(url);
      validate(raw);
      return normalize(raw);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Could not load the ledger.");
}

function normalize(raw) {
  const members = raw.members.map(normalizeMember);
  const achievements = raw.achievements.map((a) => ({
    ...a,
    id: String(a.id || a.name || "achievement").toLowerCase(),
    target: Math.max(1, asNumber(a.target, 1)),
    bonus: asNumber(a.bonus),
    icon: a.icon || "✦",
    category: a.category || "General",
  }));
  const seen = new Set();
  const uniqueMembers = members.filter((m) => (seen.has(m.id) ? false : seen.add(m.id)));

  const activity = raw.activity
    .map((entry, index) => ({
      ...entry,
      id: entry.id || `activity-${index}`,
      memberId: String(entry.memberId || "").toLowerCase(),
      delta: asNumber(entry.delta),
      at: entry.at || new Date().toISOString(),
    }))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    meta: {
      guild: raw.meta.guild || "The Keep",
      season: raw.meta.season || "Current season",
      seasonStart: raw.meta.seasonStart || "",
      seasonEnds: raw.meta.seasonEnds || "",
      updatedAt: raw.meta.updatedAt || new Date().toISOString(),
      currency: raw.meta.currency || "pts",
      sourceNote: raw.meta.sourceNote || "",
    },
    members: uniqueMembers,
    achievements,
    goals: raw.goals.map((g, i) => ({
      ...g,
      id: g.id || `goal-${i}`,
      target: Math.max(1, asNumber(g.target, 1)),
      current: asNumber(g.current),
      icon: g.icon || "◆",
    })),
    polls: raw.polls.map((p, i) => ({
      ...p,
      id: p.id || `poll-${i}`,
      options: Array.isArray(p.options)
        ? p.options.map((o, oi) => ({
            id: o.id || `option-${oi}`,
            label: o.label || `Option ${oi + 1}`,
            votes: asNumber(o.votes),
          }))
        : [],
      status: p.status === "closed" ? "closed" : "open",
    })),
    activity,
    memberMap: new Map(uniqueMembers.map((m) => [m.id, m])),
    achievementMap: new Map(achievements.map((a) => [a.id, a])),
  };
}

export const RANGE_LABELS = {
  total: "All time",
  month: "This month",
  week: "This week",
};

export function pointsFor(member, range) {
  if (range === "month") return member.month;
  if (range === "week") return member.week;
  return member.total;
}

export function ranked(data, range = "total") {
  const sorted = data.members
    .map((member) => ({ member, value: pointsFor(member, range) }))
    .sort((a, b) => b.value - a.value || b.member.streak - a.member.streak || a.member.name.localeCompare(b.member.name));

  let lastValue = null;
  let lastRank = 0;
  return sorted.map((row, index) => {
    const rank = lastValue === row.value ? lastRank : index + 1;
    lastValue = row.value;
    lastRank = rank;
    return { ...row, rank };
  });
}

export function rankFor(data, memberId, range = "total") {
  return ranked(data, range).find((row) => row.member.id === memberId) || null;
}

export function memberChange(member, range) {
  if (range === "week") {
    const pace = member.month / 4;
    return Math.round(member.week - pace);
  }
  const history = member.history;
  if (history.length < 2) return 0;
  return history[history.length - 1].points - history[history.length - 2].points;
}

export function monthsFor(data) {
  const months = new Set();
  data.members.forEach((member) => member.history.forEach((row) => months.add(row.month)));
  return [...months].sort();
}

export function unlockedAchievements(member, achievements) {
  return achievements.filter((a) => asNumber(member.achievements[a.id]) >= a.target);
}

export function memberAchievementStats(data, member) {
  const unlocked = unlockedAchievements(member, data.achievements);
  const bonus = unlocked.reduce((sum, a) => sum + a.bonus, 0);
  return {
    unlocked,
    count: unlocked.length,
    total: data.achievements.length,
    bonus,
    pct: data.achievements.length ? Math.round((unlocked.length / data.achievements.length) * 100) : 0,
  };
}

export function achievementHolders(data, achievement) {
  return data.members.filter((m) => asNumber(m.achievements[achievement.id]) >= achievement.target);
}

export function achievementStats(data, achievement) {
  const holders = achievementHolders(data, achievement);
  const progressTotal = data.members.reduce(
    (sum, m) => sum + Math.min(achievement.target, asNumber(m.achievements[achievement.id])),
    0
  );
  const possible = achievement.target * data.members.length;
  return {
    holders,
    unlocked: holders.length,
    pct: possible ? Math.round((progressTotal / possible) * 100) : 0,
  };
}

export function ledgerStats(data) {
  const totalPoints = data.members.reduce((sum, m) => sum + m.total, 0);
  const activeWeek = data.members.filter((m) => m.week > 0).length;
  const monthPoints = data.members.reduce((sum, m) => sum + m.month, 0);
  let unlocked = 0;
  data.members.forEach((m) => {
    unlocked += unlockedAchievements(m, data.achievements).length;
  });
  return {
    totalPoints,
    activeWeek,
    monthPoints,
    unlocked,
    possibleAchievements: data.members.length * data.achievements.length,
    memberCount: data.members.length,
    achievementCount: data.achievements.length,
  };
}

export function seasonProgress(meta) {
  const start = meta.seasonStart ? new Date(meta.seasonStart).getTime() : 0;
  const end = meta.seasonEnds ? new Date(meta.seasonEnds).getTime() : 0;
  const now = Date.now();
  if (!start || !end || end <= start) return null;
  return {
    pct: Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100))),
    daysLeft: Math.max(0, Math.ceil((end - now) / 86400000)),
    daysTotal: Math.max(1, Math.round((end - start) / 86400000)),
  };
}

export function recentActivityFor(data, memberId, limit = 6) {
  return data.activity.filter((entry) => entry.memberId === memberId).slice(0, limit);
}

export function pollTotal(poll) {
  return poll.options.reduce((sum, option) => sum + option.votes, 0);
}
