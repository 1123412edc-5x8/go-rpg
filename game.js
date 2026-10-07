import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithRedirect, GoogleAuthProvider, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, update 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ⚠️ 請填入你自己的 Firebase 金鑰 ⚠️
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let currentUid = null;
let currentAction = "combat";
let actionTimer = 0;
const ACTION_MAX_TIME = 2000;

let player = {
  name: "冒險者",
  level: 1,
  exp: 0,
  maxExp: 100,
  gold: 0,
  milk: 0,
  wood: 0,
  cheese: 0,
  atk: 10,
  weaponAtk: 0,
  weaponName: "無",
  lastOnline: Date.now()
};

function resizeCanvas() {
  if (canvas && canvas.parentElement) {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// --- 顯示/隱藏錯誤與提示訊息 ---
function showError(msg) {
  const errEl = document.getElementById("auth-error");
  if (errEl) errEl.innerText = msg;
}

// --- 自動登入機制 (只要登入過一次，之後開網頁自動免登入) ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    console.log("已自動登入 UID:", currentUid);
    
    try {
      // 載入玩家進度
      const snap = await get(ref(db, `milky_users/${currentUid}`));
      if (snap.exists()) {
        Object.assign(player, snap.val());
        calculateOfflineProgress(player.lastOnline);
      } else {
        const inputName = document.getElementById("nickname-input")?.value.trim();
        player.name = inputName || user.displayName || "冒險者";
        await set(ref(db, `milky_users/${currentUid}`), player);
      }

      // 隱藏登入 Modal，直接進入遊戲
      const modal = document.getElementById("login-modal");
      if (modal) modal.style.display = "none";
      
      updateUI();
      requestAnimationFrame(gameLoop);
    } catch (err) {
      showError("資料載入失敗：" + err.message);
    }
  } else {
    // 未登入時顯示彈窗
    const modal = document.getElementById("login-modal");
    if (modal) modal.style.display = "flex";
  }
});

// --- 表單提交登入/註冊 (修復無反應問題) ---
const authForm = document.getElementById("auth-form");
if (authForm) {
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    
    const email = document.getElementById("email-input").value.trim();
    const password = document.getElementById("password-input").value.trim();
    const submitBtn = document.getElementById("submit-btn");

    if (!email || !password) {
      showError("請輸入 Email 與密碼！");
      return;
    }

    if (password.length < 6) {
      showError("密碼長度至少需要 6 位數！");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = "驗證中...";
    }

    try {
      // 1. 嘗試直接登入
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      // 2. 若帳號不存在，自動嘗試為新使用者註冊
      if (
        err.code === "auth/user-not-found" || 
        err.code === "auth/invalid-credential"
      ) {
        try {
          await createUserWithEmailAndPassword(auth, email, password);
        } catch (createErr) {
          showError(getFriendlyErrorMessage(createErr));
        }
      } else {
        showError(getFriendlyErrorMessage(err));
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = "開始冒險（登入 / 註冊）";
      }
    }
  });
}

// 錯誤訊息轉化為中文
function getFriendlyErrorMessage(err) {
  if (err.code === "auth/invalid-email") return "Email 格式不正確！";
  if (err.code === "auth/wrong-password") return "密碼錯誤，請重新輸入！";
  if (err.code === "auth/email-already-in-use") return "此 Email 已被註冊，但密碼不正確！";
  if (err.code === "auth/weak-password") return "密碼強度不足，請設定至少 6 位數。";
  return "登入失敗：" + err.message;
}

// --- Google 轉址登入 ---
getRedirectResult(auth).catch(err => showError(err.message));
const provider = new GoogleAuthProvider();
const googleBtn = document.getElementById("google-btn");
if (googleBtn) {
  googleBtn.addEventListener("click", () => {
    signInWithRedirect(auth, provider);
  });
}

// --- 登出 ---
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await saveData();
    await signOut(auth);
    window.location.reload();
  });
}

// --- 遊戲頁籤與工作切換 ---
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    
    e.target.classList.add("active");
    const targetTab = e.target.getAttribute("data-tab");
    document.getElementById(targetTab)?.classList.add("active");
  });
});

document.querySelectorAll(".action-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".action-card").forEach(c => c.classList.remove("active-work"));
    card.classList.add("active-work");
    currentAction = card.getAttribute("data-action");
    actionTimer = 0;
    addLog(`🔄 切換工作：${getActionName(currentAction)}`);
  });
});

function getActionName(act) {
  if (act === "combat") return "⚔️ 自動打怪";
  if (act === "milking") return "🥛 牧場擠奶";
  if (act === "woodcutting") return "🌲 森林伐木";
  return "空閒";
}

// --- 鍛造與交易 ---
document.querySelectorAll(".craft-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.getAttribute("data-craft");
    if (type === "cheese" && player.milk >= 5) {
      player.milk -= 5;
      player.cheese += 1;
      addLog("🧀 成功製作濃縮牛奶起司！");
    } else if (type === "sword" && player.wood >= 10 && player.gold >= 50) {
      player.wood -= 10;
      player.gold -= 50;
      player.weaponAtk = 15;
      player.weaponName = "精鋼長劍";
      addLog("🗡️ 成功鍛造精鋼長劍！攻擊力 +15");
    } else {
      addLog("❌ 資源不足，無法合成！");
    }
    updateUI();
    saveData();
  });
});

document.getElementById("sell-milk-btn")?.addEventListener("click", () => {
  if (player.milk >= 10) {
    player.milk -= 10;
    player.gold += 20;
    addLog("💰 出售 10 份牛奶，獲得 20 金幣。");
    updateUI();
    saveData();
  }
});

document.getElementById("sell-wood-btn")?.addEventListener("click", () => {
  if (player.wood >= 10) {
    player.wood -= 10;
    player.gold += 30;
    addLog("💰 出售 10 份木材，獲得 30 金幣。");
    updateUI();
    saveData();
  }
});

// --- 離線收益計算 ---
function calculateOfflineProgress(lastTime) {
  const now = Date.now();
  const diffSec = Math.floor((now - lastTime) / 1000);
  if (diffSec < 60) return;

  const maxOfflineSec = 12 * 3600;
  const effectiveSec = Math.min(diffSec, maxOfflineSec);
  const cycles = Math.floor(effectiveSec / 2);

  const hours = (effectiveSec / 3600).toFixed(1);
  let rewardText = "";

  if (currentAction === "combat") {
    const goldEarned = cycles * 5;
    const expEarned = cycles * 2;
    player.gold += goldEarned;
    player.exp += expEarned;
    rewardText = `💰 獲得 ${goldEarned} 金幣 | ⭐ 獲得 ${expEarned} 經驗`;
  } else if (currentAction === "milking") {
    const milkEarned = cycles * 2;
    player.milk += milkEarned;
    rewardText = `🥛 採集 ${milkEarned} 牛奶`;
  } else if (currentAction === "woodcutting") {
    const woodEarned = cycles * 2;
    player.wood += woodEarned;
    rewardText = `🪵 採集 ${woodEarned} 木材`;
  }

  const summaryEl = document.getElementById("offline-summary");
  const rewardEl = document.getElementById("offline-rewards");
  const modalEl = document.getElementById("offline-modal");
  
  if (summaryEl) summaryEl.innerText = `你離開了 ${hours} 小時，系統已為你進行自動掛機！`;
  if (rewardEl) rewardEl.innerText = rewardText;
  if (modalEl) modalEl.classList.remove("hidden");
}

document.getElementById("claim-offline-btn")?.addEventListener("click", () => {
  document.getElementById("offline-modal")?.classList.add("hidden");
  updateUI();
  saveData();
});

async function saveData() {
  if (!currentUid) return;
  player.lastOnline = Date.now();
  await update(ref(db, `milky_users/${currentUid}`), player);
}

function updateUI() {
  document.getElementById("player-name").innerText = player.name;
  document.getElementById("player-level").innerText = `Lv.${player.level}`;
  document.getElementById("gold-val").innerText = player.gold;
  document.getElementById("milk-val").innerText = player.milk;
  document.getElementById("wood-val").innerText = player.wood;
  document.getElementById("eq-weapon").innerText = player.weaponName;

  const invGrid = document.getElementById("inventory-grid");
  if (invGrid) {
    invGrid.innerHTML = `
      <div class="inv-item">🥛 牛奶<span class="count">${player.milk}</span></div>
      <div class="inv-item">🪵 木材<span class="count">${player.wood}</span></div>
      <div class="inv-item">🧀 起司<span class="count">${player.cheese}</span></div>
    `;
  }
}

function addLog(msg) {
  const box = document.getElementById("log-box");
  if (!box) return;
  const div = document.createElement("div");
  div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// --- 遊戲繪製與主循環 ---
let lastTime = performance.now();

function gameLoop(now) {
  const dt = now - lastTime;
  lastTime = now;

  actionTimer += dt;
  if (actionTimer >= ACTION_MAX_TIME) {
    actionTimer = 0;
    executeAction();
  }

  const pct = Math.min(100, (actionTimer / ACTION_MAX_TIME) * 100);
  const fillEl = document.getElementById("action-progress-fill");
  const textEl = document.getElementById("current-action-text");
  
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (textEl) textEl.innerText = `⚡ 當前工作：${getActionName(currentAction)}`;

  renderCanvas();
  requestAnimationFrame(gameLoop);
}

function executeAction() {
  if (currentAction === "combat") {
    const expGain = 20;
    const goldGain = 10;
    player.exp += expGain;
    player.gold += goldGain;
    addLog(`⚔️ 擊敗哥布林！金幣 +${goldGain}，經驗 +${expGain}`);
    
    if (player.exp >= player.maxExp) {
      player.level += 1;
      player.exp -= player.maxExp;
      player.maxExp = Math.floor(player.maxExp * 1.3);
      addLog(`🎉 恭喜升級至 Lv.${player.level}！`);
    }
  } else if (currentAction === "milking") {
    player.milk += 2;
    addLog("🥛 擠奶成功，獲得牛奶 x2");
  } else if (currentAction === "woodcutting") {
    player.wood += 2;
    addLog("🌲 伐木成功，獲得木材 x2");
  }
  updateUI();
  saveData();
}

function renderCanvas() {
  if (!canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  if (currentAction === "combat") {
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc(cx + Math.sin(Date.now() / 200) * 30, cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚔️ 自動戰鬥中...", cx, cy + 40);
  } else if (currentAction === "milking") {
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(cx, cy + Math.sin(Date.now() / 300) * 10, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🥛 快樂擠奶中...", cx, cy + 40);
  } else if (currentAction === "woodcutting") {
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🌲 伐木採集時光...", cx, cy + 40);
  }
}
