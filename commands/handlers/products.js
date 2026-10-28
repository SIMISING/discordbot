const { ChannelType, MessageFlags, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder } = require('discord.js');
const {
  addShopProduct,
  loadShopProductsFromDB,
  updateShopProduct,
  deleteShopProduct,
  getShopProducts,
} = require('../../services/vending');
const { buildProductChannelName } = require('./shared');

async function handleAddProduct(interaction, guildId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = interaction.options.getString('name', true).trim();
  const price = interaction.options.getInteger('price', true);
  const categoryName = interaction.options.getString('category', true).trim();
  const visibility = interaction.options.getString('visibility', true);

  if (price <= 0) return await interaction.editReply({ content: '가격은 1 이상이어야 합니다.' });

  const existingProducts = await getShopProducts(guildId);
  const isDuplicate = existingProducts.some(
    p => p.category.toLowerCase() === categoryName.toLowerCase() && p.name.toLowerCase() === name.toLowerCase()
  );

  if (isDuplicate) {
    return await interaction.editReply({ 
      content: `[${categoryName}] 카테고리 내에 이미 '${name}' 이름을 가진 제품이 존재합니다. 채널을 생성할 수 없습니다.` 
    });
  }

  let categoryChannel = interaction.guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase()
  );

  if (!categoryChannel) {
    categoryChannel = await interaction.guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
      reason: `카테고리 자동 생성 : ${categoryName}`
    });
  }

  const permissionOverwrites = [
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageChannels
      ],
    }
  ];

  if (visibility === 'private') {
    permissionOverwrites.push({
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    });
  } else if (visibility === 'readonly') {
    permissionOverwrites.push({
      id: interaction.guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions
      ],
    });
  }

  const channelName = buildProductChannelName(name);
  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryChannel.id,
    permissionOverwrites,
    reason: `상품 채널 생성 : ${name}`,
  });

  try {
    await addShopProduct(guildId, channel.id, name, price, categoryName, false);
  } catch (error) {
    await channel.delete('상품 등록 실패로 인한 채널 회수').catch(() => {});
    return await interaction.editReply({ content: error.message });
  }

  await loadShopProductsFromDB(guildId);

  return await interaction.editReply({
  content: `**채널형 제품이 추가되었습니다.**\n\n` +
           `• **카테고리** : ${categoryName}\n` +
           `• **생성된 채널** : ${channel}\n` +
           `• **현재 공개 설정** : ${visibility === 'private' ? '`아예 안 보임 (완전 비공개)`' : '`채널 목록 표시 (읽기/전송 불가)`'}\n\n` +
           `ℹ️ *유저가 상품을 구매하면 이 채널을 전체 열람(메시지 기록 포함)할 수 있는 개별 권한이 자동으로 부여됩니다.*`
  });

  return await interaction.editReply({
    content: `채널형 제품이 추가되었습니다.\n* 카테고리 : **${categoryName}**\n* 생성된 채널 : ${channel}`
  });
}

async function handleAddAccountProduct(interaction, guildId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = interaction.options.getString('name', true).trim();
  const price = interaction.options.getInteger('price', true);
  const description = interaction.options.getString('description') ? interaction.options.getString('description').trim() : '';
  const categoryName = interaction.options.getString('category', true).trim();

  if (price <= 0) return await interaction.editReply({ content: '가격은 1 이상이어야 합니다.' });

  const existingProducts = await getShopProducts(guildId);
  const isDuplicate = existingProducts.some(
    p => p.category.toLowerCase() === categoryName.toLowerCase() && p.name.toLowerCase() === name.toLowerCase()
  );

  if (isDuplicate) {
    return await interaction.editReply({
      content: `[${categoryName}] 카테고리 내에 이미 '${name}' 이름을 가진 제품이 존재합니다. 등록할 수 없습니다.`
    });
  }

  try {
    await addShopProduct(guildId, '', name, price, categoryName, true, description);
  } catch (error) {
    return await interaction.editReply({ content: error.message });
  }

  await loadShopProductsFromDB(guildId);

  return await interaction.editReply({
    content: `**계정/DM 전송 전용** 상품이 상점에 등록되었습니다.\n* 카테고리 : **${categoryName}**\n* 상품명 : **${name}**\n\n바로 \`/shop refill-stock\` 명령어를 이용하여 실재고 데이터(니트로 주소나 계정 정보 등)를 충전해 주어야 유저가 구매할 수 있습니다.`
  });
}

async function handleEditProduct(interaction, guildId) {
  const name = interaction.options.getString('name', true).trim();
  const newName = interaction.options.getString('new_name')?.trim() || null;
  const targetCategoryName = interaction.options.getString('target_category')?.trim() || null;
  const price = interaction.options.getInteger('price');
  const description = interaction.options.getString('description');
  const categoryName = interaction.options.getString('category');

  const products = await getShopProducts(guildId);
  const normalizedName = name.toLowerCase();
  const normalizedTargetCategory = targetCategoryName ? targetCategoryName.toLowerCase() : null;
  const matchingProducts = products.filter(p =>
    p.name.toLowerCase() === normalizedName &&
    (!normalizedTargetCategory || p.category.toLowerCase() === normalizedTargetCategory)
  );

  if (matchingProducts.length > 1) {
    return await interaction.reply({ content: '같은 이름의 상품이 여러 개 존재합니다. `target_category` 옵션으로 대상 카테고리를 지정해주세요.', flags: MessageFlags.Ephemeral });
  }

  const targetProduct = matchingProducts[0];

  if (!targetProduct) {
    return await interaction.reply({ content: `상점에 \`${name}\` 이름을 가진 상품이 존재하지 않습니다.`, flags: MessageFlags.Ephemeral });
  }

  const updates = {};
  const resolvedCategory = categoryName !== null ? categoryName.trim() : targetProduct.category;

  if (newName !== null) {
    if (newName.length === 0) {
      return await interaction.reply({ content: '새 제품 이름은 비워둘 수 없습니다.', flags: MessageFlags.Ephemeral });
    }

    const duplicateName = products.some(p =>
      p.product_id !== targetProduct.product_id &&
      p.name.toLowerCase() === newName.toLowerCase() &&
      p.category.toLowerCase() === resolvedCategory.toLowerCase()
    );

    if (duplicateName) {
      return await interaction.reply({ content: `카테고리 \`${resolvedCategory}\` 내에 이미 \`${newName}\` 이름의 상품이 존재합니다.`, flags: MessageFlags.Ephemeral });
    }

    updates.name = newName;
  }

  if (price !== null) {
    if (price <= 0) return await interaction.reply({ content: '가격은 1 이상이어야 합니다.', flags: MessageFlags.Ephemeral });
    updates.price = price;
  }
  if (description !== null) updates.description = description.trim();

  if (categoryName !== null) {
    updates.category = categoryName.trim();

    if (targetProduct.channel_id) {
      let categoryChannel = interaction.guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.trim().toLowerCase()
      );

      if (!categoryChannel) {
        categoryChannel = await interaction.guild.channels.create({
          name: categoryName.trim(),
          type: ChannelType.GuildCategory,
          reason: `상품 카테고리 이관을 위한 신규 자동 생성`
        });
      }

      const productChannel = await interaction.guild.channels.fetch(targetProduct.channel_id).catch(() => null);
      if (productChannel) {
        await productChannel.setParent(categoryChannel.id, { lockPermissions: false }).catch(err => {
          console.error('[shop] 카테고리 이동 실패 : ', err);
        });
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return await interaction.reply({ content: '수정할 항목을 하나 이상 입력해주세요.', flags: MessageFlags.Ephemeral });
  }

  await updateShopProduct(guildId, targetProduct.product_id, updates);

  if (newName && targetProduct.channel_id) {
    const productChannel = await interaction.guild.channels.fetch(targetProduct.channel_id).catch(() => null);
    if (productChannel && typeof productChannel.setName === 'function') {
      await productChannel.setName(buildProductChannelName(newName)).catch(err => {
        console.error('[shop] 채널 이름 변경 실패 : ', err);
      });
    }
  }

  await loadShopProductsFromDB(guildId);
  return await interaction.reply({ content: `제품 \`${name}\` 정보가 수정되었습니다.${newName ? ` 새 이름: \`${newName}\`` : ''}`, flags: MessageFlags.Ephemeral });
}

async function handleDeleteProduct(interaction, guildId) {
  const name = interaction.options.getString('name', true).trim();
  const targetCategoryName = interaction.options.getString('target_category')?.trim() || null;

  const products = await getShopProducts(guildId);
  const normalizedName = name.toLowerCase();
  const normalizedTargetCategory = targetCategoryName ? targetCategoryName.toLowerCase() : null;
  const matchingProducts = products.filter(p =>
    p.name.toLowerCase() === normalizedName &&
    (!normalizedTargetCategory || p.category.toLowerCase() === normalizedTargetCategory)
  );

  if (matchingProducts.length > 1) {
    return await interaction.reply({ content: '같은 이름의 상품이 여러 개 존재합니다. `target_category` 옵션으로 대상 카테고리를 지정해주세요.', flags: MessageFlags.Ephemeral });
  }

  const targetProduct = matchingProducts[0];

  if (!targetProduct) {
    return await interaction.reply({ content: `상점에 \`${name}\` 이름을 가진 상품이 존재하지 않습니다.`, flags: MessageFlags.Ephemeral });
  }

  if (targetProduct.channel_id) {
    const channel = await interaction.guild.channels.fetch(targetProduct.channel_id).catch(() => null);
    if (channel) {
      await channel.delete('상품 삭제로 인한 자동 채널 제거').catch(err => {
        console.error('[shop] 상품 채널 삭제 실패 : ', err);
      });
    }
  }

  await deleteShopProduct(guildId, targetProduct.product_id);
  await loadShopProductsFromDB(guildId);
  return await interaction.reply({ content: `제품 \`${name}\`과(와) 연동된 데이터 및 채널이 삭제되었습니다.`, flags: MessageFlags.Ephemeral });
}

module.exports = {
  handleAddProduct,
  handleAddAccountProduct,
  handleEditProduct,
  handleDeleteProduct,
};
