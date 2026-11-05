'use client';

import { useEffect, useState } from 'react';
import { api, type ApiAuth } from '@/lib/api';
import { cn, initials } from '@/lib/utils';

// Photos are served from an authenticated endpoint (`GET /students/:id/photo`),
// which a plain <img> cannot call with a Bearer token. We fetch the bytes once,
// keep an object URL in a module-level cache, and render that.
const objectUrlCache = new Map<string, string>();
const failedSources = new Set<string>();

function photoApiPath(photoUrl: string): string {
  if (/^https?:\/\//i.test(photoUrl)) return photoUrl;
  return photoUrl.replace(/^\/api/, '');
}

export function AuthedImage({
  src,
  alt,
  className,
  auth = 'admin',
  fallback,
}: {
  src: string;
  alt: string;
  className?: string;
  auth?: ApiAuth;
  fallback?: React.ReactNode;
}) {
  const cacheKey = `${auth}:${src}`;
  const [url, setUrl] = useState<string | null>(() => objectUrlCache.get(cacheKey) ?? null);
  const [failed, setFailed] = useState<boolean>(() => failedSources.has(cacheKey));

  useEffect(() => {
    if (objectUrlCache.has(cacheKey)) {
      setUrl(objectUrlCache.get(cacheKey) ?? null);
      return;
    }
    if (failedSources.has(cacheKey)) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    api
      .blob(photoApiPath(src), undefined, auth)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        objectUrlCache.set(cacheKey, createdUrl);
        setUrl(createdUrl);
      })
      .catch(() => {
        if (cancelled) return;
        failedSources.add(cacheKey);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, src, auth]);

  if (failed || !url) return <>{fallback ?? null}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      decoding="async"
      onError={() => {
        failedSources.add(cacheKey);
        setFailed(true);
      }}
    />
  );
}

const AVATAR_SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

/** Initials avatar that upgrades to the authenticated student photo when available. */
export function UserAvatar({
  name,
  photoUrl,
  size = 'md',
  auth = 'admin',
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof AVATAR_SIZES;
  auth?: ApiAuth;
  className?: string;
}) {
  const fallback = (
    <span className="flex h-full w-full items-center justify-center font-semibold text-brand-700">{initials(name)}</span>
  );

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 ring-1 ring-inset ring-brand-200/60',
        AVATAR_SIZES[size],
        className,
      )}
      aria-hidden={photoUrl ? undefined : true}
    >
      {photoUrl ? (
        <AuthedImage
          src={photoUrl}
          alt={name}
          auth={auth}
          className="h-full w-full object-cover"
          fallback={fallback}
        />
      ) : (
        fallback
      )}
    </span>
  );
}
