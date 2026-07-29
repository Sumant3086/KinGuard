import express from 'express';
import { authenticate, requireAreaManager } from '../middleware/auth.js';
import * as amController from '../controllers/areaManagerController.js';

const router = express.Router();

// Area Manager routes
router.use(authenticate, requireAreaManager);
router.get('/dashboard',                                         amController.getDashboard);
router.get('/notifications',                                     amController.getNotifications);
router.get('/batches',                                           amController.getBatches);
router.get('/batches/:batchId/stores',                           amController.getBatchStores);
router.get('/batches/:batchId/stores/:storeId/records',          amController.getStoreRecords);
router.patch('/records/:id',                                     amController.updateRecord);
router.post('/batches/:batchId/stores/:storeId/approve',         amController.approveStore);
router.post('/batches/:batchId/stores/:storeId/return',          amController.returnStore);

export default router;
