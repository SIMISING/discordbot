const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function createShopButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('shop_products')
      .setLabel('제품')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('shop_recharge')
      .setLabel('충전')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('shop_info')
      .setLabel('정보')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('shop_buy')
      .setLabel('구매')
      .setStyle(ButtonStyle.Success),
  );
}

module.exports = {
  createShopButtons,
};