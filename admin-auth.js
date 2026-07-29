/* =========================================================
   ADMIN AUTH — Phase 1
   Same Firebase project/config as chat-mode.html — reused,
   not duplicated. This file only adds Authentication on top
   of the existing Realtime Database connection.
   ========================================================= */

// >>> REPLACE THIS with the exact Google account email that should
//     have admin access. This must also match the email used in
//     firebase-rules-additions.json ("ADMIN_EMAIL") — both the client
//     check below AND the database rules enforce this; the UI check
//     alone is not what makes this secure.
const ADMIN_EMAIL = "REPLACE_WITH_YOUR_ADMIN_EMAIL@example.com";

const firebaseConfig = {
  apiKey: "AIzaSyB2lhbK9zLBQx5Tl_8Skw_uit0zmPr3DpY",
  authDomain: "chitchat-709cc.firebaseapp.com",
  databaseURL: "https://chitchat-709cc-default-rtdb.firebaseio.com",
  projectId: "chitchat-709cc",
  storageBucket: "chitchat-709cc.appspot.com",
  messagingSenderId: "122065028796",
  appId: "1:122065028796:web:a5a47552d92ceb5bf232b9"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const adminDb = firebase.database();

// exposed globally so Phase 2's admin-dashboard.js can reuse the same
// authenticated connection without re-initializing Firebase
window.adminAuth = auth;
window.adminDb = adminDb;

const screens = {
  loading: document.getElementById("admin-loading"),
  login: document.getElementById("admin-login"),
  denied: document.getElementById("admin-403"),
  dashboard: document.getElementById("admin-dashboard")
};

function showScreen(name){
  Object.entries(screens).forEach(([key, el]) => {
    el.style.display = key === name ? (name === "dashboard" ? "block" : "flex") : "none";
  });
}

showScreen("loading");

auth.onAuthStateChanged(user => {
  if (!user){
    showScreen("login");
    return;
  }

  if (user.email !== ADMIN_EMAIL){
    showScreen("denied");
    return;
  }

  // authorized — reveal the dashboard shell (Phase 2 mounts widgets into #dashboard-root)
  document.getElementById("admin-account-email").textContent = user.email;
  showScreen("dashboard");
  window.dispatchEvent(new CustomEvent("admin:authorized", { detail: { db: adminDb, user } }));
});

document.getElementById("google-signin-btn").addEventListener("click", () => {
  const errorEl = document.getElementById("login-error");
  errorEl.style.display = "none";

  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => {
    console.error("Admin sign-in failed:", err);
    errorEl.textContent = "Sign-in failed. Please try again.";
    errorEl.style.display = "block";
  });
});

document.getElementById("signout-btn").addEventListener("click", () => auth.signOut());
document.getElementById("topbar-signout-btn").addEventListener("click", () => auth.signOut());
