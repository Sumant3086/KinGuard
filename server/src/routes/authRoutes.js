import express from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/login',           authController.login);
router.post('/refresh',         authController.refresh);        // rotate refresh token → new access token
router.post('/logout',          authController.logout);         // clear cookies + revoke refresh token
router.get('/me',  authenticate, authController.getCurrentUser);
router.post('/change-password', authenticate, authController.changePassword);

export default router;
