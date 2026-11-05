'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import type { Device, DeviceListResponse, DeviceWithKey } from '@/lib/types';
import { cn, formatDate, relativeTime } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import {
  AlertIcon,
  CheckCircleIcon,
  CopyIcon,
  DeviceIcon,
  KeyIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
  WifiIcon,
  WifiOffIcon,
} from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, InlineAlert } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export default function DevicesPage() {
  const toast = useToast();

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ device: Device; apiKey: string; action: 'created' | 'rotated' } | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotateTarget, setRotateTarget] = useState<Device | null>(null);
  const [rotating, setRotating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<DeviceListResponse>('/devices');
      if (id !== requestId.current) return;
      setDevices(Array.isArray(result?.items) ? result.items : []);
    } catch (loadError) {
      if (id !== requestId.current) return;
      setError(apiErrorMessage(loadError));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setName('');
    setLocation('');
    setFormErrors({});
    setCreateError(null);
    setCopied(false);
    setCreateOpen(true);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Device name is required.';
    if (!location.trim()) errors.location = 'Location is required.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setCreating(true);
    setCreateError(null);
    try {
      const result = await api.post<DeviceWithKey>('/devices', { name: name.trim(), location: location.trim() });
      setCreateOpen(false);
      setNewKey({ device: result.device, apiKey: result.apiKey, action: 'created' });
      setCopied(false);
      toast.success('Device created', 'Copy the API key now — it will not be shown again.');
      await load();
    } catch (createFailure) {
      setCreateError(apiErrorMessage(createFailure));
    } finally {
      setCreating(false);
    }
  }

  async function rotateKey() {
    if (!rotateTarget) return;
    setRotating(true);
    try {
      const result = await api.post<DeviceWithKey>(`/devices/${encodeURIComponent(rotateTarget.id)}/rotate-key`, {});
      setRotateTarget(null);
      setNewKey({ device: result.device, apiKey: result.apiKey, action: 'rotated' });
      setCopied(false);
      toast.success('API key rotated', 'The old key stops working immediately.');
      await load();
    } catch (rotateError) {
      toast.error('Could not rotate key', apiErrorMessage(rotateError));
    } finally {
      setRotating(false);
    }
  }

  async function toggleActive(device: Device) {
    setTogglingId(device.id);
    try {
      await api.patch(`/devices/${encodeURIComponent(device.id)}`, { active: !device.active });
      toast.success(device.active ? 'Device deactivated' : 'Device activated', `${device.name} has been updated.`);
      await load();
    } catch (toggleError) {
      toast.error('Could not update device', apiErrorMessage(toggleError));
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteDevice() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/devices/${encodeURIComponent(deleteTarget.id)}`);
      toast.success('Device deleted', `${deleteTarget.name} can no longer connect to the API.`);
      setDeleteTarget(null);
      await load();
    } catch (deleteError) {
      toast.error('Could not delete device', apiErrorMessage(deleteError));
    } finally {
      setDeleting(false);
    }
  }

  async function copyKey() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey.apiKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Clipboard blocked', 'Select the key and copy it manually.');
    }
  }

  const onlineCount = devices.filter((device) => device.online).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kiosk devices"
        description="Each school gate tablet authenticates with its own API key. Keys are stored hashed and shown only once."
        meta={
          devices.length > 0 ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <DeviceIcon className="h-3.5 w-3.5" />
                {devices.length} {devices.length === 1 ? 'device' : 'devices'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <WifiIcon className="h-3.5 w-3.5" />
                {onlineCount} online
              </span>
            </>
          ) : undefined
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} loading={loading && devices.length > 0} leftIcon={<RefreshIcon className="h-4 w-4" />}>
              Refresh
            </Button>
            <Button onClick={openCreate} leftIcon={<PlusIcon className="h-4 w-4" />}>
              Add device
            </Button>
          </>
        }
      />

      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
        <p>
          The kiosk app needs the API key when it is set up. A key is displayed <strong>once</strong> when created or rotated — if it is lost,
          rotate the key and reconfigure that tablet.
        </p>
      </div>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={() => void load()} />
        </Card>
      ) : loading && devices.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="p-5">
              <div className="flex items-start justify-between">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-4 h-5 w-40" />
              <Skeleton className="mt-2 h-3.5 w-28" />
              <Skeleton className="mt-5 h-9 w-full rounded-lg" />
            </Card>
          ))}
        </div>
      ) : devices.length === 0 ? (
        <Card>
          <EmptyState
            icon={<DeviceIcon className="h-6 w-6" />}
            title="No kiosk devices yet"
            description="Add the tablet at the school gate, then enter its API key in the kiosk app to start recording attendance."
            action={
              <Button onClick={openCreate} leftIcon={<PlusIcon className="h-4 w-4" />}>
                Add your first device
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((device) => {
            const online = Boolean(device.online);
            const toggling = togglingId === device.id;
            return (
              <Card key={device.id} className={cn('flex flex-col p-5 transition', !device.active && 'opacity-75')}>
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-lg',
                      device.active ? 'bg-navy-50 text-navy-700' : 'bg-slate-100 text-slate-400',
                    )}
                  >
                    <DeviceIcon className="h-5 w-5" />
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {device.active ? (
                      <Badge tone={online ? 'brand' : 'slate'} dot>
                        {online ? 'Online' : 'Offline'}
                      </Badge>
                    ) : (
                      <Badge tone="slate">Disabled</Badge>
                    )}
                  </div>
                </div>

                <div className="mt-3 min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-slate-900">{device.name}</h2>
                  <p className="truncate text-xs text-slate-500">{device.location}</p>

                  <dl className="mt-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-400">Last seen</dt>
                      <dd className="font-medium text-slate-600" title={device.lastSeenAt ?? undefined}>
                        {device.lastSeenAt ? relativeTime(device.lastSeenAt) : 'never'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-400">Key prefix</dt>
                      <dd className="truncate font-mono text-slate-600">{device.apiKeyPrefix}…</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-400">Added</dt>
                      <dd className="text-slate-600">{formatDate(device.createdAt)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={device.active}
                    aria-label={`${device.active ? 'Deactivate' : 'Activate'} ${device.name}`}
                    disabled={toggling}
                    onClick={() => void toggleActive(device)}
                    className="focus-ring inline-flex items-center gap-2 rounded-md text-xs font-medium text-slate-600 disabled:opacity-50"
                  >
                    <span
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition',
                        device.active ? 'bg-brand-500' : 'bg-slate-300',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition',
                          device.active ? 'translate-x-[18px]' : 'translate-x-0.5',
                        )}
                      />
                    </span>
                    {device.active ? 'Active' : 'Disabled'}
                  </button>
                  <div className="flex items-center gap-1">
                    <IconButton
                      label={`Rotate API key for ${device.name}`}
                      size="sm"
                      variant="outline"
                      onClick={() => setRotateTarget(device)}
                    >
                      <KeyIcon className="h-4 w-4" />
                    </IconButton>
                    <IconButton label={`Delete ${device.name}`} size="sm" variant="danger" onClick={() => setDeleteTarget(device)}>
                      <TrashIcon className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1">
          <WifiIcon className="h-3.5 w-3.5" />
          Online = heartbeat within the last 2 minutes
        </span>
        <span className="inline-flex items-center gap-1">
          <WifiOffIcon className="h-3.5 w-3.5" />
          Offline devices keep working after they reconnect
        </span>
      </p>

      {/* Create device */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add a kiosk device"
        description="Give the device a recognisable name and location."
        busy={creating}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" form="create-device-form" loading={creating} leftIcon={<DeviceIcon className="h-4 w-4" />}>
              Create device
            </Button>
          </>
        }
      >
        <form id="create-device-form" onSubmit={handleCreate} className="space-y-4" noValidate>
          {createError ? <InlineAlert variant="error">{createError}</InlineAlert> : null}
          <Field label="Device name" htmlFor="device-name" required error={formErrors.name} hint="e.g. Main Gate Tablet">
            <Input
              id="device-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Main Gate Tablet"
              invalid={Boolean(formErrors.name)}
              autoFocus
            />
          </Field>
          <Field label="Location" htmlFor="device-location" required error={formErrors.location} hint="e.g. Main Entrance">
            <Input
              id="device-location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Main Entrance"
              invalid={Boolean(formErrors.location)}
            />
          </Field>
          <InlineAlert variant="info">
            After creating the device you will get a one-time API key to enter in the kiosk app.
          </InlineAlert>
        </form>
      </Modal>

      {/* API key modal */}
      <Modal
        open={Boolean(newKey)}
        onClose={() => setNewKey(null)}
        title={newKey?.action === 'rotated' ? 'New API key' : 'Device API key'}
        description="Copy this key into the kiosk app now."
        size="md"
        footer={
          <Button onClick={() => setNewKey(null)} leftIcon={<CheckCircleIcon className="h-4 w-4" />}>
            I have saved the key
          </Button>
        }
      >
        {newKey ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="flex items-center gap-2 font-semibold">
                <AlertIcon className="h-4 w-4" />
                This key cannot be retrieved again
              </p>
              <p className="mt-1 text-xs leading-relaxed">
                Only a hash is stored on the server. If you lose this key, rotate it and reconfigure the tablet.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">API key for {newKey.device.name}</p>
              <p className="mt-2 break-all font-mono text-sm font-semibold text-slate-900">{newKey.apiKey}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void copyKey()} leftIcon={<CopyIcon className="h-3.5 w-3.5" />}>
                {copied ? 'Copied to clipboard' : 'Copy API key'}
              </Button>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-slate-400">Location</dt>
                <dd className="font-medium text-slate-700">{newKey.device.location}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-slate-400">Key prefix</dt>
                <dd className="font-mono font-medium text-slate-700">{newKey.device.apiKeyPrefix}…</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(rotateTarget)}
        onClose={() => setRotateTarget(null)}
        onConfirm={() => void rotateKey()}
        title="Rotate this device's API key?"
        message={
          <>
            A new key is generated for <strong>{rotateTarget?.name}</strong>. The current key stops working immediately, so the kiosk app must
            be reconfigured with the new key.
          </>
        }
        confirmLabel="Rotate key"
        tone="primary"
        loading={rotating}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void deleteDevice()}
        title="Delete this device?"
        message={
          <>
            <strong>{deleteTarget?.name}</strong> will be removed and its API key revoked. Past attendance records are kept. This cannot be
            undone.
          </>
        }
        confirmLabel="Delete device"
        tone="danger"
        loading={deleting}
      />
    </div>
  );
}
