import express from 'express';
import { authenticate, requireStoreManager } from '../middleware/auth.js';
import * as storeController from '../controllers/storeController.js';

const router = express.Router();

// All store routes require authentication and store manager role
router.use(authenticate, requireStoreManager);

router.get('/dashboard', storeController.getDashboard);
router.get('/batches', storeController.getBatches);
router.get('/inventory', storeController.getInventory);
router.patch('/inventory/:id', storeController.updateInventoryRecord);
router.post('/inventory/submit', storeController.submitInventory);
router.get('/inventory/download', storeController.downloadInventory);

export default router;
