'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import type { AttendanceRow, AttendanceStatus } from '@/lib/types';
import { dateAndTimeToISO, formatDate, isoToTimeInput } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import { AlertIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { InlineAlert } from '@/components/ui/states';

interface FormState {
  status: AttendanceStatus;
  checkInTime: string;
  checkOutTime: string;
  note: string;
}

const EMPTY: FormState = { status: 'PRESENT', checkInTime: '', checkOutTime: '', note: '' };

export interface AttendanceCorrectionModalProps {
  open: boolean;
  row: AttendanceRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AttendanceCorrectionModal({ open, row, onClose, onSaved }: AttendanceCorrectionModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !row) return;
    setForm({
      status: row.status,
      checkInTime: isoToTimeInput(row.checkInAt),
      checkOutTime: isoToTimeInput(row.checkOutAt),
      note: row.note ?? '',
    });
    setError(null);
  }, [open, row]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row) return;
    setError(null);

    if (form.status !== 'ABSENT' && form.checkOutTime && !form.checkInTime) {
      setError('Add a check-in time before a check-out time.');
      return;
    }
    if (form.status !== 'ABSENT' && form.checkInTime && form.checkOutTime && form.checkOutTime < form.checkInTime) {
      setError('Check-out time must be after check-in time.');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { status: form.status };
      if (form.status !== 'ABSENT') {
        if (form.checkInTime) body.checkInAt = dateAndTimeToISO(row.date, form.checkInTime);
        if (form.checkOutTime) body.checkOutAt = dateAndTimeToISO(row.date, form.checkOutTime);
      }
      if (form.note.trim()) body.note = form.note.trim();

      // Upsert endpoint: works for recorded rows AND synthesized absent rows
      // (which have no attendance id of their own).
      await api.put(
        `/attendance/${encodeURIComponent(row.studentId)}/${encodeURIComponent(row.date)}`,
        body,
      );
      toast.success(
        'Attendance corrected',
        form.status === 'ABSENT'
          ? `${row.fullName} is now marked absent for ${formatDate(row.date)}.`
          : `${row.fullName} was updated for ${formatDate(row.date)}.`,
      );
      onSaved();
      onClose();
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Correct attendance"
      description={row ? `${row.fullName} · ${row.studentId} · ${formatDate(row.date)}` : undefined}
      busy={saving}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="attendance-correction-form" loading={saving}>
            Save correction
          </Button>
        </>
      }
    >
      {row ? (
        <form id="attendance-correction-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" htmlFor="correction-status" required>
              <Select
                id="correction-status"
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AttendanceStatus }))}
              >
                <option value="PRESENT">Present</option>
                <option value="LATE">Late</option>
                <option value="ABSENT">Absent</option>
              </Select>
            </Field>
            <Field label="Late minutes" htmlFor="correction-late" hint="Recomputed by the server from the start time.">
              <Input id="correction-late" value={row.lateMinutes} readOnly disabled className="bg-slate-50" />
            </Field>
          </div>

          {form.status === 'ABSENT' ? (
            <InlineAlert variant="warning" title="Marking this student absent">
              The attendance row will be removed. If a check-in exists it is deleted, and the student is treated as absent for the day.
            </InlineAlert>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Check-in time" htmlFor="correction-checkin" hint="Leave blank to use the current time.">
                <Input
                  id="correction-checkin"
                  type="time"
                  value={form.checkInTime}
                  onChange={(event) => setForm((current) => ({ ...current, checkInTime: event.target.value }))}
                />
              </Field>
              <Field label="Check-out time" htmlFor="correction-checkout" hint="Leave blank if the student has not left.">
                <Input
                  id="correction-checkout"
                  type="time"
                  value={form.checkOutTime}
                  onChange={(event) => setForm((current) => ({ ...current, checkOutTime: event.target.value }))}
                />
              </Field>
            </div>
          )}

          <Field label="Note" htmlFor="correction-note" hint="Visible to admins in the register and reports.">
            <Textarea
              id="correction-note"
              value={form.note}
              maxLength={500}
              placeholder="Reason for the correction, e.g. student forgot to scan out."
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            />
          </Field>

          <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p>
              Manual corrections keep the original kiosk scan history but update the attendance record. Status changes are logged against
              this admin account.
            </p>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
