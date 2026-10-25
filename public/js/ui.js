const numberFormat = new Intl.NumberFormat("en-US");

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fmt(value) {
  return numberFormat.format(Math.round(Number(value) || 0));
}

export function compact(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

export function fmtDate(value, options = { month: "short", day: "numeric", year: "numeric" }) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", options).format(date);
}

export function monthLabel(key) {
  const [year, month] = String(key).split("-").map(Number);
  if (!year || !month) return String(key);
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(year, month - 1, 1));
}

export function monthLong(key) {
  const [year, month] = String(key).split("-").map(Number);
  if (!year || !month) return String(key);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export function timeAgo(value) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return "just now";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(date, { month: "short", day: "numeric" });
}

export function daysUntil(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

export function initials(name) {
  const cleaned = String(name).replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || "?").slice(0, 1).toUpperCase();
}

function toneFor(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `tone-${(hash % 4) + 1}`;
}

const roleNames = { owner: "Owner", admin: "Admin", mod: "Mod", council: "Council", member: "Member" };

export function roleName(role) {
  return roleNames[role] || role;
}

export function avatar(member, size = "md", options = {}) {
  const classes = ["avatar", size, toneFor(member.id || member.name)];
  if (options.ring) classes.push("ring");
  if (options.className) classes.push(options.className);
  const inner = member.avatar
    ? `<img src="${esc(member.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : esc(initials(member.name));
  return `<span class="${classes.join(" ")}" aria-hidden="true">${inner}</span>`;
}

export function roleBadge(member) {
  if (!member || !member.role) return "";
  return `<span class="role ${esc(member.role)}">${esc(roleName(member.role))}</span>`;
}

export function memberLink(member, className = "") {
  return `<a class="${className}" href="#/member/${esc(member.id)}">${esc(member.name)}</a>`;
}

export function trend(delta) {
  if (delta > 0) {
    return `<span class="trend up" title="Up ${fmt(delta)} points">▲ ${fmt(delta)}</span>`;
  }
  if (delta < 0) {
    return `<span class="trend down" title="Down ${fmt(Math.abs(delta))} points">▼ ${fmt(Math.abs(delta))}</span>`;
  }
  return `<span class="trend flat" title="No change">—</span>`;
}

export function checkIcon() {
  return `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8.5 3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function crownIcon() {
  return `<svg class="podium-crown" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7.5 7.6 11 12 4l4.4 7L21 7.5 19.2 17H4.8L3 7.5Zm2.2 11.2h13.6v1.8H5.2v-1.8Z"/></svg>`;
}

export function emptyState(message) {
  return `<div class="empty-state"><p>${esc(message)}</p></div>`;
}
