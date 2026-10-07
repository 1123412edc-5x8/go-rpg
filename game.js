import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, signInWithRedirect, GoogleAuthProvider, getRedirectResult,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, onValue, onDisconnect, remove, push, update, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ⚠️ 請替換為你自己的 Firebase Config 專案設定資訊！
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

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let currentUid = null;
let selectedItemToSell = null;
let players = {};
let monster = null;
const MOVE_SPEED = 4;

let myData = {
  id: "",
  name: "玩家",
  x: 400,
  y: 300,
  targetX: 400,
  targetY: 300,
  color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
  score: 0,
  gold: 100,
  inventory: [
    { id: "item_sword_01", name: "🗡️ 鐵劍", type: "weapon" },
    { id: "item_potion_01", name: "🧪 藥水", type: "consumable" }
  ]
};

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// 面板控制綁定
document.getElementById("tab-inventory-btn").addEventListener("click", () => {
  document.getElementById("inventory-panel").classList.toggle("hidden");
  document.getElementById("market-panel").classList.add("hidden");
});

document.getElementById("tab-market-btn").addEventListener("click", () => {
  document.getElementById("market-panel").classList.toggle("hidden");
  document.getElementById("inventory-panel").classList.add("hidden");
});

document.getElementById("close-inventory-btn").addEventListener("click", () => {
  document.getElementById("inventory-panel").classList.add("hidden");
});

document.getElementById("close-market-btn").addEventListener("click", () => {
  document.getElementById("market-panel").classList.add("hidden");
});

// Google 轉址登入結果檢查
getRedirectResult(auth).catch(err => {
  document.getElementById("auth-error").innerText = "Google 登入失敗: " + err.message;
});

// Auth 身份監聽
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
    initOnlineGame();
    renderInventory();
    listenToMarket();
  }
});

// 1. Google 轉址登入 (防手機封鎖 Popup)
const provider = new GoogleAuthProvider();
document.getElementById("google-btn").addEventListener("click", () => {
  signInWithRedirect(auth, provider);
});

// 2. Email 登入/自動註冊
document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email-input").value;
  const password = document.getElementById("password-input").value;
  const errorEl = document.getElementById("auth-error");
  errorEl.innerText = "";

  if (password.length < 6) {
    errorEl.innerText = "密碼長度至少需要 6 位數！";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    // 帳號不存在則自動進行註冊
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
      } catch (createErr) {
        errorEl.innerText = "註冊失敗: " + createErr.message;
      }
    } else {
      errorEl.innerText = "登入失敗: " + err.message;
    }
  }
});

// 登出
document.getElementById("logout-btn").addEventListener("click", async () => {
  if (currentUid) await remove(ref(db, `players/${currentUid}`));
  await signOut(auth);
  window.location.reload();
});

function initOnlineGame() {
  myData.id = currentUid;
  myData.x = Math.random() * (canvas.width - 100) + 50;
  myData.y = Math.random() * (canvas.height - 100) + 50;
  myData.targetX = myData.x;
  myData.targetY = myData.y;

  const myPlayerRef = ref(db, `players/${currentUid}`);
  onDisconnect(myPlayerRef).remove();
  set(myPlayerRef, myData);

  onValue(ref(db, "players"), snapshot => { players = snapshot.val() || {}; });
  onValue(ref(db, "monster"), snapshot => { monster = snapshot.val(); });

  setupControls();
  requestAnimationFrame(gameLoop);
}

function renderInventory() {
  const container = document.getElementById("inventory-list");
  document.getElementById("player-gold-display").innerText = `💰 當前金幣: ${myData.gold}`;
  document.getElementById("user-info").innerText = `玩家: ${myData.name} | 💰 ${myData.gold}`;
  container.innerHTML = "";

  if (!myData.inventory || myData.inventory.length === 0) {
    container.innerHTML = "<p style='grid-column: span 2; font-size: 11px; color: #888;'>背包是空的</p>";
    return;
  }

  myData.inventory.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerText = item.name;
    card.onclick = () => {
      selectedItemToSell = { ...item, originalIndex: index };
      document.getElementById("sell-item-name").innerText = item.name;
      document.getElementById("sell-box").classList.remove("hidden");
    };
    container.appendChild(card);
  });
}

// 物品上架
document.getElementById("confirm-sell-btn").addEventListener("click", async () => {
  const price = parseInt(document.getElementById("sell-price-input").value);
  if (!selectedItemToSell || isNaN(price) || price <= 0) return alert("請輸入售價！");

  myData.inventory.splice(selectedItemToSell.originalIndex, 1);
  await update(ref(db, `users/${currentUid}`), { inventory: myData.inventory });

  await push(ref(db, "market"), {
    sellerUid: currentUid,
    sellerName: myData.name,
    item: selectedItemToSell,
    price: price
  });

  selectedItemToSell = null;
  document.getElementById("sell-box").classList.add("hidden");
  renderInventory();
});

// 監聽拍賣場
function listenToMarket() {
  onValue(ref(db, "market"), (snapshot) => {
    const list = document.getElementById("market-list");
    list.innerHTML = "";
    const items = snapshot.val();

    if (!items) {
      list.innerHTML = "<p style='font-size: 11px; color: #888; text-align: center;'>拍賣行空無一物</p>";
      return;
    }

    Object.entries(items).forEach(([id, data]) => {
      const row = document.createElement("div");
      row.className = "market-item";
      const isMine = data.sellerUid === currentUid;

      row.innerHTML = `
        <div style="font-size:11px;">
          <strong>${data.item.name}</strong><br>
          <span style="color:#888;">💰 ${data.price} (${data.sellerName})</span>
        </div>
      `;

      const btn = document.createElement("button");
      btn.className = "action-btn-sm blue";
      btn.style.width = "50px";
      btn.innerText = isMine ? "下架" : "購買";
      btn.onclick = () => isMine ? cancelListing(id, data) : buyItem(id, data);

      row.appendChild(btn);
      list.appendChild(row);
    });
  });
}

async function buyItem(id, data) {
  if (myData.gold < data.price) return alert("金幣不足！");
  const listingRef = ref(db, `market/${id}`);
  const snap = await get(listingRef);
  if (!snap.exists()) return alert("商品已被買走！");

  myData.gold -= data.price;
  if (!myData.inventory) myData.inventory = [];
  myData.inventory.push(data.item);

  await update(ref(db, `users/${currentUid}`), { gold: myData.gold, inventory: myData.inventory });
  await runTransaction(ref(db, `users/${data.sellerUid}/gold`), gold => (gold || 0) + data.price);
  await remove(listingRef);

  renderInventory();
}

async function cancelListing(id, data) {
  await remove(ref(db, `market/${id}`));
  if (!myData.inventory) myData.inventory = [];
  myData.inventory.push(data.item);
  await update(ref(db, `users/${currentUid}`), { inventory: myData.inventory });
  renderInventory();
}

function setupControls() {
  canvas.addEventListener("pointerdown", (e) => {
    if (e.target.closest("#chat-container") || e.target.closest("#touch-ui") || e.target.closest(".game-panel") || e.target.closest("#side-menu-tabs")) return;
    myData.targetX = e.clientX;
    myData.targetY = e.clientY;
    syncPosition();
  });

  document.getElementById("attack-btn").addEventListener("click", performAttack);
}

function performAttack() {
  if (!monster) return;
  if (Math.hypot(myData.x - monster.x, myData.y - monster.y) < 60) {
    myData.gold += 10;
    renderInventory();
    update(ref(db, `users/${currentUid}`), { gold: myData.gold });
    set(ref(db, "monster"), {
      x: Math.random() * (canvas.width - 100) + 50,
      y: Math.random() * (canvas.height - 100) + 50
    });
  }
}

function updateMovement() {
  const dx = myData.targetX - myData.x;
  const dy = myData.targetY - myData.y;
  const dist = Math.hypot(dx, dy);

  if (dist > MOVE_SPEED) {
    myData.x += (dx / dist) * MOVE_SPEED;
    myData.y += (dy / dist) * MOVE_SPEED;
    syncPosition();
  }
}

let lastSync = 0;
function syncPosition() {
  const now = Date.now();
  if (now - lastSync > 50) {
    set(ref(db, `players/${currentUid}`), myData);
    lastSync = now;
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (monster) {
    ctx.beginPath();
    ctx.arc(monster.x, monster.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = "#e74c3c";
    ctx.fill();
  }

  Object.values(players).forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = p.color || "#3498db";
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${p.name}`, p.x, p.y - 20);
  });
}

function gameLoop() {
  updateMovement();
  render();
  requestAnimationFrame(gameLoop);
}
