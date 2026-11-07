import { Router } from 'express';
import { GroupController } from './group.controller.js';
import { requireAuth, optionalAuth } from '../../middleware/authMiddleware.js';

const router = Router();

router.get('/', optionalAuth, GroupController.getGroups);
router.get('/:slug', optionalAuth, GroupController.getGroupBySlug);

router.post('/', requireAuth, GroupController.createGroup);
router.patch('/:id/settings', requireAuth, GroupController.updateGroupSettings);

router.post('/:id/join', requireAuth, GroupController.joinGroup);
router.post('/:id/leave', requireAuth, GroupController.leaveGroup);
router.post('/:id/requests/:memberId', requireAuth, GroupController.handleJoinRequest);
router.patch('/:id/members/:memberId/role', requireAuth, GroupController.updateMemberRole);

export const groupRoutes = router;

