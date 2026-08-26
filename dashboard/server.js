/**
 * HELL Dashboard — Backend API
 * Express.js server that connects to the same MongoDB as the bot
 * and exposes a full REST API for the dashboard.
 *
 * Place this file inside your bot project root.
 * Run: node dashboard/server.js  (or alongside the bot)
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const mongoose = require('mongoose');
const http    = require('http');
const { Server } = require('socket.io');
const session  = require('express-session');
const fetch    = require('node-fetch');
const { getWhitelist, addToWhitelist, removeFromWhitelist, isWhitelisted } = require('../src/database/models.js');

// ─── تحميل config البوت مباشرة ────────────────────────────────
const config  = require('../config.js');

const app  = express();
const httpServer = http.createServer(app);
const io   = new Server(httpServer, { cors: { origin: '*' } });
// Railway يضبط PORT تلقائياً، DASH_PORT للإعداد اليدوي، الافتراضي 3000
const PORT = process.env.PORT || process.env.DASH_PORT || 3000;

// تصدير io عشان نستخدمها من البوت
global.__hellIO = io;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Session ──────────────────────────────────────────────────
app.use(session({
  secret:            config.sessionSecret || 'hell-dashboard-secret',
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 1000 * 60 * 60 * 24 }, // 24 ساعة
}));

// ─── Auth Helpers ─────────────────────────────────────────────
const DISCORD_API  = 'https://discord.com/api/v10';
// على Railway: اضبط متغير البيئة DASHBOARD_URL بـ URL السيرفر الحقيقي
// مثال: https://my-bot.up.railway.app
// محلياً: يُقرأ من config.js تلقائياً
const REDIRECT_URI = () => `${process.env.DASHBOARD_URL || config.dashboardURL}/auth/callback`;

function isLoggedIn(req) { return !!req.session?.user; }
async function isAllowed(req) {
  if (!isLoggedIn(req)) return false;
  if (req.session.user.id === config.ownerID) return true;
  return isWhitelisted(req.session.user.id);
}

// ─── Auth Routes ──────────────────────────────────────────────

// GET /auth/login — redirect to Discord OAuth
app.get('/auth/login', (req, res) => {
  const url = `https://discord.com/oauth2/authorize`
    + `?client_id=${config.clientID}`
    + `&redirect_uri=${encodeURIComponent(REDIRECT_URI())}`
    + `&response_type=code&scope=identify`;
  res.redirect(url);
});

// GET /auth/callback — Discord returns here with code
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/auth/login');
  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     config.clientID,
        client_secret: config.clientSecret,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI(),
      }),
    });
    const token = await tokenRes.json();
    if (!token.access_token) throw new Error('no token');

    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const user = await userRes.json();
    req.session.user = { id: user.id, username: user.username, avatar: user.avatar };

    res.redirect('/');
  } catch (e) {
    console.error('[Auth] OAuth error:', e.message);
    res.redirect('/auth/login');
  }
});

// GET /auth/logout
app.get('/auth/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/auth/login');
});

// GET /auth/me — يرجع بيانات الجلسة الحالية
app.get('/auth/me', (req, res) => {
  if (!isLoggedIn(req)) return res.status(401).json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.session.user, isOwner: req.session.user.id === config.ownerID });
});

// ─── Auth Guard — كل /api و / يمرون من هنا ───────────────────
app.use(async (req, res, next) => {
  // مسارات مستثناة من الحماية
  if (req.path.startsWith('/auth/')) return next();

  if (!isLoggedIn(req)) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not logged in' });
    return res.sendFile(path.join(__dirname, 'public/auth/login.html'));
  }

  const allowed = await isAllowed(req);
  if (!allowed) {
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Access denied' });
    return res.status(403).sendFile(path.join(__dirname, 'public/forbidden.html'));
  }

  next();
});

// ─── Static files (بعد الـ guard) ────────────────────────────
app.use(express.static(path.join(__dirname, '../dashboard/public')));
// uploads directory
const uploadsDir = path.join(__dirname, '../dashboard/public/uploads');
if (!require('fs').existsSync(uploadsDir)) require('fs').mkdirSync(uploadsDir, { recursive: true });

// ─── نماذج MongoDB (نفس نماذج البوت) ─────────────────────────
const { model, Schema } = mongoose;

const StaffStats  = model('StaffStats');
const Blocked     = model('Blocked');
const ActiveTicket= model('ActiveTicket');
const TicketLog   = model('TicketLog');

// ─── حالة البوت (مشتركة مع client لو شغّلنا من نفس process) ──
// نقرأها من global إذا موجود وإلا نرجع بيانات مبدئية
function getClient() { return global.__hellClient || null; }

// ══════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════

// ── GET /api/status — حالة البوت والسيرفر ────────────────────
app.get('/api/status', async (req, res) => {
  const client = getClient();
  const botOnline = !!(client?.isReady?.());

  let guildInfo = null;
  if (client?.isReady()) {
    const g = client.guilds.cache.get(config.mainGuildId);
    if (g) {
      const fresh = await g.fetch().catch(() => g);
      guildInfo = { name: fresh.name, memberCount: fresh.memberCount, id: fresh.id };
    }
  }

  res.json({
    online: botOnline,
    uptime: process.uptime(),
    ping: client?.ws?.ping ?? -1,
    guild: guildInfo,
    dbState: mongoose.connection.readyState, // 1 = connected
  });
});

// ── GET /api/config — إعدادات البوت الكاملة ──────────────────
app.get('/api/config', (req, res) => {
  res.json({
    token: config.token ? maskToken(config.token) : '',
    supportGuildId: config.supportGuildId,
    mainGuildId: config.mainGuildId,
    ticketCategoryId: config.ticketCategoryId,
    logChannelId: config.logChannelId,
    transcriptChannelId: config.transcriptChannelId,
    staffCommandsChannelId: config.staffCommandsChannelId,
    staffRoles: config.staffRoles,
    forceClaimRole: config.forceClaimRole,
    blockedRole: config.blockedRole,
    roleEmojis: config.roleEmojis,
    userEmoji: config.userEmoji,
    maxClaimedPerStaff: config.maxClaimedPerStaff,
    autoCloseMinutes: config.autoCloseMinutes,
    accentColor: config.accentColor,
  });
});

// ── PATCH /api/config — تعديل إعدادات البوت ─────────────────
app.patch('/api/config', (req, res) => {
  const allowed = [
    'supportGuildId','mainGuildId','ticketCategoryId',
    'logChannelId','transcriptChannelId','staffCommandsChannelId',
    'staffRoles','forceClaimRole','blockedRole','roleEmojis',
    'userEmoji','maxClaimedPerStaff','autoCloseMinutes','accentColor',
  ];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      config[key] = req.body[key];
      updates[key] = req.body[key];
    }
  }
  // تحديث التوكن بشكل خاص
  if (req.body.token && req.body.token.trim() !== '') {
    config.token = req.body.token.trim();
    updates.token = 'updated';
  }

  res.json({ success: true, updated: updates });
});

// ── GET /api/tickets/active — التذاكر النشطة ─────────────────
app.get('/api/tickets/active', async (req, res) => {
  try {
    const tickets = await ActiveTicket.find().lean();
    const client  = getClient();

    const enriched = await Promise.all(tickets.map(async (t) => {
      // حالة التذكرة: مستلمة أو بانتظار
      const status = t.claimedBy ? 'claimed' : 'open';

      // اسم المستلم لو موجود
      let claimedByTag = null;
      if (t.claimedBy && client?.isReady()) {
        const user = await client.users.fetch(t.claimedBy).catch(() => null);
        if (user) claimedByTag = user.username;
      }

      return { ...t, status, claimedByTag };
    }));

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/tickets/logs — سجل التذاكر ──────────────────────
app.get('/api/tickets/logs', async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;
    const total = await TicketLog.countDocuments();
    const logs  = await TicketLog.find().sort({ openedAt: -1 }).skip(skip).limit(limit).lean();

    // جيب قائمة التذاكر النشطة فعلاً من ActiveTicket
    const activeTickets = await ActiveTicket.find().lean();
    const activeTicketIds = new Set(activeTickets.map(t => t.ticketId));

    // صحّح حالة كل تذكرة: لو closedAt موجود أو مش في ActiveTicket → مغلقة
    const correctedLogs = logs.map(t => {
      const isReallyActive = activeTicketIds.has(t.ticketId);
      return {
        ...t,
        closedAt: t.closedAt || (!isReallyActive ? t.closedAt || new Date(0) : null),
        _isActive: isReallyActive,
      };
    });

    res.json({ total, page, pages: Math.ceil(total / limit), logs: correctedLogs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/tickets/stats — إحصائيات سريعة ──────────────────
app.get('/api/tickets/stats', async (req, res) => {
  try {
    const [active, total, today] = await Promise.all([
      ActiveTicket.countDocuments(),
      TicketLog.countDocuments(),
      TicketLog.countDocuments({ openedAt: { $gte: new Date(Date.now() - 86400000) } }),
    ]);
    res.json({ active, total, today });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/tickets/:id/close — إغلاق تذكرة (force) ────────
app.post('/api/tickets/:channelId/close', async (req, res) => {
  const client = getClient();
  if (!client?.isReady()) return res.status(503).json({ error: 'Bot offline' });

  const { channelId } = req.params;
  const { reason } = req.body || {};
  try {
    const { handleClose } = require('../src/utils/closeHandler.js');
    const tm = require('../src/utils/ticketManager.js');
    const ticket = tm.getTicketByChannel(client, channelId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found in memory' });

    const closer = {
      id: 'dashboard',
      displayName: 'Dashboard',
    };
    await handleClose(client, channelId, closer, ticket, false, reason || '');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/tickets/:channelId/send — إرسال رسالة من الداشبورد ─
app.post('/api/tickets/:channelId/send', async (req, res) => {
  if (!await isAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const client = getClient();
  if (!client?.isReady()) return res.status(503).json({ error: 'Bot offline' });

  const { channelId } = req.params;
  const { message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'Empty message' });

  try {
    const guild = client.guilds.cache.get(config.supportGuildId);
    const channel = guild?.channels.cache.get(channelId);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });

    const senderName = req.session?.user?.username || 'Dashboard';
    await channel.send(`> <:Untitled_37:1513737823537336380> **${senderName}** (Console)\n${message.trim()}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/transcripts/:ticketId — جلب ملف الترانسكريبت ───────
app.get('/api/transcripts/:ticketId', async (req, res) => {
  if (!await isAllowed(req)) return res.status(403).json({ error: 'Forbidden' });
  const { ticketId } = req.params;
  const transcriptsDir = path.join(__dirname, '../transcripts');

  if (!fs.existsSync(transcriptsDir)) {
    return res.status(404).send(noTranscriptPage(ticketId, 'لا يوجد مجلد ترانسكريبت'));
  }

  // نبحث عن أي ملف يبدأ بـ ticket-{id}
  const files = fs.readdirSync(transcriptsDir).filter(f =>
    f.match(new RegExp(`^ticket-${ticketId}[\-.]`)) || f === `ticket-${ticketId}.html`
  );

  if (!files.length) {
    return res.status(404).send(noTranscriptPage(ticketId, 'هذه التذكرة مغلقة قبل تفعيل نظام الترانسكريبت، أو الملف غير موجود'));
  }

  // أحدث ملف
  const latest = files.sort().reverse()[0];
  const filepath = path.join(transcriptsDir, latest);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.resolve(filepath));
});

function noTranscriptPage(ticketId, msg) {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>
    body{margin:0;font-family:'Segoe UI',sans-serif;background:#0a0a0c;color:#9191a4;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px;}
    .icon{font-size:40px;}
    .title{font-size:15px;color:#f0f0f5;font-weight:600;}
    .sub{font-size:12px;color:#5a5a70;text-align:center;max-width:300px;line-height:1.6;}
    .badge{background:#18181d;border:1px solid rgba(255,255,255,.07);border-radius:6px;padding:4px 10px;font-family:monospace;font-size:12px;color:#e8363c;}
  </style></head><body>
    <div class="icon"<img src="./icons/Untitled-36.png" width="40px" alt="ترانسكريبت"></div>
    <div class="title">الترانسكريبت غير متوفر</div>
    <div class="badge">#${ticketId}</div>
    <div class="sub">${msg}</div>
  </body></html>`;
}

// ── GET /api/staff — قائمة الستاف + إحصائياتهم ───────────────
app.get('/api/staff', async (req, res) => {
  try {
    const stats = await StaffStats.find().sort({ closed: -1 }).lean();
    const client = getClient();
    const enriched = await Promise.all(stats.map(async (s) => {
      let username = s.staffId;
      let avatar = null;
      if (client?.isReady()) {
        const user = await client.users.fetch(s.staffId).catch(() => null);
        if (user) {
          username = user.username;
          avatar = user.displayAvatarURL({ extension: 'png', size: 128 });
        }
      }
      const avg = s.ratings.length
        ? (s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length).toFixed(1)
        : null;
      return { staffId: s.staffId, username, avatar, claimed: s.claimed, closed: s.closed, avg, ratingCount: s.ratings.length };
    }));
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/blocked — المحظورون ──────────────────────────────
app.get('/api/blocked', async (req, res) => {
  try {
    const blocked = await Blocked.find().lean();
    res.json(blocked);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/blocked/:userId — رفع حظر ────────────────────
app.delete('/api/blocked/:userId', async (req, res) => {
  try {
    await Blocked.deleteOne({ userId: req.params.userId });
    const client = getClient();
    if (client?.isReady()) {
      client.blocked?.delete(req.params.userId);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/blocked — حظر مستخدم ───────────────────────────
app.post('/api/blocked', async (req, res) => {
  const { userId, blockedBy, reason, duration } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    // احسب expiresAt من نص المدة مثل "1m" "2h" "1d"
    function parseDuration(str) {
      const match = str && str.match(/^(\d+)(s|m|h|d)$/i);
      if (!match) return null;
      const n = parseInt(match[1]);
      const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()];
      return new Date(Date.now() + n * ms);
    }
    const expiresAt = duration ? parseDuration(duration) : null;

    await Blocked.findOneAndUpdate(
      { userId },
      { blockedBy: blockedBy || 'dashboard', reason: reason || '', duration: duration || 'دائم', expiresAt: expiresAt, blockedAt: new Date() },
      { upsert: true }
    );
    const client = getClient();
    if (client?.isReady()) client.blocked?.add(userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/roles — رتب السيرفر من Discord API ───────────────
app.get('/api/roles', async (req, res) => {
  const client = getClient();
  if (!client?.isReady()) return res.json([]);
  try {
    const guild = client.guilds.cache.get(config.supportGuildId)
                 || await client.guilds.fetch(config.supportGuildId);
    const roles = guild.roles.cache
      .filter(r => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }));
    res.json(roles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/channels — قنوات السيرفر ────────────────────────
app.get('/api/channels', async (req, res) => {
  const client = getClient();
  if (!client?.isReady()) return res.json([]);
  try {
    const guild = client.guilds.cache.get(config.supportGuildId)
                 || await client.guilds.fetch(config.supportGuildId);
    const channels = guild.channels.cache
      .filter(c => [0, 5, 4].includes(c.type)) // text, announcement, category
      .sort((a, b) => (a.rawPosition || 0) - (b.rawPosition || 0))
      .map(c => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId }));
    res.json(channels);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Whitelist API (Owner only) ────────────────────────────────

app.get('/api/whitelist', async (req, res) => {
  try {
    const list = await getWhitelist();
    res.json({ success: true, list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/whitelist', async (req, res) => {
  if (req.session.user.id !== config.ownerID)
    return res.status(403).json({ error: 'Owner only' });

  const { discordId, note } = req.body;
  if (!discordId) return res.status(400).json({ error: 'discordId required' });

  try {
    const entry = await addToWhitelist(discordId, req.session.user.id, note || '');
    res.json({ success: true, entry });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Already whitelisted' });
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/whitelist/:discordId', async (req, res) => {
  if (req.session.user.id !== config.ownerID)
    return res.status(403).json({ error: 'Owner only' });

  try {
    const r = await removeFromWhitelist(req.params.discordId);
    if (r.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Serve dashboard SPA for any non-API route ─────────────────
// ══════════════════════════════════════════════════════════════
//  IMAGE UPLOAD — رفع صور البرند
// ══════════════════════════════════════════════════════════════

// نتحقق إذا multer موجود، إذا لا نستخدم حل بديل
let multerUpload = null;
try {
  const multer = require('multer');
  const uploadDir = path.join(__dirname, '../dashboard/public/uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, 'brand_' + Date.now() + ext);
    },
  });
  multerUpload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
} catch(e) { /* multer not installed */ }

// POST /api/ui/upload-image — رفع صورة برند
app.post('/api/ui/upload-image', (req, res) => {
  if (req.session.user.id !== config.ownerID)
    return res.status(403).json({ error: 'Forbidden' });

  if (!multerUpload) {
    return res.status(501).json({ error: 'multer غير مثبّت — شغّل: npm install multer' });
  }

  const upload = multerUpload.single('image');
  upload(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'لم يُرفق ملف' });

    const dashUrl = (config.dashboardURL || 'http://localhost:3000').replace(/\/$/, '');
    const url = dashUrl + '/uploads/' + req.file.filename;
    res.json({ success: true, url });
  });
});

// ══════════════════════════════════════════════════════════════
//  STAFF RESET — تصفير إحصائيات الستاف
// ══════════════════════════════════════════════════════════════

// POST /api/staff/reset — يصفر كل إحصائيات الستاف (Owner only)
app.post('/api/staff/reset', async (req, res) => {
  if (req.session.user.id !== config.ownerID)
    return res.status(403).json({ error: 'Forbidden — owners only' });
  try {
    await StaffStats.updateMany({}, { $set: { claimed: 0, closed: 0, ratings: [] } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  EMOJIS API — إيموجيات السيرفر الكاستم
// ══════════════════════════════════════════════════════════════

// GET /api/emojis — جميع الإيموجيات الكاستم من السيرفر
app.get('/api/emojis', async (req, res) => {
  const client = getClient();
  if (!client?.isReady()) return res.json([]);
  try {
    const guild = client.guilds.cache.get(config.supportGuildId)
                 || await client.guilds.fetch(config.supportGuildId);
    const emojis = guild.emojis.cache.map(e => ({
      id:        e.id,
      name:      e.name,
      animated:  e.animated,
      url:       e.url,
      string:    e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`,
    }));
    res.json(emojis);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  UI LIBRARY API — مكتبة الألوان والإيموجيات (ui.js)
// ══════════════════════════════════════════════════════════════

// GET /api/ui — قراءة ui.js الحالي
app.get('/api/ui', (req, res) => {
  try {
    // نقرأ الملف مباشرة لتجنب الـ cache
    const uiPath = path.join(__dirname, '../src/utils/ui.js');
    const raw    = fs.readFileSync(uiPath, 'utf8');

    // نستخرج COLORS, EMOJI, BRAND بـ eval آمن عبر require
    // نمسح الـ cache أولاً
    delete require.cache[require.resolve('../src/utils/ui.js')];
    const ui = require('../src/utils/ui.js');
    res.json({ colors: ui.COLORS, emoji: ui.EMOJI, brand: ui.BRAND, buttonEmoji: ui.BUTTON_EMOJI, images: ui.IMAGES || {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/ui — تحديث ui.js
app.patch('/api/ui', (req, res) => {
  if (req.session.user.id !== config.ownerID)
    return res.status(403).json({ error: 'Forbidden — owners only' });
  try {
    const { colors, emoji, brand, images } = req.body;
    const uiPath = path.join(__dirname, '../src/utils/ui.js');

    delete require.cache[require.resolve('../src/utils/ui.js')];
    const current = require('../src/utils/ui.js');

    const newColors      = colors ? { ...current.COLORS, ...colors }           : current.COLORS;
    const newEmoji       = emoji  ? { ...current.EMOJI,  ...emoji  }           : current.EMOJI;
    const newBrand       = brand  ? { ...current.BRAND,  ...brand  }           : current.BRAND;
    const newImages       = images ? { ...(current.IMAGES || {}), ...images } : (current.IMAGES || {});
    const newButtonEmoji = current.BUTTON_EMOJI;
    const newEmojiUrl    = current.EMOJI_URL;

    const body = `/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              Hell | UI Design Library                       ║
 * ║  مكتبة التصميم المركزية — غيّر من هنا ويتغير في كل مكان   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const COLORS = ${JSON.stringify(newColors, null, 2)};

const EMOJI = ${JSON.stringify(newEmoji, null, 2)};

const BUTTON_EMOJI = ${JSON.stringify(newButtonEmoji, null, 2)};

const EMOJI_URL = ${JSON.stringify(newEmojiUrl, null, 2)};

const IMAGES = ${JSON.stringify(newImages, null, 2)};

const BRAND = ${JSON.stringify(newBrand, null, 2)};

module.exports = { COLORS, EMOJI, BUTTON_EMOJI, EMOJI_URL, IMAGES, BRAND };
`;
    fs.writeFileSync(uiPath, body, 'utf8');
    delete require.cache[require.resolve('../src/utils/ui.js')];
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
//  RESET ROUTES — إعادة تعيين الإعدادات
// ══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG_FIELDS = {
  supportGuildId:         '',
  mainGuildId:            '',
  ticketCategoryId:       '',
  logChannelId:           '',
  transcriptChannelId:    '',
  staffCommandsChannelId: '',
  staffRoles:             [],
  forceClaimRole:         '',
  blockedRole:            '',
  roleEmojis:             {},
  userEmoji:              '',
  maxClaimedPerStaff:     3,
  autoCloseMinutes:       1440,
  accentColor:            16711680,
  successColor:           16711680,
  errorColor:             16711680,
  warnColor:              16711680,
};

// POST /api/reset — إعادة تعيين قسم معين أو الكل
app.post('/api/reset', (req, res) => {
  // فقط الـ Owner يقدر يسوي reset
  if (req.session.user.id !== config.ownerID)
    return res.status(403).json({ error: 'Forbidden — owners only' });

  const { sections } = req.body; // مصفوفة: ['rooms','roles','admin','servers','all']
  if (!sections || !Array.isArray(sections))
    return res.status(400).json({ error: 'sections array required' });

  const resetAll = sections.includes('all');

  // --- تعريف كل قسم وحقوله ---
  const sectionMap = {
    rooms: ['ticketCategoryId', 'logChannelId', 'transcriptChannelId', 'staffCommandsChannelId'],
    roles: ['staffRoles', 'forceClaimRole', 'blockedRole', 'roleEmojis', 'userEmoji'],
    admin: ['maxClaimedPerStaff', 'autoCloseMinutes', 'accentColor', 'successColor', 'errorColor', 'warnColor'],
    servers: ['supportGuildId', 'mainGuildId'],
  };

  let resetFields = [];

  if (resetAll) {
    resetFields = Object.keys(DEFAULT_CONFIG_FIELDS);
  } else {
    sections.forEach(s => {
      if (sectionMap[s]) resetFields.push(...sectionMap[s]);
    });
  }

  if (!resetFields.length)
    return res.status(400).json({ error: 'No valid sections provided' });

  // نطبق القيم الافتراضية
  resetFields.forEach(field => {
    if (field in DEFAULT_CONFIG_FIELDS) {
      const def = DEFAULT_CONFIG_FIELDS[field];
      config[field] = Array.isArray(def) ? [] : typeof def === 'object' && def !== null ? {} : def;
    }
  });

  res.json({ success: true, reset: resetFields });
});

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/public/index.html'));
});

// ══════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════

function maskToken(token) {
  if (!token || token.length < 20) return '***';
  return token.slice(0, 10) + '•'.repeat(token.length - 20) + token.slice(-10);
}

function saveConfigToDisk() {
  // Railway: filesystem is read-only, config lives in env variables
}

// ══════════════════════════════════════════════════════════════
//  Start
// ══════════════════════════════════════════════════════════════

async function start() {
  if (mongoose.connection.readyState === 0) {
    const { connectDB } = require('../src/database/connect.js');
    await connectDB();
  }

  // Socket.io — اتصال العميل
  io.on('connection', (socket) => {
    const client = getClient();
    buildStatus(client).then(s => socket.emit('status', s));
  });

  httpServer.listen(PORT, () => {
    console.log(`\x1b[35m[DASH]\x1b[0m Dashboard running → http://localhost:${PORT}`);
  });
}

async function buildStatus(client) {
  const botOnline = !!(client?.isReady?.());
  let guildInfo = null;
  if (client?.isReady()) {
    const g = client.guilds.cache.get(config.mainGuildId);
    if (g) {
      const fresh = await g.fetch().catch(() => g);
      guildInfo = { name: fresh.name, memberCount: fresh.memberCount, id: fresh.id };
    }
  }
  return { online: botOnline, uptime: process.uptime(), ping: client?.ws?.ping ?? -1, guild: guildInfo };
}

// ── إذا شُغّل منفرداً
if (require.main === module) start();

// دالة لإرسال تحديث لحظي لكل العملاء
function emitUpdate(event, data) {
  if (global.__hellIO) global.__hellIO.emit(event, data);
}

module.exports = { app, start, emitUpdate };
