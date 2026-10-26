const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

const env = require('../config/env');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage for match point table images
const pointTableStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const matchId = req.params.id || 'temp';
    const matchNum = req.body.match_number || 'x';
    const type = req.body.image_type || 'raw';
    return {
      folder: `ffm/point-tables/${matchId}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      public_id: `match-${matchNum}-${type}-${Date.now()}`,
      transformation: [
        { width: 1600, height: 1600, crop: 'limit' },
        { quality: 'auto:good' },
      ],
    };
  },
});
// Add after pointTableStorage
const chatStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req) => {
    const groupId = req.params.id || 'temp';
    return {
      folder: `ffm/chat/${groupId}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      public_id: `chat-${Date.now()}`,
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:good' },
      ],
    };
  },
});

const uploadChatImage = multer({
  storage: chatStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed.'), false);
  },
});


const uploadPointTable = multer({
  storage: pointTableStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed.'), false);
  },
});

async function deleteImage(publicId) {
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (e) {
    console.error('Cloudinary delete failed:', e.message);
    return null;
  }
}

module.exports = { cloudinary, uploadPointTable, deleteImage, uploadChatImage };