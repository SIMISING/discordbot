const { EmbedBuilder, MessageFlags } = require('discord.js');
const { getUserSpecificLogsFromDB, getUserRechargeLogsFromDB } = require('../../database/database');
const { getLoyaltySettings } = require('../../services/vending');

async function handleInfoButtons(interaction) {
  const customId = interaction.customId;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  if (customId === 'shop_log_buy') {
    const logs = getUserSpecificLogsFromDB(userId, guildId);
    
    const embed = new EmbedBuilder()
      .setTitle('🛍️ 최근 구매 로그 (최대 10개)')
      .setColor(0x2f3136);

    if (logs.length === 0) {
      embed.setDescription('최근 구매 내역이 존재하지 않습니다.');
    } else {
      let desc = '';
      logs.forEach((log, index) => {
        desc += `\`${index + 1}.\` **${log.product_name}** (${log.quantity}개) - \`${log.used_points.toLocaleString()}원\`\n📅 ${log.timestamp}\n\n`;
      });
      embed.setDescription(desc);
    }
    return await interaction.editReply({ embeds: [embed] });
  }

  if (customId === 'shop_log_recharge') {
    const logs = getUserRechargeLogsFromDB(userId, guildId);

    const embed = new EmbedBuilder()
      .setTitle('💵 최근 충전 로그 (최대 10개)')
      .setColor(0x2f3136);
    
    if (logs.length === 0) {
      embed.setDescription('최근 충전 내역이 존재하지 않습니다.');
    } else {
      let desc = '';
      logs.forEach((log, index) => {
        desc += `\`${index + 1}.\` **충전 완료** : \`+${log.amount.toLocaleString()}원\`\n📅 ${log.timestamp}\n\n`;
      });
      embed.setDescription(desc);
    }

    return await interaction.editReply({ embeds: [embed] });
  }

  if (customId === 'shop_grade_condition') {
    const loyaltySettings = getLoyaltySettings(guildId);
    const rulesText = Array.isArray(loyaltySettings.grade_rules) && loyaltySettings.grade_rules.length > 0
      ? loyaltySettings.grade_rules.map(rule => `• **${rule.name}**: 누적 사용 \`${Number(rule.threshold).toLocaleString()}원\` 이상`).join('\n')
      : `• **VIP**: 누적 사용 \`50,000원\` 이상\n• **VVIP**: 누적 사용 \`150,000원\` 이상`;

    const rewardText = loyaltySettings.reward_threshold > 0 && loyaltySettings.reward_rate > 0
      ? `🎁 **포인트 혜택**: \`${loyaltySettings.reward_threshold.toLocaleString()}원\` 이상 결제 시 결제 금액의 \`${loyaltySettings.reward_rate}%\`가 포인트로 적립됩니다.`
      : '🎁 **포인트 혜택**: 현재 설정된 포인트 적립 규칙이 없습니다.';

    const convertText = loyaltySettings.convert_threshold > 0
      ? `🔄 **포인트 전환**: \`${loyaltySettings.convert_threshold.toLocaleString()}P\` 이상 모이면 보유금액으로 전환할 수 있습니다.`
      : '🔄 **포인트 전환**: 현재 전환 기준이 설정되지 않았습니다.';

    const embed = new EmbedBuilder()
      .setTitle('👑 등급 업그레이드 조건 안내')
      .setColor(0x2f3136)
      .setDescription(`누적 사용 금액에 따라 등급이 자동으로 적용됩니다.\n\n${rulesText}\n\n${rewardText}\n${convertText}`);

    return await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = {
  handleInfoButtons,
};