const config = require('../../src/config');   // عدّل المسار حسب مشروعك
const Whitelist = require('../../models/Whitelist');

/**
 * ══════════════════════════════════════
 *  isAuthenticated — Middleware
 * ══════════════════════════════════════
 *  يتحقق إن المستخدم سجّل دخول عبر Discord OAuth
 */
function isAuthenticated(req, res, next) {
  if (!req.session?.user) {
    return res.redirect('/auth/login');
  }
  next();
}

/**
 * ══════════════════════════════════════
 *  isAuthorized — Middleware
 * ══════════════════════════════════════
 *  يتحقق إن المستخدم أونر أو موجود في الـ Whitelist
 */
async function isAuthorized(req, res, next) {
  const userId = req.session?.user?.id;

  if (!userId) {
    return res.redirect('/auth/login');
  }

  // الأونر يعدي مباشرة
  if (userId === config.ownerID) {
    return next();
  }

  try {
    const allowed = await Whitelist.findOne({ discordId: userId });
    if (allowed) return next();

    // مو أونر ومو في الـ whitelist
    return res.status(403).render('forbidden', {
      user: req.session.user,
    });
  } catch (err) {
    console.error('[Auth] DB error:', err);
    return res.status(500).send('Server error');
  }
}

module.exports = { isAuthenticated, isAuthorized };
