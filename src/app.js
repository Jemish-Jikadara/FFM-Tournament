const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const flash = require('./middleware/flash');
const { attachUser } = require('./middleware/auth');
const format = require('./utils/format');
const icon = require('./utils/icons');
const ui = require('./utils/ui');
const { MODES } = require('./config/game');


const app = express();
const root = path.join(__dirname, '..');

app.set('view engine', 'ejs');
app.set('views', path.join(root, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.disable('x-powered-by');
if (env.isProd) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
}));
app.use(compression());
// Helpers available in every EJS template
app.use((req, res, next) => {
  Object.assign(res.locals, {
    icon, paise: format.paise, date: format.date, statusLabel: format.statusLabel,
    statusPill: ui.statusPill, roleBadge: ui.roleBadge, stateBadge: ui.stateBadge,
    path: req.path, title: 'FFM', modesList: MODES, testMode: env.testModeDeposits,
    user: null, wallet: null, unread: 0, flash: null, adminNav: [], active: '',
  });
  next();
});
if (!env.isProd) app.use(morgan('dev'));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser(env.cookieSecret));
app.use(express.static(path.join(root, 'public'), { maxAge: env.isProd ? '7d' : 0 }));

app.use(flash);
app.use(attachUser);

app.use('/api/v1', require('./routes/api'));
app.use('/', require('./routes/pages'));
app.use('/', require('./routes/auth'));
app.use('/matches', require('./routes/matches'));
app.use('/admin', require('./routes/admin'));
// app.use('/',require('./routes/tournament'))
app.use('/', require('./routes/player'));
app.use('/', require('./routes/team'));

app.use((req, res) => {
  res.status(404).render('error', { code: 404, message: 'The page you are looking for does not exist.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(err.status || 500).render('error', {
    code: err.status || 500,
    message: env.isProd ? 'Something went wrong on our side. Please try again.' : err.message,
  });
});


module.exports = app;
