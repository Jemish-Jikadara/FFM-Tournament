const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
    console.log('MongoDB connected ->', mongoose.connection.host + '/' + mongoose.connection.name);
  } catch (err) {
    console.error('\nMongoDB connection FAILED:', err.message);
    console.error('  1) Install & start MongoDB Community Server  OR');
    console.error('  2) Put a MongoDB Atlas connection string in MONGO_URI inside your .env file\n');
    throw err;
  }
}

module.exports = { connectDB, mongoose };
