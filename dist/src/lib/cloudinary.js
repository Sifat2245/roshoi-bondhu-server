import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { env } from '../config/env.js';
export { cloudinary };
cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
});
const storage = multer.memoryStorage();
export const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed!'));
        }
    },
});
export const uploadToCloudinary = (buffer, folder = 'hesheli') => {
    return new Promise((resolve, reject) => {
        if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
            console.warn('[Cloudinary] Missing credentials. Returning base64 data URI fallback for local dev.');
            const base64 = buffer.toString('base64');
            return resolve(`data:image/jpeg;base64,${base64}`);
        }
        const uploadStream = cloudinary.uploader.upload_stream({
            folder,
            resource_type: 'image',
            transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        }, (error, result) => {
            if (error || !result) {
                const errMsg = error?.message || '';
                console.warn('[Cloudinary Upload Error]:', errMsg);
                // If credentials mismatch or signature is rejected, fallback to base64 data URI so user is not blocked
                if (errMsg.includes('Signature') ||
                    errMsg.includes('api_secret') ||
                    errMsg.includes('Must supply') ||
                    error?.http_code === 401) {
                    console.warn('[Cloudinary Fallback] Invalid Cloudinary credentials in .env. Returning base64 data URI.');
                    const base64 = buffer.toString('base64');
                    return resolve(`data:image/jpeg;base64,${base64}`);
                }
                return reject(error || new Error('Upload to Cloudinary failed'));
            }
            resolve(result.secure_url);
        });
        uploadStream.end(buffer);
    });
};
export default {
    cloudinary,
    upload,
    uploadToCloudinary,
};
