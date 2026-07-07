import express from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../middleware/auth.js';
import * as adminController from '../controllers/adminController.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate, requireRole('ADMIN'));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'));
    }
  },
});

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Stores
router.get('/stores', adminController.getStores);
router.post('/stores', adminController.createStore);
router.patch('/stores/:id', adminController.updateStore);

// Users
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.patch('/users/:id', adminController.updateUser);

// Uploads
router.post('/uploads/preview', upload.single('file'), adminController.previewUpload);
router.post('/uploads', upload.single('file'), adminController.uploadInventory);
router.get('/uploads', adminController.getUploads);

// Inventory
router.get('/inventory', adminController.getInventory);
router.get('/inventory/export', adminController.downloadInventoryExport);

// Reports
router.get('/reports/reconciliation', adminController.getReconciliationReport);
router.get('/reports/reconciliation/download', adminController.downloadReconciliationReport);

// Audit logs
router.get('/audit-logs', adminController.getAuditLogs);

// Batches
router.get('/batches', adminController.getBatches);
router.patch('/batches/:id', adminController.updateBatch);
router.post('/batches/extend', adminController.grantStoreExtension);
router.get('/batches/:batchId/export', adminController.getBatchExport);

// Analytics
router.get('/analytics/trends', adminController.getTrends);

// Store drilldown
router.get('/stores/:storeId/drilldown', adminController.getStoreDrilldown);

export default router;
