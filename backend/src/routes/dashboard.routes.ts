import { Router } from 'express';
import { asyncHandler, parseOrThrow, sendOk } from '../lib/http';
import { dashboardQuerySchema } from '../lib/schemas';
import { authenticate, requireAdmin } from '../middleware/auth';
import { getDashboard } from '../services/reports.service';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(dashboardQuerySchema, req.query);
    sendOk(res, await getDashboard(query.date));
  }),
);

export default router;
