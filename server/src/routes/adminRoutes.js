import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import * as adminController    from '../controllers/adminController.js';
import * as analyticsController from '../controllers/analyticsController.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate, requireRole('ADMIN'));

// Heavy export/analytics limiter — 30 per minute per IP
const heavyLimiter = rateLimit({
  windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many export requests. Please slow down.' }),
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase().split('.').pop();
    const allowedExtensions = ['xlsx', 'xls', 'csv'];
    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv',
      'application/octet-stream', // some browsers/OS combos send this for .xlsx
    ];
    if (allowedExtensions.includes(ext) || allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(`Only .xlsx, .xls, and .csv files are allowed (got: ${file.mimetype})`, 400));
    }
  },
});

// Timeout middleware for file processing routes (2 minutes)
const fileTimeout = (req, res, next) => {
  req.setTimeout(120000);
  res.setTimeout(120000);
  next();
};

// Dashboard
router.get('/dashboard', adminController.getDashboard);
router.get('/notifications', adminController.getNotifications);

// Stores — bulk route MUST come before :id routes
router.get('/stores', adminController.getStores);
router.post('/stores', adminController.createStore);
router.delete('/stores/bulk', adminController.bulkDeleteStores);
router.patch('/stores/:id', adminController.updateStore);
router.delete('/stores/:id', adminController.deleteStore);
router.delete('/stores/:id/force', adminController.forceDeleteStore);

// Users — specific paths must come before /:id wildcards
router.get('/users', adminController.getUsers);
router.post('/users', adminController.createUser);
router.get('/users/plants-without-users', adminController.getPlantsWithoutUsers);
router.post('/users/batch-create-for-plants', adminController.batchCreateUsersForPlants);
router.post('/users/batch-import/preview', fileTimeout, upload.single('file'), adminController.previewUserBatchImport);
router.post('/users/batch-import/commit',  fileTimeout, upload.single('file'), adminController.commitUserBatchImport);
router.post('/users/bulk-review', adminController.bulkReviewUsers);
router.post('/users/bulk-delete', adminController.bulkDeleteUsers);
router.post('/users/:id/approve', adminController.approveUser);
router.post('/users/:id/reject',  adminController.rejectUser);
router.patch('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

// Uploads (with extended timeout for file processing)
router.get('/uploads/template', adminController.downloadSampleTemplate);
router.post('/uploads/preview', fileTimeout, upload.single('file'), adminController.previewUpload);
router.post('/uploads', fileTimeout, upload.single('file'), adminController.uploadInventory);
router.get('/uploads', adminController.getUploads);

// Inventory
router.get('/inventory', adminController.getInventory);
router.get('/inventory/export',     heavyLimiter, adminController.downloadInventoryExport);
router.get('/inventory/export-pdf', heavyLimiter, adminController.downloadInventoryExportPDF);
router.patch('/inventory/:id/override', adminController.overrideInventoryRecord);
router.post('/inventory/bulk-override', adminController.bulkOverrideInventory);

// Reports
router.get('/reports/reconciliation', adminController.getReconciliationReport);
router.get('/reports/reconciliation/download',     heavyLimiter, adminController.downloadReconciliationReport);
router.get('/reports/reconciliation/download-pdf', heavyLimiter, adminController.downloadReconciliationReportPDF);

// Audit logs
router.get('/audit-logs', adminController.getAuditLogs);
router.get('/audit-logs/export', adminController.exportAuditLogs);

// Batches
router.get('/batches', adminController.getBatches);
router.patch('/batches/:id', adminController.updateBatch);
router.post('/batches/:id/close', adminController.closeBatch);
router.delete('/batches/:id', adminController.deleteBatch);
router.post('/batches/extend', adminController.grantStoreExtension);
router.post('/batches/:id/unlock-store', adminController.unlockStoreForBatch);
router.get('/batches/:batchId/export',     adminController.getBatchExport);
router.get('/batches/:batchId/export-pdf', adminController.downloadBatchExportPDF);
router.post('/batches/:id/send-reminders', adminController.sendBatchReminders);

// Analytics
router.get('/analytics/trends',        adminController.getTrends);
router.get('/analytics/risk',          analyticsController.getRiskScores);
router.get('/analytics/trends-yoy',    analyticsController.getTrendsYoY);

// Reports
router.get('/reports/executive-summary', analyticsController.downloadExecutiveSummary);

// Store drilldown
router.get('/stores/:storeId/drilldown', adminController.getStoreDrilldown);

export default router;
