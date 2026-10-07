import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithRedirect, GoogleAuthProvider, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, onValue, onDisconnect, remove, update, runTransaction, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

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
let monster = null;
let monsterRef = null;
const MOVE_SPEED = 2; // 緩慢推進速度

let myData = {
  name: "冒險者",
  level: 1,
  exp: 0,
  maxExp: 100,
  hp: 100,
  maxHp: 100,
  atk: 10,
  gold: 0,
  stage: 1,
  x: 50,
  y: 200,
  weaponName: "木棍",
  weaponAtk: 0
};

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// 面板按鈕綁定
document.getElementById("upgrade-btn").addEventListener("click", async () => {
  const upgradeCost = myData.level * 50;
  if (myData.gold >= upgradeCost) {
    myData.gold -= upgradeCost;
    myData.atk += 10;
    myData.weaponAtk += 10;
    document.getElementById("weapon-slot").innerText = `武器: +${myData.weaponAtk} 攻擊`;
    await saveData();
    addLog(`⚔️ 強化攻擊力！消耗 ${upgradeCost} 金幣。`);
    updateUI();
  } else {
    addLog("不足，無法強化！");
  }
});

// Auth 身份監聽與自動創角/讀檔
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    const userSnap = await get(ref(db, `users/${currentUid}`));
    
    if (userSnap.exists()) {
      Object.assign(myData, userSnap.val());
    } else {
      myData.name = document.getElementById("nickname-input").value.trim() || user.displayName || "冒險者";
      await set(ref(db, `users/${currentUid}`), myData);
    }

    document.getElementById("login-modal").style.display = "none";
    initIdleGame();
    updateUI();
  }
});

// Google 與 Email 登入邏輯
getRedirectResult(auth).catch(err => { document.getElementById("auth-error").innerText = err.message; });
const provider = new GoogleAuthProvider();
document.getElementById("google-btn").addEventListener("click", () => signInWithRedirect(auth, provider));

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email-input").value;
  const password = document.getElementById("password-input").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      try { await createUserWithEmailAndPassword(auth, email, password); } 
      catch (createErr) { document.getElementById("auth-error").innerText = createErr.message; }
    } else {
      document.getElementById("auth-error").innerText = err.message;
    }
  }
});

document.getElementById("logout-btn").addEventListener("click", async () => {
  if (currentUid) await remove(ref(db, `players/${currentUid}`));
  await signOut(auth);
  window.location.reload();
});

// 初始化放置遊戲
function initIdleGame() {
  monsterRef = ref(db, "monster");
  
  // 監聽怪物狀態（單一怪物被全服共享，或每個關卡獨立生成）
  onValue(monsterRef, (snapshot) => {
    monster = snapshot.val();
  });

  setupMonsterSpawner();
  requestAnimationFrame(gameLoop);
}

// 關卡怪物生成邏輯
function setupMonsterSpawner() {
  if (currentUid) {
    // 檢查怪物是否死亡或不存在，由系統/第一個玩家生成
    get(monsterRef).then(snapshot => {
      if (!snapshot.exists()) {
        spawnNewMonster();
      }
    });
  }
}

function spawnNewMonster() {
  const hp = 50 + (myData.stage * 20);
  const maxHp = hp;
  set(monsterRef, {
    hp: hp,
    maxHp: maxHp,
    name: "哥布林",
    x: window.innerWidth - 100,
    y: 200,
    alive: true
  });
}

// 保存進度至 Firebase
async function saveData() {
  await update(ref(db, `users/${currentUid}`), myData);
}

// 懸浮字體特效
function showDamageText(x, y, damage) {
  const span = document.createElement("div");
  span.className = "damage-text";
  span.innerText = damage;
  span.style.left = `${x}px`;
  span.style.top = `${y - 20}px`;
  document.body.appendChild(span);
  setTimeout(() => span.remove(), 500);
}

// UI 更新
function updateUI() {
  document.getElementById("player-info").innerText = `${myData.name} [Lv.${myData.level}]`;
  document.getElementById("player-stats").innerText = `⚔️ 攻擊力: ${myData.atk} | 🩸 生命值: ${myData.hp}`;
  document.getElementById("player-gold").innerText = `💰 金幣: ${myData.gold}`;
  document.getElementById("current-stage").innerText = `🗺️ 關卡: 第 ${myData.stage} 層`;
  document.getElementById("weapon-slot").innerText = `武器: +${myData.weaponAtk} 攻擊`;

  const expPct = Math.min(100, (myData.exp / myData.maxExp) * 100);
  document.getElementById("exp-fill").style.width = `${expPct}%`;
}

function addLog(text) {
  const logBox = document.getElementById("log-messages");
  const div = document.createElement("div");
  div.innerText = text;
  logBox.appendChild(div);
  logBox.scrollTop = logBox.scrollHeight;
}

// 戰鬥與掛機計算
let lastAttackTime = 0;
const ATTACK_INTERVAL = 1000; // 每秒自動攻擊一次

function updateGameLogic() {
  if (!monster || !monster.alive) return;

  // 自動攻擊邏輯（角色碰到怪物範圍內即刻施放）
  const dist = Math.hypot((window.innerWidth - 100) - myData.x, monster.y - myData.y);
  if (dist < 150) {
    const now = Date.now();
    if (now - lastAttackTime > ATTACK_INTERVAL) {
      monster.hp -= myData.atk;
      showDamageText(window.innerWidth - 100, 200, myData.atk);

      if (monster.hp <= 0) {
        monster.alive = false;
        handleMonsterKilled();
      } else {
        // 同步扣血
        set(ref(db, "monster/hp"), monster.hp);
      }
      lastAttackTime = now;
    }
  } else {
    // 角色緩慢向前移動靠攏怪物
    myData.x += MOVE_SPEED;
  }
}

// 擊殺結算
async function handleMonsterKilled() {
  addLog(`💀 擊殺 ${monster.name}！獲得獎勵。`);
  
  // 獲得金幣與經驗
  myData.gold += 15 * myData.stage;
  myData.exp += 30;

  // 升級檢測
  if (myData.exp >= myData.maxExp) {
    myData.level += 1;
    myData.exp -= myData.maxExp;
    myData.maxExp = Math.floor(myData.maxExp * 1.2);
    myData.maxHp += 20;
    myData.hp = myData.maxHp;
    myData.atk += 10;
    addLog(`🎉 升級！等級提升至 Lv.${myData.level}！`);
  }

  // 自動推進關卡
  if (myData.level % 5 === 0 && myData.level !== 1) {
    myData.stage += 1;
    addLog(`⏩ 突破關卡！進入第 ${myData.stage} 層！`);
  }

  updateUI();
  await saveData();

  // 延遲重生下一隻怪
  setTimeout(() => {
    spawnNewMonster();
  }, 2000);
}

// 畫面渲染
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 繪製背景元素（簡單的地面線）
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 250);
  ctx.lineTo(window.innerWidth, 250);
  ctx.stroke();

  // 繪製角色 (勇者)
  ctx.beginPath();
  ctx.arc(myData.x, 220, 25, 0, Math.PI * 2);
  ctx.fillStyle = "#3498db";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "white";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(myData.name, myData.x, 180);

  // 繪製怪物
  if (monster && monster.alive) {
    ctx.beginPath();
    ctx.arc(window.innerWidth - 100, 220, 30, 0, Math.PI * 2);
    ctx.fillStyle = "#e74c3c";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.stroke();

    // 怪物血條
    const hpPct = Math.max(0, monster.hp / monster.maxHp);
    ctx.fillStyle = "#c0392b";
    ctx.fillRect(window.innerWidth - 140, 270, 80, 8);
    ctx.fillStyle = "#2ecc71";
    ctx.fillRect(window.innerWidth - 140, 270, 80 * hpPct, 8);

    ctx.fillStyle = "white";
    ctx.fillText(`${monster.name} (HP: ${monster.hp})`, window.innerWidth - 100, 180);
  }
}

function gameLoop() {
  updateGameLogic();
  render();
  requestAnimationFrame(gameLoop);
}
