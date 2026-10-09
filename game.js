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

// --- 2. 遊戲狀態 ---
const state = {
  player: {
    name: "星河冒險家",
    gold: 200,
    statPoints: 5,
    stats: { str: 10, agi: 10, int: 10, luk: 10 }
  },
  skills: {
    milking: { level: 1, exp: 0, maxExp: 100 },
    woodcutting: { level: 1, exp: 0, maxExp: 100 },
    cheesesmithing: { level: 1, exp: 0, maxExp: 100 },
    cooking: { level: 1, exp: 0, maxExp: 100 },
    alchemy: { level: 1, exp: 0, maxExp: 100 },
    combat: { level: 1, exp: 0, maxExp: 100 }
  },
  inventory: [
    { id: 101, name: "生鏽短劍", type: "weapon", atk: 10, quality: "common" },
    { id: 102, name: "星河戰刀", type: "weapon", atk: 28, quality: "rare" }
  ],
  currentAction: 'milking',
  actionTimer: 0
};

const ACTIONS = {
  milking: { title: "🥛 牧場擠奶", skill: "milking", exp: 15, baseTime: 2000 },
  woodcutting: { title: "🌲 森林伐木", skill: "woodcutting", exp: 18, baseTime: 2200 },
  cheesesmithing: { title: "🧀 起司加工", skill: "cheesesmithing", exp: 30, baseTime: 2800 },
  cooking: { title: "🍳 料理烹飪", skill: "cooking", exp: 25, baseTime: 2500 },
  alchemy: { title: "🧪 藥水煉金", skill: "alchemy", exp: 35, baseTime: 3200 },
  combat: { title: "⚔️ 野外討伐", skill: "combat", exp: 40, baseTime: 1800 }
};

// 計算總等級
function getTotalLevel() {
  let total = 0;
  for (let k in state.skills) {
    total += state.skills[k].level || 1;
  }
  return total;
}

// --- 3. 遊戲主循環 ---
let lastTime = Date.now();
function gameLoop() {
  const now = Date.now();
  const dt = now - lastTime;
  lastTime = now;

  const act = ACTIONS[state.currentAction] || ACTIONS.milking;
  const speedBonus = (state.player.stats.agi * 0.5);
  const interval = Math.max(500, act.baseTime * (1 - speedBonus / 100));

  state.actionTimer += dt;
  const pct = Math.min(100, (state.actionTimer / interval) * 100);
  const bar = document.getElementById('action-progress');
  if (bar) bar.style.width = `${pct}%`;

  if (state.actionTimer >= interval) {
    state.actionTimer = 0;
    executeAction(act);
  }

  requestAnimationFrame(gameLoop);
}

function executeAction(act) {
  const sk = state.skills[act.skill];
  if (!sk) return;

  sk.exp += act.exp;
  if (sk.exp >= sk.maxExp) {
    sk.exp -= sk.maxExp;
    sk.level++;
    sk.maxExp = Math.floor(sk.maxExp * 1.3);
    state.player.statPoints += 2;
    addLog(`🎉 技能【${act.title}】升至 等級 ${sk.level}！獲得 2 點屬性配點！`);
  }

  // 掉落武器 (防止 undefined)
  if (Math.random() < 0.2) {
    const atkVal = 8 + Math.floor(Math.random() * 10) + Math.floor(state.player.stats.str * 0.8);
    const newItem = {
      id: Date.now(),
      name: act.skill === 'combat' ? "星河長劍" : "採集工具",
      type: "weapon",
      atk: atkVal,
      quality: atkVal > 20 ? "rare" : "common"
    };
    state.inventory.push(newItem);
    addLog(`🎁 獲得裝備：【${newItem.name}】(攻擊力 +${newItem.atk})`);
  }

  state.player.gold += Math.floor(10 + state.player.stats.luk * 0.5);
  updateUI();
  saveData();
}

// --- 4. 屬性配點 ---
window.addStat = function(statKey) {
  if (state.player.statPoints > 0) {
    state.player.statPoints--;
    state.player.stats[statKey]++;
    updateUI();
    saveData();
  }
};

// --- 5. 背包與一鍵清理 ---
window.autoCleanInventory = function() {
  let soldCount = 0;
  state.inventory = state.inventory.filter(item => {
    if (item.quality === 'common') {
      soldCount++;
      state.player.gold += 40;
      return false;
    }
    return true;
  });
  addLog(`🧹 清理了 ${soldCount} 件普通裝備，獲得 ${soldCount * 40} 金幣！`);
  updateUI();
  saveData();
};

// --- 6. P2P 交易所 ---
window.openSellModal = function() {
  if (state.inventory.length === 0) {
    addLog(`❌ 背包中沒有可上架的裝備。`);
    return;
  }
  const item = state.inventory.pop();
  const price = 200;
  push(ref(db, "milky_market"), {
    sellerName: state.player.name,
    itemName: item.name,
    atk: item.atk || 10,
    price: price,
    timestamp: Date.now()
  });
  addLog(`🏪 將【${item.name}】上架至玩家交易所（售價 ${price} 金幣）`);
  updateUI();
  saveData();
  loadMarket();
};

async function loadMarket() {
  const listEl = document.getElementById("market-list");
  if (!listEl) return;
  listEl.innerHTML = '<div class="sub-text">載入市場資料中...</div>';

  try {
    const snap = await get(ref(db, "milky_market"));
    if (snap.exists()) {
      const data = snap.val();
      listEl.innerHTML = Object.entries(data).map(([id, item]) => `
        <div class="list-row">
          <span>⚔️ <strong>${item.itemName}</strong> (攻擊力 +${item.atk || 10}) | 賣家: ${item.sellerName}</span>
          <button class="btn btn-success btn-sm" onclick="buyMarketItem('${id}', ${item.price}, '${item.itemName}', ${item.atk || 10})">購買 (${item.price}💰)</button>
        </div>
      `).join("");
    } else {
      listEl.innerHTML = '<div class="sub-text">目前交易所沒有物品上架</div>';
    }
  } catch (err) {
    listEl.innerHTML = '<div class="sub-text">無法取得市場資料</div>';
  }
}

window.buyMarketItem = async function(id, price, name, atk) {
  if (state.player.gold < price) {
    addLog(`❌ 金幣不足，無法購買！`);
    return;
  }
  state.player.gold -= price;
  state.inventory.push({ id: Date.now(), name: name, type: "weapon", atk: atk, quality: "rare" });
  await remove(ref(db, `milky_market/${id}`));
  addLog(`🛒 成功購買【${name}】！`);
  updateUI();
  saveData();
  loadMarket();
};

// --- 7. 排行榜 ---
async function loadRankings() {
  const listEl = document.getElementById("rank-list");
  if (!listEl) return;
  listEl.innerHTML = '<div class="sub-text">載入全服排行榜中...</div>';

  try {
    const snap = await get(ref(db, "milky_users"));
    if (snap.exists()) {
      const users = Object.values(snap.val()).map(u => u.player || u).filter(Boolean);
      users.sort((a, b) => (b.totalLevel || 0) - (a.totalLevel || 0));

      listEl.innerHTML = users.slice(0, 10).map((u, i) => `
        <div class="list-row">
          <span>#${i + 1} <strong>${u.name || "冒險家"}</strong></span>
          <span>⭐ 總等級：${u.totalLevel || 4} | 💰 ${u.gold || 0}</span>
        </div>
      `).join("");
    }
  } catch (err) {
    listEl.innerHTML = '<div class="sub-text">無法讀取排行榜</div>';
  }
}

// --- 8. Firebase 帳號與同步 ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    const inputName = document.getElementById("nickname-input")?.value.trim();

    try {
      const snap = await get(ref(db, `milky_users/${currentUid}`));
      if (snap.exists()) {
        const data = snap.val();
        if (data.player) Object.assign(state.player, data.player);
        if (data.skills) Object.assign(state.skills, data.skills);
        if (data.inventory) state.inventory = data.inventory;
      } else {
        if (inputName) state.player.name = inputName;
        await saveData();
      }

      document.getElementById("login-modal").style.display = "none";
      document.getElementById("settings-uid").innerText = currentUid;
      updateUI();
      loadRankings();
      loadMarket();
      requestAnimationFrame(gameLoop);
    } catch (err) {
      console.error(err);
    }
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
  const email = document.getElementById("email-input").value;
  const password = document.getElementById("password-input").value;
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

// --- 9. 介面更新 ---
function updateUI() {
  document.getElementById('username').innerText = state.player.name;
  document.getElementById('total-level').innerText = getTotalLevel();
  document.getElementById('gold-val').innerText = state.player.gold;
  document.getElementById('stat-points').innerText = state.player.statPoints;
  document.getElementById('stat-str').innerText = state.player.stats.str;
  document.getElementById('stat-agi').innerText = state.player.stats.agi;
  document.getElementById('stat-int').innerText = state.player.stats.int;
  document.getElementById('stat-luk').innerText = state.player.stats.luk;

  for (let k in state.skills) {
    const el = document.getElementById(`sk-${k}`);
    if (el) el.innerText = state.skills[k].level;
  }

  const grid = document.getElementById('inventory-grid');
  if (grid) {
    grid.innerHTML = '';
    state.inventory.forEach((item) => {
      const div = document.createElement('div');
      div.className = `item-box ${item.quality || 'common'}`;
      div.innerHTML = `
        <strong>${item.name}</strong><br>
        <span class="sub-text">⚔️ 攻擊力: +${item.atk || 10}</span>
      `;
      grid.appendChild(div);
    });
  }
}

function addLog(msg) {
  const box = document.getElementById('game-logs');
  if (!box) return;
  const div = document.createElement('div');
  div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
  box.prepend(div);
}

window.selectAction = function(key) {
  state.currentAction = key;
  document.getElementById('current-action-name').innerText = ACTIONS[key].title;
};

window.switchTab = function(evt, tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  evt.currentTarget.classList.add('active');
  document.getElementById(tabId)?.classList.add('active');
  if (tabId === 'tab-market') loadMarket();
  if (tabId === 'tab-rank') loadRankings();
};

window.donateGuild = function() {
  if (state.player.gold >= 100) {
    state.player.gold -= 100;
    addLog(`🏰 感謝捐贈！公會經驗增加 100 點！`);
    updateUI();
    saveData();
  }
};

document.getElementById("refresh-rank-btn")?.addEventListener("click", loadRankings);
