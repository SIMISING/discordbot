const { getShopProductsForGuild } = require('../database/database');

const guildProducts = new Map();

async function loadShopProductsFromDB(guildId) {
  const products = await getShopProductsForGuild(guildId);
  guildProducts.set(guildId, products);
  return products;
}

async function getShopProducts(guildId) {
  if (!guildProducts.has(guildId)) {
    await loadShopProductsFromDB(guildId);
  }
  return guildProducts.get(guildId) || [];
}

function invalidateGuildProducts(guildId) {
  guildProducts.delete(guildId);
}

module.exports = {
  guildProducts,
  getShopProducts,
  loadShopProductsFromDB,
  invalidateGuildProducts,
};
