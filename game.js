import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, ref, set, get, onValue, push, remove, update, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase 初始化 (略，請保留原本的 config)
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUid = null;
let selectedItemToSell = null;

// 預設玩家背包數據 (無道具時自動補發預設道具)
let myData = {
  id: "",
  name: "玩家",
  gold: 100,
  inventory: [
    { id: "item_sword_01", name: "🗡️ 鐵劍", type: "weapon" },
    { id: "item_potion_01", name: "🧪 高級生命藥水", type: "consumable" },
    { id: "item_ring_01", name: "💍 力量戒指", type: "accessory" }
  ]
};

// 1. 初始化與即時數據監聽
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUid = user.uid;
    const userSnap = await get(ref(db, `users/${currentUid}`));
    
    if (userSnap.exists()) {
      Object.assign(myData, userSnap.val());
    } else {
      await set(ref(db, `users/${currentUid}`), myData);
    }

    renderInventory();
    listenToMarket(); // 開始監聽全服拍賣行
  }
});

// 2. 渲染玩家背包 UI
function renderInventory() {
  const container = document.getElementById("inventory-list");
  document.getElementById("player-gold-display").innerText = `💰 當前金幣: ${myData.gold}`;
  container.innerHTML = "";

  if (!myData.inventory || myData.inventory.length === 0) {
    container.innerHTML = "<p style='grid-column: span 2; font-size: 12px; color: #888;'>背包是空的</p>";
    return;
  }

  myData.inventory.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerText = item.name;
    card.onclick = () => selectItemForSale(item, index);
    container.appendChild(card);
  });
}

// 3. 選擇物品進行上架
function selectItemForSale(item, index) {
  selectedItemToSell = { ...item, originalIndex: index };
  document.getElementById("sell-item-name").innerText = item.name;
  document.getElementById("sell-box").classList.remove("hidden");
}

// 4. 確認上架到拍賣行 (寫入 Firebase `market`)
document.getElementById("confirm-sell-btn").addEventListener("click", async () => {
  const priceInput = document.getElementById("sell-price-input");
  const price = parseInt(priceInput.value);

  if (!selectedItemToSell || isNaN(price) || price <= 0) {
    return alert("請輸入有效的售價！");
  }

  // A. 從玩家背包中移除該道具
  myData.inventory.splice(selectedItemToSell.originalIndex, 1);
  await update(ref(db, `users/${currentUid}`), { inventory: myData.inventory });

  // B. 推送至全服拍賣行 (`market` 節點)
  const marketRef = ref(db, "market");
  await push(marketRef, {
    sellerUid: currentUid,
    sellerName: myData.name,
    item: { id: selectedItemToSell.id, name: selectedItemToSell.name, type: selectedItemToSell.type },
    price: price,
    timestamp: Date.now()
  });

  // C. 重置 UI
  selectedItemToSell = null;
  priceInput.value = "";
  document.getElementById("sell-box").classList.add("hidden");
  renderInventory();
  alert("商品已成功上架拍賣行！");
});

// 5. 即時監聽全服拍賣行 (Market Real-time Sync)
function listenToMarket() {
  onValue(ref(db, "market"), (snapshot) => {
    const marketList = document.getElementById("market-list");
    marketList.innerHTML = "";
    const items = snapshot.val();

    if (!items) {
      marketList.innerHTML = "<p style='font-size: 12px; color: #888; text-align: center;'>拍賣行目前沒有商品</p>";
      return;
    }

    Object.entries(items).forEach(([listingId, data]) => {
      const itemRow = document.createElement("div");
      itemRow.className = "market-item";

      const isMyItem = data.sellerUid === currentUid;

      itemRow.innerHTML = `
        <div class="market-item-info">
          <strong>${data.item.name}</strong>
          <span class="seller">賣家: ${data.sellerName} ${isMyItem ? "(你自己)" : ""}</span>
        </div>
        <div class="market-item-price">💰 ${data.price}</div>
      `;

      const buyBtn = document.createElement("button");
      buyBtn.className = "action-btn-sm blue";
      buyBtn.style.width = "60px";
      buyBtn.innerText = isMyItem ? "下架" : "購買";

      buyBtn.onclick = () => {
        if (isMyItem) {
          cancelListing(listingId, data);
        } else {
          buyMarketItem(listingId, data);
        }
      };

      itemRow.appendChild(buyBtn);
      marketList.appendChild(itemRow);
    });
  });
}

// 6. 購買商品 (採用 Atomic Transaction 防搶購競態)
async function buyMarketItem(listingId, listingData) {
  if (myData.gold < listingData.price) {
    return alert("你的金幣不足！");
  }

  const listingRef = ref(db, `market/${listingId}`);

  // 檢查物品是否仍在拍賣場上
  const snapshot = await get(listingRef);
  if (!snapshot.exists()) {
    return alert("太慢了！該商品已被其他玩家買走或下架。");
  }

  // A. 買家扣款與發貨
  myData.gold -= listingData.price;
  if (!myData.inventory) myData.inventory = [];
  myData.inventory.push(listingData.item);

  // 更新買家個人資料
  await update(ref(db, `users/${currentUid}`), {
    gold: myData.gold,
    inventory: myData.inventory
  });

  // B. 賣家入帳 (使用 Firebase Transaction 確保原子性累加金幣)
  const sellerGoldRef = ref(db, `users/${listingData.sellerUid}/gold`);
  await runTransaction(sellerGoldRef, (currentGold) => {
    return (currentGold || 0) + listingData.price;
  });

  // C. 成功完成後移除拍賣行商品節點
  await remove(listingRef);

  renderInventory();
  alert(`成功購買 ${listingData.item.name}！`);
}

// 7. 下架自己的商品
async function cancelListing(listingId, listingData) {
  // 移除拍賣場節點
  await remove(ref(db, `market/${listingId}`));

  // 物品退回背包
  if (!myData.inventory) myData.inventory = [];
  myData.inventory.push(listingData.item);

  await update(ref(db, `users/${currentUid}`), { inventory: myData.inventory });
  renderInventory();
  alert("已成功下架商品並退回背包！");
}
