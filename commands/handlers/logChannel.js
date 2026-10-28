const { MessageFlags, ChannelType } = require('discord.js');
const { setLogChannelId } = require('../../database/database');

async function handleSetLogChannel(interaction, guildId) {
  const channel = interaction.options.getChannel('channel');

  if (channel.type !== ChannelType.GuildText) {
    return await interaction.reply({
      content: '일반 텍스트 채널만 로그 채널로 설정할 수 있습니다.',
      flags: MessageFlags.Ephemeral
    });
  }

  try {
    setLogChannelId(guildId, channel.id);

    return await interaction.reply({
      content: `상점 구매 로그 채널이 ${channel}(으)로 변경 및 등록되었습니다.`,
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error('[logChannel] 로그 채널 저장 오류 : ', error);
    return await interaction.reply({
      content: '로그 채널을 데이터베이스에 등록하는 도중 알 수 없는 에러가 발생했습니다.',
      flags: MessageFlags.Ephemeral
    });
  }
}

module.exports = {
  handleSetLogChannel,
};