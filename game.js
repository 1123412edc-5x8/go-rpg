import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, get, onValue, onDisconnect, remove, push, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 1. Firebase 配置
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

// 2. 職業天賦與基礎數值定義 (一、角色養成)
const CLASS_STATS = {
  warrior: { name: "戰士", maxHp: 200, atk: 15, color: "#e74c3c", skillName: "旋風斬" },
  mage:    { name: "法師", maxHp: 100, atk: 30, color: "#9b59b6", skillName: "火球術" },
  priest:  { name: "牧師", maxHp: 130, atk: 10, color: "#2ecc71", skillName: "治癒術" }
};

let currentUid = null;
let myData = {
  id: "",
  name: "玩家",
  heroClass: "warrior",
  level: 1,
  exp: 0,
  maxExp: 100,
  hp: 200,
  maxHp: 200,
  atk: 15,
  gold: 0,
  guild: "無",
  x: 400,
  y: 300,
  targetX: 400,
  targetY: 300
};

let players = {};
let worldBoss = null;
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 面板切換切換
window.togglePanel = (panelId) => {
  const panel = document.getElementById(panelId);
  panel.classList.toggle("hidden");
};

// 3. 帳號與角色資料初始化
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    const userSnap = await get(ref(db, `users/${currentUid}`));

    if (userSnap.exists()) {
      Object.assign(myData, userSnap.val());
    } else {
      // 新創角讀取選取職業
      const selectedClass = document.querySelector('input[name="hero-class"]:checked').value;
      const stats = CLASS_STATS[selectedClass];
      
      myData.heroClass = selectedClass;
      myData.hp = stats.maxHp;
      myData.maxHp = stats.maxHp;
      myData.atk = stats.atk;
      myData.name = document.getElementById("nickname-input").value.trim() || user.displayName || "冒險者";
      
      await set(ref(db, `users/${currentUid}`), myData);
    }

    document.getElementById("login-modal").style.display = "none";
    initGameWorld();
  }
});

// 4. 遊戲世界即時連線 (二、社交與五、經濟)
function initGameWorld() {
  myData.id = currentUid;
  const playerRef = ref(db, `players/${currentUid}`);
  
  onDisconnect(playerRef).remove();
  set(playerRef, myData);

  // 監聽全服玩家位置與動態
  onValue(ref(db, "players"), snapshot => { players = snapshot.val() || {}; });

  // 監聽世界 Boss (三、世界 Boss 事件)
  onValue(ref(db, "worldBoss"), snapshot => { worldBoss = snapshot.val(); });

  // 綁定 UI 與攻擊技能按鈕
  document.getElementById("attack-btn").addEventListener("click", () => handleAttack(false));
  document.getElementById("skill-1-btn").addEventListener("click", () => handleAttack(true));
  
  // 創建公會事件 (二、幫會系統)
  document.getElementById("create-guild-btn").addEventListener("click", async () => {
    const gName = document.getElementById("guild-name-input").value.trim();
    if (gName) {
      myData.guild = gName;
      await update(ref(db, `users/${currentUid}`), { guild: gName });
      document.getElementById("guild-info").innerText = `公會: ${gName}`;
      alert(`成功創立公會【${gName}】！`);
    }
  });

  updateUI();
  requestAnimationFrame(gameLoop);
}

// 5. 戰鬥與傷害機制 (經驗值、升級、金幣掉落)
function handleAttack(isSkill) {
  if (!worldBoss) return;

  const dist = Math.hypot(myData.x - worldBoss.x, myData.y - worldBoss.y);
  if (dist < (isSkill ? 120 : 60)) { // 技能傷害範圍更大
    const damage = isSkill ? myData.atk * 2 : myData.atk;
    worldBoss.hp -= damage;

    if (worldBoss.hp <= 0) {
      // 擊殺 Boss，結算獎勵 (金幣與 EXP 成長)
      myData.exp += 50;
      myData.gold += 20;

      // 檢查升級機制 (一、角色養成)
      if (myData.exp >= myData.maxExp) {
        myData.level += 1;
        myData.exp -= myData.maxExp;
        myData.maxExp = Math.floor(myData.maxExp * 1.5);
        myData.maxHp += 20;
        myData.hp = myData.maxHp;
        myData.atk += 5;
        alert(`🎉 恭喜升級至 Lv.${myData.level}！最大血量與攻擊力提升！`);
      }

      // 同步永久存檔
      set(ref(db, `users/${currentUid}`), myData);

      // 重生全服世界 Boss
      set(ref(db, "worldBoss"), {
        x: Math.random() * (canvas.width - 200) + 100,
        y: Math.random() * (canvas.height - 200) + 100,
        hp: 500,
        maxHp: 500
      });
    } else {
      set(ref(db, "worldBoss"), worldBoss);
    }

    updateUI();
  }
}

// 6. UI 即時刷新
function updateUI() {
  document.getElementById("player-name-class").innerText = `${myData.name} [Lv.${myData.level} ${CLASS_STATS[myData.heroClass].name}]`;
  document.getElementById("player-gold").innerText = `💰 金幣: ${myData.gold}`;
  
  // 更新 HP 與 EXP 條
  const hpPct = Math.max(0, (myData.hp / myData.maxHp) * 100);
  const expPct = Math.min(100, (myData.exp / myData.maxExp) * 100);
  document.getElementById("hp-fill").style.width = `${hpPct}%`;
  document.getElementById("exp-fill").style.width = `${expPct}%`;
}

// 7. 主遊戲渲染迴圈
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 繪製世界 Boss (巨型紅點)
  if (worldBoss) {
    ctx.beginPath();
    ctx.arc(worldBoss.x, worldBoss.y, 35, 0, Math.PI * 2);
    ctx.fillStyle = "#c0392b";
    ctx.fill();
    ctx.strokeStyle = "#f1c40f";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "white";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`☠️ 世界Boss (${worldBoss.hp}/${worldBoss.maxHp})`, worldBoss.x, worldBoss.y - 45);
  }

  // 繪製全服所有玩家
  Object.values(players).forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = CLASS_STATS[p.heroClass]?.color || "#3498db";
    ctx.fill();
    ctx.strokeStyle = p.id === currentUid ? "#f1c40f" : "#fff";
    ctx.lineWidth = 3;
    ctx.stroke();

    // 顯示稱號與公會
    ctx.fillStyle = "white";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`<${p.guild || '無公會'}> ${p.name} (Lv.${p.level})`, p.x, p.y - 25);
  });

  requestAnimationFrame(gameLoop);
}
