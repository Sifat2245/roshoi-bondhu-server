import { Router } from 'express';
import { postRoutes } from '../module/post/post.routes.js';
import { groupRoutes } from '../module/group/group.routes.js';
import { userRoutes } from '../module/user/user.routes.js';
import { adminRoutes } from '../module/admin/admin.routes.js';
import { uploadRoutes } from '../module/upload/upload.routes.js';

const router = Router();

// Modular application routes
router.use('/post', postRoutes);
router.use('/posts', postRoutes);
router.use('/group', groupRoutes);
router.use('/groups', groupRoutes);
router.use('/user', userRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/upload', uploadRoutes);

export const routerIndex = router;
export default routerIndex;

