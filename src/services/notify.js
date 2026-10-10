const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');

async function notify(userId, title, message = '', link = '') {
  try {
    await Notification.create({ user: userId, title, message, link });
  } catch (e) {
    console.error('notify failed:', e.message);
  }
}

async function audit(req, action, target = '', details = '') {
  try {
    await AuditLog.create({
      actor: req.user?._id, actorEmail: req.user?.email, action, target, details, ip: req.ip,
    });
  } catch (e) {
    console.error('audit failed:', e.message);
  }
}

module.exports = { notify, audit };
