const { 
  ChannelType, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const {
  getUserPoints,
  getUserBalance: dbGetUserBalance,
  addOrUpdateUserPoints,
  setUserPoints,
  getRechargeSettings: dbGetRechargeSettings,
  setRechargeSettings: dbSetRechargeSettings,
  getGuildLoyaltySettings: dbGetGuildLoyaltySettings,
  setGuildLoyaltySettings: dbSetGuildLoyaltySettings,
  getProductById: dbGetProductById,
  getProductByIdOrName,
  getNextShopProductId,
  createProduct,
  updateShopProduct,
  deleteShopProduct,
  addProductStocks,
  getProductStocks: dbGetProductStocks,
  updateProductStockContent: dbUpdateProductStockContent,
  deleteProductStock: dbDeleteProductStock,
  getPurchaseLogs: dbGetPurchaseLogs,
} = require('../database/database');
const { createShopButtons } = require('../util/shopButtons');
const { verifyPayment } = require('../util/pushbulletHandler');
const { getShopProducts, loadShopProductsFromDB } = require('./shopCache');
const { getGradeInfo, formatPurchaseErrorMessage, purchaseProduct } = require('./purchaseService');
const { grantUserPoints, grantUserBalance, convertPointsToBalance } = require('./accountService');

async function handleRechargeSubmit(interaction) {
  const sender = interaction.fields.getTextInputValue('sender_input').trim();
  const amountStr = interaction.fields.getTextInputValue('amount_input').trim();
  const amount = parseInt(amountStr, 10);

  if (Number.isNaN(amount) || amount <= 0) {
    return await interaction.reply({ content: '올바른 충전 금액을 입력해주세요.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const settings = await dbGetRechargeSettings(interaction.guildId);
  if (!settings) {
    return await interaction.editReply({ content: '계좌 정보가 등록되어 있지 않습니다. 관리자에게 문의하세요.' });
  }

  const selectedAccountKey = interaction.customId && interaction.customId.startsWith('shop_recharge_modal:')
    ? interaction.customId.split('shop_recharge_modal:')[1]
    : null;

  const accounts = Array.isArray(settings.accounts) && settings.accounts.length > 0
    ? settings.accounts
    : [{ bank_name: settings.bank_name, account_number: settings.account_number, account_holder: settings.account_holder, extra_info: settings.extra_info || '' }];

  const selectedIndex = Number(selectedAccountKey ?? 0);
  const selectedAccount = Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < accounts.length
    ? accounts[selectedIndex]
    : accounts[0];

  if (!selectedAccount) {
    return await interaction.editReply({ content: '선택한 충전 계좌를 찾을 수 없습니다. 다시 시도해주세요.' });
  }

  await interaction.editReply({
    content: `**입금 대기 중...**\n\n**아래 계좌로 정해진 예금주명과 금액을 정확히 입금해 주세요.**\n- 은행 : **${selectedAccount.bank_name}**\n- 계좌번호 : \`${selectedAccount.account_number}\`\n- 예금주 : **${selectedAccount.account_holder}**\n\n- 실입금자명 : **${sender}**\n- 입금할 금액 : **${amount.toLocaleString()}원**\n\n*원활한 확인을 위해 5분 이내에 입금을 완료해 주세요.*`
  });

  try {
    await verifyPayment(sender, amount); 
    const updatedPoints = await addOrUpdateUserPoints(interaction.user.id, amount, interaction.guildId); 

    return await interaction.followUp({
      content: `**입금 확인 완료!**\n\n**${sender}**님의 **${amount.toLocaleString()}원** 입금이 정상적으로 자동 확인되었습니다.\n현재 보유 금액 : **${updatedPoints.toLocaleString()}원**`,
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error('[vending] 입금 확인 오류 : ', error);
    return await interaction.followUp({
      content: `**입금 확인 실패**\n원인 : ${error.message || '시간 초과 또는 알림 불일치'}\n\n*만약 입금을 하셨는데도 실패가 떴다면 관리자에게 수동 처리를 요청하세요.*`,
      flags: MessageFlags.Ephemeral
    });
  }
}

module.exports = {
  getUserBalance: dbGetUserBalance,
  handleRechargeSubmit,
  getRechargeSettings: dbGetRechargeSettings,
  setRechargeSettings: dbSetRechargeSettings,
  grantUserPoints: async function(userId, amount, guildId = 'default') {
    return await grantUserPoints(userId, amount);
  },
  grantUserBalance: async function(userId, amount, guildId = 'default') {
    return await grantUserBalance(userId, amount);
  },
  convertPointsToBalance: async function(userId, amount, guildId = 'default') {
    return await convertPointsToBalance(userId, amount, guildId);
  },
  getLoyaltySettings: dbGetGuildLoyaltySettings,
  setLoyaltySettings: dbSetGuildLoyaltySettings,
  getUserLoyaltyStatus: async function(userId, guildId = 'default') {
    const balanceData = dbGetUserBalance(userId);
    const loyaltySettings = dbGetGuildLoyaltySettings(guildId);
    const gradeInfo = getGradeInfo(balanceData.total_used || 0, guildId);

    return {
      balance: balanceData.balance || 0,
      totalUsed: balanceData.total_used || 0,
      pointBalance: balanceData.point_balance || 0,
      rewardThreshold: Number(loyaltySettings.reward_threshold || 0),
      rewardRate: Number(loyaltySettings.reward_rate || 0),
      convertThreshold: Number(loyaltySettings.convert_threshold || 0),
      gradeName: gradeInfo.gradeName,
      nextGradeName: gradeInfo.nextGradeName,
      nextThreshold: gradeInfo.nextThreshold,
      canConvert: (balanceData.point_balance || 0) >= Number(loyaltySettings.convert_threshold || 0)
    };
  },
  getShopProducts,
  loadShopProductsFromDB,
  getProductById: dbGetProductById,
  addShopProduct: async function(guildId, channelId, name, price, category, isAccount = false, description = '') {
    const products = await getShopProducts(guildId);
    const duplicate = products.find(p => p.category.toLowerCase() === category.toLowerCase() && p.name.toLowerCase() === name.toLowerCase());
    
    if (duplicate) {
      throw new Error(`[${category}] 카테고리 내에 이미 '${name}' 이름을 가진 제품이 존재합니다.`);
    }
    
    const nextId = getNextShopProductId(guildId);
    const productData = {
      product_id: nextId,
      channel_id: channelId || '',
      name: name,
      price: price,
      description: description,
      category: category, 
      stock: isAccount ? 0 : 999999,
      active: true,
      is_account: isAccount
    };
    return await createProduct(guildId, productData);
  },
  refillStockData: async function(guildId, searchKey, stockList, category = null) {
    const products = await getShopProducts(guildId);
    const normalizedSearchKey = searchKey.toLowerCase();
    const normalizedCategory = category ? category.trim().toLowerCase() : null;
    const matchingProducts = products.filter(p =>
      p.name.toLowerCase() === normalizedSearchKey &&
      (!normalizedCategory || p.category.toLowerCase() === normalizedCategory)
    );

    if (matchingProducts.length === 0) {
      throw new Error(category ? `카테고리 [${category}] 내에 '${searchKey}' 이름의 상품이 존재하지 않습니다.` : `해당 상품을 찾을 수 없습니다.`);
    }

    if (matchingProducts.length > 1) {
      throw new Error('같은 이름의 상품이 여러 개 존재합니다. 카테고리를 함께 입력해주세요.');
    }

    const product = matchingProducts[0];
    if (product.is_account === 0) throw new Error('해당 상품은 채널 형태의 전용 제품이므로 계정/텍스트 재고를 충전할 수 없습니다.');
    
    const updatedCount = addProductStocks(guildId, product.product_id, stockList);
    await loadShopProductsFromDB(guildId);
    return { name: product.name, totalStock: updatedCount };
  },
  updateShopProduct,
  deleteShopProduct,
  getPurchaseLogs: dbGetPurchaseLogs,
  purchaseProduct,
  deleteRechargeAccount: require('../database/database').deleteRechargeAccount,
  
  listIndividualStocks: async function(guildId, searchKey, category = null) {
    const products = await getShopProducts(guildId);
    const normalizedSearchKey = searchKey.toLowerCase();
    const normalizedCategory = category ? category.trim().toLowerCase() : null;
    const matchingProducts = products.filter(p =>
      p.name.toLowerCase() === normalizedSearchKey &&
      (!normalizedCategory || p.category.toLowerCase() === normalizedCategory)
    );

    if (matchingProducts.length === 0) {
      throw new Error(category ? `카테고리 [${category}] 내에 '${searchKey}' 이름의 상품이 존재하지 않습니다.` : `해당 상품을 찾을 수 없습니다.`);
    }

    if (matchingProducts.length > 1) {
      throw new Error('같은 이름의 상품이 여러 개 존재합니다. 카테고리를 함께 입력해주세요.');
    }

    const product = matchingProducts[0];
    if (product.is_account === 0) throw new Error('채널 형태의 상품은 개별 재고가 존재하지 않습니다.');
    
    const list = dbGetProductStocks(guildId, product.product_id);
    return { productName: product.name, stocks: list };
  },
  editIndividualStock: async function(id, newContent) {
    const res = dbUpdateProductStockContent(id, newContent);
    if (res.changes === 0) throw new Error('해당 고유 ID의 재고 항목을 찾을 수 없습니다.');
    return true;
  },
  deleteIndividualStock: async function(guildId, id) {
    const result = dbDeleteProductStock(guildId, id);
    if (!result) throw new Error('해당 고유 ID의 재고 항목을 찾을 수 없습니다.');
    await loadShopProductsFromDB(guildId);
    return result;
  },

  handlePurchaseSubmit: async function (interaction, productName) {
    try {
      const product = await getProductByIdOrName(interaction.guildId, productName);
      if (!product || product.active === 0) {
        return await interaction.reply({ content: '존재하지 않거나 판매 중지된 제품입니다.', flags: MessageFlags.Ephemeral });
      }

      if (product.is_account === 1) {
        const modal = new ModalBuilder()
          .setCustomId(`purchase_quantity_modal:${product.name}`)
          .setTitle(`${product.name} - 수량 선택`);

        const quantityInput = new TextInputBuilder()
          .setCustomId('quantity_input')
          .setLabel('구매할 수량을 입력하세요')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('예: 1')
          .setValue('1')
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(quantityInput);
        modal.addComponents(row);

        return await interaction.showModal(modal);
      }

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      }

      const result = await purchaseProduct(
        interaction.user.id, 
        interaction.guildId, 
        productName, 
        1, 
        interaction.user,
        interaction.guild
      );

      await interaction.editReply({
        content: `구매가 완료되었습니다!\n- 제품 : ${result.product.name}\n- 사용 금액 : ${result.totalPrice.toLocaleString()}원\n- 남은 잔액 : ${result.remaining.toLocaleString()}원`,
        embeds: [], 
        components: [] 
      });

      const channelLink = result.channelId ? `<#${result.channelId}>` : '채널 정보 없음';
      const dmContent = `구매가 완료되었습니다!\n상품 : **${result.product.name}**\n제품 확인 채널 : ${channelLink}`;
      await interaction.user.send(dmContent).catch(() => {});

    } catch (error) {
      console.error('[vending] handlePurchaseSubmit 오류 : ', error);
      const replyOptions = { content: formatPurchaseErrorMessage(error), embeds: [], components: [] };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(replyOptions);
      } else {
        await interaction.reply({ ...replyOptions, flags: MessageFlags.Ephemeral });
      }
    }
  },

  handleQuantityModalSubmit: async function (interaction, productName) {
    const quantityStr = interaction.fields.getTextInputValue('quantity_input').trim();
    const quantity = parseInt(quantityStr, 10);

    if (Number.isNaN(quantity) || quantity <= 0) {
      return await interaction.reply({ content: '올바른 구매 수량을 입력해주세요 (1 이상의 숫자).', flags: MessageFlags.Ephemeral });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
      const result = await purchaseProduct(
        interaction.user.id, 
        interaction.guildId, 
        productName, 
        quantity, 
        interaction.user,
        interaction.guild
      );

      await interaction.editReply({
        content: `구매가 완료되었습니다!\n- 제품 : ${result.product.name}\n- 수량 : ${quantity}개\n- 사용 금액 : ${result.totalPrice.toLocaleString()}원\n- 남은 잔액 : ${result.remaining.toLocaleString()}원`,
        embeds: [], 
        components: [] 
      });

      let dmContent = `구매가 완료되었습니다!\n상품 : **${result.product.name}**\n수량 : **${quantity}개**\n`;
      if (result.extractedStock) {
        dmContent += `\n**지급된 제품** : \n\`\`\`\n${result.extractedStock}\n\`\`\``;
      }

      await interaction.user.send(dmContent).catch(() => {});
    } catch (error) {
      console.error('[vending] handleQuantityModalSubmit 오류 : ', error);
      await interaction.editReply({ 
        content: formatPurchaseErrorMessage(error),
        embeds: [],
        components: []
      });
    }
  }
};