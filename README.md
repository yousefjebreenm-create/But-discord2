# 📬 ModMail Bot — نظام التذاكر المتكامل

بوت Discord متكامل لإدارة تذاكر الدعم الفني عبر نظام ModMail.  
التواصل عبر الخاص ↔ روم مخصص في سيرفر الدعم.

---

## 🗂️ هيكل المشروع

```
modmail-bot/
├── index.js                      ← نقطة البداية
├── config.js                     ← إعدادات البوت
├── package.json
│
├── src/
│   ├── events/
│   │   ├── ready.js              ← تسجيل Slash Commands + Presence
│   │   ├── interactionCreate.js  ← اللوحة، المودال، الأزرار، التقييم
│   │   └── messageCreate.js      ← ريلاي الرسائل + كل أوامر الستاف
│   │
│   ├── handlers/
│   │   ├── eventHandler.js       ← تحميل الـ Events تلقائياً
│   │   └── commandHandler.js     ← تحميل الـ Commands تلقائياً
│   │
│   └── utils/
│       ├── format.js             ← كل التنسيقات (Containers لا Embeds)
│       ├── ticketManager.js      ← إدارة حالة التذاكر في الذاكرة
│       ├── logger.js             ← لوق في الملف + روم Discord
│       ├── transcript.js         ← توليد HTML Transcript
│       └── closeHandler.js       ← مساعد لتجنب circular imports
│
├── logs/
│   └── modmail.log               ← يُنشأ تلقائياً
│
└── transcripts/
    └── ticket-XXXX-*.html        ← يُنشأ تلقائياً عند الإغلاق
```

---

## ⚙️ الإعداد

### 1. تثبيت الحزم
```bash
npm install
```

### 2. ملء config.js

```js
token:               'توكن البوت'
supportGuildId:      'ID سيرفر الدعم الفني'
mainGuildId:         'ID السيرفر الرئيسي'
ticketCategoryId:    'ID الكاتيقوري لتذاكر الدعم'
logChannelId:        'ID روم اللوق'
transcriptChannelId: 'ID روم الترانسكريبت'
staffCommandsChannelId: 'ID روم كوماندات الستاف'
staffRoles:          ['ID رتبة 1', 'ID رتبة 2']
forceClaimRole:      'ID رتبة الأدمن (-fdr)'
roleEmojis:          { 'ROLE_ID': '🛡️' }
```

### 3. تشغيل البوت
```bash
npm start
# أو للتطوير:
npm run dev
```

### 4. إرسال لوحة التذاكر
في سيرفر الدعم أو الرئيسي اكتب:
```
/panel
```

---

## 🎮 أوامر الستاف

| الأمر | الوصف | الشرط |
|-------|-------|-------|
| `-r [الكلام]` | الرد على المستخدم | المستلم فقط |
| `-dr` | ترك الاستلام | المستلم فقط |
| `-fdr` | ترك إجباري للاستلام | رتبة `forceClaimRole` |
| `-name [اسم]` | تغيير اسم الروم | المستلم فقط |
| `-cr` | طلب إغلاق + تايمر تلقائي | المستلم فقط |
| `-block @user` | حظر مستخدم | رتبة `forceClaimRole` |
| `-unblock @user` | رفع الحظر | رتبة `forceClaimRole` |
| `-sfb [@user]` | إحصائيات الستاف | في روم الكوماندات فقط |

---

## 🔄 سير العمل

```
المستخدم يضغط زر "فتح تذكرة"
        ↓
    Modal الاستفسار
        ↓
  DM للمستخدم (تأكيد + رقم التذكرة)
        ↓
  روم جديد في سيرفر الدعم
        ↓
  ping رتب الستاف + زر الاستلام
        ↓
     الستاف يستلم
        ↓
  تواصل ثنائي: خاص ↔ روم
        ↓
   -cr من المستلم (تايمر)
        ↓
   إغلاق + تقييم + HTML Transcript
```

---

## 📋 ميزات النظام

- ✅ **Container-based** — لا embeds، كل التنسيقات نصية منسّقة
- ✅ **ريلاي ثنائي** — خاص المستخدم ↔ روم الدعم
- ✅ **إيموجي بالرتبة** — كل رتبة لها إيموجي خاص
- ✅ **حد الاستلام** — أقصى 3 تذاكر لكل ستاف
- ✅ **إغلاق تلقائي** — مع تايمر قابل للإلغاء
- ✅ **تقييم الخدمة** — Select Menu بعد الإغلاق
- ✅ **HTML Transcript** — سجل كامل مع تصميم جميل
- ✅ **لوق مفصّل** — ملف + روم Discord
- ✅ **حظر وإلغاء حظر** — تحكم كامل
- ✅ **إحصائيات الستاف** — claims، closures، ratings
