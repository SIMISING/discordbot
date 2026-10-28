const {
  getUserPoints,
  getProductByIdOrName,
  addOrUpdateUserPoints,
  getGuildLoyaltySettings: dbGetGuildLoyaltySettings,
  addUserPointBalance: dbAddUserPointBalance,
  logPurchase,
  popRandomStock,
  runTransaction,
  hasUserPurchasedProduct,
} = require('../database/database');
const { loadShopProductsFromDB } = require('./shopCache');
const { sendPurchaseLog } = require('../util/logger');

const purchaseLocks = new Set();

function lockKey(userId, productName) {
  return `${userId}:${productName}`;
}

function acquirePurchaseLock(userId, productName) {
  const key = lockKey(userId, productName);
  if (purchaseLocks.has(key)) {
    throw new Error('현재 해당 제품 구매가 진행 중입니다. 잠시 후 다시 시도해주세요.');
  }
  purchaseLocks.add(key);
}

function releasePurchaseLock(userId, productName) {
  purchaseLocks.delete(lockKey(userId, productName));
}

function getDefaultGradeRules() {
  return [
    { name: 'VIP', threshold: 50000 },
    { name: 'VVIP', threshold: 150000 }
  ];
}

function getGradeInfo(totalUsed, guildId) {
  const loyaltySettings = dbGetGuildLoyaltySettings(guildId);
  const gradeRules = Array.isArray(loyaltySettings.grade_rules) && loyaltySettings.grade_rules.length > 0
    ? loyaltySettings.grade_rules
    : getDefaultGradeRules();

  const sortedRules = [...gradeRules].sort((a, b) => (Number(a.threshold) || 0) - (Number(b.threshold) || 0));
  let currentGrade = '일반';
  let nextGrade = null;
  let nextThreshold = null;

  for (const rule of sortedRules) {
    const threshold = Number(rule.threshold) || 0;
    if ((totalUsed || 0) >= threshold) {
      currentGrade = rule.name || '일반';
      continue;
    }

    nextGrade = rule.name || '일반';
    nextThreshold = threshold;
    break;
  }

  return { gradeName: currentGrade, nextGradeName: nextGrade, nextThreshold };
}

function formatPurchaseErrorMessage(error) {
  const message = error?.message || '구매 처리 중 오류가 발생했습니다.';
  if (
    message.startsWith('재고가 부족합니다.') ||
    message.startsWith('보유 금액이 부족합니다.') ||
    message.includes('존재하지 않거나 판매 중지된 제품입니다.')
  ) {
    return message;
  }
  return `구매 처리 중 오류가 발생했습니다 : ${message}`;
}

async function purchaseProduct(userId, guildId, productName, quantity, user, guild) {
  acquirePurchaseLock(userId, productName);

  try {
    const userPoints = await getUserPoints(userId);
    const product = await getProductByIdOrName(guildId, productName);

    if (!product || product.active === 0) {
      throw new Error('존재하지 않거나 판매 중지된 제품입니다.');
    }

    if (product.is_account === 0 && product.channel_id && hasUserPurchasedProduct(guildId, userId, product.product_id)) {
      throw new Error('이미 구매한 채널 상품입니다. 중복 구매는 불가합니다.');
    }

    if (product.is_account === 1 && product.stock < quantity) {
      throw new Error(`재고가 부족합니다. (현재 남은 재고 : ${product.stock}개)`);
    }

    const totalPrice = product.price * quantity;
    if (userPoints < totalPrice) {
      throw new Error(`보유 금액이 부족합니다. (필요 : ${totalPrice.toLocaleString()}원 / 보유 : ${userPoints.toLocaleString()}원)`);
    }

    const loyaltySettings = dbGetGuildLoyaltySettings(guildId);
    const rewardThreshold = Number(loyaltySettings.reward_threshold || 0);
    const rewardRate = Number(loyaltySettings.reward_rate || 0);
    const earnedPoints = rewardRate > 0 && totalPrice >= rewardThreshold
      ? Math.floor(totalPrice * rewardRate / 100)
      : 0;

    let extractedStocks = [];

    runTransaction(() => {
      addOrUpdateUserPoints(userId, -totalPrice, guildId);

      if (product.is_account === 1) {
        for (let i = 0; i < quantity; i += 1) {
          const stock = popRandomStock(guildId, product.product_id);
          if (!stock) {
            throw new Error('재고를 추출하는 도중 무결성 오류가 발생했거나 재고가 부족합니다.');
          }
          extractedStocks.push(stock);
        }
      }

      if (earnedPoints > 0) {
        dbAddUserPointBalance(userId, earnedPoints);
      }

      logPurchase(guildId, userId, user.username, product.product_id, product.name, quantity, totalPrice, product.channel_id || 'ACCOUNT_DM');
    });

    await loadShopProductsFromDB(guildId);

    if (product.is_account === 0 && guild && product.channel_id) {
      const channel = await guild.channels.fetch(product.channel_id).catch(() => null);
      if (channel && typeof channel.permissionOverwrites?.edit === 'function') {
        await channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: false,
        }).catch(err => console.error('채널 권한 수정 실패 : ', err));
      }
    }

    await sendPurchaseLog(guild, user, product, quantity);

    const remaining = userPoints - totalPrice;
    return {
      product,
      totalPrice,
      remaining,
      channelId: product.channel_id,
      extractedStock: extractedStocks.join('\n'),
    };
  } finally {
    releasePurchaseLock(userId, productName);
  }
}

module.exports = {
  getGradeInfo,
  formatPurchaseErrorMessage,
  purchaseProduct,
  acquirePurchaseLock,
  releasePurchaseLock,
};
