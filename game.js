import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithRedirect, GoogleAuthProvider,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get
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

// --- 2. RPG 核心狀態（含配點、衝階、天賦、隨機詞條） ---
const state = {
  player: {
    name: "冒險者",
    gold: 200,
    statPoints: 5,
    stats: { str: 10, agi: 10, int: 10, luk: 10 }
  },
  skills: {
    milking: { level: 1, exp: 0, maxExp: 100 },
    woodcutting: { level: 1, exp: 0, maxExp: 100 },
    cheesesmithing: { level: 1, exp: 0, maxExp: 100 },
    combat: { level: 1, exp: 0, maxExp: 100 }
  },
  talents: { speed: 0, double: 0, crit: 0 },
  inventory: [
    { id: 1, name: "生鏽長劍", type: "weapon", atk: 12, enhance: 0, quality: "common", prefix: "普通" },
    { id: 2, name: "狂暴的 精鋼劍", type: "weapon", atk: 35, enhance: 3, quality: "epic", prefix: "狂暴的" }
  ],
  currentAction: 'milking',
  actionTimer: 0
};

// --- 3. 動作定義 ---
const ACTIONS = {
  milking: { title: "🥛 牧場擠奶", skill: "milking", exp: 15, baseTime: 2000 },
  woodcutting: { title: "🌲 森林伐木", skill: "woodcutting", exp: 18, baseTime: 2200 },
  cheesesmithing: { title: "🧀 起司鍛造", skill: "cheesesmithing", exp: 35, baseTime: 3000 },
  combat: { title: "⚔️ 星域討伐", skill: "combat", exp: 40, baseTime: 1800 }
};

// --- 4. 遊戲主循環 ---
let lastTime = Date.now();
function gameLoop() {
  const now = Date.now();
  const dt = now - lastTime;
  lastTime = now;

  const act = ACTIONS[state.currentAction];
  const speedBonus = (state.player.stats.agi * 0.5) + (state.talents.speed * 5); // AGI 影響速度
  const interval = Math.max(500, act.baseTime * (1 - speedBonus / 100));

  state.actionTimer += dt;
  const pct = Math.min(100, (state.actionTimer / interval) * 100);
  document.getElementById('action-progress').style.width = `${pct}%`;

  if (state.actionTimer >= interval) {
    state.actionTimer = 0;
    executeAction(act);
  }

  requestAnimationFrame(gameLoop);
}

function executeAction(act) {
  // 給予技能經驗
  const sk = state.skills[act.skill];
  sk.exp += act.exp;
  if (sk.exp >= sk.maxExp) {
    sk.exp -= sk.maxExp;
    sk.level++;
    sk.maxExp = Math.floor(sk.maxExp * 1.3);
    state.player.statPoints += 2; // 升級獲得配點
    addLog(`🎉 技能【${act.skill.toUpperCase()}】升至 Lv.${sk.level}！獲得 2 屬性點！`);
  }

  // 隨機掉落帶有「隨機詞條」的裝備
  if (Math.random() < 0.25) {
    generateRandomEquipment();
  }

  state.player.gold += Math.floor(10 + state.player.stats.luk * 0.5); // LUK 影響金幣收益
  updateUI();
  saveData();
}

// 產生隨機詞條裝備
function generateRandomEquipment() {
  const prefixes = [
    { name: "殘暴的", extraAtk: 10, quality: "rare" },
    { name: "輕盈的", extraAtk: 5, quality: "common" },
    { name: "神聖的", extraAtk: 25, quality: "legendary" }
  ];
  const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
  const newItem = {
    id: Date.now(),
    name: `${pref.name} 冒險長劍`,
    type: "weapon",
    atk: 10 + pref.extraAtk + state.player.stats.str,
    enhance: 0,
    quality: pref.quality
  };
  state.inventory.push(newItem);
  addLog(`🎁 獲得裝備：【${newItem.name}】(攻 +${newItem.atk})！`);
}

// --- 5. RPG 屬性配點 ---
window.addStat = function(statKey) {
  if (state.player.statPoints > 0) {
    state.player.statPoints--;
    state.player.stats[statKey]++;
    updateUI();
    saveData();
  }
};

// --- 6. 天賦樹升級 ---
window.upgradeTalent = function(talentKey) {
  if (state.player.gold >= 100) {
    state.player.gold -= 100;
    state.talents[talentKey]++;
    addLog(`🌳 天賦【${talentKey}】提升至 Lv.${state.talents[talentKey]}`);
    updateUI();
    saveData();
  } else {
    addLog(`❌ 金幣不足 100，無法升級天賦。`);
  }
};

// --- 7. Firebase 登入與同步 ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    try {
      const snap = await get(ref(db, `milky_users/${currentUid}`));
      if (snap.exists()) {
        const data = snap.val();
        if (data.player) Object.assign(state.player, data.player);
        if (data.skills) Object.assign(state.skills, data.skills);
        if (data.inventory) state.inventory = data.inventory;
      }
      document.getElementById("login-modal").style.display = "none";
      updateUI();
      loadRankings();
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

async function saveData() {
  if (!currentUid) return;
  await set(ref(db, `milky_users/${currentUid}`), state);
}

// --- 8. UI 渲染 ---
function updateUI() {
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

  // 渲染背包
  const grid = document.getElementById('inventory-grid');
  if (grid) {
    grid.innerHTML = '';
    state.inventory.forEach((item) => {
      const div = document.createElement('div');
      div.className = `item-box ${item.quality}`;
      div.innerHTML = `
        <strong>${item.name} ${item.enhance > 0 ? `+${item.enhance}` : ''}</strong><br>
        <span class="sub-text">⚔️ 攻擊: +${item.atk}</span>
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
};
