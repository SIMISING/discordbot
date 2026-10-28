const { EmbedBuilder, MessageFlags } = require('discord.js');
const {
  refillStockData,
  listIndividualStocks,
  editIndividualStock,
  deleteIndividualStock,
} = require('../../services/vending');

async function handleRefillStock(interaction, guildId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const name = interaction.options.getString('name', true).trim();
  const category = interaction.options.getString('category')?.trim() || null;
  const contents = interaction.options.getString('contents', true);
  const splitter = interaction.options.getString('splitter') || '\n';

  const stockList = contents.split(splitter).map(s => s.trim()).filter(s => s.length > 0);

  if (stockList.length === 0) {
    return await interaction.editReply({ content: '충전할 재고 데이터가 유효하지 않거나 비어 있습니다.' });
  }

  try {
    const result = await refillStockData(guildId, name, stockList, category);
    return await interaction.editReply({
      content: `**[${result.name}]** 상품의 재고가 충전되었습니다.\n- 추가된 재고 수: \`${stockList.length}개\`\n- 현재 총 재고 : \`${result.totalStock}개\``
    });
  } catch (error) {
    return await interaction.editReply({ content: `재고 충전 실패 : ${error.message}` });
  }
}

async function handleListStock(interaction, guildId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const name = interaction.options.getString('name', true).trim();
  const category = interaction.options.getString('category')?.trim() || null;

  try {
    const result = await listIndividualStocks(guildId, name, category);
    if (result.stocks.length === 0) {
      return await interaction.editReply({ content: `**[${result.productName}]** 상품에 등록되어 대기 중인 실재고 데이터가 현재 0개입니다.` });
    }

    let desc = `**[${result.productName}]** 상품의 개별 재고 데이터 리스트입니다.\n오기입 데이터 수정/삭제 시 좌측 고유 \`ID\`를 사용하세요.\n\n`;
    result.stocks.forEach(st => {
      desc += `\`ID : ${st.id}\` ➡️ ${st.stock_content}\n`;
    });

    const stockEmbed = new EmbedBuilder()
      .setTitle('개별 재고 실시간 모니터링')
      .setDescription(desc.slice(0, 4000))
      .setColor(0xe67e22)
      .setTimestamp();

    return await interaction.editReply({ embeds: [stockEmbed] });
  } catch (error) {
    return await interaction.editReply({ content: `조회 실패 : ${error.message}` });
  }
}

async function handleEditStock(interaction) {
  const targetId = interaction.options.getInteger('id', true);
  const newContent = interaction.options.getString('content', true).trim();

  try {
    await editIndividualStock(targetId, newContent);
    return await interaction.reply({ content: `\`ID : ${targetId}\`번 개별 재고 내용이 성공적으로 수정 완료되었습니다.`, flags: MessageFlags.Ephemeral });
  } catch (error) {
    return await interaction.reply({ content: `수정 실패 : ${error.message}`, flags: MessageFlags.Ephemeral });
  }
}

function parseStockIdList(rawInput, splitter = null) {
  const normalized = rawInput.trim();
  if (!normalized) return [];

  const tokens = splitter
    ? normalized.split(splitter)
    : normalized.split(/[\s,]+/);

  return tokens.map(token => token.trim()).filter(Boolean);
}

async function handleDeleteStock(interaction, guildId) {
  const rawIdInput = interaction.options.getString('id', true);
  const splitter = interaction.options.getString('splitter');
  const targetIds = parseStockIdList(rawIdInput, splitter);

  if (targetIds.length === 0) {
    return await interaction.reply({ content: '삭제할 재고 ID를 하나 이상 입력해주세요.', flags: MessageFlags.Ephemeral });
  }

  const deletedItems = [];
  const failedItems = [];

  for (const rawTargetId of targetIds) {
    const targetId = Number.parseInt(rawTargetId, 10);
    if (Number.isNaN(targetId) || targetId <= 0) {
      failedItems.push(rawTargetId);
      continue;
    }

    try {
      const result = await deleteIndividualStock(guildId, targetId);
      deletedItems.push({ id: targetId, newTotalStock: result?.newTotalStock });
    } catch (error) {
      failedItems.push(`${rawTargetId} (${error.message})`);
    }
  }

  if (deletedItems.length === 0) {
    return await interaction.reply({ content: `삭제 실패 : ${failedItems.join(', ')}`, flags: MessageFlags.Ephemeral });
  }

  const summary = deletedItems.length === 1
    ? `\`${deletedItems[0].id}\`번 재고가 제거되었습니다.\n- 잔여 재고가 \`${deletedItems[0].newTotalStock}개\`로 조정되었습니다.`
    : `총 ${deletedItems.length}개 재고 항목이 제거되었습니다.\n- 삭제된 ID : ${deletedItems.map(item => `\`${item.id}\``).join(', ')}\n- 마지막 항목 잔여 재고 : \`${deletedItems[deletedItems.length - 1].newTotalStock}개\``;

  return await interaction.reply({
    content: failedItems.length > 0 ? `${summary}\n\n일부 항목은 실패했습니다 : ${failedItems.join(', ')}` : summary,
    flags: MessageFlags.Ephemeral
  });
}

module.exports = {
  handleRefillStock,
  handleListStock,
  handleEditStock,
  handleDeleteStock,
};
