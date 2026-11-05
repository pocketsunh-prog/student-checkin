import type { ScanAction, ScanResult } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export interface ScanAuditInput {
  deviceId: string;
  studentId?: string | null;
  action: ScanAction;
  result: ScanResult;
  /** Cosine similarity 0..1 when available. Negative similarities are clamped. */
  confidence?: number | null;
  imagePath?: string | null;
  createdAt?: Date;
}

/**
 * Every kiosk verify attempt writes an audit row. Audit failures must never fail
 * the scan itself, so errors are logged and swallowed.
 */
export async function recordScanEvent(input: ScanAuditInput): Promise<void> {
  const confidence =
    input.confidence === null || input.confidence === undefined
      ? null
      : Math.max(0, Math.min(1, input.confidence));

  try {
    await prisma.scanEvent.create({
      data: {
        deviceId: input.deviceId,
        studentId: input.studentId ?? null,
        action: input.action,
        result: input.result,
        confidence,
        imagePath: input.imagePath ?? null,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  } catch (error) {
    logger.warn('Failed to write scan audit event', { error });
  }
}
