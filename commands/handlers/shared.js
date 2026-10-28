const { PermissionFlagsBits } = require('discord.js');

const MAX_TEXT_LENGTH = 100;

function isShopAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function sanitizeText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.slice(0, maxLength);
}

function buildProductChannelName(productName) {
  const safeName = productName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣-_]/g, '')
    .slice(0, 30);
  return safeName ? safeName : 'item';
}

module.exports = {
  isShopAdmin,
  buildProductChannelName,
  sanitizeText,
  MAX_TEXT_LENGTH,
};
