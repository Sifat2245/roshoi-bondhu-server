import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.middleware.js';

const router = Router();

// Stats (Admin & Moderator)
router.get('/stats', requireAuth, requireRole(['ADMIN', 'MODERATOR']), AdminController.getPlatformStats);

// User Directory (Admin only)
router.get('/users', requireAuth, requireRole(['ADMIN']), AdminController.getUsers);
router.patch('/users/:id/role', requireAuth, requireRole(['ADMIN']), AdminController.updateUserRole);
router.patch('/users/:id/ban', requireAuth, requireRole(['ADMIN']), AdminController.toggleUserBan);

// Content Moderation Queue (Admin & Moderator)
router.get('/reports', requireAuth, requireRole(['ADMIN', 'MODERATOR']), AdminController.getReports);
router.patch('/reports/:id', requireAuth, requireRole(['ADMIN', 'MODERATOR']), AdminController.resolveReport);

// Submit Report (Any authenticated user)
router.post('/reports', requireAuth, AdminController.submitReport);

export const adminRoutes = router;
export default adminRoutes;

