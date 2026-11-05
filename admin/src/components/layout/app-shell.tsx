'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { cn, adminDisplayName, initials } from '@/lib/utils';
import { getAdminSession, clearAdminSession } from '@/lib/auth';
import { useAdminSession } from '@/lib/use-session';
import { useToast } from '@/lib/toast';
import {
  CalendarIcon,
  ChartIcon,
  ClipboardCheckIcon,
  CloseIcon,
  DashboardIcon,
  DeviceIcon,
  GraduationCapIcon,
  LogoutIcon,
  MenuIcon,
  SettingsIcon,
  UsersIcon,
} from '@/components/icons';
import { FullPageLoader } from '@/components/ui/states';
import { IconButton } from '@/components/ui/button';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Additional path prefixes that should highlight this item. */
  match?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ href: '/', label: 'Dashboard', icon: <DashboardIcon className="h-[18px] w-[18px]" /> }],
  },
  {
    label: 'People',
    items: [
      {
        href: '/students',
        label: 'Students',
        icon: <UsersIcon className="h-[18px] w-[18px]" />,
        match: ['/students'],
      },
    ],
  },
  {
    label: 'Attendance',
    items: [
      { href: '/attendance', label: 'Daily attendance', icon: <ClipboardCheckIcon className="h-[18px] w-[18px]" /> },
      { href: '/reports', label: 'Reports', icon: <ChartIcon className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/devices', label: 'Kiosk devices', icon: <DeviceIcon className="h-[18px] w-[18px]" /> },
      { href: '/settings', label: 'Settings', icon: <SettingsIcon className="h-[18px] w-[18px]" /> },
    ],
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/';
  if (pathname === item.href) return true;
  if (item.match?.some((prefix) => pathname.startsWith(prefix))) return true;
  return pathname.startsWith(`${item.href}/`);
}

function SidebarContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const session = getAdminSession();
  const router = useRouter();
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);

  function handleLogout() {
    setSigningOut(true);
    clearAdminSession();
    toast.info('Signed out', 'You have been signed out of the admin console.');
    onNavigate?.();
    router.replace('/login');
  }

  return (
    <div className="flex h-full flex-col bg-navy-950">
      <div className="flex h-16 shrink-0 items-center gap-3 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white shadow-lg shadow-brand-500/20">
          <GraduationCapIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight text-white">SchoolCheck</p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Admin console</p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'focus-ring group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                        active
                          ? 'bg-brand-500/15 text-brand-200 ring-1 ring-inset ring-brand-400/20'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <span className={cn('shrink-0', active ? 'text-brand-300' : 'text-slate-400 group-hover:text-slate-200')}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-white/5 p-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-200">
            {initials(adminDisplayName(session?.user))}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{adminDisplayName(session?.user)}</p>
            <p className="truncate text-[11px] text-slate-400">{session?.user.email ?? 'Not signed in'}</p>
          </div>
          <IconButton
            label="Sign out"
            size="sm"
            onClick={handleLogout}
            disabled={signingOut}
            className="text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <LogoutIcon className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-slate-500">
          <span>Kiosk &amp; portal</span>
          <Link href="/register" className="focus-ring rounded text-slate-400 transition hover:text-white">
            Registration page
          </Link>
        </div>
      </div>
    </div>
  );
}

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const session = getAdminSession();
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const currentLabel =
    pathname === '/'
      ? 'Dashboard'
      : pathname.startsWith('/students')
        ? 'Students'
        : pathname.startsWith('/attendance')
          ? 'Daily attendance'
          : pathname.startsWith('/reports')
            ? 'Reports'
            : pathname.startsWith('/devices')
              ? 'Kiosk devices'
              : pathname.startsWith('/settings')
                ? 'Settings'
                : 'Admin';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <IconButton label="Open navigation" onClick={onOpenMenu} className="lg:hidden">
          <MenuIcon className="h-5 w-5" />
        </IconButton>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{currentLabel}</p>
          <p className="hidden text-xs text-slate-500 sm:block">{today}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
            Live attendance
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-700" title={adminDisplayName(session?.user)}>
            {initials(adminDisplayName(session?.user))}
          </span>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useAdminSession();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) {
      const next = encodeURIComponent(`${pathname}`);
      router.replace(`/login?next=${next}`);
    }
  }, [loading, session, pathname, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  if (loading) return <FullPageLoader label="Checking your session…" />;
  if (!session) return <FullPageLoader label="Redirecting to sign in…" />;

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <SidebarContent pathname={pathname} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-navy-950/60" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-slide-in-right">
            <div className="absolute right-3 top-3 z-10">
              <IconButton
                label="Close navigation"
                onClick={() => setMobileOpen(false)}
                className="text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <CloseIcon className="h-5 w-5" />
              </IconButton>
            </div>
            <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        <footer className="mx-auto w-full max-w-7xl px-4 pb-6 text-xs text-slate-400 sm:px-6 lg:px-8">
          SchoolCheck · Student check-in / check-out system
        </footer>
      </div>
    </div>
  );
}
