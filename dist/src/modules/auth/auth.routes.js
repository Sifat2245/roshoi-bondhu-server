import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { requireAuth, optionalAuth } from '../../middleware/auth.middleware.js';
const router = Router();
router.post('/signup', AuthController.signup);
router.post('/register', AuthController.signup); // Alias
router.post('/verify-otp', AuthController.verifyOTP);
router.post('/resend-otp', AuthController.resendOTP);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.post('/login', AuthController.login);
router.post('/logout', optionalAuth, AuthController.logout);
router.get('/me', requireAuth, AuthController.getMe);
export const authRoutes = router;
export default authRoutes;
