/* =========================================================
   ADMIN.JS — shared utilities for the dashboard
   No Firebase calls here — just formatting helpers so
   admin-dashboard.js stays focused on data + rendering.
   ========================================================= */

function escapeText(str){
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function shortId(id){
  if (!id) return "—";
  return id.length > 10 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function formatClock(ts){
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour12: false });
}

function formatElapsed(fromTs, toTs){
  if (!fromTs) return "—";
  const end = toTs || Date.now();
  let seconds = Math.max(0, Math.floor((end - fromTs) / 1000));
  const h = Math.floor(seconds / 3600);
  seconds -= h * 3600;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function timeAgo(ts){
  if (!ts) return "—";
  const diff = Math.max(0, Date.now() - ts);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function debounce(fn, wait){
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// human-friendly labels for activity feed event types
const ACTIVITY_LABELS = {
  joined: name => `<b>${name}</b> joined`,
  queue_enter: name => `<b>${name}</b> entered the queue`,
  queue_left: name => `<b>${name}</b> left the queue`,
  matched: name => `<b>${name}</b> was matched`,
  disconnected: name => `<b>${name}</b> disconnected`,
  room_ended: name => `A room involving <b>${name}</b> ended`
};

function activityLabel(item){
  const fn = ACTIVITY_LABELS[item.type];
  const name = escapeText(item.nickname || "Someone");
  return fn ? fn(name) : `<b>${name}</b> — ${escapeText(item.type)}`;
}
