import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithRedirect, GoogleAuthProvider,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, push, remove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- Firebase 金鑰設定 ---
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

// --- 核心遊戲資料結構 ---
const state = {
  player: { name: "Gooseuwu", gold: 0 },
  skills: {
    milking: { level: 1, exp: 0, maxExp: 100 },
    foraging: { level: 1, exp: 0, maxExp: 100 },
    woodcutting: { level: 1, exp: 0, maxExp: 100 },
    cheesesmithing: { level: 1, exp: 0, maxExp: 100 },
    cooking: { level: 1, exp: 0, maxExp: 100 },
    combat: { level: 1, exp: 0, maxExp: 100 }
  },
  inventory: [
    { id: 'milk', name: "牛奶", icon: "🥛", count: 12 },
    { id: 'egg', name: "雞蛋", icon: "🥚", count: 4 }
  ],
  currentAction: null,
  actionTimer: 0
};

// 技能與工作卡片項目配置 (與正版一模一樣)
const SKILL_DATA = {
  foraging: {
    title: "採摘",
    cards: [
      { id: "egg", name: "雞蛋", icon: "🥚", time: 2000, exp: 15 },
      { id: "wheat", name: "小麥", icon: "🌾", time: 2200, exp: 18 },
      { id: "sugar", name: "糖", icon: "🍚", time: 2500, exp: 20 },
      { id: "cotton", name: "棉花", icon: "🌸", time: 2800, exp: 25 }
    ]
  },
  milking: {
    title: "擠奶",
    cards: [
      { id: "milk", name: "牛奶", icon: "🥛", time: 2000, exp: 15 }
    ]
  },
  woodcutting: {
    title: "伐木",
    cards: [
      { id: "wood", name: "原木", icon: "🪵", time: 2400, exp: 20 }
    ]
  },
  cheesesmithing: {
    title: "乳酪鍛造",
    cards: [
      { id: "cheese", name: "起司", icon: "🧀", time: 3000, exp: 30 }
    ]
  },
  cooking: {
    title: "烹飪",
    cards: [
      { id: "fried_egg", name: "煎蛋", icon: "🍳", time: 2500, exp: 22 }
    ]
  },
  combat: {
    title: "戰鬥",
    cards: [
      { id: "goblin", name: "哥布林營地", icon: "👺", time: 1800, exp: 35, rewardId: "sword", rewardName: "短劍", rewardIcon: "🗡️" }
    ]
  }
};

function getTotalLevel() {
  let total = 0;
  for (let k in state.skills) total += state.skills[k].level || 1;
  return total;
}

// --- 遊戲掛機主循環 ---
let lastTime = Date.now();
function gameLoop() {
  const now = Date.now();
  const dt = now - lastTime;
  lastTime = now;

  if (state.currentAction) {
    const act = state.currentAction;
    state.actionTimer += dt;
    const pct = Math.min(100, (state.actionTimer / act.time) * 100);

    const bar = document.getElementById('action-progress-bar');
    if (bar) bar.style.width = `${pct}%`;

    if (state.actionTimer >= act.time) {
      state.actionTimer = 0;
      executeReward(act);
    }
  }

  requestAnimationFrame(gameLoop);
}

function executeReward(act) {
  // 技能經驗獲得
  const sk = state.skills[act.skillKey];
  if (sk) {
    sk.exp += act.exp;
    if (sk.exp >= sk.maxExp) {
      sk.exp -= sk.maxExp;
      sk.level++;
      sk.maxExp = Math.floor(sk.maxExp * 1.35);
      addLog(`🎉 技能【${SKILL_DATA[act.skillKey].title}】提升至 Lv.${sk.level}！`);
    }
  }

  // 獲得產出物品 (嚴格堆疊計算，防止 undefined)
  const rId = act.rewardId || act.id;
  const rName = act.rewardName || act.name;
  const rIcon = act.rewardIcon || act.icon;

  let existing = state.inventory.find(i => i.id === rId);
  if (existing) {
    existing.count += 1;
  } else {
    state.inventory.push({ id: rId, name: rName, icon: rIcon, count: 1 });
  }

  addLog(`獲得了 ${rIcon} ${rName} x1`);
  updateUI();
  saveData();
}

// --- 側邊欄與頁籤控制 ---
window.toggleSidebar = function() {
  document.getElementById('sidebar')?.classList.toggle('collapsed');
};

window.switchMainTab = function(tabId) {
  document.querySelectorAll('.main-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

  document.getElementById(tabId)?.classList.add('active');

  if (tabId === 'tab-market') loadMarket();
  if (tabId === 'tab-rank') loadLeaderboard();
};

window.openSkillPage = function(skillKey) {
  window.switchMainTab('tab-skill-page');
  const data = SKILL_DATA[skillKey];
  if (!data) return;

  document.getElementById('page-skill-title').innerText = data.title;
  const grid = document.getElementById('action-cards-grid');
  grid.innerHTML = '';

  data.cards.forEach(card => {
    const div = document.createElement('div');
    div.className = 'mwi-card-item';
    div.onclick = () => startAction(skillKey, card);
    div.innerHTML = `
      <div class="card-icon">${card.icon}</div>
      <div class="card-name">${card.name}</div>
    `;
    grid.appendChild(div);
  });
};

function startAction(skillKey, card) {
  state.currentAction = { ...card, skillKey: skillKey };
  state.actionTimer = 0;
  document.getElementById('current-action-text').innerText = `${card.icon} ${card.name}中...`;
  addLog(`🔄 開始進行：${card.name}`);
}

window.stopCurrentAction = function() {
  state.currentAction = null;
  document.getElementById('current-action-text').innerText = "⏸️ 已停止工作";
  document.getElementById('action-progress-bar').style.width = "0%";
};

// --- 排行榜 (真實數據，無玩家時顯示真實狀態) ---
async function loadLeaderboard() {
  const listEl = document.getElementById("rank-list");
  if (!listEl) return;
  listEl.innerHTML = '<div style="color:#64748b;">載入排行榜中...</div>';

  try {
    const snap = await get(ref(db, "milky_users"));
    if (snap.exists()) {
      const users = Object.values(snap.val()).map(u => u.player || u).filter(Boolean);
      users.sort((a, b) => (b.totalLevel || 1) - (a.totalLevel || 1));

      listEl.innerHTML = users.map((u, i) => `
        <div class="list-row">
          <span>#${i + 1} <strong>${u.name || "冒險者"}</strong></span>
          <span style="color:#38bdf8;">⭐ 總等級: ${u.totalLevel || 1}</span>
        </div>
      `).join("");
    } else {
      listEl.innerHTML = '<div style="color:#64748b;">目前尚無其他玩家資料</div>';
    }
  } catch (err) {
    listEl.innerHTML = '<div style="color:#64748b;">排行榜無法連線</div>';
  }
}

// --- 玩家交易所 (純玩家交易，無系統假賣) ---
async function loadMarket() {
  const listEl = document.getElementById("market-list");
  if (!listEl) return;
  listEl.innerHTML = '<div style="color:#64748b;">載入市場資料中...</div>';

  try {
    const snap = await get(ref(db, "milky_market"));
    if (snap.exists()) {
      const data = snap.val();
      listEl.innerHTML = Object.entries(data).map(([id, item]) => `
        <div class="list-row">
          <span>${item.icon || '📦'} <strong>${item.itemName}</strong> x${item.count || 1} (賣家: ${item.seller})</span>
          <button class="btn-primary" onclick="buyMarketItem('${id}', ${item.price}, '${item.itemName}', ${item.count || 1})">購買 (${item.price}💰)</button>
        </div>
      `).join("");
    } else {
      listEl.innerHTML = '<div style="color:#64748b;">目前市場上沒有玩家掛單商品。</div>';
    }
  } catch (err) {
    listEl.innerHTML = '<div style="color:#64748b;">市場無法連線</div>';
  }
}

window.sellItemModal = function() {
  if (state.inventory.length === 0) {
    addLog(`❌ 你的倉庫內沒有物品可供上架。`);
    return;
  }
  const item = state.inventory.pop();
  push(ref(db, "milky_market"), {
    seller: state.player.name,
    itemName: item.name,
    icon: item.icon || '📦',
    count: item.count || 1,
    price: 50
  });
  addLog(`🏪 將【${item.name}】上架至市場 (定價 50 金幣)`);
  updateUI();
  saveData();
  loadMarket();
};

window.buyMarketItem = async function(id, price, name, count) {
  if (state.player.gold < price) {
    addLog(`❌ 金幣不足，無法購買。`);
    return;
  }
  state.player.gold -= price;
  let existing = state.inventory.find(i => i.name === name);
  if (existing) existing.count += count;
  else state.inventory.push({ id: Date.now(), name: name, icon: '📦', count: count });

  await remove(ref(db, `milky_market/${id}`));
  addLog(`🛒 成功從市場購買【${name}】！`);
  updateUI();
  saveData();
  loadMarket();
};

// --- Firebase 帳號驗證 ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    const snap = await get(ref(db, `milky_users/${currentUid}`));
    if (snap.exists()) {
      const data = snap.val();
      if (data.player) Object.assign(state.player, data.player);
      if (data.skills) Object.assign(state.skills, data.skills);
      if (data.inventory) state.inventory = data.inventory;
    } else {
      state.player.name = document.getElementById("nickname-input").value.trim() || user.displayName || "Gooseuwu";
      await saveData();
    }
    document.getElementById("login-modal").style.display = "none";
    updateUI();
    requestAnimationFrame(gameLoop);
  } else {
    document.getElementById("login-modal").style.display = "flex";
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

  state.player.name = name || "Gooseuwu";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    await createUserWithEmailAndPassword(auth, email, password);
  }
});

window.handleLogout = function() {
  signOut(auth).then(() => location.reload());
};

async function saveData() {
  if (!currentUid) return;
  state.player.totalLevel = getTotalLevel();
  await set(ref(db, `milky_users/${currentUid}`), state);
}

// --- UI 渲染與經驗條更新 ---
function updateUI() {
  document.getElementById('username-display').innerText = state.player.name;
  document.getElementById('settings-name-text').innerText = state.player.name;
  document.getElementById('total-level-val').innerText = getTotalLevel();
  document.getElementById('gold-val').innerText = state.player.gold;

  // 更新各技能經驗條與等級
  for (let k in state.skills) {
    const sk = state.skills[k];
    const lvEl = document.getElementById(`sk-lv-${k}`);
    const barEl = document.getElementById(`sk-bar-${k}`);
    if (lvEl) lvEl.innerText = sk.level;
    if (barEl) barEl.style.width = `${Math.min(100, (sk.exp / sk.maxExp) * 100)}%`;
  }

  // 渲染倉庫 (1:1 正版小卡片堆疊格式)
  const grid = document.getElementById('inventory-grid');
  if (grid) {
    grid.innerHTML = '';
    state.inventory.forEach(item => {
      const div = document.createElement('div');
      div.className = 'inv-box';
      div.innerHTML = `
        <div class="inv-count">x${item.count}</div>
        <div class="inv-icon">${item.icon || '📦'}</div>
        <div class="inv-name">${item.name}</div>
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

// 預設開啟採摘技能頁面
openSkillPage('foraging');
updateUI();
