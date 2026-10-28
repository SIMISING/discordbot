const { 
  EmbedBuilder
} = require('discord.js');
const { getLogChannelId } = require('../database/database');

async function sendPurchaseLog(guild, user, product, quantity) {
  try {
    if (!guild || !user || !product) {
      console.log('로그 채널 미설정');
      return;
    }

    const channelId = await getLogChannelId(guild.id);
    if (!channelId) {
      console.log('로그 채널 미설정');
      return;
    }

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.log('로그 채널 미설정');
      return;
    }

    const now = new Date();
    const formattedDate = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Seoul'
    }).format(now);

    const embed = new EmbedBuilder()
      .setColor(0x2f3136)
      .setDescription(
        `${user}님 구매해 주셔서 감사합니다!\n\n` +
        `**구매한 상품** : ${product.name} (${quantity}개)\n\n` +
        `\`${formattedDate}\``
      );

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[logger] sendPurchaseLog 오류 : ', error);
  }
}

module.exports = {
  sendPurchaseLog,
};
