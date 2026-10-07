import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithRedirect, GoogleAuthProvider, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, update, query, orderByChild, limitToLast 
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

// --- 遊戲核心數據與狀態 ---
let currentUid = null;
const gameState = {
  player: {
    name: "冒險者",
    level: 1,
    exp: 0,
    maxExp: 100,
    gold: 0,
    milk: 0,
    wood: 0,
    baseAtk: 10,
    baseDef: 2,
    equipped: {
      weapon: null, // { id, name, value }
      armor: null   // { id, name, value }
    },
    lastOnline: Date.now()
  },
  inventory: [],
  currentWork: 'combat', // combat, milking, woodcutting
  currentMap: 'goblin',  // goblin, forest, boss
  lastTick: Date.now()
};

// --- 地圖與怪物設定 ---
const MAP_DATA = {
  goblin: {
    name: "哥布林營地",
    reqLevel: 1,
    monster: { name: "野蠻哥布林", maxHp: 50, atk: 5, exp: 25, goldMin: 5, goldMax: 15, color: '#4CAF50', icon: '👺' },
    dropTable: [
      { id: 'rusty_sword', name: '生鏽長劍', type: 'weapon', value: 8, rate: 0.2 },
      { id: 'leather_armor', name: '皮質護甲', type: 'armor', value: 5, rate: 0.15 }
    ]
  },
  forest: {
    name: "迷霧森林",
    reqLevel: 5,
    monster: { name: "森林巨狼", maxHp: 180, atk: 18, exp: 85, goldMin: 20, goldMax: 40, color: '#2E7D32', icon: '🐺' },
    dropTable: [
      { id: 'iron_sword', name: '精鐵長劍', type: 'weapon', value: 20, rate: 0.15 },
      { id: 'wood_armor', name: '硬木重甲', type: 'armor', value: 15, rate: 0.2 }
    ]
  },
  boss: {
    name: "魔王城堡",
    reqLevel: 10,
    monster: { name: "暗黑魔龍", maxHp: 600, atk: 50, exp: 350, goldMin: 100, goldMax: 250, color: '#D32F2F', icon: '🐲' },
    dropTable: [
      { id: 'legend_sword', name: '滅世之劍', type: 'weapon', value: 65, rate: 0.08 },
      { id: 'dragon_armor', name: '龍鱗鎧甲', type: 'armor', value: 50, rate: 0.08 }
    ]
  }
};

// --- Canvas 戰鬥與動畫系統 ---
let canvas, ctx;
let currentMonsterHp = 50;
let actionProgress = 0; // 0 ~ 100
let floatingTexts = []; // 浮動傷害/文字粒子
let attackAnimationTimer = 0;

function initCanvas() {
  canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  
  canvas.width = canvas.parentElement.clientWidth || 360;
  canvas.height = 140;
  
  window.addEventListener('resize', () => {
    if (canvas && canvas.parentElement) {
      canvas.width = canvas.parentElement.clientWidth;
    }
  });
}

// 浮動文字物件 (傷害、獲得資源)
function addFloatingText(text, x, y, color = '#FFF', fontSize = 16) {
  floatingTexts.push({
    text, x, y, color, fontSize,
    alpha: 1.0,
    offsetY: 0
  });
}

function updateAndRenderCanvas() {
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  // 1. 繪製玩家角色 (左側)
  const playerX = centerX - 80 + (attackAnimationTimer > 0 ? 15 : 0);
  const playerY = centerY + 10;
  
  ctx.fillStyle = '#3b82f6';
  ctx.beginPath();
  ctx.arc(playerX, playerY - 15, 14, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Lv.${gameState.player.level} ${gameState.player.name}`, playerX, playerY - 35);

  // 2. 繪製目標 (右側) - 根據當前工作切換
  const targetX = centerX + 80;
  const targetY = centerY + 10;

  if (gameState.currentWork === 'combat') {
    const map = MAP_DATA[gameState.currentMap] || MAP_DATA.goblin;
    const monster = map.monster;

    ctx.font = "40px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(monster.icon, targetX, targetY - 10);

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(monster.name, targetX, targetY - 42);

    // 血條
    ctx.fillStyle = '#475569';
    ctx.fillRect(targetX - 35, targetY - 35, 70, 6);
    const hpRatio = Math.max(0, currentMonsterHp / monster.maxHp);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(targetX - 35, targetY - 35, 70 * hpRatio, 6);

  } else if (gameState.currentWork === 'milking') {
    ctx.font = "44px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🐮", targetX, targetY - 10);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText("星空乳牛", targetX, targetY - 42);

  } else if (gameState.currentWork === 'woodcutting') {
    ctx.font = "44px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🌲", targetX, targetY - 10);

    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText("古木森林", targetX, targetY - 42);
  }

  // 3. 繪製攻擊特效
  if (attackAnimationTimer > 0) {
    attackAnimationTimer--;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(playerX + 15, playerY - 10);
    ctx.lineTo(targetX - 15, targetY - 10);
    ctx.stroke();
  }

  // 4. 更新與繪製浮動傷害/資源文字
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    let ft = floatingTexts[i];
    ft.y -= 1;
    ft.alpha -= 0.02;

    ctx.save();
    ctx.globalAlpha = Math.max(0, ft.alpha);
    ctx.fillStyle = ft.color;
    ctx.font = `bold ${ft.fontSize}px sans-serif`;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();

    if (ft.alpha <= 0) {
      floatingTexts.splice(i, 1);
    }
  }

  requestAnimationFrame(updateAndRenderCanvas);
}

// --- 遊戲邏輯與計時器 (Game Loop) ---
function gameLoop() {
  const now = Date.now();
  const dt = (now - gameState.lastTick) / 1000;
  gameState.lastTick = now;

  actionProgress += dt * 50; 
  updateProgressBar(actionProgress);

  if (actionProgress >= 100) {
    actionProgress = 0;
    performCurrentAction();
  }
}

function performCurrentAction() {
  const centerX = canvas ? canvas.width / 2 : 180;
  attackAnimationTimer = 8;

  if (gameState.currentWork === 'combat') {
    const map = MAP_DATA[gameState.currentMap] || MAP_DATA.goblin;
    const monster = map.monster;

    const totalAtk = getPlayerTotalAtk();
    const isCrit = Math.random() < 0.15;
    const damage = Math.round(totalAtk * (isCrit ? 1.5 : (0.9 + Math.random() * 0.2)));

    currentMonsterHp -= damage;

    addFloatingText(
      isCrit ? `💥${damage}!` : `-${damage}`,
      centerX + 80 + (Math.random() * 20 - 10),
      70,
      isCrit ? '#f59e0b' : '#ffffff',
      isCrit ? 18 : 14
    );

    if (currentMonsterHp <= 0) {
      currentMonsterHp = monster.maxHp;

      const goldGained = Math.floor(Math.random() * (monster.goldMax - monster.goldMin + 1)) + monster.goldMin;
      gameState.player.gold += goldGained;
      addExp(monster.exp);

      addFloatingText(`+${goldGained} 💰`, centerX + 80, 50, '#facc15', 14);
      addLog(`⚔️ 擊敗 ${monster.name}！獲得 ${goldGained} 金幣與 ${monster.exp} 經驗。`);

      checkEquipmentDrop(map.dropTable);
    }

  } else if (gameState.currentWork === 'milking') {
    const gained = Math.floor(Math.random() * 3) + 1;
    gameState.player.milk += gained;
    addFloatingText(`+${gained} 🥛`, centerX + 80, 70, '#38bdf8', 16);
    addLog(`🥛 採集新鮮牛奶 x${gained}`);

  } else if (gameState.currentWork === 'woodcutting') {
    const gained = Math.floor(Math.random() * 3) + 1;
    gameState.player.wood += gained;
    addFloatingText(`+${gained} 🪵`, centerX + 80, 70, '#4ade80', 16);
    addLog(`🌲 採集優質木材 x${gained}`);
  }

  updateUI();
  saveData();
}

function addExp(amount) {
  gameState.player.exp += amount;
  if (gameState.player.exp >= gameState.player.maxExp) {
    gameState.player.exp -= gameState.player.maxExp;
    gameState.player.level += 1;
    gameState.player.baseAtk += 3;
    gameState.player.baseDef += 1;
    gameState.player.maxExp = Math.floor(100 * Math.pow(gameState.player.level, 1.4));

    const centerX = canvas ? canvas.width / 2 : 180;
    addFloatingText(`LEVEL UP! 🎉`, centerX - 80, 60, '#a855f7', 20);
    addLog(`🎉 恭喜升級！達到 Lv.${gameState.player.level}，攻擊力+3，防禦力+1！`);
  }
}

function checkEquipmentDrop(dropTable) {
  if (!dropTable) return;
  dropTable.forEach(item => {
    if (Math.random() < item.rate) {
      const newEquip = { ...item, id: Date.now() + Math.random() };
      gameState.inventory.push(newEquip);
      addLog(`🎁 幸運掉落裝備：【${item.name}】！`);
    }
  });
}

function getPlayerTotalAtk() {
  const wAtk = gameState.player.equipped.weapon ? gameState.player.equipped.weapon.value : 0;
  return gameState.player.baseAtk + wAtk;
}

function getPlayerTotalDef() {
  const aDef = gameState.player.equipped.armor ? gameState.player.equipped.armor.value : 0;
  return gameState.player.baseDef + aDef;
}

// --- Firebase 雲端整合與登入機制 ---
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
        const inputName = document.getElementById("nickname-input")?.value.trim();
        gameState.player.name = inputName || user.displayName || "冒險者";
        await saveData();
      }

      document.getElementById("login-modal").style.display = "none";
      updateUI();
      loadLeaderboard();
      requestAnimationFrame(updateAndRenderCanvas);
      setInterval(gameLoop, 100);
    } catch (err) {
      console.error("資料讀取失敗：", err);
    }
  } else {
    document.getElementById("login-modal").style.display = "flex";
  }
});

// Google 登入
document.getElementById("google-btn")?.addEventListener("click", () => {
  const provider = new GoogleAuthProvider();
  signInWithRedirect(auth, provider);
});

// Email 表單提交
document.getElementById("auth-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email-input").value.trim();
  const password = document.getElementById("password-input").value.trim();

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
      } catch (cErr) {
        alert("註冊失敗：" + cErr.message);
      }
    } else {
      alert("登入失敗：" + err.message);
    }
  }
});

async function saveData() {
  if (!currentUid) return;
  gameState.player.lastOnline = Date.now();
  await set(ref(db, `milky_users/${currentUid}`), {
    player: gameState.player,
    inventory: gameState.inventory
  });
}

// --- 排行榜讀取 ---
async function loadLeaderboard() {
  const listEl = document.getElementById("rank-list");
  if (!listEl) return;
  try {
    const snap = await get(query(ref(db, "milky_users"), orderByChild("player/level"), limitToLast(10)));
    if (snap.exists()) {
      const users = [];
      snap.forEach(child => { users.push(child.val().player || child.val()); });
      users.reverse();
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

// --- UI 與互動事件 ---
function updateUI() {
  document.getElementById('gold-val').innerText = gameState.player.gold;
  document.getElementById('milk-val').innerText = gameState.player.milk;
  document.getElementById('wood-val').innerText = gameState.player.wood;
  document.getElementById('player-name').innerText = gameState.player.name;
  document.getElementById('player-level').innerText = `Lv.${gameState.player.level}`;

  const eqW = gameState.player.equipped.weapon;
  const eqA = gameState.player.equipped.armor;
  document.getElementById('eq-weapon-name').innerText = eqW ? eqW.name : "無";
  document.getElementById('eq-weapon-atk').innerText = eqW ? eqW.value : 0;
  document.getElementById('eq-armor-name').innerText = eqA ? eqA.name : "無";
  document.getElementById('eq-armor-def').innerText = eqA ? eqA.value : 0;

  renderInventory();
}

function updateProgressBar(percent) {
  const fill = document.getElementById('action-progress-fill');
  if (fill) fill.style.width = `${Math.min(100, percent)}%`;
}

function renderInventory() {
  const container = document.getElementById('inventory-list');
  if (!container) return;
  container.innerHTML = '';

  if (gameState.inventory.length === 0) {
    container.innerHTML = '<p style="color:#64748b; font-size:0.85rem;">背包空空如也...</p>';
    return;
  }

  gameState.inventory.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'inv-card';
    div.innerHTML = `
      <span>${item.type === 'weapon' ? '🗡️' : '🛡️'} ${item.name} (${item.type === 'weapon' ? '攻' : '防'} +${item.value})</span>
      <button onclick="equipItem(${index})">裝備</button>
    `;
    container.appendChild(div);
  });
}

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

function addLog(msg) {
  const box = document.getElementById('log-box');
  if (!box) return;
  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.innerText = `[${time}] ${msg}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// 頁籤與工作卡片設定
window.addEventListener('DOMContentLoaded', () => {
  initCanvas();

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      const tabId = e.target.getAttribute('data-tab');
      e.target.classList.add('active');
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  document.querySelectorAll('.action-card').forEach(card => {
    card.addEventListener('click', (e) => {
      document.querySelectorAll('.action-card').forEach(c => c.classList.remove('active-work'));
      e.currentTarget.classList.add('active-work');

      gameState.currentWork = e.currentTarget.getAttribute('data-action');
      const textMap = { combat: '⚡ 當前工作：自動打怪', milking: '🥛 當前工作：牧場擠奶', woodcutting: '🌲 當前工作：森林伐木' };
      document.getElementById('current-action-text').innerText = textMap[gameState.currentWork];
      actionProgress = 0;
    });
  });

  document.querySelectorAll('.map-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const selectedMap = e.currentTarget.getAttribute('data-map');
      const mapInfo = MAP_DATA[selectedMap];

      if (gameState.player.level < mapInfo.reqLevel) {
        addLog(`⚠️ 等級不足！需要 Lv.${mapInfo.reqLevel} 才能進入 ${mapInfo.name}`);
        return;
      }

      document.querySelectorAll('.map-card').forEach(c => c.classList.remove('active-map'));
      e.currentTarget.classList.add('active-map');

      gameState.currentMap = selectedMap;
      currentMonsterHp = mapInfo.monster.maxHp;
      addLog(`🗺️ 切換冒險地圖為：${mapInfo.name}`);
    });
  });
});
