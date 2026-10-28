const {
  getUserBalance,
  addUserPointBalance,
  addUserBalance,
  convertUserPointsToBalance,
  getGuildLoyaltySettings,
} = require('../database/database');

function ensurePositiveAmount(amount, label) {
  if (Number.isNaN(amount) || Number(amount) <= 0) {
    throw new Error(`${label}은(는) 1 이상이어야 합니다.`);
  }
}

function grantUserPoints(userId, amount) {
  ensurePositiveAmount(amount, '지급할 포인트');
  return addUserPointBalance(userId, Number(amount));
}

function grantUserBalance(userId, amount) {
  ensurePositiveAmount(amount, '지급할 금액');
  return addUserBalance(userId, Number(amount));
}

function convertPointsToBalance(userId, amount, guildId = 'default') {
  const settings = getGuildLoyaltySettings(guildId);
  const convertThreshold = Number(settings.convert_threshold || 0);
  const userBalance = getUserBalance(userId);
  const currentPoints = userBalance.point_balance || 0;

  if (convertThreshold > 0 && currentPoints < convertThreshold) {
    throw new Error(`${convertThreshold.toLocaleString()}포인트 이상이어야 전환할 수 있습니다.`);
  }

  const targetAmount = typeof amount === 'number' ? amount : currentPoints;
  if (targetAmount <= 0) {
    throw new Error('전환할 포인트가 없습니다.');
  }

  if (currentPoints < targetAmount) {
    throw new Error('보유 포인트보다 많이 전환할 수 없습니다.');
  }

  return convertUserPointsToBalance(userId, targetAmount);
}

module.exports = {
  grantUserPoints,
  grantUserBalance,
  convertPointsToBalance,
  ensurePositiveAmount,
};
