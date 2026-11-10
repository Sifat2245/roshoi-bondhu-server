import { Router } from 'express';
import { UserController } from './user.controller.js';
import { AuthController } from '../auth/auth.controller.js';
import { requireAuth, optionalAuth } from '../../middleware/auth.middleware.js';
const router = Router();
// Specific routes MUST come before parameterized /:id route
router.get('/me', requireAuth, UserController.getMyProfile);
router.patch('/me', requireAuth, UserController.updateProfile);
router.patch('/profile', requireAuth, UserController.updateProfile);
router.patch('/bio', requireAuth, UserController.updateProfile);
router.get('/preferences', requireAuth, UserController.getPreferences);
router.patch('/preferences', requireAuth, UserController.updatePreferences);
router.post('/deactivate', requireAuth, AuthController.deactivateAccount);
router.post('/delete', requireAuth, AuthController.deleteAccount);
router.post('/delete-account', requireAuth, AuthController.deleteAccount);
// Target user routes
router.get('/:id', optionalAuth, UserController.getUserProfile);
router.post('/:id/follow', requireAuth, UserController.toggleFollow);
export const userRoutes = router;
export default userRoutes;
