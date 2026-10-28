const { ActivityType } = require('discord.js');

module.exports = {
  name: 'clientReady',
  once: true,
  execute(client) {
    console.log(`\nThe bot is ready!`);
    console.log(`Login account : ${client.user.tag}\n`);

    client.user.setActivity('Discord Bot', { type: ActivityType.Watching });
  },
};
