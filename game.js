import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, push, remove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

const state = {
  player: { name: "goosewwwww", gold: 0 },
  skills: {
    milking: { level: 1, exp: 0, maxExp: 100 },
    foraging: { level: 1, exp: 0, maxExp: 100 },
    woodcutting: { level: 1, exp: 0, maxExp: 100 },
    cheesesmithing: { level: 1, exp: 0, maxExp: 100 },
    cooking: { level: 1, exp: 0, maxExp: 100 },
    combat: { level: 1, exp: 0, maxExp: 100 }
  },
  inventory: [
    { id: 'milk', name: "牛奶", icon: "🥛", count: 22 },
    { id: 'sword', name: "哥布林戰刀", icon: "🗡️", count: 1 }
  ],
  currentAction: null,
  actionTimer: 0
};

const SKILL_DATA = {
  milking: {
    title: "擠奶",
    cards: [{ id: "milk", name: "牛奶", icon: "🥛", time: 2000, exp: 15 }]
  },
  foraging: {
    title: "採摘",
    cards: [
      { id: "egg", name: "雞蛋", icon: "🥚", time: 2000, exp: 15 },
      { id: "wheat", name: "小麥", icon: "🌾", time: 2200, exp: 18 }
    ]
  },
  woodcutting: {
    title: "伐木",
    cards: [{ id: "wood", name: "原木", icon: "🪵", time: 2400, exp: 20 }]
  },
  cheesesmithing: {
    title: "乳酪鍛造",
    cards: [{ id: "cheese", name: "起司", icon: "🧀", time: 3000, exp: 30 }]
  },
  cooking: {
    title: "烹飪",
    cards: [{ id: "fried_egg", name: "煎蛋", icon: "🍳", time: 2500, exp: 22 }]
  },
  combat: {
    title: "戰鬥",
    cards: [{ id: "goblin", name: "哥布林營地", icon: "👺", time: 1800, exp: 35, rewardId: "sword", rewardName: "哥布林戰刀", rewardIcon: "🗡️" }]
  }
};

function getTotalLevel() {
  let total = 0;
  for (let k in state.skills) total += state.skills[k].level || 1;
  return total;
}

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

window.toggleSidebar = function() {
  document.getElementById('sidebar')?.classList.toggle('collapsed');
};

window.switchMainTab = function(tabId) {
  document.querySelectorAll('.main-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');

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

async function loadLeaderboard() {
  const listEl = document.getElementById("rank-list");
  if (!listEl) return;
  listEl.innerHTML = '<div style="color:#64748b;">載入中...</div>';

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
    listEl.innerHTML = '<div style="color:#64748b;">排行榜連線失敗</div>';
  }
}

async function loadMarket() {
  const listEl = document.getElementById("market-list");
  if (!listEl) return;
  listEl.innerHTML = '<div style="color:#64748b;">載入中...</div>';

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
      listEl.innerHTML = '<div style="color:#64748b;">目前市場上沒有商品</div>';
    }
  } catch (err) {
    listEl.innerHTML = '<div style="color:#64748b;">市場連線失敗</div>';
  }
}

window.sellItemModal = function() {
  if (state.inventory.length === 0) {
    addLog(`❌ 背包無物品。`);
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
  addLog(`🏪 上架了【${item.name}】`);
  updateUI();
  saveData();
  loadMarket();
};

window.buyMarketItem = async function(id, price, name, count) {
  if (state.player.gold < price) {
    addLog(`❌ 金幣不足。`);
    return;
  }
  state.player.gold -= price;
  let existing = state.inventory.find(i => i.name === name);
  if (existing) existing.count += count;
  else state.inventory.push({ id: Date.now(), name: name, icon: '📦', count: count });

  await remove(ref(db, `milky_market/${id}`));
  addLog(`🛒 購買了【${name}】`);
  updateUI();
  saveData();
  loadMarket();
};

document.getElementById("auth-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("nickname-input").value.trim();
  if (name) state.player.name = name;
  document.getElementById("login-modal").style.display = "none";
  updateUI();
  saveData();
  requestAnimationFrame(gameLoop);
});

async function saveData() {
  localStorage.setItem("mwi_save", JSON.stringify(state));
  if (currentUid) {
    state.player.totalLevel = getTotalLevel();
    await set(ref(db, `milky_users/${currentUid}`), state);
  }
}

function updateUI() {
  document.getElementById('username-display').innerText = state.player.name;
  document.getElementById('settings-name-text').innerText = state.player.name;
  document.getElementById('total-level-val').innerText = getTotalLevel();
  document.getElementById('gold-val').innerText = state.player.gold;

  for (let k in state.skills) {
    const sk = state.skills[k];
    const lvEl = document.getElementById(`sk-lv-${k}`);
    const barEl = document.getElementById(`sk-bar-${k}`);
    if (lvEl) lvEl.innerText = sk.level;
    if (barEl) barEl.style.width = `${Math.min(100, (sk.exp / sk.maxExp) * 100)}%`;
  }

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

// 初始化預設頁面
openSkillPage('milking');
startAction('milking', SKILL_DATA.milking.cards[0]);
updateUI();
