import type { Request, Response } from 'express';
import { CatchAsync } from '../../shared/utils/catch-async.js';
import { sendResponse } from '../../shared/utils/send-response.js';
import { uploadToCloudinary } from '../../lib/cloudinary.js';

const uploadImage = CatchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    return sendResponse(res, {
      statusCode: 400,
      success: false,
      message: 'No image file uploaded.',
    });
  }

  const folder = (req.body.folder as string) || 'hesheli';
  const url = await uploadToCloudinary(req.file.buffer, folder);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Image uploaded successfully!',
    data: { url },
  });
});

export const MediaController = {
  uploadImage,
};

export const UploadController = MediaController;
export default MediaController;

