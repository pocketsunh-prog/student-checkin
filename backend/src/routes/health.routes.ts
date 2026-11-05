import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler, sendOk } from '../lib/http';
import { faceServiceStatus } from '../face';

const router = Router();

/** Public health check. Docker compose and uptime monitoring hit this. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    let db: 'ok' | 'error' = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }

    sendOk(
      res,
      {
        status: db === 'ok' ? 'ok' : 'error',
        db,
        faceService: faceServiceStatus(),
        uptimeSeconds: Math.floor(process.uptime()),
      },
      db === 'ok' ? 200 : 503,
    );
  }),
);

export default router;
