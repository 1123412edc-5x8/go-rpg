import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithRedirect, GoogleAuthProvider, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, update 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCMDqo_WjGtGevTHcu4VFgcngyge66hJ60",
    authDomain: "go-rpg-game.firebaseapp.com",
    databaseURL: "https://go-rpg-game-default-rtdb.firebaseio.com",
    projectId: "go-rpg-game",
    storageBucket: "go-rpg-game.firebasestorage.app",
    messagingSenderId: "903016119451",
    appId: "1:903016119451:web:6e90207567f5ca27e99a3e",
    measurementId: "G-RDK6HNMW9Z"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let currentUid = null;
let currentAction = "combat"; // 預設工作：combat, milking, woodcutting
let actionTimer = 0;
const ACTION_MAX_TIME = 2000; // 2 秒完成一次循環

// 角色核心數據
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

// Canvas 自適應
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// UI 頁籤切換邏輯 (手機專用 Tab)
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    
    e.target.classList.add("active");
    const targetTab = e.target.getAttribute("data-tab");
    document.getElementById(targetTab).classList.add("active");
  });
});

// 工作切換綁定
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

// 鍛造與黑市交易綁定
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

document.getElementById("sell-milk-btn").addEventListener("click", () => {
  if (player.milk >= 10) {
    player.milk -= 10;
    player.gold += 20;
    addLog("💰 出售 10 份牛奶，獲得 20 金幣。");
    updateUI();
    saveData();
  }
});

document.getElementById("sell-wood-btn").addEventListener("click", () => {
  if (player.wood >= 10) {
    player.wood -= 10;
    player.gold += 30;
    addLog("💰 出售 10 份木材，獲得 30 金幣。");
    updateUI();
    saveData();
  }
});

// 離線收益計算 (離線時間上限 12 小時)
function calculateOfflineProgress(lastTime) {
  const now = Date.now();
  const diffSec = Math.floor((now - lastTime) / 1000);
  if (diffSec < 60) return; // 小於 1 分鐘忽略

  const maxOfflineSec = 12 * 3600;
  const effectiveSec = Math.min(diffSec, maxOfflineSec);
  const cycles = Math.floor(effectiveSec / 2); // 每 2 秒一次循環

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

  document.getElementById("offline-summary").innerText = `你離開了 ${hours} 小時，系統已為你進行自動掛機！`;
  document.getElementById("offline-rewards").innerText = rewardText;
  document.getElementById("offline-modal").classList.remove("hidden");
}

document.getElementById("claim-offline-btn").addEventListener("click", () => {
  document.getElementById("offline-modal").classList.add("hidden");
  updateUI();
  saveData();
});

// Auth 監聽
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    const snap = await get(ref(db, `milky_users/${currentUid}`));
    if (snap.exists()) {
      Object.assign(player, snap.val());
      calculateOfflineProgress(player.lastOnline);
    } else {
      player.name = document.getElementById("nickname-input").value.trim() || user.displayName || "冒險者";
      await set(ref(db, `milky_users/${currentUid}`), player);
    }
    document.getElementById("login-modal").style.display = "none";
    updateUI();
    requestAnimationFrame(gameLoop);
  }
});

getRedirectResult(auth).catch(err => { document.getElementById("auth-error").innerText = err.message; });
const provider = new GoogleAuthProvider();
document.getElementById("google-btn").addEventListener("click", () => signInWithRedirect(auth, provider));

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email-input").value;
  const password = document.getElementById("password-input").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      try { await createUserWithEmailAndPassword(auth, email, password); } 
      catch (cErr) { document.getElementById("auth-error").innerText = cErr.message; }
    } else {
      document.getElementById("auth-error").innerText = err.message;
    }
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  await saveData();
  await signOut(auth);
  window.location.reload();
});

// 資料保存
async function saveData() {
  if (!currentUid) return;
  player.lastOnline = Date.now();
  await update(ref(db, `milky_users/${currentUid}`), player);
}

// UI 畫面刷新
function updateUI() {
  document.getElementById("player-name").innerText = player.name;
  document.getElementById("player-level").innerText = `Lv.${player.level}`;
  document.getElementById("gold-val").innerText = player.gold;
  document.getElementById("milk-val").innerText = player.milk;
  document.getElementById("wood-val").innerText = player.wood;
  document.getElementById("eq-weapon").innerText = player.weaponName;

  // 更新背包格
  const invGrid = document.getElementById("inventory-grid");
  invGrid.innerHTML = `
    <div class="inv-item">🥛 牛奶<span class="count">${player.milk}</span></div>
    <div class="inv-item">🪵 木材<span class="count">${player.wood}</span></div>
    <div class="inv-item">🧀 起司<span class="count">${player.cheese}</span></div>
  `;
}

function addLog(msg) {
  const box = document.getElementById("log-box");
  const div = document.createElement("div");
  div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// 核心循環：更新與渲染
let lastTime = performance.now();

function gameLoop(now) {
  const dt = now - lastTime;
  lastTime = now;

  actionTimer += dt;
  if (actionTimer >= ACTION_MAX_TIME) {
    actionTimer = 0;
    executeAction();
  }

  // 更新進度條
  const pct = Math.min(100, (actionTimer / ACTION_MAX_TIME) * 100);
  document.getElementById("action-progress-fill").style.width = `${pct}%`;
  document.getElementById("current-action-text").innerText = `⚡ 當前工作：${getActionName(currentAction)}`;

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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  // 根據工作繪製不同主題動畫
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
