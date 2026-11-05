import { Router } from 'express';
import { asyncHandler, parseOrThrow, sendOk } from '../lib/http';
import { reportQuerySchema } from '../lib/schemas';
import { authenticate, requireAdmin } from '../middleware/auth';
import { getReportSummary } from '../services/reports.service';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(reportQuerySchema, req.query);
    sendOk(res, await getReportSummary(query));
  }),
);

export default router;
