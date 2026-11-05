import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/lib/toast';

export const metadata: Metadata = {
  title: {
    default: 'SchoolCheck — Student Attendance',
    template: '%s · SchoolCheck',
  },
  description:
    'Student check-in / check-out system: face-recognition kiosk attendance, student records, daily attendance and reports.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111d33',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
