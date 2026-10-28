const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

const loadEvents = () => {
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (event.name && typeof event.execute === 'function') {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
      console.log(`Event loaded: ${event.name}`);
    } else {
      console.warn(`Event file format is incorrect: ${file}`);
    }
  }
};

const loadCommands = (dirPath = path.join(__dirname, 'commands')) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return;
  }

  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (item === 'handlers') continue;
      loadCommands(fullPath);
    }
    else if (item.endsWith('.js')) {
      const command = require(fullPath);

      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`Command loaded: ${command.data.name}`);
      } else {
        console.warn(`Command file format is incorrect : ${fullPath}`);
      }
    }
  }
};

const initialize = () => {
  console.log('Initializing bot...\n');
  loadEvents();
  loadCommands();
  client.login(process.env.DISCORD_TOKEN);
};

process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection : ', error);
});

process.on('uncaughtException', error => {
  console.error('Uncaught Exception : ', error);
});

initialize();
