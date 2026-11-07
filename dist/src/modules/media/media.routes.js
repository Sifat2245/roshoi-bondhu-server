import { Router } from 'express';
import { MediaController } from './media.controller.js';
import { upload } from '../../lib/cloudinary.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
const router = Router();
router.post('/image', requireAuth, upload.single('image'), MediaController.uploadImage);
export const mediaRoutes = router;
export const uploadRoutes = router;
export default router;
