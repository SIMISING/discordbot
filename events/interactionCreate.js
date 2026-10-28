const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder,
  ButtonStyle,
  MessageFlags 
} = require('discord.js');
const {
  getUserBalance,
  getRechargeSettings,
  getShopProducts,
  getUserLoyaltyStatus,
} = require('../services/vending');
const { handleInfoButtons } = require('../commands/handlers/infoButtons');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
      return;
    }
  },
};

async function handleChatInputCommand(interaction) {
  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error('Error executing command : ', error);
    
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '명령어를 실행하는 중 오류가 발생했습니다.' }).catch(() => {});
    } else {
      await interaction.reply({ content: '명령어를 실행하는 중 오류가 발생했습니다.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

async function handleButton(interaction) {
  const customId = interaction.customId;
  const guildId = interaction.guildId;

  if (['shop_log_buy', 'shop_log_recharge', 'shop_grade_condition'].includes(customId)) {
    return await handleInfoButtons(interaction);
  }

  if (customId === 'shop_recharge') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const settings = await getRechargeSettings(guildId);
    if (!settings) {
      return await interaction.reply({ content: '계좌 정보가 등록되지 않았습니다. 관리자에게 문의하세요.', flags: MessageFlags.Ephemeral });
    }

    const accounts = Array.isArray(settings.accounts) && settings.accounts.length > 0
      ? settings.accounts
      : [{ bank_name: settings.bank_name, account_number: settings.account_number, account_holder: settings.account_holder, extra_info: settings.extra_info || '' }];

    if (accounts.length > 1) {
      const embed = new EmbedBuilder()
        .setTitle('💳 충전 계좌 선택')
        .setDescription('입금할 계좌를 선택해주세요.')
        .setColor(0x2f3136);

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('shop_recharge_select_account')
        .setPlaceholder('계좌를 선택하세요')
        .addOptions(accounts.map((account, index) => ({
          label: `${account.bank_name || '은행'} ${account.account_number || ''}`,
          value: String(index),
          description: `${account.account_holder || '예금주 미기재'}`
        })));

      const row = new ActionRowBuilder().addComponents(selectMenu);
      return await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }

    const account = accounts[0];
    const modal = new ModalBuilder()
      .setCustomId(`shop_recharge_modal:0`)
      .setTitle('포인트 충전 신청');
    const senderInput = new TextInputBuilder().setCustomId('sender_input').setLabel('입금자명').setStyle(TextInputStyle.Short).setPlaceholder('홍길동').setRequired(true);
    const amountInput = new TextInputBuilder().setCustomId('amount_input').setLabel('입금 금액').setStyle(TextInputStyle.Short).setPlaceholder('10000').setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(senderInput), new ActionRowBuilder().addComponents(amountInput));
    return await interaction.showModal(modal);
  }

  if (customId === 'shop_info') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const balanceData = await getUserBalance(interaction.user.id);
    const loyaltyInfo = await getUserLoyaltyStatus(interaction.user.id, guildId);

    const currentBalance = typeof balanceData === 'number' ? balanceData : (balanceData.balance || 0);
    const totalUsed = balanceData.total_used || 0;
    const pointBalance = balanceData.point_balance || 0;
    const userGrade = loyaltyInfo.gradeName || '일반';
    const nextThresholdText = loyaltyInfo.nextThreshold ? `다음 등급까지 ${(loyaltyInfo.nextThreshold-totalUsed).toLocaleString()}원 남음` : '최고 등급입니다.';

    const embed = new EmbedBuilder()
      .setTitle('👤 내 정보')
      .setColor(0x2f3136)
      .setDescription(
        `• **닉네임** : \`${interaction.user.username}\`\n` +
        `• **보유금액** : \`${currentBalance.toLocaleString()}원\`\n` +
        `• **사용금액** : \`${totalUsed.toLocaleString()}원\`\n` +
        `• **포인트 잔액** : \`${pointBalance.toLocaleString()}P\`\n` +
        `• **적용된 등급** : \`${userGrade}\`\n` +
        `• **등급 진행** : \`${nextThresholdText}\`\n` +
        `• **포인트 전환 기준** : \`${loyaltyInfo.convertThreshold.toLocaleString()}P 이상\``
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('shop_log_buy').setLabel('구매로그').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('shop_log_recharge').setLabel('충전로그').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('shop_grade_condition').setLabel('등업조건').setStyle(ButtonStyle.Primary)
    );

    return await interaction.editReply({ embeds: [embed], components: [row] });
  }

  if (customId === 'shop_products') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const products = await getShopProducts(guildId);
    
    if (!products || products.length === 0) {
      return await interaction.editReply({ content: '등록된 상품이 없습니다.' });
    }

    const categories = [...new Set(products.map(p => p.category || '기타'))];

    let desc = '조회하실 카테고리를 선택해주세요.\n\n';
    categories.forEach(cat => {
      const count = products.filter(p => p.category === cat).length;
      desc += `• **${cat}** : \`${count}개\`\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🛒 카테고리 선택')
      .setDescription(desc)
      .setColor(0x2f3136);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('shop_view_category')
      .setPlaceholder('카테고리를 선택하세요')
      .addOptions(
        categories.map(cat => ({
          label: cat,
          value: cat
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);
    return await interaction.editReply({ embeds: [embed], components: [row] });
  }

  if (customId === 'shop_buy') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const products = await getShopProducts(guildId);

    if (!products || products.length === 0) {
      return await interaction.editReply({ content: '구매 가능한 상품이 없습니다.' });
    }

    const categories = [...new Set(products.map(p => p.category || '기타'))];

    const embed = new EmbedBuilder()
      .setTitle('🗂️ 카테고리 선택')
      .setDescription('구매할 카테고리를 선택해주세요.')
      .setColor(0x2f3136);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('shop_buy_category')
      .setPlaceholder('카테고리를 선택하세요')
      .addOptions(categories.map(cat => ({ label: cat, value: cat })));

    const row = new ActionRowBuilder().addComponents(selectMenu);
    return await interaction.editReply({ embeds: [embed], components: [row] });
  }
}

async function handleSelectMenu(interaction) {
  const customId = interaction.customId;
  const guildId = interaction.guildId;

  if (customId === 'shop_view_category') {
    await interaction.deferUpdate();
    const selectedCategory = interaction.values[0];
    const products = await getShopProducts(guildId);
    const filteredProducts = products.filter(p => p.category === selectedCategory);

    const embed = new EmbedBuilder()
      .setTitle(`📦 ${selectedCategory} 제품 목록`)
      .setColor(0x2f3136);

    let desc = '';
    filteredProducts.forEach(p => {
      desc += `• **제품명** : ${p.name}\n`;
      desc += `• **가격** : ${p.price.toLocaleString()}원\n`;
      desc += `• **재고** : \`${p.is_account === 1 ? `${p.stock}개` : '무제한'}\`\n\n`;
    });

    embed.setDescription(desc || '이 카테고리에는 등록된 제품이 없습니다.');
    return await interaction.editReply({ embeds: [embed], components: [] });
  }

  if (customId === 'shop_buy_category') {
    await interaction.deferUpdate();
    const selectedCategory = interaction.values[0];
    const products = await getShopProducts(guildId);
    const filteredProducts = products.filter(p => p.category === selectedCategory);

    if (filteredProducts.length === 0) {
      return await interaction.editReply({ content: '해당 카테고리에 판매 중인 상품이 없습니다.', embeds: [], components: [] });
    }

    const embed = new EmbedBuilder()
      .setTitle('🛒 제품 선택')
      .setDescription('구매할 제품을 선택해주세요.')
      .setColor(0x2f3136);

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('shop_buy_product')
      .setPlaceholder('제품 선택')
      .addOptions(
        filteredProducts.map(p => ({
          label: p.name,
          value: p.name,
          description: `${p.price.toLocaleString()}원 | 재고: ${p.is_account === 1 ? `${p.stock}개` : '무제한'}`
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);
    return await interaction.editReply({ embeds: [embed], components: [row] });
  }

  if (customId === 'shop_buy_product') {
    const productName = interaction.values[0];
    const { handlePurchaseSubmit } = require('../services/vending');
    return await handlePurchaseSubmit(interaction, productName); 
  }

  if (customId === 'shop_recharge_select_account') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
    const selectedIndex = Number(interaction.values[0] ?? 0);

    const modal = new ModalBuilder()
      .setCustomId(`shop_recharge_modal:${selectedIndex}`)
      .setTitle('포인트 충전 신청');
    const senderInput = new TextInputBuilder().setCustomId('sender_input').setLabel('입금자명').setStyle(TextInputStyle.Short).setPlaceholder('홍길동').setRequired(true);
    const amountInput = new TextInputBuilder().setCustomId('amount_input').setLabel('입금 금액').setStyle(TextInputStyle.Short).setPlaceholder('10000').setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(senderInput), new ActionRowBuilder().addComponents(amountInput));
    return await interaction.showModal(modal);
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId.startsWith('shop_recharge_modal')) {
    const { handleRechargeSubmit } = require('../services/vending');
    return await handleRechargeSubmit(interaction);
  }

  if (interaction.customId.startsWith('purchase_quantity_modal:')) {
    const productName = interaction.customId.split('purchase_quantity_modal:')[1];
    const { handleQuantityModalSubmit } = require('../services/vending');
    return await handleQuantityModalSubmit(interaction, productName);
  }
}