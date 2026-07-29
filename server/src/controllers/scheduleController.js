import prisma from '../config/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../services/auditService.js';
import { computeNextRun } from '../services/cycleScheduleService.js';
import { requireId, parseIntParam } from '../utils/params.js';

const VALID_FREQUENCIES = new Set(['weekly', 'monthly', 'quarterly']);

function validateFrequencyInput({ frequency, dayOfMonth, dayOfWeek }) {
  if (!VALID_FREQUENCIES.has(frequency)) {
    throw new AppError('Frequency must be weekly, monthly, or quarterly', 400);
  }
  if (frequency === 'weekly') {
    const dow = parseInt(dayOfWeek);
    if (isNaN(dow) || dow < 0 || dow > 6) throw new AppError('dayOfWeek must be 0–6 for weekly schedules', 400);
  }
  if (frequency === 'monthly' || frequency === 'quarterly') {
    const dom = parseInt(dayOfMonth);
    if (isNaN(dom) || dom < 1 || dom > 28) throw new AppError('dayOfMonth must be 1–28 for monthly/quarterly schedules', 400);
  }
}

function validateScheduleInput({ name, frequency, dayOfMonth, dayOfWeek, submissionWindowDays }) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError('Schedule name is required', 400);
  }
  validateFrequencyInput({ frequency, dayOfMonth, dayOfWeek });
  const window = parseInt(submissionWindowDays) || 7;
  if (window < 1 || window > 90) throw new AppError('submissionWindowDays must be between 1 and 90', 400);
}

export async function getSchedules(req, res, next) {
  try {
    const schedules = await prisma.cycleSchedule.findMany({
      orderBy: { createdAt: 'desc' },
      include: { creator: { select: { name: true, employeeId: true } } },
    });
    res.json(schedules);
  } catch (error) { next(error); }
}

export async function createSchedule(req, res, next) {
  try {
    const { name, frequency, dayOfMonth, dayOfWeek, submissionWindowDays } = req.body;
    validateScheduleInput({ name, frequency, dayOfMonth, dayOfWeek, submissionWindowDays });

    const nextRunAt = computeNextRun(
      frequency,
      dayOfMonth ? parseInt(dayOfMonth) : null,
      dayOfWeek  ? parseInt(dayOfWeek)  : null,
    );

    const schedule = await prisma.cycleSchedule.create({
      data: {
        name:                 name.trim(),
        frequency,
        dayOfMonth:           dayOfMonth ? parseInt(dayOfMonth) : null,
        dayOfWeek:            dayOfWeek  ? parseInt(dayOfWeek)  : null,
        submissionWindowDays: parseInt(submissionWindowDays) || 7,
        isActive:             true,
        nextRunAt,
        createdBy:            req.user.id,
      },
      include: { creator: { select: { name: true, employeeId: true } } },
    });

    createAuditLog({
      userId: req.user.id, action: 'CREATE_CYCLE_SCHEDULE',
      entityType: 'CYCLE_SCHEDULE', entityId: schedule.id,
      metadata: { name: schedule.name, frequency, nextRunAt },
    }).catch(() => {});

    res.status(201).json(schedule);
  } catch (error) { next(error); }
}

export async function updateSchedule(req, res, next) {
  try {
    const id = requireId(req.params.id, 'schedule ID');

    const { name, frequency, dayOfMonth, dayOfWeek, submissionWindowDays, isActive } = req.body;

    // If frequency-related fields are changing, recompute nextRunAt
    const updateData = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) throw new AppError('Schedule name is required', 400);
      updateData.name = name.trim();
    }
    if (isActive !== undefined)           updateData.isActive = Boolean(isActive);
    if (submissionWindowDays !== undefined) {
      updateData.submissionWindowDays = parseIntParam(submissionWindowDays, 'submissionWindowDays', 7, 1, 90);
    }

    if (frequency !== undefined) {
      validateFrequencyInput({ frequency, dayOfMonth, dayOfWeek });
      updateData.frequency  = frequency;
      updateData.dayOfMonth = dayOfMonth ? parseInt(dayOfMonth) : null;
      updateData.dayOfWeek  = dayOfWeek  ? parseInt(dayOfWeek)  : null;
      updateData.nextRunAt  = computeNextRun(frequency, updateData.dayOfMonth, updateData.dayOfWeek);
    }

    const schedule = await prisma.cycleSchedule.update({
      where: { id },
      data: updateData,
      include: { creator: { select: { name: true, employeeId: true } } },
    }).catch(err => {
      if (err.code === 'P2025') throw new AppError('Schedule not found', 404);
      throw err;
    });

    createAuditLog({
      userId: req.user.id, action: 'UPDATE_CYCLE_SCHEDULE',
      entityType: 'CYCLE_SCHEDULE', entityId: id,
      metadata: updateData,
    }).catch(() => {});

    res.json(schedule);
  } catch (error) { next(error); }
}

export async function deleteSchedule(req, res, next) {
  try {
    const id = requireId(req.params.id, 'schedule ID');

    const schedule = await prisma.cycleSchedule.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!schedule) throw new AppError('Schedule not found', 404);

    await prisma.cycleSchedule.delete({ where: { id } });

    createAuditLog({
      userId: req.user.id, action: 'DELETE_CYCLE_SCHEDULE',
      entityType: 'CYCLE_SCHEDULE', entityId: id,
      metadata: { name: schedule.name },
    }).catch(() => {});

    res.json({ message: 'Schedule deleted' });
  } catch (error) { next(error); }
}
