const { EmbedBuilder } = require('discord.js');
const { createShopButtons } = require('../../util/shopButtons');

async function handleOpen(interaction) {
  const customDesc = interaction.options.getString('description');

  const defaultDesc = `버튼을 눌러보세요!`;
  const safeDesc = customDesc ? customDesc.replace(/\n/g, '\n').slice(0, 1000) : defaultDesc;

  const finalDesc = safeDesc || defaultDesc;

  const embed = new EmbedBuilder()
    .setTitle('구매하기')
    .setDescription(finalDesc)
    .setColor(0x2f3136)
    .setFields([
      { name: '\u200B', value: '문제 발견 시 DM부탁드립니다.' }
    ]);

  const row = createShopButtons();
  return await interaction.reply({ embeds: [embed], components: [row] });
}

module.exports = {
  handleOpen,
};