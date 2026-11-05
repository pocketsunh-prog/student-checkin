import cors, { type CorsOptions } from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { generalLimiter } from './middleware/rateLimit';
import { requestLogger } from './middleware/requestLogger';
import routes from './routes';

function corsOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
): void {
  // No Origin header: native Android app / server-to-server / curl.
  if (!origin) return callback(null, true);
  if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
    return callback(null, true);
  }
  return callback(null, false);
}

const corsOptions: CorsOptions = {
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Key'],
  exposedHeaders: ['Content-Disposition'],
  credentials: false,
  maxAge: 600,
};

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      // Photos are loaded cross-origin by the admin web app (<img>).
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(requestLogger);
  app.use(generalLimiter);

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
