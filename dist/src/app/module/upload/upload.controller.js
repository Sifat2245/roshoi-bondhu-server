import { CatchAsync } from '../../shared/catchAsync.js';
import { sendResponse } from '../../shared/sendResponse.js';
import { uploadToCloudinary } from '../../lib/cloudinary.js';
const uploadImage = CatchAsync(async (req, res) => {
    if (!req.file) {
        return sendResponse(res, {
            statusCode: 400,
            success: false,
            message: 'No image file uploaded.',
        });
    }
    const folder = req.body.folder || 'hesheli';
    const url = await uploadToCloudinary(req.file.buffer, folder);
    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'Image uploaded successfully!',
        data: { url },
    });
});
export const UploadController = {
    uploadImage,
};
