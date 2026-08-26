# 🚀 دليل تشغيل Hell ModMail على Railway

## 1️⃣ المتغيرات المطلوبة في Railway Variables

| المتغير | الوصف | مثال |
| :--- | :--- | :--- |
| `TOKEN` | توكن البوت | `MTQ2N...` |
| `CLIENT_ID` | معرف البوت (Application ID) | `1465321...` |
| `CLIENT_SECRET` | سر البوت (Client Secret) | `81OSak...` |
| `OWNER_ID` | معرف الأونر | `1014396...` |
| `MONGODB_URI` | رابط MongoDB | `mongodb+srv://...` |
| `DASHBOARD_URL` | **هام:** رابط Railway بعد توليد الدومين | `https://xxx.up.railway.app` |
| `SESSION_SECRET` | كلمة سر الجلسات (اختر أي نص عشوائي) | `mysecret123` |
| `SUPPORT_GUILD_ID` | ID سيرفر الدعم | `1384348...` |
| `MAIN_GUILD_ID` | ID السيرفر الرئيسي | `1383091...` |
| `TICKET_CATEGORY_ID` | ID تصنيف التذاكر | `1510952...` |
| `LOG_CHANNEL_ID` | ID قناة اللوق | `1510953...` |
| `TRANSCRIPT_CHANNEL_ID` | ID قناة الترانسكريبت | `1510953...` |
| `STAFF_COMMANDS_CHANNEL_ID` | ID قناة أوامر الستاف | `1511124...` |
| `STAFF_ROLES` | رتب الستاف مفصولة بفاصلة | `1510975...,1510974...` |
| `FORCE_CLAIM_ROLE` | رتبة الكليم الإجباري | `1510921...` |
| `BLOCKED_ROLE` | رتبة المحظورين (اتركها فارغة لو مافيه) | `` |
| `ROLE_EMOJIS` | JSON لأيموجيات الرتب | `{"roleId":"<:emoji:id>"}` |
| `USER_EMOJI` | إيموجي المستخدم | `<:Untitled2:1515...>` |
| `MAX_CLAIMED` | أقصى تذاكر يستلمها الستاف | `3` |
| `AUTO_CLOSE` | دقائق الإغلاق التلقائي | `1440` |
| `ACCENT_COLOR` | لون التمييز (عدد decimal) | `16711680` |
| `RATING_CHANNEL_ID` | ID قناة استقبال التقييمات | `1514002598712315975` |

> **ملاحظة:** لا ترفع ملف `.env` على GitHub — المتغيرات تُدخل مباشرة في Railway Variables.

## 2️⃣ توليد الدومين وإعداد Discord OAuth

1. في Railway → إعدادات الخدمة → **Public Networking** → اضغط **Generate Domain**
2. انسخ الرابط (مثل `hell-bot.up.railway.app`)
3. حدّث `DASHBOARD_URL` في Railway Variables بهذا الرابط
4. في [Discord Developer Portal](https://discord.com/developers/applications) → تطبيقك → **OAuth2** → أضف:
   ```
   https://your-domain.up.railway.app/auth/callback
   ```

## 3️⃣ تشغيل البوت

Railway يشغل تلقائياً: `npm start` (من package.json)
البوت والداشبورد يشتغلان معاً من `index.js`.

---
**💡 نصيحة:** أي تغيير في المتغيرات من Railway يعيد تشغيل البوت تلقائياً بالقيم الجديدة.
