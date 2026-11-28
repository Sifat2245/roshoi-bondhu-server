import { Router } from 'express';
import { optionalAuth, requireAuth } from '../../middleware/auth.middleware.js';
import { NotificationController } from './notification.controller.js';

const router = Router();

router.get('/', optionalAuth, NotificationController.listNotifications);
router.post('/read', requireAuth, NotificationController.markNotificationsRead);
router.post('/:id/respond', requireAuth, NotificationController.respondToNotification);
router.delete('/:id', requireAuth, NotificationController.dismissNotification);

export const notificationRoutes = router;
export default notificationRoutes;

