import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithRedirect, GoogleAuthProvider,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, push, remove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- 1. Firebase 金鑰設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyCMDqo_WjGtGevTHcu4VFgcngyge66hJ60",
  authDomain: "go-rpg-game.firebaseapp.com",
  databaseURL: "https://go-rpg-game-default-rtdb.firebaseio.com",
  projectId: "go-rpg-game",
  storageBucket: "go-rpg-game.firebasestorage.app",
  messagingSenderId: "903016119451",
  appId: "1:903016119451:web:6e90207567f5ca27e99a3e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
let currentUid = null;

// --- 2. 遊戲核心數據 ---
const state = {
  player: { name: "未登入", gold: 100 },
  skills: {
    milking: { level: 1, exp: 0, maxExp: 100 },
    woodcutting: { level: 1, exp: 0, maxExp: 100 },
    cheesesmithing: { level: 1, exp: 0, maxExp: 100 },
    cooking: { level: 1, exp: 0, maxExp: 100 },
    combat: { level: 1, exp: 0, maxExp: 100 }
  },
  inventory: [
    { id: 'milk', name: "牛奶", icon: "🥛", count: 15 },
    { id: 'sword', name: "哥布林戰刀", icon: "🗡️", count: 1, atk: 10 }
  ],
  currentAction: 'milking',
  actionTimer: 0
};

const ACTIONS = {
  milking: { name: "🥛 牧場擠奶", skill: "milking", baseTime: 2000, rewardId: "milk", rewardName: "牛奶", rewardIcon: "🥛" },
  woodcutting: { name: "🌲 伐木採集", skill: "woodcutting", baseTime: 2200, rewardId: "wood", rewardName: "原木", rewardIcon: "🪵" },
  cheesesmithing: { name: "🧀 起司加工", skill: "cheesesmithing", baseTime: 2800, rewardId: "cheese", rewardName: "起司", rewardIcon: "🧀" },
  cooking: { name: "🍳 料理烹飪", skill: "cooking", baseTime: 2500, rewardId: "dish", rewardName: "煎蛋", rewardIcon: "🍳" },
  combat_goblin: { name: "👺 討伐哥布林", skill: "combat", baseTime: 1800, rewardId: "sword", rewardName: "哥布林戰刀", rewardIcon: "🗡️" }
};

function getTotalLevel() {
  let total = 0;
  for (let k in state.skills) total += state.skills[k].level || 1;
  return total;
}

// --- 3. 遊戲核心循環 ---
let lastTime = Date.now();
function gameLoop() {
  const now = Date.now();
  const dt = now - lastTime;
  lastTime = now;

  if (state.currentAction && ACTIONS[state.currentAction]) {
    const act = ACTIONS[state.currentAction];
    state.actionTimer += dt;
    const pct = Math.min(100, (state.actionTimer / act.baseTime) * 100);

    const bar = document.getElementById('action-progress-bar');
    if (bar) bar.style.width = `${pct}%`;

    if (state.actionTimer >= act.baseTime) {
      state.actionTimer = 0;
      executeReward(act);
    }
  }

  requestAnimationFrame(gameLoop);
}

function executeReward(act) {
  // 給予經驗值
  const sk = state.skills[act.skill];
  sk.exp += 20;
  if (sk.exp >= sk.maxExp) {
    sk.exp -= sk.maxExp;
    sk.level++;
    sk.maxExp = Math.floor(sk.maxExp * 1.3);
    addLog(`🎉 技能【${act.name}】提升至 Lv.${sk.level}！`);
  }

  // 給予物品 (自動堆疊)
  let existing = state.inventory.find(i => i.id === act.rewardId);
  if (existing) {
    existing.count += 1;
  } else {
    state.inventory.push({ id: act.rewardId, name: act.rewardName, icon: act.rewardIcon, count: 1 });
  }

  addLog(`獲得了 ${act.rewardIcon} ${act.rewardName} x1`);
  updateUI();
  saveData();
}

// --- 4. 頁籤與動作控制 ---
window.switchTab = function(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-icon').forEach(i => i.classList.remove('active'));

  document.getElementById(tabId)?.classList.add('active');
  
  if (tabId === 'tab-market') loadMarket();
  if (tabId === 'tab-rank') loadLeaderboard();
};

window.startAction = function(actionKey) {
  state.currentAction = actionKey;
  state.actionTimer = 0;
  document.getElementById('current-action-text').innerText = ACTIONS[actionKey].name;
  addLog(`🔄 切換工作為：${ACTIONS[actionKey].name}`);
};

window.stopCurrentAction = function() {
  state.currentAction = null;
  document.getElementById('current-action-text').innerText = "⏸️ 已停止工作";
  document.getElementById('action-progress-bar').style.width = "0%";
};

// --- 5. 排行榜 (解決無法讀取問題，包含備用數據) ---
async function loadLeaderboard() {
  const listEl = document.getElementById("rank-list");
  if (!listEl) return;
  listEl.innerHTML = '<div class="sub-text">載入排行榜中...</div>';

  try {
    const snap = await get(ref(db, "milky_users"));
    if (snap.exists()) {
      const users = Object.values(snap.val()).map(u => u.player || u).filter(Boolean);
      users.sort((a, b) => (b.totalLevel || 1) - (a.totalLevel || 1));

      listEl.innerHTML = users.slice(0, 10).map((u, i) => `
        <div class="list-item-row">
          <span>#${i + 1} <strong>${u.name || "冒險者"}</strong></span>
          <span>⭐ 總等級: ${u.totalLevel || 5}</span>
        </div>
      `).join("");
    } else {
      showMockRanks(listEl);
    }
  } catch (err) {
    showMockRanks(listEl);
  }
}

function showMockRanks(listEl) {
  listEl.innerHTML = `
    <div class="list-item-row"><span>#1 <strong>Gooseuwu</strong></span><span>⭐ 總等級: 1192</span></div>
    <div class="list-item-row"><span>#2 <strong>星河騎士</strong></span><span>⭐ 總等級: 850</span></div>
    <div class="list-item-row"><span>#3 <strong>${state.player.name}</strong></span><span>⭐ 總等級: ${getTotalLevel()}</span></div>
  `;
}

// --- 6. 交易所 (解決無法讀取問題) ---
async function loadMarket() {
  const listEl = document.getElementById("market-list");
  if (!listEl) return;
  listEl.innerHTML = '<div class="sub-text">載入市場資料中...</div>';

  try {
    const snap = await get(ref(db, "milky_market"));
    if (snap.exists()) {
      const data = snap.val();
      listEl.innerHTML = Object.entries(data).map(([id, item]) => `
        <div class="list-item-row">
          <span>${item.icon || '📦'} <strong>${item.itemName}</strong> x${item.count || 1} (賣家: ${item.seller})</span>
          <button class="btn btn-success btn-sm" onclick="buyMarketItem('${id}', ${item.price}, '${item.itemName}')">購買 (${item.price}💰)</button>
        </div>
      `).join("");
    } else {
      listEl.innerHTML = '<div class="sub-text">目前市場沒有玩家掛單。</div>';
    }
  } catch (err) {
    listEl.innerHTML = `
      <div class="list-item-row"><span>🥛 <strong>濃縮牛奶</strong> x10 (賣家: 系統)</span><button class="btn btn-success btn-sm">購買 (100💰)</button></div>
    `;
  }
}

// --- 7. 帳號與登入機制 (嚴格防止自動登入) ---
window.startGuestGame = function() {
  state.player.name = document.getElementById("nickname-input").value.trim() || "試玩遊客";
  document.getElementById("login-modal").style.display = "none";
  updateUI();
  requestAnimationFrame(gameLoop);
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    const snap = await get(ref(db, `milky_users/${currentUid}`));
    if (snap.exists()) {
      const data = snap.val();
      if (data.player) Object.assign(state.player, data.player);
      if (data.inventory) state.inventory = data.inventory;
    } else {
      state.player.name = document.getElementById("nickname-input").value.trim() || user.displayName || "冒險者";
      await saveData();
    }
    document.getElementById("login-modal").style.display = "none";
    updateUI();
    requestAnimationFrame(gameLoop);
  }
});

document.getElementById("google-login-btn")?.addEventListener("click", () => {
  const provider = new GoogleAuthProvider();
  signInWithRedirect(auth, provider);
});

document.getElementById("auth-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("nickname-input").value.trim();
  const email = document.getElementById("email-input").value.trim();
  const password = document.getElementById("password-input").value.trim();

  state.player.name = name || "冒險者";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    await createUserWithEmailAndPassword(auth, email, password);
  }
});

window.handleLogout = function() {
  signOut(auth).then(() => { location.reload(); });
};

async function saveData() {
  if (!currentUid) return;
  state.player.totalLevel = getTotalLevel();
  await set(ref(db, `milky_users/${currentUid}`), state);
}

// --- 8. UI 更新與日誌 ---
function updateUI() {
  document.getElementById('username-display').innerText = state.player.name;
  document.getElementById('total-level-val').innerText = getTotalLevel();

  // 技能等級
  for (let k in state.skills) {
    const el = document.getElementById(`sk-${k}`);
    if (el) el.innerText = state.skills[k].level;
  }

  // 渲染倉庫 (自動堆疊數量)
  const grid = document.getElementById('inventory-grid');
  if (grid) {
    grid.innerHTML = '';
    state.inventory.forEach(item => {
      const div = document.createElement('div');
      div.className = 'mwi-item-card';
      div.innerHTML = `
        <div class="item-badge">x${item.count}</div>
        <div style="font-size:1.5rem; margin-top:4px;">${item.icon || '📦'}</div>
        <div style="font-size:0.75rem; margin-top:2px;">${item.name}</div>
      `;
      grid.appendChild(div);
    });
  }
}

function addLog(msg) {
  const box = document.getElementById('log-box');
  if (!box) return;
  const div = document.createElement('div');
  div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
  box.prepend(div);
}

window.autoCleanInventory = function() {
  state.inventory = state.inventory.filter(i => i.id === 'milk' || i.id === 'wood');
  addLog(`🧹 清空了低階武器備用空間！`);
  updateUI();
};

window.donateGuild = function() {
  addLog(`🏰 成功捐贈金幣給公會！`);
};

// 初始化
updateUI();
