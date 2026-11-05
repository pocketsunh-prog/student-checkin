'use client';

import { useEffect, useState } from 'react';
import type { Admin, Student } from './types';
import {
  SESSION_EVENT,
  UNAUTHORIZED_EVENT,
  getAdminSession,
  getStudentSession,
  type AdminSession,
  type StudentSession,
} from './auth';

interface SessionState<T> {
  session: T | null;
  /** False until the first client-side read of localStorage has happened. */
  loading: boolean;
}

function useStoredSession<T>(read: () => T | null): SessionState<T> {
  const [state, setState] = useState<SessionState<T>>({ session: null, loading: true });

  useEffect(() => {
    const sync = () => setState({ session: read(), loading: false });
    sync();
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener('storage', sync);
    window.addEventListener(UNAUTHORIZED_EVENT, sync);
    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener(UNAUTHORIZED_EVENT, sync);
    };
  }, [read]);

  return state;
}

export function useAdminSession(): SessionState<AdminSession> {
  return useStoredSession<AdminSession>(getAdminSession);
}

export function useStudentSession(): SessionState<StudentSession> {
  return useStoredSession<StudentSession>(getStudentSession);
}

export type { AdminSession, StudentSession };
export type { Admin, Student };
