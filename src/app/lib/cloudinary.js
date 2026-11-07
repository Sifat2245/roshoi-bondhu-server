const cloudinary = require('cloudinary').v2;
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for in-memory upload (up to 10MB)
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    },
});

/**
 * Upload a file buffer directly to Cloudinary
 * @param {Buffer} buffer - File buffer from multer
 * @param {string} folder - Cloudinary folder name (e.g., 'hesheli/recipes')
 * @returns {Promise<string>} Secure URL of uploaded image
 */
const uploadToCloudinary = (buffer, folder = 'hesheli') => {
    return new Promise((resolve, reject) => {
        // If cloudinary credentials are not configured yet, fallback to a data URI or placeholder
        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
            console.warn('[Cloudinary] Missing credentials. Returning data URI fallback for local dev.');
            const base64 = buffer.toString('base64');
            return resolve(`data:image/jpeg;base64,${base64}`);
        }

        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: 'image',
                transformation: [{ quality: 'auto', fetch_format: 'auto' }],
            },
            (error, result) => {
                if (error) {
                    return reject(error);
                }
                resolve(result.secure_url);
            }
        );
        uploadStream.end(buffer);
    });
};

module.exports = {
    cloudinary,
    upload,
    uploadToCloudinary,
};
