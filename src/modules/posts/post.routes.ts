import { Router } from 'express';
import { PostController } from './post.controller.js';
import { requireAuth, optionalAuth } from '../../middleware/auth.middleware.js';

const router = Router();

// Trash management routes (must precede /:id)
router.get('/trash', requireAuth, PostController.getTrash);
router.post('/trash/empty', requireAuth, PostController.emptyTrash);
router.post('/trash/:id/restore', requireAuth, PostController.restorePost);
router.delete('/trash/:id', requireAuth, PostController.permanentDeletePost);

router.get('/', optionalAuth, PostController.getFeed);
router.get('/:id', optionalAuth, PostController.getPostById);
router.post('/', requireAuth, PostController.createPost);
router.post('/repost', requireAuth, PostController.repostPost);
router.post('/:id/share', requireAuth, PostController.repostPost);
router.delete('/:id', requireAuth, PostController.deletePost);

router.post('/:id/like', requireAuth, PostController.toggleLike);
router.post('/:id/comments', requireAuth, PostController.createComment);

export const postRoutes = router;
export default postRoutes;

