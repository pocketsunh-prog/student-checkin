'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import type { CreateStudentResponse, MetaOptions, Pagination, StudentListRow, StudentStatus } from '@/lib/types';
import { cn, formatDate, titleCase, todayISO } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import { ChevronRightIcon, PlusIcon, RefreshIcon, SearchIcon, UsersIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination as PaginationBar } from '@/components/ui/pagination';
import { TBody, TD, TH, THead, TableContainer, TableEmpty, TableSkeleton, TR } from '@/components/ui/table';
import { AttendanceBadge, FaceEnrolledBadge, StudentStatusBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/avatar';
import { StudentFormModal } from '@/components/students/student-form-modal';

type FaceFilter = '' | 'true' | 'false';
type SortOption = 'studentId' | 'name' | 'createdAt';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export default function StudentsPage() {
  const toast = useToast();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [formFilter, setFormFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StudentStatus | 'ALL'>('ACTIVE');
  const [faceFilter, setFaceFilter] = useState<FaceFilter>('');
  const [sort, setSort] = useState<SortOption>('studentId');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [data, setData] = useState<Pagination<StudentListRow> | null>(null);
  const [meta, setMeta] = useState<MetaOptions>({ classes: [], forms: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch((current) => {
        if (current === searchInput.trim()) return current;
        setPage(1);
        return searchInput.trim();
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    api
      .get<MetaOptions>('/students/meta/options')
      .then((options) => setMeta({ classes: options.classes ?? [], forms: options.forms ?? [] }))
      .catch(() => {
        // Filters still work without the options list.
      });
  }, []);

  const load = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<Pagination<StudentListRow>>('/students', {
        search: search || undefined,
        class: classFilter || undefined,
        form: formFilter || undefined,
        status: statusFilter,
        faceEnrolled: faceFilter || undefined,
        page,
        pageSize,
        sort,
      });
      if (id !== requestId.current) return;
      setData(result);
    } catch (loadError) {
      if (id !== requestId.current) return;
      setError(apiErrorMessage(loadError));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [search, classFilter, formFilter, statusFilter, faceFilter, page, pageSize, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFilters() {
    setSearchInput('');
    setSearch('');
    setClassFilter('');
    setFormFilter('');
    setStatusFilter('ACTIVE');
    setFaceFilter('');
    setSort('studentId');
    setPage(1);
  }

  function handleCreated(created: CreateStudentResponse) {
    toast.success('Student added', `${created.student.fullName} is now in the register.`);
    setData(null);
    void load();
  }

  const filtersActive =
    Boolean(search) || Boolean(classFilter) || Boolean(formFilter) || statusFilter !== 'ACTIVE' || Boolean(faceFilter) || sort !== 'studentId';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Students"
        description="Search student records, check face enrolment and manage profiles."
        meta={
          data ? (
            <span className="inline-flex items-center gap-1.5">
              <UsersIcon className="h-3.5 w-3.5" />
              {data.total} {data.total === 1 ? 'student' : 'students'} match the current filters
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} loading={loading && Boolean(data)} leftIcon={<RefreshIcon className="h-4 w-4" />}>
              Refresh
            </Button>
            <Button onClick={() => setModalOpen(true)} leftIcon={<PlusIcon className="h-4 w-4" />}>
              Add student
            </Button>
          </>
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="sm:col-span-2">
            <label htmlFor="student-search" className="sr-only">
              Search students
            </label>
            <Input
              id="student-search"
              type="search"
              placeholder="Search by name or student ID…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              icon={<SearchIcon className="h-4 w-4" />}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="class-filter" className="sr-only">
              Filter by class
            </label>
            <Select
              id="class-filter"
              value={classFilter}
              onChange={(event) => {
                setClassFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All classes</option>
              {meta.classes.map((className) => (
                <option key={className} value={className}>
                  Class {className}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="form-filter" className="sr-only">
              Filter by form
            </label>
            <Select
              id="form-filter"
              value={formFilter}
              onChange={(event) => {
                setFormFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All forms</option>
              {meta.forms.map((formName) => (
                <option key={formName} value={formName}>
                  {formName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="status-filter" className="sr-only">
              Filter by status
            </label>
            <Select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StudentStatus | 'ALL');
                setPage(1);
              }}
            >
              <option value="ACTIVE">Active students</option>
              <option value="INACTIVE">Inactive students</option>
              <option value="ALL">All statuses</option>
            </Select>
          </div>
          <div>
            <label htmlFor="face-filter" className="sr-only">
              Filter by face enrolment
            </label>
            <Select
              id="face-filter"
              value={faceFilter}
              onChange={(event) => {
                setFaceFilter(event.target.value as FaceFilter);
                setPage(1);
              }}
            >
              <option value="">Face: any</option>
              <option value="true">Face enrolled</option>
              <option value="false">No face yet</option>
            </Select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="sort" className="text-xs font-medium text-slate-500">
              Sort by
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as SortOption);
                setPage(1);
              }}
              className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600"
            >
              <option value="studentId">Student ID</option>
              <option value="name">Name</option>
              <option value="createdAt">Recently created</option>
            </select>
            {filtersActive ? (
              <button
                type="button"
                onClick={resetFilters}
                className="focus-ring rounded text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              >
                Reset filters
              </button>
            ) : null}
          </div>
          <p className="text-xs text-slate-400">Showing page {data?.page ?? page}</p>
        </div>
      </Card>

      <div>
        <TableContainer>
          <THead>
            <TR>
              <TH>Student</TH>
              <TH>Class / form</TH>
              <TH className="hidden md:table-cell">Date of birth</TH>
              <TH>Face</TH>
              <TH className="hidden sm:table-cell">Status</TH>
              <TH>Today</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          {loading && !data ? (
            <TableSkeleton columns={7} rows={8} />
          ) : error && !data ? (
            <TBody>
              <tr>
                <td colSpan={7} className="p-0">
                  <ErrorState message={error} onRetry={() => void load()} />
                </td>
              </tr>
            </TBody>
          ) : data && data.items.length === 0 ? (
            <TBody>
              <TableEmpty
                colSpan={7}
                title={filtersActive ? 'No students match these filters' : 'No students yet'}
                description={
                  filtersActive
                    ? 'Try a different search term or clear the filters.'
                    : 'Add your first student or let students self-register from the public registration page.'
                }
                action={
                  filtersActive ? (
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setModalOpen(true)} leftIcon={<PlusIcon className="h-4 w-4" />}>
                      Add student
                    </Button>
                  )
                }
              />
            </TBody>
          ) : (
            <TBody>
              {data?.items.map((student) => (
                <TR key={student.studentId} className="group">
                  <TD>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={student.fullName} photoUrl={student.photoUrl} size="md" />
                      <div className="min-w-0">
                        <Link
                          href={`/students/${encodeURIComponent(student.studentId)}`}
                          className="focus-ring block truncate rounded font-semibold text-slate-900 hover:text-brand-700"
                        >
                          {student.fullName}
                        </Link>
                        <p className="truncate font-mono text-xs text-slate-500">{student.studentId}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <p className="font-medium text-slate-800">{student.class}</p>
                    <p className="text-xs text-slate-500">{student.form}</p>
                  </TD>
                  <TD className="hidden md:table-cell">
                    <span className="text-slate-600">{formatDate(student.dob)}</span>
                    <span className="ml-2 text-xs text-slate-400">{titleCase(student.sex)}</span>
                  </TD>
                  <TD>
                    <FaceEnrolledBadge enrolled={Boolean(student.faceEnrolled)} />
                  </TD>
                  <TD className="hidden sm:table-cell">
                    <StudentStatusBadge status={student.status} />
                  </TD>
                  <TD>
                    <AttendanceBadge status={student.todayStatus} />
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/students/${encodeURIComponent(student.studentId)}`}
                      className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                    >
                      View
                      <ChevronRightIcon className="h-3.5 w-3.5" />
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          )}
        </TableContainer>

        {data ? (
          <PaginationBar
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
          />
        ) : loading ? (
          <div className="flex items-center justify-between px-1 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-48" />
          </div>
        ) : null}
      </div>

      <p className="px-1 text-xs text-slate-400">
        Students without an enrolled face cannot check in at a kiosk. Open a profile to capture a face photo.
      </p>

      <StudentFormModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
    </div>
  );
}
