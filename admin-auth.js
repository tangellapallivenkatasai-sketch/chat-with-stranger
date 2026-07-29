/* =========================================================
   ADMIN AUTH — Phase 1
   Same Firebase project/config as chat-mode.html — reused,
   not duplicated. This file only adds Authentication on top
   of the existing Realtime Database connection.
   ========================================================= */

const ADMIN_EMAIL = "tangellapallivenkatasai@gmail.com";

const firebaseConfig = {
  apiKey: "AIzaSyB2lhbK9zLBQx5Tl_8Skw_uit0zmPr3DpY",
  authDomain: "chitchat-709cc.firebaseapp.com",
  databaseURL: "https://chitchat-709cc-default-rtdb.firebaseio.com",
  projectId: "chitchat-709cc",
  storageBucket: "chitchat-709cc.appspot.com",
  messagingSenderId: "122065028796",
  appId: "1:122065028796:web:a5a47552d92ceb5bf232b9"
};

// Prevent duplicate initialization
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const adminDb = firebase.database();

window.adminAuth = auth;
window.adminDb = adminDb;

const screens = {
  loading: document.getElementById("admin-loading"),
  login: document.getElementById("admin-login"),
  denied: document.getElementById("admin-403"),
  dashboard: document.getElementById("admin-dashboard")
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (!el) return;
    el.style.display =
      key === name
        ? (name === "dashboard" ? "block" : "flex")
        : "none";
  });
}

showScreen("loading");

auth.onAuthStateChanged(user => {
  if (!user) {
    showScreen("login");
    return;
  }

  if (
    !user.email ||
    user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
  ) {
    showScreen("denied");
    return;
  }

  const emailEl = document.getElementById("admin-account-email");
  if (emailEl) {
    emailEl.textContent = user.email;
  }

  showScreen("dashboard");

  window.dispatchEvent(
    new CustomEvent("admin:authorized", {
      detail: {
        db: adminDb,
        user
      }
    })
  );
});

const googleBtn = document.getElementById("google-signin-btn");

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    const errorEl = document.getElementById("login-error");

    if (errorEl) {
      errorEl.style.display = "none";
    }

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
    } catch (err) {
      console.error("Admin sign-in failed:", err);

      if (errorEl) {
        errorEl.textContent = err.message;
        errorEl.style.display = "block";
      }
    }
  });
}

const signoutBtn = document.getElementById("signout-btn");
if (signoutBtn) {
  signoutBtn.addEventListener("click", () => auth.signOut());
}

const topbarBtn = document.getElementById("topbar-signout-btn");
if (topbarBtn) {
  topbarBtn.addEventListener("click", () => auth.signOut());
}
