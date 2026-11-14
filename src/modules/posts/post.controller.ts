import type { Request, Response } from 'express';
import { CatchAsync } from '../../shared/utils/catch-async.js';
import { sendResponse } from '../../shared/utils/send-response.js';
import { PostService } from './post.service.js';

const getFeed = CatchAsync(async (req: Request, res: Response) => {
  const result = await PostService.getFeed(req.query as any, req.user?.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Feed retrieved successfully.',
    meta: result.meta,
    data: result.data,
  });
});

const getPostById = CatchAsync(async (req: Request, res: Response) => {
  const postId = req.params.id as string;
  const result = await PostService.getPostById(postId, req.user?.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Post retrieved successfully.',
    data: result,
  });
});

const createPost = CatchAsync(async (req: Request, res: Response) => {
  const result = await PostService.createPost(req.user!.id, req.body, req.user!.role);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message:
      result.status === 'PENDING_APPROVAL'
        ? 'Post submitted and pending group admin approval.'
        : 'Post published successfully!',
    data: result,
  });
});

const repostPost = CatchAsync(async (req: Request, res: Response) => {
  const { originalPostId, caption, groupId, audience } = req.body;
  const targetId = originalPostId || req.params.id;
  const result = await PostService.repostPost(req.user!.id, targetId, caption, groupId, audience);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Shared successfully to your timeline!',
    data: result,
  });
});

const toggleLike = CatchAsync(async (req: Request, res: Response) => {
  const postId = req.params.id as string;
  const result = await PostService.toggleLike(req.user!.id, postId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: result.liked ? 'Liked post.' : 'Unliked post.',
    data: result,
  });
});

const createComment = CatchAsync(async (req: Request, res: Response) => {
  const postId = req.params.id as string;
  const { content, parentId } = req.body;
  const result = await PostService.createComment(req.user!.id, postId, content, parentId);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Comment posted successfully.',
    data: result,
  });
});

const deletePost = CatchAsync(async (req: Request, res: Response) => {
  const postId = req.params.id as string;
  const result = await PostService.deletePost(req.user!.id, req.user!.role, postId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Post moved to trash successfully.',
    data: result,
  });
});

const getTrash = CatchAsync(async (req: Request, res: Response) => {
  const result = await PostService.getTrash(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Trash items retrieved successfully.',
    data: result,
  });
});

const restorePost = CatchAsync(async (req: Request, res: Response) => {
  const postId = req.params.id as string;
  const result = await PostService.restorePost(req.user!.id, postId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Post restored successfully.',
    data: result,
  });
});

const permanentDeletePost = CatchAsync(async (req: Request, res: Response) => {
  const postId = req.params.id as string;
  const result = await PostService.permanentDeletePost(req.user!.id, req.user!.role, postId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Post permanently deleted.',
    data: result,
  });
});

const emptyTrash = CatchAsync(async (req: Request, res: Response) => {
  const result = await PostService.emptyTrash(req.user!.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Trash emptied successfully.',
    data: result,
  });
});

export const PostController = {
  getFeed,
  getPostById,
  createPost,
  repostPost,
  toggleLike,
  createComment,
  deletePost,
  getTrash,
  restorePost,
  permanentDeletePost,
  emptyTrash,
};

export default PostController;

