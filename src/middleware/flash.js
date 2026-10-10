// Tiny flash-message helper using a short-lived signed cookie.
module.exports = function flash(req, res, next) {
  res.flash = (type, message) => {
    res.cookie('flash', JSON.stringify({ type, message }), {
      signed: true, httpOnly: true, sameSite: 'lax', maxAge: 15000,
    });
  };
  res.locals.flash = null;
  const raw = req.signedCookies?.flash;
  if (raw) {
    try { res.locals.flash = JSON.parse(raw); } catch { /* ignore */ }
    res.clearCookie('flash');
  }
  next();
};
