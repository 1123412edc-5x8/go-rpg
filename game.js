import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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

// 擴充包含裝備與基礎屬性的 state
const state = {
  player: { 
    name: "Gooseuwu", 
    gold: 100,
    baseStats: { str: 10, agi: 10, int: 10, vit: 10 }
  },
  equipment: {
    weapon: null,
    armor: null,
    helmet: null,
    ring: null
  },
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
    { id: 'cheese_sword', name: "起司長劍", icon: "🗡️", type: "weapon", statBonus: { str: 5, agi: 2 }, enhanceLv: 0, count: 1 }
  ],
  currentAction: null,
  actionTimer: 0
};

// 穿戴裝備
window.equipItem = function(itemIndex) {
  const item = state.inventory[itemIndex];
  if (!item || !item.type) {
    addLog(`❌ 此物品無法穿戴。`);
    return;
  }

  const slot = item.type;
  // 若該位置已有裝備，將舊裝備放回背包
  if (state.equipment[slot]) {
    state.inventory.push(state.equipment[slot]);
  }

  // 穿上新裝備並從背包扣除
  state.equipment[slot] = item;
  state.inventory.splice(itemIndex, 1);

  addLog(`🛡️ 穿上了【${item.name} +${item.enhanceLv || 0}】`);
  updateUI();
  saveData();
};

// 卸下裝備
window.unequipItem = function(slot) {
  const item = state.equipment[slot];
  if (!item) return;

  state.inventory.push(item);
  state.equipment[slot] = null;

  addLog(`📦 卸下了【${item.name}】`);
  updateUI();
  saveData();
};

// 強化裝備 (消耗強化卷軸)
window.enhanceItem = function(itemIndex) {
  const item = state.inventory[itemIndex];
  if (!item || !item.type) return;

  const scrollIdx = state.inventory.findIndex(i => i.id === 'scroll_atk');
  if (scrollIdx === -1) {
    addLog(`❌ 缺乏【強化卷軸】，無法進行強化。`);
    return;
  }

  // 扣除一張卷軸
  state.inventory[scrollIdx].count -= 1;
  if (state.inventory[scrollIdx].count <= 0) {
    state.inventory.splice(scrollIdx, 1);
  }

  item.enhanceLv = (item.enhanceLv || 0) + 1;
  addLog(`✨ 強化成功！【${item.name}】提升至 +${item.enhanceLv}`);
  updateUI();
  saveData();
};

// 計算加上裝備後的最終屬性
function getCalculatedStats() {
  let stats = { ...state.player.baseStats };
  for (let slot in state.equipment) {
    const eq = state.equipment[slot];
    if (eq && eq.statBonus) {
      const mult = 1 + ((eq.enhanceLv || 0) * 0.1); // 每級強化 +10% 數值
      for (let s in eq.statBonus) {
        stats[s] = (stats[s] || 0) + Math.floor(eq.statBonus[s] * mult);
      }
    }
  }
  return stats;
}

// UI 渲染更新
function updateUI() {
  document.getElementById('username-display').innerText = state.player.name;
  document.getElementById('settings-name-text').innerText = state.player.name;
  document.getElementById('total-level-val').innerText = getTotalLevel();
  document.getElementById('gold-val').innerText = state.player.gold;

  // 更新角色數值
  const stats = getCalculatedStats();
  document.getElementById('stat-str').innerText = stats.str || 10;
  document.getElementById('stat-agi').innerText = stats.agi || 10;
  document.getElementById('stat-int').innerText = stats.int || 10;
  document.getElementById('stat-vit').innerText = stats.vit || 10;

  // 更新裝備欄圖示
  for (let slot in state.equipment) {
    const el = document.getElementById(`slot-${slot}`);
    const eq = state.equipment[slot];
    if (el) {
      el.innerText = eq ? `${eq.icon} +${eq.enhanceLv || 0}` : '🚫';
    }
  }

  // 渲染背包格子（點擊可穿戴）
  const grid = document.getElementById('inventory-grid');
  if (grid) {
    grid.innerHTML = '';
    state.inventory.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = `inv-box ${item.isPerfect ? 'perfect' : ''}`;
      div.onclick = () => {
        if (item.type) window.equipItem(index);
      };
      div.innerHTML = `
        <div class="inv-count">x${item.count}</div>
        <div class="inv-icon">${item.icon || '📦'}</div>
        <div class="inv-name">${item.name}${item.enhanceLv ? ` +${item.enhanceLv}` : ''}</div>
      `;
      grid.appendChild(div);
    });
  }
}

// （其餘存檔、邏輯與掛機 loop 保持正常運作）
