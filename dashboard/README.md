# 🔥 HELL Dashboard — دليل التثبيت

## هيكل الملفات بعد التثبيت

```
HELL_ticket/
├── index.js              ← (معدّل — تضيف سطرين)
├── config.js
├── package.json
├── src/
│   └── ...
└── dashboard/            ← ✅ هذا المجلد كامل
    ├── server.js         ← Express API
    └── public/
        └── index.html    ← واجهة الداشبورد
```

---

## خطوات التثبيت

### 1. انسخ مجلد `dashboard/` داخل مجلد البوت
```
HELL_ticket/
└── dashboard/
    ├── server.js
    └── public/index.html
```

### 2. ثبّت الباكجات الجديدة
```bash
cd HELL_ticket
npm install express cors
```

### 3. عدّل `index.js`
افتح `index.js` وعدّل `connectDB().then(...)` ليصير كذا:

```js
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
```

### 4. شغّل البوت
```bash
npm start
# أو
node index.js
```

---

## الوصول للداشبورد

افتح المتصفح:
```
http://localhost:3000
```

### تغيير البورت (اختياري)
```bash
DASH_PORT=8080 node index.js
```

---

## الصفحات

| الصفحة | الوصف |
|--------|-------|
| 📊 نظرة عامة | إحصائيات سريعة + أفضل ستاف + آخر التذاكر |
| 🎫 التذاكر النشطة | عرض + إغلاق يدوي لأي تذكرة |
| 📜 سجل التذاكر | كل التذاكر مع pagination |
| 👥 الستاف | ترتيب + إحصائيات كاملة |
| 🚫 المحظورون | حظر / رفع حظر مستخدمين |
| 🤖 إعدادات البوت | التوكن + Guild IDs |
| 📢 القنوات | تغيير جميع القنوات من dropdown |
| 🛡️ الرتب | إدارة رتب الستاف + رتبة الأدمن |
| ✨ الإيموجيات | إيموجي كل رتبة + إيموجي المستخدم |
| ⚙️ الحدود | maxClaimed + autoClose |

---

## API Endpoints

```
GET    /api/status                    حالة البوت
GET    /api/config                    قراءة الإعدادات
PATCH  /api/config                    تعديل الإعدادات
GET    /api/tickets/active            التذاكر النشطة
GET    /api/tickets/logs?page=1       سجل التذاكر
GET    /api/tickets/stats             إحصائيات
POST   /api/tickets/:channelId/close  إغلاق تذكرة
GET    /api/staff                     إحصائيات الستاف
GET    /api/blocked                   قائمة المحظورين
POST   /api/blocked                   حظر مستخدم
DELETE /api/blocked/:userId           رفع حظر
GET    /api/roles                     رتب السيرفر
GET    /api/channels                  قنوات السيرفر
```

---

## ملاحظات

- الداشبورد يشتغل على نفس MongoDB تبع البوت
- التغييرات تُحفظ على `config.js` مباشرة
- لو البوت أوفلاين، بعض الميزات (الإغلاق المباشر، الرتب، القنوات) لن تشتغل
- الداشبورد بدون كلمة مرور — لا تفتحه على الإنترنت بدون Nginx + auth
