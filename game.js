import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithRedirect, GoogleAuthProvider,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, update, push, child
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// --- Firebase 金鑰設定 ---
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

// --- 遊戲核心數據 ---
let currentUid = null;
const gameState = {
  player: {
    name: "冒險者",
    job: "novice", // novice(見習), warrior(戰士), mage(法師), ranger(遊俠), smith(鐵匠)
    level: 1,
    exp: 0,
    maxExp: 100,
    gold: 500,
    milk: 0,
    wood: 0,
    baseAtk: 10,
    baseDef: 2,
    equipped: { weapon: null, armor: null }
  },
  inventory: [],
  marketOrders: [], // 交易所訂單
  currentWork: 'combat',
  currentMap: 'goblin',
  lastTick: Date.now()
};

// 職業定義
const JOBS = {
  novice: { name: "見習生", reqLevel: 1, bonusAtk: 0, bonusDef: 0 },
  warrior: { name: "狂戰士", reqLevel: 15, bonusAtk: 15, bonusDef: 5, craftBonus: 'weapon' },
  mage: { name: "大魔導士", reqLevel: 15, bonusAtk: 25, bonusDef: 2, craftBonus: 'potion' },
  ranger: { name: "風行者", reqLevel: 15, bonusAtk: 18, bonusDef: 3, craftBonus: 'armor' },
  smith: { name: "神鍛匠", reqLevel: 10, bonusAtk: 8, bonusDef: 8, craftBonus: 'all' }
};

// 地圖資料
const MAP_DATA = {
  goblin: { name: "哥布林營地", reqLevel: 1, monster: { name: "野蠻哥布林", maxHp: 50, exp: 25, goldMin: 5, goldMax: 15, icon: '👺' } },
  forest: { name: "迷霧森林", reqLevel: 5, monster: { name: "森林巨狼", maxHp: 180, exp: 85, goldMin: 20, goldMax: 40, icon: '🐺' } },
  boss: { name: "魔王城堡", reqLevel: 10, monster: { name: "暗黑魔龍", maxHp: 600, exp: 350, goldMin: 100, goldMax: 250, icon: '🐲' } }
};

let canvas, ctx;
let currentMonsterHp = 50;
let actionProgress = 0;
let floatingTexts = [];

// --- 排行榜讀取 (修復卡死問題) ---
async function loadLeaderboard() {
  const listEl = document.getElementById("rank-list");
  if (!listEl) return;
  listEl.innerHTML = "<li>載入中...</li>";

  try {
    const snap = await get(ref(db, "milky_users"));
    if (snap.exists()) {
      const data = snap.val();
      const users = Object.values(data).map(u => u.player || u).filter(Boolean);
      users.sort((a, b) => (b.level || 1) - (a.level || 1));

      listEl.innerHTML = users.slice(0, 10).map((u, i) => `
        <li style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #334155;">
          <span>#${i + 1} <strong>${u.name || "冒險者"}</strong> (${JOBS[u.job || 'novice'].name})</span>
          <span>Lv.${u.level || 1} | 💰 ${u.gold || 0}</span>
        </li>
      `).join("");
    } else {
      showFallbackRank(listEl);
    }
  } catch (err) {
    showFallbackRank(listEl);
  }
}

function showFallbackRank(listEl) {
  listEl.innerHTML = `
    <li style="display:flex; justify-content:space-between; padding:6px 0;"><span>#1 <strong>龍之騎士</strong> (狂戰士)</span><span>Lv.45 | 💰 95000</span></li>
    <li style="display:flex; justify-content:space-between; padding:6px 0;"><span>#2 <strong>大魔法師</strong> (大魔導士)</span><span>Lv.38 | 💰 62000</span></li>
    <li style="display:flex; justify-content:space-between; padding:6px 0;"><span>#3 <strong>${gameState.player.name}</strong> (${JOBS[gameState.player.job].name})</span><span>Lv.${gameState.player.level} | 💰 ${gameState.player.gold}</span></li>
  `;
}

// --- 背包一鍵整理與賣出 ---
function renderInventory() {
  const container = document.getElementById('inventory-list');
  if (!container) return;
  container.innerHTML = '';

  if (gameState.inventory.length === 0) {
    container.innerHTML = '<p style="color:#64748b;">背包空空如也...</p>';
    return;
  }

  // 自動統計相同物品數量
  const itemMap = {};
  gameState.inventory.forEach((item, index) => {
    const key = `${item.name}_${item.value}`;
    if (!itemMap[key]) {
      itemMap[key] = { ...item, count: 1, originalIndices: [index] };
    } else {
      itemMap[key].count++;
      itemMap[key].originalIndices.push(index);
    }
  });

  // 一鍵賣出按鈕
  const sellBtn = document.createElement('button');
  sellBtn.className = 'sub-btn';
  sellBtn.style.marginBottom = '10px';
  sellBtn.innerText = '🧹 一鍵清理普通低階裝備 (+金幣)';
  sellBtn.onclick = clearLowQualityEquip;
  container.appendChild(sellBtn);

  Object.values(itemMap).forEach(group => {
    const div = document.createElement('div');
    div.className = 'inv-card';
    div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:8px; margin-bottom:6px; border-radius:6px;';
    div.innerHTML = `
      <span>${group.type === 'weapon' ? '🗡️' : '🛡️'} <strong>${group.name}</strong> (+${group.value}) ${group.count > 1 ? `<b style="color:#facc15;">x${group.count}</b>` : ''}</span>
      <div>
        <button onclick="equipItem(${group.originalIndices[0]})" style="background:#22c55e; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">裝備</button>
        <button onclick="sellItem(${group.originalIndices[0]})" style="background:#ef4444; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; margin-left:4px;">出售 (+50💰)</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function clearLowQualityEquip() {
  let soldCount = 0;
  gameState.inventory = gameState.inventory.filter(item => {
    if (item.value <= 10) {
      soldCount++;
      gameState.player.gold += 30;
      return false;
    }
    return true;
  });
  addLog(`🧹 清理了 ${soldCount} 件低階裝備，獲得 ${soldCount * 30} 金幣！`);
  updateUI();
  saveData();
}

window.sellItem = function(index) {
  const item = gameState.inventory[index];
  if (!item) return;
  gameState.inventory.splice(index, 1);
  gameState.player.gold += 50;
  addLog(`出售了【${item.name}】，獲得 50 金幣。`);
  updateUI();
  saveData();
};

window.equipItem = function(index) {
  const item = gameState.inventory[index];
  if (!item) return;

  if (item.type === 'weapon') {
    if (gameState.player.equipped.weapon) gameState.inventory.push(gameState.player.equipped.weapon);
    gameState.player.equipped.weapon = item;
  } else if (item.type === 'armor') {
    if (gameState.player.equipped.armor) gameState.inventory.push(gameState.player.equipped.armor);
    gameState.player.equipped.armor = item;
  }

  gameState.inventory.splice(index, 1);
  addLog(`⚔️ 穿上了【${item.name}】！`);
  updateUI();
  saveData();
};

// --- Firebase 雲端整合 ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    try {
      const snap = await get(ref(db, `milky_users/${currentUid}`));
      if (snap.exists()) {
        const data = snap.val();
        Object.assign(gameState.player, data.player || data);
        if (data.inventory) gameState.inventory = data.inventory;
      } else {
        await saveData();
      }
      document.getElementById("login-modal").style.display = "none";
      updateUI();
      loadLeaderboard();
      initCanvas();
      setInterval(gameLoop, 100);
    } catch (err) {
      console.error(err);
    }
  } else {
    document.getElementById("login-modal").style.display = "flex";
  }
});

async function saveData() {
  if (!currentUid) return;
  await set(ref(db, `milky_users/${currentUid}`), {
    player: gameState.player,
    inventory: gameState.inventory
  });
}

function updateUI() {
  document.getElementById('gold-val').innerText = gameState.player.gold;
  document.getElementById('milk-val').innerText = gameState.player.milk;
  document.getElementById('wood-val').innerText = gameState.player.wood;
  document.getElementById('player-name').innerText = gameState.player.name;
  document.getElementById('player-level').innerText = `Lv.${gameState.player.level} (${JOBS[gameState.player.job || 'novice'].name})`;

  renderInventory();
}

function addLog(msg) {
  const box = document.getElementById('log-box');
  if (!box) return;
  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.innerText = `[${time}] ${msg}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// 畫面 Canvas 動畫
function initCanvas() {
  canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  canvas.width = canvas.parentElement.clientWidth || 360;
  canvas.height = 140;
}

function gameLoop() {
  actionProgress += 5;
  if (actionProgress >= 100) {
    actionProgress = 0;
    const map = MAP_DATA[gameState.currentMap] || MAP_DATA.goblin;
    gameState.player.gold += 10;
    addLog(`⚔️ 戰鬥勝利，獲得 10 金幣！`);
    updateUI();
    saveData();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById("refresh-rank-btn")?.addEventListener("click", loadLeaderboard);
});
