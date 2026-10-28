const { EmbedBuilder, MessageFlags } = require('discord.js');
const { setRechargeSettings, deleteRechargeAccount, getRechargeSettings, grantUserPoints, grantUserBalance, convertPointsToBalance, setLoyaltySettings } = require('../../services/vending');
const { sanitizeText, MAX_TEXT_LENGTH } = require('./shared');

async function handleSetAccount(interaction, guildId) {
  const bank = sanitizeText(interaction.options.getString('bank', true), MAX_TEXT_LENGTH);
  const number = sanitizeText(interaction.options.getString('number', true), MAX_TEXT_LENGTH);
  const holder = sanitizeText(interaction.options.getString('holder', true), MAX_TEXT_LENGTH);
  const extra = sanitizeText(interaction.options.getString('extra') || '', 200);

  if (!bank || !number || !holder) {
    return await interaction.reply({
      content: '은행명, 계좌번호, 예금주명은 모두 비어 있을 수 없습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const existingSettings = await getRechargeSettings(guildId);
  const existingAccounts = Array.isArray(existingSettings?.accounts) ? existingSettings.accounts : [];
  const isDuplicate = existingAccounts.some(account =>
    String(account.bank_name || '').trim() === bank &&
    String(account.account_number || '').trim() === number &&
    String(account.account_holder || '').trim() === holder
  );

  if (isDuplicate) {
    return await interaction.reply({
      content: `이미 등록된 계좌입니다.\n- ${bank} / ${number} / ${holder}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const updatedSettings = setRechargeSettings(guildId, bank, number, holder, extra || '');
  const accountList = Array.isArray(updatedSettings?.accounts) ? updatedSettings.accounts : [{
    bank_name: updatedSettings?.bank_name || bank,
    account_number: updatedSettings?.account_number || number,
    account_holder: updatedSettings?.account_holder || holder,
  }];

  const accountEmbed = new EmbedBuilder()
    .setTitle('💳 충전 계좌 등록 완료')
    .setDescription('계좌 정보가 설정되었습니다.')
    .addFields(
      { name: '은행명', value: bank, inline: true },
      { name: '계좌번호', value: number, inline: true },
      { name: '예금주', value: holder, inline: true },
      { name: '등록 계좌 수', value: `${accountList.length}개`, inline: true },
      { name: '비고/안내', value: extra || '없음', inline: false }
    )
    .setColor(0x2ecc71)
    .setTimestamp();

  return await interaction.reply({ embeds: [accountEmbed], flags: MessageFlags.Ephemeral });
}

async function handleDeleteAccount(interaction, guildId) {
  const bank = sanitizeText(interaction.options.getString('bank', true), MAX_TEXT_LENGTH);
  const number = sanitizeText(interaction.options.getString('number', true), MAX_TEXT_LENGTH);
  const holder = sanitizeText(interaction.options.getString('holder', true), MAX_TEXT_LENGTH);

  if (!bank || !number || !holder) {
    return await interaction.reply({
      content: '은행명, 계좌번호, 예금주명은 모두 비어 있을 수 없습니다.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const result = deleteRechargeAccount(guildId, bank, number, holder);
  if (!result || result.deleted === 0) {
    return await interaction.reply({
      content: `삭제할 계좌를 찾지 못했습니다.\n- ${bank} / ${number} / ${holder}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return await interaction.reply({
    content: `등록된 충전 계좌를 삭제했습니다.\n- ${bank} / ${number} / ${holder}\n남은 계좌 수: ${result.accounts.length}개`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleGrantPoints(interaction, guildId) {
  const targetUser = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason')?.trim() || '관리자 지급';

  if (amount <= 0) {
    return await interaction.reply({ content: '지급 금액은 1 이상이어야 합니다.', flags: MessageFlags.Ephemeral });
  }

  try {
    const newBalance = await grantUserPoints(targetUser.id, amount, guildId);
    return await interaction.reply({
      content: `\`${targetUser.tag}\`님에게 \`${amount.toLocaleString()}포인트\`를 지급했습니다.\n- 사유 : ${reason}\n- 지급 후 포인트 : \`${newBalance.toLocaleString()}P\``,
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    return await interaction.reply({ content: `포인트 지급 실패 : ${error.message}`, flags: MessageFlags.Ephemeral });
  }
}

async function handleGrantBalance(interaction, guildId) {
  const targetUser = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  const reason = interaction.options.getString('reason')?.trim() || '관리자 지급';

  if (amount <= 0) {
    return await interaction.reply({ content: '지급 금액은 1 이상이어야 합니다.', flags: MessageFlags.Ephemeral });
  }

  try {
    const newBalance = await grantUserBalance(targetUser.id, amount, guildId);
    return await interaction.reply({
      content: `\`${targetUser.tag}\`님에게 \`${amount.toLocaleString()}원\`을 지급했습니다.\n- 사유 : ${reason}\n- 지급 후 보유금액 : \`${newBalance.toLocaleString()}원\``,
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    return await interaction.reply({ content: `보유금액 지급 실패 : ${error.message}`, flags: MessageFlags.Ephemeral });
  }
}

function parseGradeRules(rawInput) {
  if (!rawInput) return [];

  return rawInput
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [name, threshold] = part.split('=').map(item => item.trim());
      if (!name || Number.isNaN(Number(threshold))) return null;
      return { name, threshold: Number(threshold) };
    })
    .filter(Boolean)
    .sort((a, b) => a.threshold - b.threshold);
}

async function handleSetPointSettings(interaction, guildId) {
  const rewardThreshold = interaction.options.getInteger('reward_threshold', true);
  const rewardRate = interaction.options.getInteger('reward_rate', true);
  const convertThreshold = interaction.options.getInteger('convert_threshold', true);

  if (rewardThreshold < 0 || rewardRate < 0 || convertThreshold < 0) {
    return await interaction.reply({ content: '설정값은 0 이상이어야 합니다.', flags: MessageFlags.Ephemeral });
  }

  const saved = setLoyaltySettings(guildId, {
    reward_threshold: rewardThreshold,
    reward_rate: rewardRate,
    convert_threshold: convertThreshold,
  });

  return await interaction.reply({
    content: `포인트 설정이 저장되었습니다.\n- 결제 기준 금액 : \`${saved.reward_threshold.toLocaleString()}원\`\n- 포인트 적립률 : \`${saved.reward_rate}%\`\n- 전환 기준 : \`${saved.convert_threshold.toLocaleString()}P\``,
    flags: MessageFlags.Ephemeral
  });
}

async function handleSetGradeSettings(interaction, guildId) {
  const rulesInput = interaction.options.getString('rules', true).trim();
  const parsedRules = parseGradeRules(rulesInput);

  if (parsedRules.length === 0) {
    return await interaction.reply({ content: '등급 규칙은 예시처럼 VIP=50000|VVIP=150000 형식으로 입력해주세요.', flags: MessageFlags.Ephemeral });
  }

  const saved = setLoyaltySettings(guildId, {
    grade_rules: parsedRules,
  });

  return await interaction.reply({
    content: `등급 규칙이 저장되었습니다.\n- 설정값 : ${saved.grade_rules.map(rule => `${rule.name}(${rule.threshold.toLocaleString()}원 이상)`).join(' / ')}`,
    flags: MessageFlags.Ephemeral
  });
}

async function handleConvertPoints(interaction, guildId) {
  const amount = interaction.options.getInteger('amount');

  try {
    const balanceData = await convertPointsToBalance(interaction.user.id, amount ?? undefined, guildId);
    return await interaction.reply({
      content: `포인트를 보유금액으로 전환했습니다.\n- 전환 후 보유금액 : \`${balanceData.balance.toLocaleString()}원\`\n- 남은 포인트 : \`${balanceData.point_balance.toLocaleString()}P\``,
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    return await interaction.reply({ content: `포인트 전환 실패 : ${error.message}`, flags: MessageFlags.Ephemeral });
  }
}

module.exports = {
  handleSetAccount,
  handleDeleteAccount,
  handleGrantPoints,
  handleGrantBalance,
  handleSetPointSettings,
  handleSetGradeSettings,
  handleConvertPoints,
};
