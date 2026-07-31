// Admin endpoints, re-exported from the modules in ./admin.
//
// This file used to hold all of it — 3,282 lines covering dashboards, stores, users,
// uploads, inventory overrides, cycle management, reports and the audit log. Nothing has
// moved out of the admin surface and no route wiring changed: adminRoutes.js imports the
// same names from the same path it always did. Only the definitions moved, each into a
// module named for the thing it is about, so a change to the upload pipeline no longer
// means opening a file where three quarters of the content is unrelated.
//
// The split is by concern rather than by size, which is why the modules are uneven:
// user management really is the largest part of the admin surface.

export {
  getDashboard,
  getTrends,
  getNotifications,
} from './admin/dashboard.js';

export {
  getStores,
  createStore,
  deleteStore,
  updateStore,
  bulkDeleteStores,
  forceDeleteStore,
  getPlantsWithoutUsers,
} from './admin/stores.js';

export {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  approveUser,
  batchCreateUsersForPlants,
  previewUserBatchImport,
  commitUserBatchImport,
  rejectUser,
  bulkReviewUsers,
  bulkDeleteUsers,
} from './admin/users.js';

export {
  uploadInventory,
  previewUpload,
  downloadSampleTemplate,
} from './admin/uploads.js';

export {
  getInventory,
  overrideInventoryRecord,
  bulkOverrideInventory,
} from './admin/inventory.js';

export {
  getBatches,
  updateBatch,
  closeBatch,
  grantStoreExtension,
  getBatchExport,
  deleteBatch,
  unlockStoreForBatch,
  sendBatchReminders,
} from './admin/batches.js';

export {
  getReconciliationReport,
  downloadReconciliationReport,
  downloadInventoryExport,
  downloadInventoryExportPDF,
  downloadReconciliationReportPDF,
  downloadBatchExportPDF,
} from './admin/reports.js';

export {
  getAuditLogs,
  exportAuditLogs,
} from './admin/audit.js';
