'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertIcon, CameraIcon, CheckIcon, RefreshIcon, UploadIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';

export interface CapturedPhoto {
  blob: Blob;
  /** JPEG data URL used for the on-screen preview. */
  dataUrl: string;
  fileName: string;
}

type CameraState = 'idle' | 'requesting' | 'live' | 'capturing' | 'captured' | 'error';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CAPTURE_WIDTH = 1024;

function describeCameraError(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission was denied. Click the camera icon in the address bar, allow access, then try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera was found on this device. You can upload a photo instead.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The camera is already in use by another app. Close the other app and try again.';
    case 'OverconstrainedError':
      return 'The camera does not support the requested video mode. Try a different camera.';
    case 'SecurityError':
      return 'Camera access requires a secure context. Use http://localhost:3000 or serve the app over HTTPS.';
    default:
      return 'The camera could not be started. Check your browser permissions and try again.';
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

export interface WebcamCaptureProps {
  /** Called with the captured photo, or `null` when the photo is discarded/retaken. */
  onCapture: (photo: CapturedPhoto | null) => void;
  /** Show a file-upload fallback when no camera is available. */
  allowUpload?: boolean;
  hint?: string;
  disabled?: boolean;
  className?: string;
  /** Change this number to force the component back to the camera view. */
  resetSignal?: number;
  /** Countdown before capture, in seconds (0 disables it). */
  countdownSeconds?: number;
}

export function WebcamCapture({
  onCapture,
  allowUpload = true,
  hint = 'Look straight at the camera and keep your face inside the oval.',
  disabled = false,
  className,
  resetSignal = 0,
  countdownSeconds = 3,
}: WebcamCaptureProps) {
  const [state, setState] = useState<CameraState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cameraActive, setCameraActive] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
    setCountdown(null);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setCameraActive(true);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('error');
      setError(
        window.isSecureContext
          ? 'This browser does not expose a camera API. Try Chrome, Edge or Safari, or upload a photo instead.'
          : 'Camera access needs a secure context. Open the app at http://localhost:3000 (or use HTTPS) and try again.',
      );
      return;
    }
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setState('live');
    } catch (cameraError) {
      stopStream();
      setError(describeCameraError(cameraError));
      setState('error');
    }
  }, [stopStream]);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) {
      setError('The camera is still warming up. Wait a moment and try again.');
      setState('live');
      return;
    }
    setState('capturing');
    const scale = Math.min(1, MAX_CAPTURE_WIDTH / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Your browser cannot process the camera image. Try uploading a photo instead.');
      setState('error');
      return;
    }
    // Mirror the frame so the saved photo matches the mirrored preview.
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.restore();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) {
      setError('Could not capture an image. Please try again.');
      setState('live');
      return;
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const captured: CapturedPhoto = {
      blob,
      dataUrl,
      fileName: `face-${Date.now()}.jpg`,
    };
    stopStream();
    clearCountdown();
    setPhoto(captured);
    setState('captured');
    onCapture(captured);
  }, [clearCountdown, onCapture, stopStream]);

  const handleShutter = useCallback(() => {
    if (state !== 'live' || countdown !== null || disabled) return;
    if (countdownSeconds <= 0) {
      void captureFrame();
      return;
    }
    setCountdown(countdownSeconds);
    countdownTimer.current = setInterval(() => {
      setCountdown((current) => {
        if (current === null) return null;
        if (current <= 1) {
          if (countdownTimer.current) {
            clearInterval(countdownTimer.current);
            countdownTimer.current = null;
          }
          void captureFrame();
          return null;
        }
        return current - 1;
      });
    }, 1000);
  }, [captureFrame, countdown, countdownSeconds, disabled, state]);

  const retake = useCallback(() => {
    setPhoto(null);
    onCapture(null);
    setError(null);
    clearCountdown();
    void startCamera();
  }, [clearCountdown, onCapture, startCamera]);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) {
        setError('That photo is larger than 8 MB. Please choose a smaller image.');
        return;
      }
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
        setError('Please choose a JPEG, PNG or WebP image.');
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        const captured: CapturedPhoto = { blob: file, dataUrl, fileName: file.name || 'photo.jpg' };
        stopStream();
        clearCountdown();
        setError(null);
        setPhoto(captured);
        setState('captured');
        onCapture(captured);
      } catch {
        setError('Could not read that image file. Please try another one.');
      }
    },
    [clearCountdown, onCapture, stopStream],
  );

  // Release the camera when unmounted or when the parent resets the component.
  useEffect(() => {
    return () => {
      stopStream();
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [stopStream]);

  useEffect(() => {
    if (resetSignal === 0) return;
    setPhoto(null);
    setError(null);
    clearCountdown();
    stopStream();
    setState('idle');
    setCameraActive(true);
  }, [resetSignal, clearCountdown, stopStream]);

  // Keep the preview element wired if the video node re-mounts.
  useEffect(() => {
    const video = videoRef.current;
    if (state === 'live' && video && streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => undefined);
    }
  }, [state]);

  const showIdle = state === 'idle';
  const showLive = state === 'live' || state === 'capturing' || state === 'requesting';
  const showError = state === 'error' && !photo;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-navy-950">
        {showLive || state === 'captured' ? (
          <div className="aspect-[4/3] w-full">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              aria-label="Live camera preview"
              className={cn(
                'h-full w-full scale-x-[-1] object-cover',
                state !== 'live' && state !== 'requesting' ? 'invisible' : 'visible',
              )}
            />
            {photo && state === 'captured' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.dataUrl} alt="Captured face preview" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}

            {state === 'live' ? (
              <>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-[72%] w-[54%] rounded-[50%] border-2 border-dashed border-white/75 shadow-[0_0_0_9999px_rgba(10,18,35,0.28)]" />
                </div>
                <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-navy-950/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" aria-hidden="true" />
                  Camera live
                </div>
                <p className="absolute inset-x-0 bottom-3 mx-auto w-max max-w-[90%] rounded-full bg-navy-950/70 px-3 py-1 text-center text-[11px] font-medium text-white backdrop-blur">
                  {hint}
                </p>
                {countdown !== null ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-navy-950/40" aria-live="assertive">
                    <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/95 text-5xl font-bold text-navy-900 shadow-xl">
                      {countdown > 0 ? countdown : '…'}
                    </span>
                  </div>
                ) : null}
              </>
            ) : null}

            {state === 'requesting' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                <CameraIcon className="h-8 w-8 animate-pulse" />
                <p className="text-sm font-medium">Starting camera…</p>
                <p className="text-xs text-slate-300">Allow camera access if your browser asks.</p>
              </div>
            ) : null}

            {state === 'capturing' ? (
              <div className="absolute inset-0 flex items-center justify-center bg-navy-950/50 text-white">
                <p className="text-sm font-semibold">Saving photo…</p>
              </div>
            ) : null}

            {state === 'captured' && photo ? (
              <>
                <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <CheckIcon className="h-3.5 w-3.5" />
                  Photo captured
                </div>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-[72%] w-[54%] rounded-[50%] border-2 border-dashed border-brand-300/80" />
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white">
              {showError ? <AlertIcon className="h-7 w-7" /> : <CameraIcon className="h-7 w-7" />}
            </div>
            {showError ? (
              <>
                <p className="max-w-sm text-sm font-semibold text-white">Camera unavailable</p>
                <p className="max-w-sm text-xs leading-relaxed text-slate-300">{error}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-white">Camera is off</p>
                <p className="max-w-xs text-xs leading-relaxed text-slate-300">
                  We use the camera only for the face photo. Nothing is recorded until you press capture.
                </p>
              </>
            )}
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      </div>

      {state === 'error' && photo ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {showIdle ? (
          <>
            <Button onClick={() => void startCamera()} disabled={disabled} leftIcon={<CameraIcon className="h-4 w-4" />}>
              Enable camera
            </Button>
            {allowUpload ? (
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={disabled} leftIcon={<UploadIcon className="h-4 w-4" />}>
                Upload photo instead
              </Button>
            ) : null}
          </>
        ) : null}

        {state === 'live' ? (
          <>
            <Button
              onClick={handleShutter}
              loading={countdown !== null}
              disabled={disabled || state !== 'live'}
              leftIcon={<CameraIcon className="h-4 w-4" />}
            >
              {countdown !== null ? `Hold still… ${countdown}` : 'Capture photo'}
            </Button>
            {allowUpload ? (
              <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={disabled} leftIcon={<UploadIcon className="h-4 w-4" />}>
                Upload instead
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => {
                stopStream();
                clearCountdown();
                setState('idle');
              }}
              disabled={disabled}
            >
              Turn off
            </Button>
          </>
        ) : null}

        {state === 'captured' ? (
          <Button variant="outline" onClick={retake} disabled={disabled} leftIcon={<RefreshIcon className="h-4 w-4" />}>
            Retake photo
          </Button>
        ) : null}

        {state === 'requesting' ? <Button loading disabled>Starting camera…</Button> : null}

        {showError && allowUpload ? (
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={disabled} leftIcon={<UploadIcon className="h-4 w-4" />}>
            Upload a photo instead
          </Button>
        ) : null}

        {state === 'error' && cameraActive ? (
          <Button variant="ghost" onClick={() => void startCamera()} disabled={disabled} leftIcon={<RefreshIcon className="h-4 w-4" />}>
            Try camera again
          </Button>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      {allowUpload ? (
        <p className="text-xs text-slate-500">
          Tips: use a well-lit room, remove hats and glasses if possible, and keep one face in frame. JPEG, PNG or WebP up to 8 MB.
        </p>
      ) : null}
    </div>
  );
}
