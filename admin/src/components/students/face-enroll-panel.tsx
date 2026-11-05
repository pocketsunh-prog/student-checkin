'use client';

import { useState } from 'react';
import { api, apiErrorMessage, type ApiAuth } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { CameraIcon, CheckCircleIcon, FaceIcon, ShieldIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { InlineAlert } from '@/components/ui/states';
import { Badge } from '@/components/ui/badge';
import { WebcamCapture, type CapturedPhoto } from '@/components/webcam-capture';

export interface FaceEnrollPanelProps {
  /** Path relative to the API base, e.g. `/students/STU001/face`. */
  enrollPath: string;
  faceEnrolled: boolean;
  auth?: ApiAuth;
  onEnrolled: () => void;
  /** Optional label override for the action button. */
  actionLabel?: string;
}

export function FaceEnrollPanel({ enrollPath, faceEnrolled, auth = 'admin', onEnrolled, actionLabel }: FaceEnrollPanelProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  function close() {
    setOpen(false);
    setPhoto(null);
    setError(null);
    setResetSignal((value) => value + 1);
  }

  async function upload() {
    if (!photo) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('faceImage', photo.blob, photo.fileName);
      await api.upload<{ faceEnrolled: boolean; enrolledAt?: string }>(enrollPath, body, { auth });
      toast.success('Face enrolled', 'The student can now check in at a kiosk.');
      setOpen(false);
      setPhoto(null);
      setResetSignal((value) => value + 1);
      onEnrolled();
    } catch (uploadError) {
      setError(apiErrorMessage(uploadError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-600">
            <FaceIcon className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">Face recognition key</p>
              {faceEnrolled ? (
                <Badge tone="brand" dot>
                  Enrolled
                </Badge>
              ) : (
                <Badge tone="amber" dot>
                  Not enrolled
                </Badge>
              )}
            </div>
            <p className="mt-0.5 max-w-md text-xs leading-relaxed text-slate-500">
              {faceEnrolled
                ? 'A face key is stored for this student. Re-enrolling replaces it immediately.'
                : 'Capture a clear, front-facing photo to let this student check in at the kiosk.'}
            </p>
          </div>
        </div>
        {!open ? (
          <Button variant={faceEnrolled ? 'outline' : 'primary'} size="sm" onClick={() => setOpen(true)} leftIcon={<CameraIcon className="h-4 w-4" />}>
            {actionLabel ?? (faceEnrolled ? 'Re-enrol face' : 'Enrol face')}
          </Button>
        ) : null}
      </div>

      {faceEnrolled && open ? (
        <InlineAlert variant="warning" title="This replaces the current face key">
          The old photo and descriptor are replaced as soon as the new photo is uploaded. Only continue if the correct student is in
          front of the camera.
        </InlineAlert>
      ) : null}

      {open ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <WebcamCapture
            onCapture={setPhoto}
            resetSignal={resetSignal}
            disabled={submitting}
            hint="Ask the student to look straight at the camera — one face only."
          />
          {error ? (
            <div className="mt-3">
              <InlineAlert variant="error">{error}</InlineAlert>
            </div>
          ) : null}
          {photo ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5">
              <p className="inline-flex items-center gap-2 text-xs font-medium text-brand-800">
                <CheckCircleIcon className="h-4 w-4 text-brand-600" />
                Photo looks good. Upload it to finish enrolment.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={close} disabled={submitting}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void upload()} loading={submitting} leftIcon={<ShieldIcon className="h-4 w-4" />}>
                  Confirm &amp; upload face
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={close} disabled={submitting}>
                Close camera
              </Button>
            </div>
          )}
        </div>
      ) : null}

      <p className="text-xs text-slate-400">
        Face images are stored on the server and compared at the kiosk. They are not public and are never included in exports.
      </p>
    </div>
  );
}
