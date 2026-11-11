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
router.post('/change-password', requireAuth, AuthController.changePassword);
router.patch('/password', requireAuth, AuthController.changePassword); // Alias
router.get('/sessions', requireAuth, AuthController.getSessions);
router.post('/sessions/revoke-others', requireAuth, AuthController.revokeOtherSessions);
router.delete('/sessions/revoke-others', requireAuth, AuthController.revokeOtherSessions);
router.delete('/sessions/:sessionId', requireAuth, AuthController.revokeSession);
router.post('/sessions/:sessionId/revoke', requireAuth, AuthController.revokeSession);
router.delete('/sessions', requireAuth, AuthController.revokeOtherSessions);

router.post('/deactivate', requireAuth, AuthController.deactivateAccount);
router.post('/delete-account', requireAuth, AuthController.deleteAccount);
router.post('/delete', requireAuth, AuthController.deleteAccount); // Alias

// Two-Factor Authentication Management
router.get('/two-factor/status', requireAuth, AuthController.getTwoFactorStatus);
router.post('/two-factor/confirm-totp', requireAuth, AuthController.confirmTotp);
router.post('/two-factor/enable-otp', requireAuth, AuthController.enableEmailOtp);
router.post('/two-factor/disable-otp', requireAuth, AuthController.disableEmailOtp);
router.post('/two-factor/disable-totp', requireAuth, AuthController.disableTotp);
router.post('/two-factor/disable-all', requireAuth, AuthController.disableAllTwoFactor);

export const authRoutes = router;
export default authRoutes;

