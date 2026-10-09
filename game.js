import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, get, push, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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

// 12 大獨立產業鏈初始狀態
const state = {
  player: { name: "Gooseuwu", gold: 100 },
  skills: {
    milking: { level: 1, exp: 0, maxExp: 100 },
    foraging: { level: 1, exp: 0, maxExp: 100 },
    woodcutting: { level: 1, exp: 0, maxExp: 100 },
    mining: { level: 1, exp: 0, maxExp: 100 },
    fishing: { level: 1, exp: 0, maxExp: 100 },
    cheesesmithing: { level: 1, exp: 0, maxExp: 100 },
    cooking: { level: 1, exp: 0, maxExp: 100 },
    brewing: { level: 1, exp: 0, maxExp: 100 },
    tailoring: { level: 1, exp: 0, maxExp: 100 },
    crafting: { level: 1, exp: 0, maxExp: 100 },
    alchemy: { level: 1, exp: 0, maxExp: 100 },
    enhancing: { level: 1, exp: 0, maxExp: 100 },
    combat: { level: 1, exp: 0, maxExp: 100 }
  },
  inventory: [
    { id: 'milk', name: "牛奶", icon: "🥛", count: 20 },
    { id: 'egg', name: "雞蛋", icon: "🥚", count: 10 },
    { id: 'wheat', name: "小麥", icon: "🌾", count: 10 }
  ],
  currentAction: null,
  actionTimer: 0
};

// 全產業鏈龐大階梯資料庫 (含複方材料與品質加成)
const SKILL_DATA = {
  milking: {
    title: "擠奶",
    cards: [
      { id: "milk", reqLv: 1, name: "牛奶", icon: "🥛", time: 2000, exp: 15 },
      { id: "space_milk", reqLv: 20, name: "太空牛奶", icon: "🌌", time: 2800, exp: 35 },
      { id: "star_milk", reqLv: 50, name: "星光牛奶", icon: "✨", time: 3800, exp: 70 },
      { id: "god_milk", reqLv: 100, name: "神聖星乳", icon: "💎", time: 5000, exp: 150 }
    ]
  },
  foraging: {
    title: "採摘/種植",
    cards: [
      { id: "egg", reqLv: 1, name: "雞蛋", icon: "🥚", time: 2000, exp: 15 },
      { id: "wheat", reqLv: 1, name: "小麥", icon: "🌾", time: 2200, exp: 18 },
      { id: "sugar", reqLv: 10, name: "糖粉", icon: "🍚", time: 2500, exp: 25 },
      { id: "coffee_bean", reqLv: 20, name: "咖啡豆", icon: "🫘", time: 2800, exp: 32 },
      { id: "star_flower", reqLv: 50, name: "星光花", icon: "🌸", time: 4000, exp: 80 }
    ]
  },
  woodcutting: {
    title: "伐木",
    cards: [
      { id: "wood", reqLv: 1, name: "原木", icon: "🪵", time: 2400, exp: 20 },
      { id: "hardwood", reqLv: 20, name: "硬木", icon: "🌳", time: 3200, exp: 40 },
      { id: "ancient_wood", reqLv: 60, name: "遠古神木", icon: "🎋", time: 4500, exp: 100 }
    ]
  },
  mining: {
    title: "採礦冶煉",
    cards: [
      { id: "copper_ore", reqLv: 1, name: "粗銅礦", icon: "🪨", time: 2200, exp: 18 },
      { id: "iron_ore", reqLv: 20, name: "粗鐵礦", icon: "⛓️", time: 3000, exp: 38 },
      { id: "gold_ore", reqLv: 50, name: "金礦石", icon: "🪙", time: 4000, exp: 85 }
    ]
  },
  fishing: {
    title: "釣魚",
    cards: [
      { id: "small_fish", reqLv: 1, name: "小溪魚", icon: "🐟", time: 2300, exp: 20 },
      { id: "salmon", reqLv: 20, name: "波光鮭魚", icon: "🍣", time: 3100, exp: 42 },
      { id: "dragon_fish", reqLv: 70, name: "遠古海龍肉", icon: "🐉", time: 4800, exp: 120 }
    ]
  },
  cheesesmithing: {
    title: "乳酪鍛造",
    cards: [
      { id: "cheese", reqLv: 1, name: "起司", icon: "🧀", time: 3000, exp: 30, reqs: [{ id: 'milk', name: '牛奶', count: 1 }] },
      { id: "cheese_sword", reqLv: 15, name: "起司長劍", icon: "🗡️", time: 4500, exp: 55, reqs: [{ id: 'cheese', name: '起司', count: 2 }] }
    ]
  },
  cooking: {
    title: "烹飪",
    cards: [
      { id: "fried_egg", reqLv: 1, name: "煎蛋", icon: "🍳", time: 2500, exp: 22, reqs: [{ id: 'egg', name: '雞蛋', count: 1 }] },
      { id: "cheese_cake", reqLv: 15, name: "起司蛋糕", icon: "🍰", time: 3800, exp: 50, reqs: [{ id: 'cheese', name: '起司', count: 1 }, { id: 'wheat', name: '小麥', count: 2 }] },
      { id: "tiramisu", reqLv: 30, name: "提拉米蘇", icon: "🍮", time: 5000, exp: 90, reqs: [{ id: 'coffee_bean', name: '咖啡豆', count: 2 }, { id: 'milk', name: '牛奶', count: 2 }] }
    ]
  },
  brewing: {
    title: "沖泡",
    cards: [
      { id: "milk_tea", reqLv: 1, name: "鮮奶茶", icon: "🧋", time: 2800, exp: 28, reqs: [{ id: 'milk', name: '牛奶', count: 1 }, { id: 'sugar', name: '糖粉', count: 1 }] },
      { id: "espresso", reqLv: 20, name: "濃縮咖啡", icon: "☕", time: 3200, exp: 45, reqs: [{ id: 'coffee_bean', name: '咖啡豆', count: 2 }] }
    ]
  },
  tailoring: {
    title: "縫紉",
    cards: [
      { id: "cotton_cloth", reqLv: 1, name: "精製棉布", icon: "👕", time: 3000, exp: 30 }
    ]
  },
  crafting: {
    title: "製作",
    cards: [
      { id: "wood_ring", reqLv: 1, name: "木戒指", icon: "💍", time: 3200, exp: 35, reqs: [{ id: 'wood', name: '原木', count: 2 }] }
    ]
  },
  alchemy: {
    title: "煉金",
    cards: [
      { id: "hp_potion", reqLv: 1, name: "小型 HP 藥水", icon: "🧪", time: 3000, exp: 32 }
    ]
  },
  enhancing: {
    title: "強化",
    cards: [
      { id: "scroll_atk", reqLv: 1, name: "強化卷軸", icon: "📜", time: 4000, exp: 50 }
    ]
  },
  combat: {
    title: "戰鬥冒險",
    cards: [
      { id: "goblin", reqLv: 1, name: "哥布林營地", icon: "👺", time: 2000, exp: 35, rewardId: "goblin_sword", rewardName: "哥布林戰刀", rewardIcon: "🗡️" }
    ]
  }
};

function getTotalLevel() {
  let total = 0;
  for (let k in state.skills) total += state.skills[k].level || 1;
  return total;
}

// 超越等級 (100+) 速度加成計算
function getTranscendBonusSpeed() {
  let bonusPct = 0;
  for (let k in state.skills) {
    if (state.skills[k].level > 100) {
      bonusPct += (state.skills[k].level - 100) * 0.5;
    }
  }
  return bonusPct;
}

// 主掛機循環
let lastTime = Date.now();
function gameLoop() {
  const now = Date.now();
  const dt = now - lastTime;
  lastTime = now;

  if (state.currentAction) {
    const act = state.currentAction;
    state.actionTimer += dt;
    
    // 計算動作加速
    const speedMult = 1 + (getTranscendBonusSpeed() / 100);
    const effectiveTime = act.time / speedMult;

    const pct = Math.min(100, (state.actionTimer / effectiveTime) * 100);

    const bar = document.getElementById('action-progress-bar');
    if (bar) bar.style.width = `${pct}%`;

    if (state.actionTimer >= effectiveTime) {
      state.actionTimer = 0;
      executeReward(act);
    }
  }

  requestAnimationFrame(gameLoop);
}

function executeReward(act) {
  // 檢查並扣除複方消耗材料
  if (act.reqs && act.reqs.length > 0) {
    for (let r of act.reqs) {
      let item = state.inventory.find(i => i.id === r.id);
      if (!item || item.count < r.count) {
        addLog(`❌ 材料不足！需要 ${r.name} x${r.count}`);
        stopCurrentAction();
        return;
      }
    }
    for (let r of act.reqs) {
      let item = state.inventory.find(i => i.id === r.id);
      item.count -= r.count;
    }
  }

  // 技能經驗獲得
  const sk = state.skills[act.skillKey];
  if (sk) {
    sk.exp += act.exp;
    if (sk.exp >= sk.maxExp) {
      sk.exp -= sk.maxExp;
      sk.level++;
      sk.maxExp = Math.floor(sk.maxExp * 1.35);
      addLog(`🎉 【${SKILL_DATA[act.skillKey].title}】提升至 Lv.${sk.level}！`);
    }
  }

  // 品質機率觸發 ([完美的])
  let isPerfect = Math.random() < 0.1;
  const rId = act.rewardId || act.id;
  let rName = act.rewardName || act.name;
  if (isPerfect) rName = `[完美的] ${rName}`;
  const rIcon = act.rewardIcon || act.icon;

  let existing = state.inventory.find(i => i.name === rName);
  if (existing) {
    existing.count += 1;
  } else {
    state.inventory.push({ id: rId, name: rName, icon: rIcon, count: 1, isPerfect: isPerfect });
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

  const currentLv = state.skills[skillKey]?.level || 1;
  document.getElementById('page-skill-title').innerText = `${data.title} (Lv.${currentLv})`;

  const masteryTag = document.getElementById('skill-mastery-title');
  if (currentLv >= 100) {
    masteryTag.innerText = `👑 【${data.title}神尊】(超越加成中)`;
  } else {
    masteryTag.innerText = '';
  }

  const grid = document.getElementById('action-cards-grid');
  grid.innerHTML = '';

  data.cards.forEach(card => {
    const isLocked = currentLv < card.reqLv;
    const div = document.createElement('div');
    div.className = `mwi-card-item ${isLocked ? 'locked' : ''}`;
    
    if (!isLocked) {
      div.onclick = () => startAction(skillKey, card);
    }

    let reqsText = card.reqs ? card.reqs.map(r => `${r.name}x${r.count}`).join(' ') : '';

    div.innerHTML = `
      <div class="req-lv-badge">Lv.${card.reqLv}</div>
      <div class="card-icon">${card.icon}</div>
      <div class="card-name">${card.name}</div>
      ${reqsText ? `<div class="card-reqs">${reqsText}</div>` : ''}
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
  listEl.innerHTML = '<div style="color:#64748b;">載入真實排行榜中...</div>';

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
      listEl.innerHTML = '<div style="color:#64748b;">目前尚無其他玩家上榜資料</div>';
    }
  } catch (err) {
    listEl.innerHTML = '<div style="color:#64748b;">排行榜無法連線</div>';
  }
}

async function loadMarket() {
  const listEl = document.getElementById("market-list");
  if (!listEl) return;
  listEl.innerHTML = '<div style="color:#64748b;">載入市場物品中...</div>';

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
      listEl.innerHTML = '<div style="color:#64748b;">目前市場上沒有玩家掛單。</div>';
    }
  } catch (err) {
    listEl.innerHTML = '<div style="color:#64748b;">市場連線失敗</div>';
  }
}

window.openSellDialog = function() {
  if (state.inventory.length === 0) {
    addLog(`❌ 背包裡面沒有可上架的物品。`);
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
  addLog(`🏪 將【${item.name}】掛單至交易所 (價格: 50💰)`);
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
  addLog(`🛒 成功購入【${name}】！`);
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
  document.getElementById('inv-capacity').innerText = state.inventory.length;

  document.getElementById('transcend-bonus-text').innerText = `動作速度 +${getTranscendBonusSpeed()}%`;

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
      div.className = `inv-box ${item.isPerfect ? 'perfect' : ''}`;
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

// 預設預熱開啟擠奶
openSkillPage('milking');
startAction('milking', SKILL_DATA.milking.cards[0]);
updateUI();
