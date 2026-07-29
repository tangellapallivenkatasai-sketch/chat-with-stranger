/* =========================================================
   ADMIN-DASHBOARD.JS — Phase 2
   Reads only from existing nodes: presence/, activity/,
   strangerQueue/, genderQueue/, rooms/{roomId}/meta,
   rooms/{roomId}/messages. The only write this file performs
   is the approved "Disconnect Room" action, which sets
   rooms/{roomId}/meta/status = "ended_by_admin" — a path
   chat-mode.html already listens for (Phase 1).
   Waits for admin-auth.js to confirm the signed-in account
   is authorized before attaching any listeners.
   ========================================================= */

(function(){
  let db = null;
  let started = false;

  // live-synced local mirrors of the DB, updated by listeners below,
  // shared across all tabs so we don't attach duplicate listeners
  // for the same data.
  const state = {
    presence: {},      // sessionId -> record
    strangerQueue: {}, // pushKey -> record
    genderQueue: {},   // pushKey -> record
    rooms: {},         // roomId -> meta (group_room excluded, has no meta)
    activity: []       // array, newest first
  };

  let sortState = { field: "nickname", dir: "asc" };
  let searchTerm = "";
  let viewerMessagesRef = null;
  let tickIntervalId = null;

  window.addEventListener("admin:authorized", e => {
    if (started) return; // guard against duplicate init if the event fires more than once
    started = true;
    db = e.detail.db;
    initTabs();
    initSearch();
    initSort();
    initViewer();
    attachListeners();
    tickIntervalId = setInterval(renderLiveDurations, 1000);
  });

  /* ---------------------------------------------------------
     TABS
     --------------------------------------------------------- */
  function initTabs(){
    document.querySelectorAll(".admin-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".admin-tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
      });
    });
  }

  /* ---------------------------------------------------------
     LISTENERS — attached once, drive every tab + the overview
     --------------------------------------------------------- */
  function attachListeners(){
    db.ref("presence").on("value", snap => {
      state.presence = snap.val() || {};
      renderOverviewStats();
      renderUsersTable();
    });

    db.ref("strangerQueue").on("value", snap => {
      state.strangerQueue = snap.val() || {};
      renderOverviewStats();
      renderQueueTable();
    });

    db.ref("genderQueue").on("value", snap => {
      state.genderQueue = snap.val() || {};
      renderOverviewStats();
      renderQueueTable();
    });

    // rooms/: only .meta is used; messages/typing are ignored client-side
    // (see the note in chat about this being a V1 read-performance tradeoff)
    db.ref("rooms").on("value", snap => {
      const val = snap.val() || {};
      const rooms = {};
      Object.keys(val).forEach(roomId => {
        if (roomId === "group_room") return;
        if (val[roomId] && val[roomId].meta) rooms[roomId] = val[roomId].meta;
      });
      state.rooms = rooms;
      renderOverviewStats();
      renderChatsTable();
    });

    db.ref("activity").orderByChild("timestamp").limitToLast(50).on("value", snap => {
      const val = snap.val() || {};
      state.activity = Object.values(val).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      renderActivityFeed();
      renderOverviewActivity();
    });
  }

  /* ---------------------------------------------------------
     OVERVIEW — stat cards + compact activity list
     --------------------------------------------------------- */
  function renderOverviewStats(){
    const presenceList = Object.values(state.presence);
    const activeUsers = presenceList.length;
    const groupUsers = presenceList.filter(p => p.status === "group").length;
    const activeChats = Object.values(state.rooms).filter(m => m.status === "active").length;
    const waitingQueue = Object.keys(state.strangerQueue).length + Object.keys(state.genderQueue).length;

    setStat("stat-active-users", activeUsers);
    setStat("stat-active-chats", activeChats);
    setStat("stat-waiting-queue", waitingQueue);
    setStat("stat-group-users", groupUsers);
  }

  function setStat(id, value){
    const el = document.getElementById(id);
    el.textContent = value;
    el.classList.remove("skeleton");
  }

  function renderOverviewActivity(){
    const container = document.getElementById("overview-activity-list");
    const items = state.activity.slice(0, 8);
    if (items.length === 0){
      container.innerHTML = `<div class="empty-state">No activity yet.</div>`;
      return;
    }
    container.innerHTML = items.map(activityItemHTML).join("");
  }

  /* ---------------------------------------------------------
     ONLINE USERS
     --------------------------------------------------------- */
  function initSearch(){
    const input = document.getElementById("users-search");
    input.addEventListener("input", debounce(() => {
      searchTerm = input.value.trim().toLowerCase();
      renderUsersTable();
    }, 200));
  }

  function initSort(){
    document.querySelectorAll("#users-table thead th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const field = th.dataset.sort;
        if (sortState.field === field){
          sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
        } else {
          sortState = { field, dir: "asc" };
        }
        document.querySelectorAll("#users-table thead th").forEach(h => h.classList.remove("sorted", "asc"));
        th.classList.add("sorted");
        if (sortState.dir === "asc") th.classList.add("asc");
        renderUsersTable();
      });
    });
  }

  function renderUsersTable(){
    const tbody = document.getElementById("users-tbody");
    const emptyEl = document.getElementById("users-empty");

    let rows = Object.entries(state.presence).map(([sessionId, r]) => ({
      sessionId,
      nickname: r.nickname || "Anonymous",
      status: r.status || "idle",
      roomId: r.roomId || null,
      joinTime: r.joinTime || 0,
      lastActive: r.lastActive || 0
    }));

    if (searchTerm){
      rows = rows.filter(r =>
        r.nickname.toLowerCase().includes(searchTerm) ||
        r.sessionId.toLowerCase().includes(searchTerm)
      );
    }

    rows.sort((a, b) => {
      const f = sortState.field === "id" ? "sessionId" : sortState.field;
      let av = a[f], bv = b[f];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av == null) av = "";
      if (bv == null) bv = "";
      if (av < bv) return sortState.dir === "asc" ? -1 : 1;
      if (av > bv) return sortState.dir === "asc" ? 1 : -1;
      return 0;
    });

    if (rows.length === 0){
      tbody.innerHTML = "";
      emptyEl.style.display = "block";
      emptyEl.textContent = searchTerm ? "No users match your search." : "No one is online right now.";
      return;
    }
    emptyEl.style.display = "none";

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeText(r.nickname)}</td>
        <td title="${escapeText(r.sessionId)}">${escapeText(shortId(r.sessionId))}</td>
        <td><span class="status-pill status-${escapeText(r.status)}">${escapeText(r.status)}</span></td>
        <td>${r.roomId ? escapeText(shortId(r.roomId)) : "—"}</td>
        <td>${formatClock(r.joinTime)}</td>
        <td>${timeAgo(r.lastActive)}</td>
      </tr>
    `).join("");
  }

  /* ---------------------------------------------------------
     ACTIVE CHATS
     --------------------------------------------------------- */
  function renderChatsTable(){
    const tbody = document.getElementById("chats-tbody");
    const emptyEl = document.getElementById("chats-empty");
    const rooms = Object.entries(state.rooms);

    if (rooms.length === 0){
      tbody.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }
    emptyEl.style.display = "none";

    tbody.innerHTML = rooms.map(([roomId, meta]) => {
      const participants = Object.values(meta.participants || {});
      const userA = participants[0] ? participants[0].nickname : "—";
      const userB = participants[1] ? participants[1].nickname : "—";
      const status = meta.status || "active";
      const durationEnd = status === "active" ? null : (meta.endedAt || null);
      return `
        <tr data-room-id="${escapeText(roomId)}" data-start="${meta.startTime || 0}" data-status="${escapeText(status)}">
          <td title="${escapeText(roomId)}">${escapeText(shortId(roomId))}</td>
          <td>${escapeText(userA)}</td>
          <td>${escapeText(userB)}</td>
          <td>${escapeText(meta.type || "private")}</td>
          <td>${formatClock(meta.startTime)}</td>
          <td class="duration-cell">${formatElapsed(meta.startTime, durationEnd)}</td>
          <td><span class="status-pill status-${escapeText(status)}">${escapeText(status)}</span></td>
          <td>
            <button class="btn-table" data-view-room="${escapeText(roomId)}">View Chat</button>
            ${status === "active" ? `<button class="btn-table danger" data-disconnect-room="${escapeText(roomId)}">Disconnect</button>` : ""}
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-view-room]").forEach(btn => {
      btn.addEventListener("click", () => openViewer(btn.dataset.viewRoom));
    });
    tbody.querySelectorAll("[data-disconnect-room]").forEach(btn => {
      btn.addEventListener("click", () => disconnectRoom(btn.dataset.disconnectRoom));
    });
  }

  // ticks every second so "Duration" on active rooms keeps counting up
  // without waiting for a new Firebase snapshot
  function renderLiveDurations(){
    document.querySelectorAll("#chats-tbody tr[data-status='active']").forEach(row => {
      const start = Number(row.dataset.start);
      if (!start) return;
      row.querySelector(".duration-cell").textContent = formatElapsed(start, null);
    });
  }

  function disconnectRoom(roomId){
    if (!confirm("End this chat for both participants?")) return;
    db.ref(`rooms/${roomId}/meta`).update({
      status: "ended_by_admin",
      endedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  /* ---------------------------------------------------------
     WAITING QUEUE
     --------------------------------------------------------- */
  function renderQueueTable(){
    const tbody = document.getElementById("queue-tbody");
    const emptyEl = document.getElementById("queue-empty");

    const rows = [
      ...Object.values(state.strangerQueue).map(r => ({ ...r, queueLabel: "Random" })),
      ...Object.values(state.genderQueue).map(r => ({ ...r, queueLabel: "Gender" }))
    ];

    if (rows.length === 0){
      tbody.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }
    emptyEl.style.display = "none";

    tbody.innerHTML = rows.map(r => `
      <tr data-created="${r.createdAt || 0}">
        <td>${escapeText(r.nickname || "Anonymous")}</td>
        <td title="${escapeText(r.id)}">${escapeText(shortId(r.id))}</td>
        <td>${escapeText(r.queueLabel)}</td>
        <td class="wait-cell">${r.createdAt ? formatElapsed(r.createdAt, null) : "—"}</td>
      </tr>
    `).join("");
  }

  /* ---------------------------------------------------------
     ACTIVITY FEED
     --------------------------------------------------------- */
  function activityItemHTML(item){
    return `
      <div class="activity-item">
        <span class="activity-dot activity-${escapeText(item.type)}" aria-hidden="true"></span>
        <span class="activity-text">${activityLabel(item)}</span>
        <span class="activity-time">${timeAgo(item.timestamp)}</span>
      </div>
    `;
  }

  function renderActivityFeed(){
    const container = document.getElementById("activity-list");
    const emptyEl = document.getElementById("activity-empty");
    if (state.activity.length === 0){
      container.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }
    emptyEl.style.display = "none";
    container.innerHTML = state.activity.map(activityItemHTML).join("");
  }

  /* ---------------------------------------------------------
     LIVE CHAT VIEWER
     Reads directly from rooms/{roomId}/messages — the exact
     same node the public chat already uses. No copying.
     --------------------------------------------------------- */
  function initViewer(){
    document.getElementById("viewer-close").addEventListener("click", closeViewer);
    document.getElementById("viewer-overlay").addEventListener("click", e => {
      if (e.target.id === "viewer-overlay") closeViewer();
    });
  }

  function openViewer(roomId){
    closeViewer(); // detach any previous viewer listener first

    const meta = state.rooms[roomId] || {};
    const participants = Object.values(meta.participants || {});
    const names = participants.map(p => p.nickname).join(" & ") || roomId;

    document.getElementById("viewer-title").textContent = "Live Chat";
    document.getElementById("viewer-sub").textContent = names;
    const messagesEl = document.getElementById("viewer-messages");
    messagesEl.innerHTML = `<div class="empty-state">Loading messages…</div>`;

    document.getElementById("viewer-overlay").style.display = "flex";

    let firstLoad = true;
    viewerMessagesRef = db.ref(`rooms/${roomId}/messages`);
    viewerMessagesRef.on("value", snap => {
      const val = snap.val() || {};
      const msgs = Object.values(val);
      if (firstLoad){
        messagesEl.innerHTML = "";
        firstLoad = false;
      }
      if (msgs.length === 0){
        messagesEl.innerHTML = `<div class="empty-state">No messages yet.</div>`;
        return;
      }
      messagesEl.innerHTML = msgs.map(m => `
        <div class="viewer-msg">
          <div class="vm-meta">
            <span class="vm-user">${escapeText(m.user || "Anonymous")}</span>
            <span>${escapeText(m.timestamp || "")}</span>
          </div>
          <div>${escapeText(m.text || "")}</div>
        </div>
      `).join("");
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function closeViewer(){
    if (viewerMessagesRef){
      viewerMessagesRef.off();
      viewerMessagesRef = null;
    }
    document.getElementById("viewer-overlay").style.display = "none";
  }

})();
