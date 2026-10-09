// --- 核心狀態 ---
const state = {
  player: {
    name: "冒險者",
    job: "novice",
    level: 1,
    exp: 0,
    maxExp: 100,
    gold: 500,
    wood: 20,
    baseAtk: 10,
    baseDef: 2,
    towerFloor: 1
  },
  inventory: [
    { id: 'w1', name: "新手短劍", type: "weapon", atk: 5, quality: "common" },
    { id: 'w2', name: "魔王城堡戰刀", type: "weapon", atk: 17, quality: "rare" },
    { id: 'w3', name: "魔王城堡戰刀", type: "weapon", atk: 17, quality: "rare" } // 堆疊展示
  ],
  market: [
    { id: 'm1', seller: "大魔法師", itemName: "傳奇法杖", price: 1200 },
    { id: 'm2', seller: "龍之騎士", itemName: "龍鱗重甲", price: 2500 }
  ],
  zone: 'goblin'
};

const JOBS = {
  novice: { name: "見習冒險者", reqLv: 1, atkBonus: 0 },
  warrior: { name: "狂戰士", reqLv: 15, atkBonus: 20 },
  mage: { name: "大魔導士", reqLv: 15, atkBonus: 35 },
  smith: { name: "神鍛匠", reqLv: 10, atkBonus: 10, canCraftAdvanced: true }
};

// --- UI 更新與日誌 ---
function updateUI() {
  document.getElementById('p-name').innerText = state.player.name;
  document.getElementById('p-job').innerText = JOBS[state.player.job].name;
  document.getElementById('p-level').innerText = state.player.level;
  document.getElementById('p-exp').innerText = state.player.exp;
  document.getElementById('p-max-exp').innerText = state.player.maxExp;
  document.getElementById('p-gold').innerText = state.player.gold;
  document.getElementById('p-wood').innerText = state.player.wood;
  document.getElementById('p-atk').innerText = state.player.baseAtk + JOBS[state.player.job].atkBonus;
  document.getElementById('p-def').innerText = state.player.baseDef;
  document.getElementById('tower-floor').innerText = state.player.towerFloor;

  renderInventory();
  renderMarket();
}

function log(msg) {
  const box = document.getElementById('log-box');
  const time = new Date().toLocaleTimeString();
  box.innerHTML = `<div>[${time}] ${msg}</div>` + box.innerHTML;
}

// --- 轉職機制 ---
function changeJob(jobKey) {
  if (state.player.level < JOBS[jobKey].reqLv) {
    log(`❌ 等級不足！轉職為 ${JOBS[jobKey].name} 需要 Lv.${JOBS[jobKey].reqLv}`);
    return;
  }
  state.player.job = jobKey;
  log(`🎉 成功轉職為【${JOBS[jobKey].name}】！`);
  updateUI();
}

// --- 背包（自動堆疊 & 一鍵清理） ---
function renderInventory() {
  const list = document.getElementById('inventory-list');
  list.innerHTML = '';

  if (state.inventory.length === 0) {
    list.innerHTML = '<p class="sub-text">背包內沒有物品。</p>';
    return;
  }

  const grouped = {};
  state.inventory.forEach(item => {
    const key = `${item.name}_${item.atk || 0}`;
    if (!grouped[key]) {
      grouped[key] = { ...item, count: 1 };
    } else {
      grouped[key].count++;
    }
  });

  Object.values(grouped).forEach(item => {
    const div = document.createElement('div');
    div.className = 'item-row';
    div.innerHTML = `
      <span>⚔️ <strong>${item.name}</strong> (攻 +${item.atk}) ${item.count > 1 ? `<b class="highlight">x${item.count}</b>` : ''}</span>
      <div>
        <button class="btn btn-sm btn-danger" onclick="sellSingleItem('${item.name}')">出售 (+50💰)</button>
      </div>
    `;
    list.appendChild(div);
  });
}

function autoCleanInventory() {
  let soldCount = 0;
  state.inventory = state.inventory.filter(item => {
    if (item.quality === 'common') {
      soldCount++;
      state.player.gold += 30;
      return false;
    }
    return true;
  });
  log(`🧹 自動清理了 ${soldCount} 件低階裝備，獲得 ${soldCount * 30} 金幣！`);
  updateUI();
}

function sellSingleItem(itemName) {
  const idx = state.inventory.findIndex(i => i.name === itemName);
  if (idx !== -1) {
    state.inventory.splice(idx, 1);
    state.player.gold += 50;
    log(`出售了 1 件【${itemName}】，獲得 50 金幣。`);
    updateUI();
  }
}

// --- 合成機制 ---
function craftItem(recipe) {
  if (recipe === 'iron_sword') {
    if (state.player.job !== 'smith') {
      log(`❌ 合成失敗：【精鋼長劍】需要【神鍛匠】職業！`);
      return;
    }
    if (state.player.wood < 10) {
      log(`❌ 材料不足：需要 10 個木材。`);
      return;
    }
    state.player.wood -= 10;
    state.inventory.push({ id: Date.now(), name: "精鋼長劍", type: "weapon", atk: 25, quality: "rare" });
    log(`🔨 成功合成【精鋼長劍】！`);
  } else if (recipe === 'wood_shield') {
    if (state.player.wood < 5) {
      log(`❌ 材料不足：需要 5 個木材。`);
      return;
    }
    state.player.wood -= 5;
    state.inventory.push({ id: Date.now(), name: "硬木盾", type: "armor", atk: 2, quality: "common" });
    log(`🔨 成功合成【硬木盾】！`);
  }
  updateUI();
}

// --- 交易所 ---
function renderMarket() {
  const list = document.getElementById('market-list');
  list.innerHTML = '';
  state.market.forEach((order, idx) => {
    const div = document.createElement('div');
    div.className = 'item-row';
    div.innerHTML = `
      <span>🏷️ <strong>${order.itemName}</strong> (賣家: ${order.seller})</span>
      <div>
        <button class="btn btn-sm btn-success" onclick="buyMarketOrder(${idx})">購買 (${order.price}💰)</button>
      </div>
    `;
    list.appendChild(div);
  });
}

function buyMarketOrder(idx) {
  const order = state.market[idx];
  if (state.player.gold < order.price) {
    log(`❌ 金幣不足，無法購買【${order.itemName}】！`);
    return;
  }
  state.player.gold -= order.price;
  state.inventory.push({ id: Date.now(), name: order.itemName, type: "weapon", atk: 30, quality: "epic" });
  state.market.splice(idx, 1);
  log(`🛒 成功購買【${order.itemName}】！`);
  updateUI();
}

function createMarketOrder() {
  if (state.inventory.length === 0) {
    log(`❌ 背包中沒有可上架的裝備。`);
    return;
  }
  const item = state.inventory.pop();
  state.market.push({ id: Date.now(), seller: state.player.name, itemName: item.name, price: 500 });
  log(`⚖️ 已將【${item.name}】上架至交易所（500 金幣）。`);
  updateUI();
}

// --- 排行榜 (容錯保護) ---
function loadRankings() {
  const list = document.getElementById('rank-list');
  list.innerHTML = '<p class="sub-text">連線遠端伺服器中...</p>';
  
  setTimeout(() => {
    const mockRanks = [
      { rank: 1, name: "龍之騎士", job: "狂戰士", level: 50 },
      { rank: 2, name: "大魔法師", job: "大魔導士", level: 42 },
      { rank: 3, name: state.player.name, job: JOBS[state.player.job].name, level: state.player.level }
    ];
    list.innerHTML = '';
    mockRanks.forEach(r => {
      const div = document.createElement('div');
      div.className = 'item-row';
      div.innerHTML = `<span>#${r.rank} <strong>${r.name}</strong> (${r.job})</span><span>Lv.${r.level}</span>`;
      list.appendChild(div);
    });
    log(`🏆 排行榜資料已更新！`);
  }, 400);
}

// --- 戰鬥與地圖 ---
function setZone(z) {
  state.zone = z;
  const names = { goblin: "哥布林營地", forest: "迷霧森林", boss: "魔王城堡" };
  document.getElementById('current-zone').innerText = names[z];
  log(`🗺️ 移動至區域：${names[z]}`);
}

function challengeTower() {
  const reqAtk = state.player.towerFloor * 15;
  const myAtk = state.player.baseAtk + JOBS[state.player.job].atkBonus;
  if (myAtk >= reqAtk) {
    state.player.towerFloor++;
    state.player.gold += 200;
    log(`🎉 通關無盡之塔第 ${state.player.towerFloor - 1} 層！獲得 200 金幣！`);
  } else {
    log(`❌ 挑戰失敗！第 ${state.player.towerFloor} 層 BOSS 需要戰力 ${reqAtk}`);
  }
  updateUI();
}

// --- 頁籤切換 ---
function switchTab(evt, tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  evt.currentTarget.classList.add('active');
  document.getElementById(`tab-${tabId}`).classList.add('active');

  if (tabId === 'rank') loadRankings();
}

// 掛機計時器 (每 3 秒自動戰鬥)
setInterval(() => {
  state.player.exp += 20;
  state.player.gold += 15;
  state.player.wood += 2;
  
  if (state.player.exp >= state.player.maxExp) {
    state.player.level++;
    state.player.exp -= state.player.maxExp;
    state.player.maxExp = Math.floor(state.player.maxExp * 1.5);
    state.player.baseAtk += 5;
    log(`🌟 恭喜升級！當前等級：Lv.${state.player.level}`);
  }

  if (Math.random() < 0.3) {
    state.inventory.push({
      id: Date.now(),
      name: state.zone === 'boss' ? "魔王城堡戰刀" : "野蠻短劍",
      type: "weapon",
      atk: state.zone === 'boss' ? 17 : 8,
      quality: state.zone === 'boss' ? "rare" : "common"
    });
    log(`🎁 戰鬥勝利，獲得裝備！`);
  }

  updateUI();
}, 3000);

// 初始化
updateUI();
log("🎮 遊戲已載入，掛機戰鬥中...");
