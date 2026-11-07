import { Router } from 'express';
import { UserController } from './user.controller.js';
import { requireAuth, optionalAuth } from '../../middleware/auth.middleware.js';
const router = Router();
router.get('/:id', optionalAuth, UserController.getUserProfile);
router.post('/:id/follow', requireAuth, UserController.toggleFollow);
router.patch('/profile', requireAuth, UserController.updateProfile);
export const userRoutes = router;
export default userRoutes;
