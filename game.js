import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithRedirect, GoogleAuthProvider, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, update, query, orderByChild, limitToLast 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ⚠️ 請替換為你自己的 Firebase 金鑰 ⚠️
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
let currentMap = "goblin";
let actionTimer = 0;
const ACTION_MAX_TIME = 2000;

// 玩家數據模型
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
  def: 0,
  equippedWeapon: null, // { name, atk }
  equippedArmor: null,  // { name, def }
  inventory: [],        // 背包道具 [{ id, name, type, val }]
  lastOnline: Date.now()
};

// 地圖怪物設定
const MAP_DATA = {
  goblin: { name: " Goblin 營地", monster: "👺 野生哥布林", icon: "👺", exp: 20, gold: 10, dropChance: 0.1 },
  forest: { name: "迷霧森林", monster: "🐺 森林野狼", icon: "🐺", exp: 45, gold: 25, dropChance: 0.2 },
  boss: { name: "魔王城堡", monster: "🐲 暗黑遠古龍", icon: "🐲", exp: 120, gold: 80, dropChance: 0.4 }
};

function resizeCanvas() {
  if (canvas && canvas.parentElement) {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
  }
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function showError(msg) {
  const errEl = document.getElementById("auth-error");
  if (errEl) errEl.innerText = msg;
}

// 帳號認證狀態變化
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    try {
      const snap = await get(ref(db, `milky_users/${currentUid}`));
      if (snap.exists()) {
        const data = snap.val();
        Object.assign(player, data);
        if (!player.inventory) player.inventory = [];
        calculateOfflineProgress(player.lastOnline);
      } else {
        const inputName = document.getElementById("nickname-input")?.value.trim();
        player.name = inputName || user.displayName || "冒險者";
        await set(ref(db, `milky_users/${currentUid}`), player);
      }

      document.getElementById("login-modal").style.display = "none";
      updateUI();
      loadLeaderboard();
      requestAnimationFrame(gameLoop);
    } catch (err) {
      showError("資料載入失敗：" + err.message);
    }
  } else {
    document.getElementById("login-modal").style.display = "flex";
  }
});

// 表單提交處理
document.getElementById("auth-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const email = document.getElementById("email-input").value.trim();
  const password = document.getElementById("password-input").value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
      } catch (cErr) {
        showError("註冊失敗：" + cErr.message);
      }
    } else {
      showError("登入失敗：" + err.message);
    }
  }
});

// 頁籤導覽
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    
    e.target.classList.add("active");
    const targetTab = e.target.getAttribute("data-tab");
    document.getElementById(targetTab)?.classList.add("active");
  });
});

// 工作切換
document.querySelectorAll(".action-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".action-card").forEach(c => c.classList.remove("active-work"));
    card.classList.add("active-work");
    currentAction = card.getAttribute("data-action");
    actionTimer = 0;
    addLog(`🔄 切換工作：${getActionName(currentAction)}`);
  });
});

// 地圖切換
document.querySelectorAll(".map-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".map-card").forEach(c => c.classList.remove("active-map"));
    card.classList.add("active-map");
    currentMap = card.getAttribute("data-map");
    addLog(`🗺️ 切換地圖至：${MAP_DATA[currentMap].name}`);
  });
});

function getActionName(act) {
  if (act === "combat") return `⚔️ 野外打怪 (${MAP_DATA[currentMap].name})`;
  if (act === "milking") return "🥛 牧場擠奶";
  if (act === "woodcutting") return "🌲 森林伐木";
  return "空閒";
}

// 鍛造與交易
document.querySelectorAll(".craft-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.getAttribute("data-craft");
    if (type === "cheese" && player.milk >= 5) {
      player.milk -= 5;
      player.cheese += 1;
      addLog("🧀 製作濃縮牛奶起司成功！");
    } else if (type === "sword" && player.wood >= 10 && player.gold >= 50) {
      player.wood -= 10;
      player.gold -= 50;
      player.inventory.push({ id: Date.now(), name: "精鋼長劍", type: "weapon", val: 15 });
      addLog("🗡️ 鍛造精鋼長劍成功，已放入背包！");
    } else if (type === "armor" && player.wood >= 15 && player.gold >= 80) {
      player.wood -= 15;
      player.gold -= 80;
      player.inventory.push({ id: Date.now(), name: "硬木重甲", type: "armor", val: 10 });
      addLog("🛡️ 鍛造硬木重甲成功，已放入背包！");
    } else {
      addLog("❌ 資源不足！");
    }
    updateUI();
    saveData();
  });
});

document.getElementById("sell-milk-btn")?.addEventListener("click", () => {
  if (player.milk >= 10) { player.milk -= 10; player.gold += 20; updateUI(); saveData(); }
});
document.getElementById("sell-wood-btn")?.addEventListener("click", () => {
  if (player.wood >= 10) { player.wood -= 10; player.gold += 30; updateUI(); saveData(); }
});

// 排行榜讀取
async function loadLeaderboard() {
  const listEl = document.getElementById("rank-list");
  if (!listEl) return;
  try {
    const snap = await get(query(ref(db, "milky_users"), orderByChild("level"), limitToLast(10)));
    if (snap.exists()) {
      const users = [];
      snap.forEach(child => { users.push(child.val()); });
      users.reverse(); // 降序排列
      listEl.innerHTML = users.map((u, i) => `
        <li>
          <span>#${i + 1} <strong>${u.name || "冒險者"}</strong></span>
          <span>Lv.${u.level} | 💰 ${u.gold}</span>
        </li>
      `).join("");
    }
  } catch (err) {
    listEl.innerHTML = "<li>載入排行榜失敗</li>";
  }
}
document.getElementById("refresh-rank-btn")?.addEventListener("click", loadLeaderboard);

// UI 畫面更新
function updateUI() {
  document.getElementById("player-name").innerText = player.name;
  document.getElementById("player-level").innerText = `Lv.${player.level}`;
  document.getElementById("gold-val").innerText = player.gold;
  document.getElementById("milk-val").innerText = player.milk;
  document.getElementById("wood-val").innerText = player.wood;

  // 裝備欄更新
  document.getElementById("eq-weapon-name").innerText = player.equippedWeapon ? player.equippedWeapon.name : "無";
  document.getElementById("eq-weapon-atk").innerText = player.equippedWeapon ? player.equippedWeapon.val : 0;
  document.getElementById("eq-armor-name").innerText = player.equippedArmor ? player.equippedArmor.name : "無";
  document.getElementById("eq-armor-def").innerText = player.equippedArmor ? player.equippedArmor.val : 0;

  // 背包更新
  const invEl = document.getElementById("inventory-list");
  if (invEl) {
    if (player.inventory.length === 0) {
      invEl.innerHTML = "<p style='color:#64748b;'>背包是空的，快去打怪或鍛造吧！</p>";
    } else {
      invEl.innerHTML = player.inventory.map(item => `
        <div class="inv-card">
          <span>${item.type === 'weapon' ? '🗡️' : '🛡️'} ${item.name} (${item.type === 'weapon' ? '攻' : '防'} +${item.val})</span>
          <button onclick="equipItem(${item.id})">裝備</button>
        </div>
      `).join("");
    }
  }
}

// 裝備穿脫邏輯 (掛載到 window 供 onclick 呼叫)
window.equipItem = function(id) {
  const idx = player.inventory.findIndex(i => i.id === id);
  if (idx === -1) return;
  const item = player.inventory[idx];

  if (item.type === "weapon") {
    if (player.equippedWeapon) player.inventory.push(player.equippedWeapon);
    player.equippedWeapon = item;
  } else if (item.type === "armor") {
    if (player.equippedArmor) player.inventory.push(player.equippedArmor);
    player.equippedArmor = item;
  }
  player.inventory.splice(idx, 1);
  addLog(`⚔️ 成功裝備了 ${item.name}！`);
  updateUI();
  saveData();
};

// 存檔與離線計算
async function saveData() {
  if (!currentUid) return;
  player.lastOnline = Date.now();
  await update(ref(db, `milky_users/${currentUid}`), player);
}

function calculateOfflineProgress(lastTime) {
  const diffSec = Math.floor((Date.now() - lastTime) / 1000);
  if (diffSec < 60) return;
  const cycles = Math.floor(Math.min(diffSec, 12 * 3600) / 2);

  if (currentAction === "combat") {
    const map = MAP_DATA[currentMap];
    player.gold += cycles * map.gold;
    player.exp += cycles * map.exp;
  } else if (currentAction === "milking") { player.milk += cycles * 2; }
  else if (currentAction === "woodcutting") { player.wood += cycles * 2; }

  document.getElementById("offline-summary").innerText = `離線掛機 ${(diffSec / 3600).toFixed(1)} 小時！`;
  document.getElementById("offline-rewards").innerText = `獲得大量掛機資源！`;
  document.getElementById("offline-modal")?.classList.remove("hidden");
}
document.getElementById("claim-offline-btn")?.addEventListener("click", () => {
  document.getElementById("offline-modal")?.classList.add("hidden");
  updateUI();
  saveData();
});

function addLog(msg) {
  const box = document.getElementById("log-box");
  if (!box) return;
  const div = document.createElement("div");
  div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// 遊戲繪製與主循環
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
  document.getElementById("action-progress-fill").style.width = `${pct}%`;
  document.getElementById("current-action-text").innerText = `⚡ 當前工作：${getActionName(currentAction)}`;

  renderCanvas();
  requestAnimationFrame(gameLoop);
}

function executeAction() {
  if (currentAction === "combat") {
    const map = MAP_DATA[currentMap];
    const totalAtk = player.atk + (player.equippedWeapon ? player.equippedWeapon.val : 0);
    
    player.exp += map.exp;
    player.gold += map.gold;
    addLog(`⚔️ 擊敗 ${map.monster}！金幣 +${map.gold}，經驗 +${map.exp}`);

    // 隨機裝備掉落
    if (Math.random() < map.dropChance) {
      const drop = { id: Date.now(), name: `${map.name}戰刃`, type: "weapon", val: Math.floor(Math.random() * 10) + 10 };
      player.inventory.push(drop);
      addLog(`🎉 幸運獲得掉落物：${drop.name}！`);
    }

    if (player.exp >= player.maxExp) {
      player.level += 1;
      player.exp -= player.maxExp;
      player.maxExp = Math.floor(player.maxExp * 1.3);
      addLog(`🎉 恭喜升級至 Lv.${player.level}！`);
    }
  } else if (currentAction === "milking") {
    player.milk += 2;
    addLog("🥛 採集新鮮牛奶 x2");
  } else if (currentAction === "woodcutting") {
    player.wood += 2;
    addLog("🌲 採集優質木材 x2");
  }
  updateUI();
  saveData();
}

function renderCanvas() {
  if (!canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const time = Date.now();

  if (currentAction === "combat") {
    const map = MAP_DATA[currentMap];
    const swing = Math.sin(time / 150) * 12;
    
    ctx.font = "50px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(map.icon, cx + swing, cy - 10);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(map.monster, cx, cy - 50);

    // 血條
    const barW = 120;
    const hpPct = Math.max(0, 1 - (actionTimer / ACTION_MAX_TIME));
    ctx.fillStyle = "#334155";
    ctx.fillRect(cx - barW / 2, cy - 35, barW, 8);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(cx - barW / 2, cy - 35, barW * hpPct, 8);

  } else if (currentAction === "milking") {
    ctx.font = "52px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🐮", cx, cy + Math.sin(time / 250) * 8);
  } else if (currentAction === "woodcutting") {
    ctx.font = "52px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🌲", cx, cy);
  }
}
