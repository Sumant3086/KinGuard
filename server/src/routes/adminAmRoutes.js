import express from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import * as amController from '../controllers/areaManagerController.js';

const router = express.Router();

// Admin-only routes for Area Manager management
router.use(authenticate, requireRole('ADMIN'));
router.get('/area-managers',                     amController.getAreaManagers);
router.patch('/stores/:storeId/assign-am',       amController.assignStoreAM);
router.patch('/area-managers/:amId/stores',      amController.batchAssignAMStores);

export default router;
