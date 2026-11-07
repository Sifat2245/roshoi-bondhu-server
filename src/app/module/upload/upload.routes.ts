import { Router } from 'express';
import { UploadController } from './upload.controller.js';
import { upload } from '../../lib/cloudinary.js';
import { requireAuth } from '../../middleware/authMiddleware.js';

const router = Router();

router.post('/image', requireAuth, upload.single('image'), UploadController.uploadImage);

export const uploadRoutes = router;

