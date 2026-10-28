const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const rest = new REST({ version: '10' }).setToken(token);

const deployCommands = async () => {
  try {
    console.log('Deploying commands to Discord...\n');

    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');

    if (!fs.existsSync(commandsPath)) {
      fs.mkdirSync(commandsPath, { recursive: true });
      console.log('commands folder was not found and created.');
      return;
    }

    const collectCommands = (dirPath) => {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (item === 'handlers') {
            continue;
          }
          collectCommands(fullPath);
        }
        else if (item.endsWith('.js')) {
          const command = require(fullPath);

          if ('data' in command) {
            commands.push(command.data.toJSON());
            console.log(`Command collected : ${command.data.name}`);
          } else {
            console.warn(`Command file format is incorrect : ${fullPath}`);
          }
        }
      }
    };

    collectCommands(commandsPath);

    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`\nGuild(${guildId}) has ${commands.length} commands deployed!`);
    }
    else {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log(`\nGlobal commands deployed : ${commands.length}`);
    }
  } catch (error) {
    console.error('Error occurred while deploying commands : ', error);
  }
};

deployCommands();
