/**
 * ═══════════════════════════════════════════════════════════════
 *  HELL Dashboard — Integration Patch  (Auth + Whitelist Update)
 * ═══════════════════════════════════════════════════════════════
 *
 *  الملفات الجديدة اللي اتضافت:
 *  ├── models/Whitelist.js
 *  ├── dashboard/middleware/auth.js
 *  ├── dashboard/routes/auth.js
 *  ├── dashboard/routes/whitelist.js
 *  └── dashboard/public/whitelist-tab.html  ← تبويبة الـ UI
 *
 * ═══════════════════════════════════════════════════════════════
 *  الخطوة 1 — أضف في config.js
 * ═══════════════════════════════════════════════════════════════
 *
 *  module.exports = {
 *    token:         'BOT_TOKEN',
 *    clientID:      'CLIENT_ID',            ← جديد
 *    clientSecret:  'CLIENT_SECRET',        ← جديد
 *    ownerID:       'YOUR_DISCORD_ID',      ← جديد
 *    dashboardURL:  'http://localhost:3000', ← جديد
 *    sessionSecret: 'RANDOM_SECRET_STRING', ← جديد
 *    mongoURI:      'mongodb://...',
 *  };
 *
 * ═══════════════════════════════════════════════════════════════
 *  الخطوة 2 — package.json، أضف هذه الـ dependencies
 * ═══════════════════════════════════════════════════════════════
 *
 *  "express":          "^4.18.2",
 *  "cors":             "^2.8.5",
 *  "express-session":  "^1.17.3",   ← جديد
 *  "node-fetch":       "^2.7.0",    ← جديد
 *
 *  ثم نفّذ: npm install
 *
 * ═══════════════════════════════════════════════════════════════
 *  الخطوة 3 — في dashboard/server.js أضف هذا الكود
 * ═══════════════════════════════════════════════════════════════
 */

const session   = require('express-session');
const config    = require('../src/config');
const authRoute = require('./routes/auth');
const wlRoute   = require('./routes/whitelist');
const { isAuthenticated, isAuthorized } = require('./middleware/auth');

// ── Session setup ──────────────────────────────────────────────
app.use(session({
  secret:            config.sessionSecret || 'hell-dashboard-secret-change-me',
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 1000 * 60 * 60 * 24 },  // 24 ساعة
}));

// ── Routes ─────────────────────────────────────────────────────
app.use('/auth',          authRoute);
app.use('/api/whitelist', wlRoute);

// ── حماية كل صفحات الداشبورد ───────────────────────────────────
app.use('/dashboard', isAuthenticated, isAuthorized);

// ═══════════════════════════════════════════════════════════════
//  في index.js — نفس ما كان قبل، بدون تغيير
// ═══════════════════════════════════════════════════════════════

connectDB().then(() => {
  loadEvents(client);
  loadCommands(client);

  client.login(config.token).then(() => {
    console.log(`\x1b[32m[BOT]\x1b[0m Logged in as ${client.user.tag}`);

    global.__hellClient = client;
    const { start } = require('./dashboard/server.js');
    start();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════
 *  Discord Developer Portal — إعدادات مطلوبة
 * ═══════════════════════════════════════════════════════════════
 *
 *  1. روح على https://discord.com/developers/applications
 *  2. اختار تطبيقك ← OAuth2 ← Redirects
 *  3. أضف: http://localhost:3000/auth/callback
 *     (غيّر للدومين الحقيقي وقت الرفع)
 *
 * ═══════════════════════════════════════════════════════════════
 *  Auth Flow
 * ═══════════════════════════════════════════════════════════════
 *
 *  زائر يفتح /dashboard
 *       ↓
 *  isAuthenticated → مو مسجّل؟ → redirect /auth/login
 *       ↓
 *  Discord OAuth2 → callback → session.user = { id, username, avatar }
 *       ↓
 *  isAuthorized → هل id = ownerID أو موجود في Whitelist (MongoDB)?
 *       ↓ نعم              ↓ لا
 *  يدخل الداشبورد     صفحة 403 Forbidden
 *
 * ═══════════════════════════════════════════════════════════════
 */
