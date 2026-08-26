const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const { connectDB } = require('./src/database/connect.js');
const { loadEvents }   = require('./src/handlers/eventHandler');
const { loadCommands } = require('./src/handlers/commandHandler');
const config           = require('./config.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember],
});

client.commands       = new Collection();
client.tickets        = new Map();
client.ticketChans    = new Map();
client.claimed        = new Map();
client.blocked        = new Set();
client.staffStats     = new Map();
client.closeTimers    = new Map();
client.adminSessions  = new Map();
client.replyMode      = new Map();
client.captchaCodes   = new Map();   // channelId → كود الكابتشا الحالي
client.captchaMsgs    = new Map();   // channelId → msgId رسالة الكابتشا
client.pendingRatings = new Map();

// اتصل بـ MongoDB أولاً ثم شغّل البوت
// ─── منع إطفاء البوت لأسباب غير متوقعة ────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err?.message || err);
});

connectDB().then(() => {
  loadEvents(client);
  loadCommands(client);

  client.login(config.token).then(() => {
    console.log(`[BOT] Logged in as ${client.user.tag}`);

    // ── Dashboard ──
    global.__hellClient = client;
    const { start } = require('./dashboard/server.js');
    start();
  });
});
