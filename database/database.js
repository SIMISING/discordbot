const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'database.db');
let db;

function initializeDatabase() {
  db = new Database(dbPath);

  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      total_used INTEGER NOT NULL DEFAULT 0,
      point_balance INTEGER NOT NULL DEFAULT 0
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS recharge_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS recharge_settings (
      guild_id TEXT PRIMARY KEY,
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_holder TEXT NOT NULL,
      extra_info TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS shop_settings (
      guild_id TEXT PRIMARY KEY,
      log_channel_id TEXT NOT NULL DEFAULT ''
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS loyalty_settings (
      guild_id TEXT PRIMARY KEY,
      reward_threshold INTEGER NOT NULL DEFAULT 0,
      reward_rate REAL NOT NULL DEFAULT 0,
      convert_threshold INTEGER NOT NULL DEFAULT 0,
      grade_rules TEXT NOT NULL DEFAULT '[]'
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS shop_products (
      guild_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      is_account INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, product_id)
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS product_stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      stock_content TEXT NOT NULL
    )
  `).run();

  const shopProductColumns = db.prepare("PRAGMA table_info('shop_products')").all().map(column => column.name);
  if (!shopProductColumns.includes('channel_id')) {
    db.prepare(`ALTER TABLE shop_products ADD COLUMN channel_id TEXT NOT NULL DEFAULT ''`).run();
  }
  if (!shopProductColumns.includes('is_account')) {
    db.prepare(`ALTER TABLE shop_products ADD COLUMN is_account INTEGER NOT NULL DEFAULT 0`).run();
  }

  db.prepare(`
    CREATE TABLE IF NOT EXISTS purchase_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      used_points INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  //repairHistoricalPurchaseBalances();
}

function ensureDatabaseInitialized() {
  if (!db) {
    initializeDatabase();
  }
}

/*
function repairHistoricalPurchaseBalances() {
  ensureDatabaseInitialized();

  const adjustmentRows = db.prepare(`
    SELECT user_id, SUM(used_points) AS total_adjustment
    FROM purchase_logs
    GROUP BY user_id
  `).all();

  for (const row of adjustmentRows) {
    if (!row.user_id || row.total_adjustment <= 0) continue;
    db.prepare(`
      UPDATE users
      SET balance = balance + ?
      WHERE user_id = ?
    `).run(row.total_adjustment, row.user_id);
  }
}
*/

function getUserBalance(userId) {
  ensureDatabaseInitialized();
  const row = db.prepare('SELECT balance, total_used, point_balance FROM users WHERE user_id = ?').get(userId);
  return row ? row : { balance: 0, total_used: 0, point_balance: 0 };
}

function runTransaction(callback) {
  ensureDatabaseInitialized();
  const transaction = db.transaction(callback);
  try {
    return transaction();
  } catch (error) {
    console.error('[database] 트랜잭션 오류 : ', error);
    throw error;
  }
}

function getUserPoints(userId) {
  ensureDatabaseInitialized();
  const row = db.prepare('SELECT balance FROM users WHERE user_id = ?').get(userId);
  return row ? row.balance : 0;
}

function addOrUpdateUserPoints(userId, amount, guildId = 'default') {
  ensureDatabaseInitialized();
  
  const stmt = db.prepare(`
    INSERT INTO users (user_id, balance, total_used)
    VALUES (@user_id, @amount, 0)
    ON CONFLICT(user_id) DO UPDATE SET
      balance = users.balance + excluded.balance
  `);
  stmt.run({ user_id: userId, amount: amount });

  if (amount > 0) {
    db.prepare(`
      INSERT INTO recharge_logs (guild_id, user_id, amount)
      VALUES (?, ?, ?)
    `).run(guildId || 'default', userId, amount);
  }

  const row = db.prepare('SELECT balance FROM users WHERE user_id = ?').get(userId);
  return row ? row.balance : 0;
}

function setUserPoints(userId, points) {
  ensureDatabaseInitialized();
  const stmt = db.prepare(`
    INSERT INTO users (user_id, balance)
    VALUES (@user_id, @balance)
    ON CONFLICT(user_id) DO UPDATE SET
      balance = excluded.balance
  `);
  stmt.run({ user_id: userId, balance: points });
  return points;
}

function getUserRechargeLogsFromDB(userId, guildId) {
  ensureDatabaseInitialized();
  return db.prepare(`
    SELECT amount, timestamp 
    FROM recharge_logs 
    WHERE user_id = ? AND guild_id = ? 
    ORDER BY timestamp DESC LIMIT 10
  `).all(userId, guildId);
}

function getUserSpecificLogsFromDB(userId, guildId) {
  ensureDatabaseInitialized();
  return db.prepare(`
    SELECT product_name, quantity, used_points, timestamp 
    FROM purchase_logs 
    WHERE user_id = ? AND guild_id = ? 
    ORDER BY timestamp DESC LIMIT 10
  `).all(userId, guildId);
}

function getLogChannelId(guildId) {
  ensureDatabaseInitialized();
  const row = db.prepare('SELECT log_channel_id FROM shop_settings WHERE guild_id = ?').get(guildId);
  return row ? row.log_channel_id : null;
}

function setLogChannelId(guildId, channelId) {
  ensureDatabaseInitialized();
  const stmt = db.prepare(`
    INSERT INTO shop_settings (guild_id, log_channel_id)
    VALUES (@guild_id, @log_channel_id)
    ON CONFLICT(guild_id) DO UPDATE SET
      log_channel_id = excluded.log_channel_id
  `);
  stmt.run({ guild_id: guildId, log_channel_id: channelId });
  return channelId;
}

function normalizeRechargeAccountList(rawValue) {
  if (!rawValue) return [];

  if (Array.isArray(rawValue)) {
    return rawValue.filter(item => item && (item.bank_name || item.account_number || item.account_holder));
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => item && (item.bank_name || item.account_number || item.account_holder));
      }
    } catch (error) {
      // legacy string values are ignored here and treated as single-account fallback below
    }
  }

  return [];
}

function getRechargeSettings(guildId) {
  ensureDatabaseInitialized();
  const row = db.prepare('SELECT bank_name, account_number, account_holder, extra_info FROM recharge_settings WHERE guild_id = ?').get(guildId);
  if (!row) return null;

  const storedAccounts = normalizeRechargeAccountList(row.extra_info);
  const fallbackAccount = row.bank_name || row.account_number || row.account_holder
    ? {
        bank_name: row.bank_name || '',
        account_number: row.account_number || '',
        account_holder: row.account_holder || '',
        extra_info: row.extra_info || ''
      }
    : null;

  const accounts = storedAccounts.length > 0 ? storedAccounts : (fallbackAccount ? [fallbackAccount] : []);
  const primary = accounts[0] || { bank_name: '', account_number: '', account_holder: '', extra_info: '' };

  return {
    guild_id: guildId,
    bank_name: primary.bank_name || row.bank_name || '',
    account_number: primary.account_number || row.account_number || '',
    account_holder: primary.account_holder || row.account_holder || '',
    extra_info: row.extra_info || '',
    accounts,
  };
}

function setRechargeSettings(guildId, bankName, accountNumber, accountHolder, extraInfo) {
  ensureDatabaseInitialized();

  let accountList = [];
  if (Array.isArray(bankName)) {
    accountList = bankName.filter(item => item && (item.bank_name || item.account_number || item.account_holder));
  } else if (bankName || accountNumber || accountHolder) {
    const nextAccount = {
      bank_name: bankName || '',
      account_number: accountNumber || '',
      account_holder: accountHolder || '',
      extra_info: extraInfo || ''
    };

    const existingSettings = getRechargeSettings(guildId) || { accounts: [] };
    const existingAccounts = Array.isArray(existingSettings.accounts) ? existingSettings.accounts : [];
    const duplicateIndex = existingAccounts.findIndex(account =>
      String(account.bank_name || '').trim() === String(nextAccount.bank_name || '').trim() &&
      String(account.account_number || '').trim() === String(nextAccount.account_number || '').trim() &&
      String(account.account_holder || '').trim() === String(nextAccount.account_holder || '').trim()
    );

    if (duplicateIndex >= 0) {
      existingAccounts[duplicateIndex] = nextAccount;
      accountList = existingAccounts;
    } else {
      accountList = [...existingAccounts, nextAccount].filter(account => account && (account.bank_name || account.account_number || account.account_holder));
    }
  }

  const primary = accountList[0] || {
    bank_name: bankName || '',
    account_number: accountNumber || '',
    account_holder: accountHolder || '',
    extra_info: extraInfo || ''
  };

  const payload = JSON.stringify(accountList.length > 0 ? accountList : [primary]);

  const stmt = db.prepare(`
    INSERT INTO recharge_settings (guild_id, bank_name, account_number, account_holder, extra_info)
    VALUES (@guild_id, @bank_name, @account_number, @account_holder, @extra_info)
    ON CONFLICT(guild_id) DO UPDATE SET
      bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      extra_info = excluded.extra_info
  `);

  stmt.run({
    guild_id: guildId,
    bank_name: primary.bank_name || '',
    account_number: primary.account_number || '',
    account_holder: primary.account_holder || '',
    extra_info: payload,
  });

  return getRechargeSettings(guildId);
}

function deleteRechargeAccount(guildId, bankName, accountNumber, accountHolder) {
  ensureDatabaseInitialized();

  const normalizedBank = String(bankName || '').trim();
  const normalizedNumber = String(accountNumber || '').trim();
  const normalizedHolder = String(accountHolder || '').trim();

  if (!normalizedBank || !normalizedNumber || !normalizedHolder) {
    return { deleted: 0, accounts: getRechargeSettings(guildId)?.accounts || [] };
  }

  const settings = getRechargeSettings(guildId);
  if (!settings) {
    return { deleted: 0, accounts: [] };
  }

  const accounts = Array.isArray(settings.accounts) ? settings.accounts : [];

  const filteredAccounts = accounts.filter(account => {
    const sameBank = String(account.bank_name || '').trim() === normalizedBank;
    const sameNumber = String(account.account_number || '').trim() === normalizedNumber;
    const sameHolder = String(account.account_holder || '').trim() === normalizedHolder;
    return !(sameBank && sameNumber && sameHolder);
  });

  if (filteredAccounts.length === accounts.length) {
    return { deleted: 0, accounts: filteredAccounts };
  }

  if (filteredAccounts.length === 0) {
    db.prepare(`
      UPDATE recharge_settings
      SET bank_name = '', account_number = '', account_holder = '', extra_info = '[]'
      WHERE guild_id = ?
    `).run(guildId);
    return { deleted: 1, accounts: [] };
  }

  const primary = filteredAccounts[0];
  db.prepare(`
    UPDATE recharge_settings
    SET bank_name = ?, account_number = ?, account_holder = ?, extra_info = ?
    WHERE guild_id = ?
  `).run(primary.bank_name || '', primary.account_number || '', primary.account_holder || '', JSON.stringify(filteredAccounts), guildId);

  return { deleted: 1, accounts: filteredAccounts };
}

function getGuildLoyaltySettings(guildId) {
  ensureDatabaseInitialized();
  const row = db.prepare(`
    SELECT reward_threshold, reward_rate, convert_threshold, grade_rules
    FROM loyalty_settings
    WHERE guild_id = ?
  `).get(guildId);

  if (!row) {
    return { guild_id: guildId, reward_threshold: 0, reward_rate: 0, convert_threshold: 0, grade_rules: [] };
  }

  return {
    guild_id: guildId,
    reward_threshold: Number(row.reward_threshold || 0),
    reward_rate: Number(row.reward_rate || 0),
    convert_threshold: Number(row.convert_threshold || 0),
    grade_rules: (() => {
      try {
        return JSON.parse(row.grade_rules || '[]');
      } catch (error) {
        return [];
      }
    })()
  };
}

function setGuildLoyaltySettings(guildId, settings = {}) {
  ensureDatabaseInitialized();
  const currentSettings = getGuildLoyaltySettings(guildId);
  const rewardThreshold = settings.reward_threshold === undefined ? currentSettings.reward_threshold : Number(settings.reward_threshold ?? 0);
  const rewardRate = settings.reward_rate === undefined ? currentSettings.reward_rate : Number(settings.reward_rate ?? 0);
  const convertThreshold = settings.convert_threshold === undefined ? currentSettings.convert_threshold : Number(settings.convert_threshold ?? 0);
  const gradeRules = settings.grade_rules === undefined ? currentSettings.grade_rules : settings.grade_rules;
  const gradeRulesJson = JSON.stringify(gradeRules || []);

  const stmt = db.prepare(`
    INSERT INTO loyalty_settings (guild_id, reward_threshold, reward_rate, convert_threshold, grade_rules)
    VALUES (@guild_id, @reward_threshold, @reward_rate, @convert_threshold, @grade_rules)
    ON CONFLICT(guild_id) DO UPDATE SET
      reward_threshold = excluded.reward_threshold,
      reward_rate = excluded.reward_rate,
      convert_threshold = excluded.convert_threshold,
      grade_rules = excluded.grade_rules
  `);
  stmt.run({
    guild_id: guildId,
    reward_threshold: rewardThreshold,
    reward_rate: rewardRate,
    convert_threshold: convertThreshold,
    grade_rules: gradeRulesJson,
  });

  return getGuildLoyaltySettings(guildId);
}

function addUserPointBalance(userId, amount) {
  ensureDatabaseInitialized();

  db.prepare(`
    INSERT INTO users (user_id, balance, total_used, point_balance)
    VALUES (@user_id, 0, 0, 0)
    ON CONFLICT(user_id) DO NOTHING
  `).run({ user_id: userId });

  db.prepare(`
    UPDATE users
    SET point_balance = point_balance + ?
    WHERE user_id = ?
  `).run(amount, userId);

  const row = db.prepare('SELECT point_balance FROM users WHERE user_id = ?').get(userId);
  return row ? row.point_balance : 0;
}

function addUserBalance(userId, amount) {
  ensureDatabaseInitialized();

  db.prepare(`
    INSERT INTO users (user_id, balance, total_used, point_balance)
    VALUES (@user_id, 0, 0, 0)
    ON CONFLICT(user_id) DO NOTHING
  `).run({ user_id: userId });

  db.prepare(`
    UPDATE users
    SET balance = balance + ?
    WHERE user_id = ?
  `).run(amount, userId);

  const row = db.prepare('SELECT balance FROM users WHERE user_id = ?').get(userId);
  return row ? row.balance : 0;
}

function convertUserPointsToBalance(userId, amount) {
  ensureDatabaseInitialized();

  db.prepare(`
    UPDATE users
    SET balance = balance + ?, point_balance = point_balance - ?
    WHERE user_id = ?
  `).run(amount, amount, userId);

  const updatedRow = db.prepare('SELECT balance, point_balance FROM users WHERE user_id = ?').get(userId);
  return updatedRow ? { balance: updatedRow.balance, point_balance: updatedRow.point_balance } : null;
}

function getShopProductsForGuild(guildId) {
  ensureDatabaseInitialized();
  return db.prepare(`
    SELECT product_id, channel_id, name, price, description, category, stock, active, is_account
    FROM shop_products
    WHERE guild_id = ?
    ORDER BY CAST(SUBSTR(product_id, 2) AS INTEGER)
  `).all(guildId);
}

function getProductById(guildId, productId) {
  ensureDatabaseInitialized();
  const row = db.prepare(`
    SELECT guild_id, product_id, channel_id, name, price, description, category, stock, active, is_account
    FROM shop_products
    WHERE guild_id = ? AND product_id = ?
  `).get(guildId, productId);
  return row || null;
}

function getProductByIdOrName(guildId, searchKey) {
  ensureDatabaseInitialized();
  const row = db.prepare(`
    SELECT guild_id, product_id, channel_id, name, price, description, category, stock, active, is_account
    FROM shop_products
    WHERE guild_id = ? AND (product_id = ? OR name = ?)
  `).get(guildId, searchKey, searchKey);
  return row || null;
}

function getNextShopProductId(guildId) {
  ensureDatabaseInitialized();
  const row = db.prepare('SELECT MAX(CAST(SUBSTR(product_id, 2) AS INTEGER)) AS max_id FROM shop_products WHERE guild_id = ?').get(guildId);
  const nextId = row && row.max_id ? row.max_id + 1 : 1;
  return `P${nextId}`;
}

function createProduct(guildId, product) {
  ensureDatabaseInitialized();
  const stmt = db.prepare(`
    INSERT INTO shop_products (guild_id, product_id, channel_id, name, price, description, category, stock, active, is_account)
    VALUES (@guild_id, @product_id, @channel_id, @name, @price, @description, @category, @stock, @active, @is_account)
  `);
  stmt.run({
    guild_id: guildId,
    product_id: product.product_id,
    channel_id: product.channel_id,
    name: product.name,
    price: product.price,
    description: product.description,
    category: product.category,
    stock: product.stock,
    active: product.active ? 1 : 0,
    is_account: product.is_account ? 1 : 0
  });
  return product;
}

function updateShopProduct(guildId, productId, updates) {
  ensureDatabaseInitialized();
  const fields = [];
  const values = { guild_id: guildId, product_id: productId };

  if (updates.name !== undefined) { fields.push('name = @name'); values.name = updates.name; }
  if (updates.price !== undefined) { fields.push('price = @price'); values.price = updates.price; }
  if (updates.description !== undefined) { fields.push('description = @description'); values.description = updates.description; }
  if (updates.category !== undefined) { fields.push('category = @category'); values.category = updates.category; }
  if (updates.stock !== undefined) { fields.push('stock = @stock'); values.stock = updates.stock; }
  if (updates.active !== undefined) { fields.push('active = @active'); values.active = updates.active ? 1 : 0; }

  if (fields.length === 0) {
    throw new Error('업데이트할 필드를 제공해주세요.');
  }

  const stmt = db.prepare(`
    UPDATE shop_products
    SET ${fields.join(', ')}
    WHERE guild_id = @guild_id AND product_id = @product_id
  `);
  const result = stmt.run(values);

  if (result.changes === 0) {
    throw new Error('제품을 찾을 수 없습니다.');
  }
  return result;
}

function deleteShopProduct(guildId, productId) {
  ensureDatabaseInitialized();
  
  db.prepare('DELETE FROM product_stocks WHERE guild_id = ? AND product_id = ?').run(guildId, productId);

  const stmt = db.prepare(`
    DELETE FROM shop_products
    WHERE guild_id = @guild_id AND product_id = @product_id
  `);
  const result = stmt.run({ guild_id: guildId, product_id: productId });
  if (result.changes === 0) {
    throw new Error('제품을 찾을 수 없습니다.');
  }
  return result;
}

function addProductStocks(guildId, productId, stockList) {
  ensureDatabaseInitialized();
  const stmt = db.prepare(`
    INSERT INTO product_stocks (guild_id, product_id, stock_content)
    VALUES (?, ?, ?)
  `);
  
  for (const content of stockList) {
    if (content.trim()) stmt.run(guildId, productId, content.trim());
  }

  const countRow = db.prepare('SELECT COUNT(*) as count FROM product_stocks WHERE guild_id = ? AND product_id = ?').get(guildId, productId);
  db.prepare('UPDATE shop_products SET stock = ? WHERE guild_id = ? AND product_id = ?').run(countRow.count, guildId, productId);
  return countRow.count;
}

function popRandomStock(guildId, productId) {
  ensureDatabaseInitialized();
  const row = db.prepare(`
    SELECT id, stock_content FROM product_stocks 
    WHERE guild_id = ? AND product_id = ? 
    ORDER BY RANDOM() LIMIT 1
  `).get(guildId, productId);

  if (!row) return null;

  db.prepare('DELETE FROM product_stocks WHERE id = ?').run(row.id);
  
  const countRow = db.prepare('SELECT COUNT(*) as count FROM product_stocks WHERE guild_id = ? AND product_id = ?').get(guildId, productId);
  db.prepare('UPDATE shop_products SET stock = ? WHERE guild_id = ? AND product_id = ?').run(countRow.count, guildId, productId);

  return row.stock_content;
}

function getProductStocks(guildId, productId) {
  ensureDatabaseInitialized();
  return db.prepare(`
    SELECT id, stock_content 
    FROM product_stocks 
    WHERE guild_id = ? AND product_id = ?
    ORDER BY id ASC
  `).all(guildId, productId);
}

function updateProductStockContent(id, newContent) {
  ensureDatabaseInitialized();
  const stmt = db.prepare('UPDATE product_stocks SET stock_content = ? WHERE id = ?');
  return stmt.run(newContent, id);
}

function deleteProductStock(guildId, id) {
  ensureDatabaseInitialized();
  const stockRow = db.prepare('SELECT guild_id, product_id FROM product_stocks WHERE id = ?').get(id);
  if (!stockRow) return null;

  db.prepare('DELETE FROM product_stocks WHERE id = ?').run(id);

  const countRow = db.prepare('SELECT COUNT(*) as count FROM product_stocks WHERE guild_id = ? AND product_id = ?').get(stockRow.guild_id, stockRow.product_id);
  db.prepare('UPDATE shop_products SET stock = ? WHERE guild_id = ? AND product_id = ?').run(countRow.count, stockRow.guild_id, stockRow.product_id);
  
  return { productId: stockRow.product_id, newTotalStock: countRow.count };
}

function logPurchase(guildId, userId, userName, productId, productName, quantity, usedPoints, channelId) {
  ensureDatabaseInitialized();
  
  const stmt = db.prepare(`
    INSERT INTO purchase_logs (guild_id, user_id, user_name, product_id, product_name, channel_id, quantity, used_points)
    VALUES (@guild_id, @user_id, @user_name, @product_id, @product_name, @channel_id, @quantity, @used_points)
  `);
  stmt.run({
    guild_id: guildId,
    user_id: userId,
    user_name: userName,
    product_id: productId,
    product_name: productName,
    channel_id: channelId,
    quantity,
    used_points: usedPoints,
  });

  db.prepare(`
    UPDATE users
    SET total_used = total_used + ?
    WHERE user_id = ?
  `).run(usedPoints, userId);
}

function getPurchaseLogs(guildId, limit = 15) {
  ensureDatabaseInitialized();
  return db.prepare(`
    SELECT user_name, product_id, product_name, quantity, used_points, timestamp
    FROM purchase_logs
    WHERE guild_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(guildId, limit);
}

function hasUserPurchasedProduct(guildId, userId, productId) {
  ensureDatabaseInitialized();
  const row = db.prepare(`
    SELECT 1
    FROM purchase_logs
    WHERE guild_id = ? AND user_id = ? AND product_id = ?
    LIMIT 1
  `).get(guildId, userId, productId);

  return !!row;
}

module.exports = {
  ensureDatabaseInitialized,
  runTransaction,
  getUserPoints,
  addOrUpdateUserPoints,
  setUserPoints,
  getRechargeSettings,
  setRechargeSettings,
  getGuildLoyaltySettings,
  setGuildLoyaltySettings,
  addUserPointBalance,
  addUserBalance,
  convertUserPointsToBalance,
  getShopProductsForGuild,
  getProductById,
  getProductByIdOrName,
  getNextShopProductId,
  createProduct,
  updateShopProduct,
  deleteShopProduct,
  addProductStocks,
  popRandomStock,
  getProductStocks,
  updateProductStockContent,
  deleteProductStock,
  logPurchase,
  getPurchaseLogs,
  hasUserPurchasedProduct,
  deleteRechargeAccount,
  getUserBalance,
  getUserRechargeLogsFromDB,
  getUserSpecificLogsFromDB,
  getLogChannelId,
  setLogChannelId
};