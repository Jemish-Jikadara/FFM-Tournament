const env = require('./config/env');
const { connectDB } = require('./config/db');
const app = require('./app');

(async () => {
  try {
    await connectDB();
  } catch {
    process.exit(1);
  }
  const server = app.listen(env.port, () => {
    console.log(`\nClashIQ running ->  http://localhost:${env.port}\n`);
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') console.error(`Port ${env.port} is already in use. Change PORT in .env`);
    else console.error(e);
    process.exit(1);
  });
})();

process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e));
