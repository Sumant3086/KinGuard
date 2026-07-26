import express from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import * as scheduleController from '../controllers/scheduleController.js';

const router = express.Router();
router.use(authenticate, requireRole('ADMIN'));

router.get('/',    scheduleController.getSchedules);
router.post('/',   scheduleController.createSchedule);
router.patch('/:id', scheduleController.updateSchedule);
router.delete('/:id', scheduleController.deleteSchedule);

export default router;
