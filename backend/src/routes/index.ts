import { Router } from 'express';
import authRoutes from './auth.routes';
import studentRoutes from './student.routes';
import studentsRoutes from './students.routes';
import devicesRoutes from './devices.routes';
import kioskRoutes from './kiosk.routes';
import attendanceRoutes from './attendance.routes';
import reportsRoutes from './reports.routes';
import dashboardRoutes from './dashboard.routes';
import settingsRoutes from './settings.routes';
import healthRoutes from './health.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/student', studentRoutes);
router.use('/students', studentsRoutes);
router.use('/devices', devicesRoutes);
router.use('/kiosk', kioskRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/reports', reportsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);

export default router;
