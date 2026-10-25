import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const members = [
  { id: "embervale", name: "EmberVale", role: "owner", joined: "2024-11-02", total: 4820, month: 320, week: 85, streak: 12, bio: "Keeper of the gates. Collects rare dice and hoards hot sauce." },
  { id: "nyx", name: "Nyx", role: "admin", joined: "2025-01-18", total: 4310, month: 410, week: 120, streak: 21, bio: "Night-shift moderator. Will absolutely beat you at trivia." },
  { id: "cinder", name: "Cinder", role: "mod", joined: "2025-02-09", total: 3995, month: 280, week: 60, streak: 7, bio: "Organises the arena brackets. Powered by iced coffee." },
  { id: "frostwyrm", name: "Frostwyrm", role: "member", joined: "2025-03-14", total: 3720, month: 350, week: 95, streak: 14, bio: "Cold takes only. Big fan of puzzle nights." },
  { id: "sable", name: "Sable", role: "council", joined: "2025-03-30", total: 3410, month: 150, week: 40, streak: 4, bio: "Writes the season lore and draws the banners." },
  { id: "quill", name: "Quill", role: "member", joined: "2025-04-22", total: 3120, month: 260, week: 70, streak: 9, bio: "Keeps notes on every tournament. Suspiciously good memory." },
  { id: "thorn", name: "Thorn", role: "member", joined: "2025-05-08", total: 2870, month: 90, week: 25, streak: 2, bio: "Lurker with excellent taste in music." },
  { id: "vesper", name: "Vesper", role: "member", joined: "2025-06-01", total: 2540, month: 180, week: 45, streak: 6, bio: "Dusk raider. Appears when the event ping drops." },
  { id: "rune", name: "Rune", role: "member", joined: "2025-06-19", total: 2210, month: 120, week: 30, streak: 3, bio: "Speedruns the daily word puzzle." },
  { id: "ash", name: "Ash", role: "member", joined: "2025-07-04", total: 1980, month: 70, week: 15, streak: 1, bio: "Here for the memes and the movie nights." },
  { id: "moth", name: "Moth", role: "member", joined: "2025-07-27", total: 1750, month: 140, week: 35, streak: 5, bio: "Drawn to anything glowing." },
  { id: "gale", name: "Gale", role: "member", joined: "2025-08-12", total: 1520, month: 60, week: 20, streak: 2, bio: "Fastest typist in the keep." },
  { id: "bramble", name: "Bramble", role: "member", joined: "2025-09-03", total: 1290, month: 100, week: 25, streak: 3, bio: "Grows the community garden channel." },
  { id: "jinx", name: "Jinx", role: "member", joined: "2025-09-21", total: 980, month: 40, week: 10, streak: 1, bio: "Newest recruit. Already broke the bot once." },
];

const achievements = [
  { id: "first-flame", name: "First Flame", icon: "🔥", description: "Earn your first 100 points in the keep.", target: 100, bonus: 25, category: "Milestone" },
  { id: "week-of-fire", name: "Week of Fire", icon: "⚡", description: "Earn points seven days in a row.", target: 7, bonus: 50, category: "Milestone" },
  { id: "keeper", name: "Keeper of the Keep", icon: "🤝", description: "Help ten members with events or questions.", target: 10, bonus: 75, category: "Community" },
  { id: "arena-regular", name: "Arena Regular", icon: "🎟️", description: "Attend five guild events.", target: 5, bonus: 40, category: "Events" },
  { id: "podium", name: "Podium Finish", icon: "🏆", description: "Finish a month in the top three.", target: 1, bonus: 100, category: "Milestone" },
  { id: "dragoncaller", name: "Dragoncaller", icon: "🐉", description: "Invite three new members who stick around.", target: 3, bonus: 60, category: "Community" },
];

const goal = (id, name, icon, description, target, current, endsAt) => ({ id, name, icon, description, target, current, endsAt });

const goals = [
  goal("season-points", "Season pool", "💎", "The whole keep needs 60,000 points before Emberfall ends.", 60000, 42840, "2026-12-01"),
  goal("events", "Twelve nights of events", "🕯️", "Host twelve community events this season.", 12, 8, "2026-12-01"),
  goal("new-recruits", "Fresh scales", "🥚", "Welcome eight new members to the keep.", 8, 5, "2026-12-01"),
];

const polls = [
  {
    id: "season-finale",
    question: "What should close out Season 4?",
    description: "The final event gets double points. Pick the format you want to show up for.",
    status: "open",
    council: false,
    closesAt: "2026-11-02T20:00:00Z",
    options: [
      { id: "tournament", label: "Bracket tournament", votes: 27 },
      { id: "trivia", label: "Trivia gauntlet", votes: 19 },
      { id: "art", label: "Art & lore contest", votes: 11 },
      { id: "movie", label: "Movie marathon", votes: 8 },
    ],
  },
  {
    id: "arena-cooldown",
    question: "Add a 24h cooldown to arena rematches?",
    description: "Council vote. Passed with 71% approval and goes live next season.",
    status: "closed",
    council: true,
    closesAt: "2026-10-12T18:00:00Z",
    options: [
      { id: "yes", label: "Yes, add the cooldown", votes: 34 },
      { id: "no", label: "No, keep it open", votes: 14 },
    ],
  },
  {
    id: "banner-theme",
    question: "Next guild banner theme?",
    description: "Sable will draw the winner for the server banner next month.",
    status: "open",
    council: false,
    closesAt: "2026-11-09T18:00:00Z",
    options: [
      { id: "ember", label: "Emberfall", votes: 22 },
      { id: "tide", label: "Deep tide", votes: 17 },
      { id: "storm", label: "Storm peak", votes: 15 },
    ],
  },
];

const activity = [
  { member: "nyx", delta: 60, reason: "Won trivia gauntlet", minutesAgo: 34 },
  { member: "frostwyrm", delta: 25, reason: "Solved the daily puzzle", minutesAgo: 96 },
  { member: "embervale", delta: 40, reason: "Hosted arena night", minutesAgo: 183 },
  { member: "quill", delta: 15, reason: "Helped a new member", minutesAgo: 320 },
  { member: "moth", delta: 20, reason: "Movie night attendance", minutesAgo: 690 },
  { member: "cinder", delta: 35, reason: "Ran the bracket", minutesAgo: 810 },
  { member: "vesper", delta: 10, reason: "Daily check-in", minutesAgo: 1240 },
  { member: "jinx", delta: 5, reason: "First check-in", minutesAgo: 1500 },
  { member: "sable", delta: 30, reason: "Drew the season banner", minutesAgo: 1810 },
  { member: "rune", delta: 15, reason: "Puzzle streak bonus", minutesAgo: 2100 },
];

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const months = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];

members.forEach((member, index) => {
  const rng = mulberry32(index * 7919 + 13);
  const history = months.map((month, monthIndex) => {
    const baseline = Math.round(member.month * (0.55 + monthIndex * 0.09));
    const noise = Math.round((rng() - 0.5) * member.month * 0.25);
    return { month, points: Math.max(0, monthIndex === months.length - 1 ? member.month : baseline + noise) };
  });
  member.history = history;
  member.achievements = {};
  achievements.forEach((achievement) => {
    let value;
    if (achievement.id === "first-flame") value = member.total >= 100 ? achievement.target : member.total;
    else if (achievement.id === "week-of-fire") value = Math.min(achievement.target, Math.max(0, member.streak - (index % 3)));
    else if (achievement.id === "keeper") value = Math.round(rng() * achievement.target);
    else if (achievement.id === "arena-regular") value = Math.round(rng() * achievement.target);
    else if (achievement.id === "podium") value = index < 4 ? 1 : 0;
    else value = Math.min(achievement.target, Math.floor(rng() * (achievement.target + 1)));
    member.achievements[achievement.id] = value;
  });
});

const now = new Date("2026-10-25T18:00:00Z");

const data = {
  meta: {
    guild: "Dragon's Keep",
    season: "Season 4 · Emberfall",
    seasonStart: "2026-08-01",
    seasonEnds: "2026-12-01",
    updatedAt: now.toISOString(),
    currency: "DP",
    sourceNote: "Sample ledger — replace this file with your own guild data.",
  },
  members,
  achievements,
  goals,
  polls,
  activity: activity.map((entry, index) => ({
    id: `act-${index + 1}`,
    memberId: entry.member,
    delta: entry.delta,
    reason: entry.reason,
    at: new Date(now.getTime() - entry.minutesAgo * 60000).toISOString(),
  })),
};

mkdirSync(resolve(root, "public/data"), { recursive: true });
writeFileSync(resolve(root, "public/data/dragonpoints.json"), JSON.stringify(data, null, 2) + "\n");
console.log(`Wrote ${members.length} members, ${achievements.length} achievements, ${polls.length} polls.`);
