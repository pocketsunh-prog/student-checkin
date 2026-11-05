import { Prisma, type Student } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { errors } from '../lib/errors';
import { logger } from '../lib/logger';
import { now } from '../lib/clock';
import { hashPassword, sha256OfDescriptor, generateTemporaryPassword } from '../lib/security';
import {
  isSchoolDay,
  parseDateOnly,
  parseSchoolDays,
  toSchoolDateString,
} from '../lib/time';
import {
  absentAttendanceToDto,
  attendanceToDto,
  fullName,
  studentToDto,
  type AttendanceDto,
  type Pagination,
  type StudentDto,
  type TodayStatus,
} from '../lib/dto';
import type { UploadedImage } from '../lib/images';
import type { UpdateStudentInput, StudentListQueryInput } from '../lib/schemas';
import { getFaceProvider } from '../face';
import { findBestMatch, invalidateDescriptorCache } from '../face/matcher';
import { getSettings } from './settings.service';
import { deleteStoredFile, saveFacePhoto } from './storage.service';
import type { FaceExtraction } from '../face/types';

export const DEFAULT_STUDENT_PASSWORD = 'Student@12345';

export interface CreateStudentInput {
  studentId: string;
  firstName: string;
  lastName: string;
  dob: string;
  sex: 'MALE' | 'FEMALE' | 'OTHER';
  class: string;
  form: string;
  password?: string;
}

export interface CreateStudentResult {
  student: Student;
  initialPassword?: string;
}

interface PreparedEnrollment {
  descriptor: number[];
  photoPath: string;
  hash: string;
  enrolledAt: Date;
}

function faceDetectionError(extraction: Extract<FaceExtraction, { ok: false }>): Error {
  switch (extraction.reason) {
    case 'MULTIPLE_FACES':
      return errors.faceNotDetected('Exactly one face is required in the image');
    case 'NO_FACE':
      return errors.faceNotDetected('No face detected in the image');
    case 'UNREADABLE':
    default:
      return errors.faceNotDetected('The image could not be read');
  }
}

async function extractFaceImage(image: UploadedImage, excludeStudentId?: string): Promise<PreparedEnrollment['descriptor']> {
  const provider = getFaceProvider();
  if (!provider.isReady()) throw errors.faceServiceUnavailable();

  let extraction: FaceExtraction;
  try {
    extraction = await provider.extract(image.buffer);
  } catch (error) {
    logger.error('Face extraction failed', { error });
    throw errors.faceServiceUnavailable();
  }
  if (!extraction.ok) throw faceDetectionError(extraction);

  const settings = await getSettings();
  const duplicate = await findBestMatch(extraction.descriptor, {
    ...(excludeStudentId ? { excludeStudentId } : {}),
  });
  if (duplicate && duplicate.similarity >= settings.faceMatchThreshold) {
    throw errors.faceAlreadyEnrolled();
  }
  return extraction.descriptor;
}

async function prepareEnrollment(
  studentId: string,
  image: UploadedImage,
  excludeStudentId?: string,
): Promise<PreparedEnrollment> {
  const descriptor = await extractFaceImage(image, excludeStudentId);
  const photoPath = await saveFacePhoto(studentId, image.buffer, image.ext);
  return {
    descriptor,
    photoPath,
    hash: sha256OfDescriptor(descriptor),
    enrolledAt: now(),
  };
}

export async function createStudent(
  input: CreateStudentInput,
  options: { image?: UploadedImage; requireFace: boolean },
): Promise<CreateStudentResult> {
  const existing = await prisma.student.findUnique({
    where: { studentId: input.studentId },
    select: { studentId: true },
  });
  if (existing) {
    throw errors.conflict(`Student ID ${input.studentId} already exists`);
  }

  if (!options.image && options.requireFace) {
    throw errors.validation('A face image is required', { faceImage: ['A face image is required'] });
  }

  const initialPassword = input.password ?? DEFAULT_STUDENT_PASSWORD;
  const passwordHash = await hashPassword(initialPassword);

  let enrolled: PreparedEnrollment | null = null;
  if (options.image) enrolled = await prepareEnrollment(input.studentId, options.image);

  try {
    const student = await prisma.student.create({
      data: {
        studentId: input.studentId,
        firstName: input.firstName,
        lastName: input.lastName,
        dob: parseDateOnly(input.dob),
        sex: input.sex,
        class: input.class,
        form: input.form,
        passwordHash,
        ...(enrolled
          ? {
              faceDescriptor: enrolled.descriptor,
              faceDescriptorHash: enrolled.hash,
              faceEnrolledAt: enrolled.enrolledAt,
              photoPath: enrolled.photoPath,
            }
          : {}),
      },
    });

    if (enrolled) invalidateDescriptorCache();
    return { student, ...(input.password ? {} : { initialPassword }) };
  } catch (error) {
    if (enrolled) await deleteStoredFile(enrolled.photoPath);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw errors.conflict(`Student ID ${input.studentId} already exists`);
    }
    throw error;
  }
}

export async function enrollFaceForStudent(
  student: Student,
  image: UploadedImage,
): Promise<{ student: Student; enrolledAt: Date }> {
  const enrolled = await prepareEnrollment(student.studentId, image, student.studentId);

  let updated: Student;
  try {
    updated = await prisma.student.update({
      where: { studentId: student.studentId },
      data: {
        faceDescriptor: enrolled.descriptor,
        faceDescriptorHash: enrolled.hash,
        faceEnrolledAt: enrolled.enrolledAt,
        photoPath: enrolled.photoPath,
      },
    });
  } catch (error) {
    await deleteStoredFile(enrolled.photoPath);
    throw error;
  }

  if (student.photoPath && student.photoPath !== enrolled.photoPath) {
    await deleteStoredFile(student.photoPath);
  }
  invalidateDescriptorCache();
  return { student: updated, enrolledAt: enrolled.enrolledAt };
}

export async function getStudentOrThrow(studentId: string): Promise<Student> {
  const student = await prisma.student.findUnique({ where: { studentId } });
  if (!student) throw errors.notFound('Student not found');
  return student;
}

async function computeTodayStatus(student: Student, timeZone: string, schoolDays: number[]): Promise<TodayStatus> {
  if (student.status !== 'ACTIVE') return null;
  const today = toSchoolDateString(now(), timeZone);
  // Do not report absences for dates before the student enrolled.
  if (today < toSchoolDateString(student.createdAt, timeZone)) return null;
  const row = await prisma.attendance.findUnique({
    where: { studentId_date: { studentId: student.studentId, date: parseDateOnly(today) } },
    select: { status: true },
  });
  if (row) return row.status;
  return isSchoolDay(today, schoolDays) ? 'ABSENT' : null;
}

export async function listStudents(
  query: StudentListQueryInput,
): Promise<Pagination<StudentDto>> {
  const settings = await getSettings();
  const timeZone = settings.timezone;
  const schoolDays = parseSchoolDays(settings.schoolDays);
  const today = toSchoolDateString(now(), timeZone);

  const where: Prisma.StudentWhereInput = {};
  if (query.status !== 'ALL') where.status = query.status;
  if (query.class) where.class = query.class;
  if (query.form) where.form = query.form;
  if (query.search) {
    where.OR = [
      { studentId: { contains: query.search } },
      { firstName: { contains: query.search } },
      { lastName: { contains: query.search } },
    ];
  }
  if (query.faceEnrolled === 'true') where.faceDescriptor = { not: Prisma.DbNull };
  if (query.faceEnrolled === 'false') where.faceDescriptor = { equals: Prisma.DbNull };

  const orderBy: Prisma.StudentOrderByWithRelationInput[] =
    query.sort === 'name'
      ? [{ lastName: 'asc' }, { firstName: 'asc' }, { studentId: 'asc' }]
      : query.sort === 'createdAt'
        ? [{ createdAt: 'desc' }, { studentId: 'asc' }]
        : [{ studentId: 'asc' }];

  const skip = (query.page - 1) * query.pageSize;
  const [total, students] = await prisma.$transaction([
    prisma.student.count({ where }),
    prisma.student.findMany({ where, orderBy, skip, take: query.pageSize }),
  ]);

  const ids = students.map((student) => student.studentId);
  const rows = ids.length
    ? await prisma.attendance.findMany({
        where: { studentId: { in: ids }, date: parseDateOnly(today) },
        select: { studentId: true, status: true },
      })
    : [];
  const statusByStudent = new Map(rows.map((row) => [row.studentId, row.status]));
  const todayIsSchoolDay = isSchoolDay(today, schoolDays);

  const items = students.map((student) => {
    const explicit = statusByStudent.get(student.studentId);
    // Absences are only derived on/after the student's enrollment date.
    const enrolled = toSchoolDateString(student.createdAt, timeZone) <= today;
    const fallback: TodayStatus = todayIsSchoolDay && enrolled ? 'ABSENT' : null;
    const todayStatus: TodayStatus =
      student.status === 'ACTIVE' ? (explicit ?? fallback) : null;
    return studentToDto(student, timeZone, todayStatus);
  });

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

export async function getStudentDetail(
  studentId: string,
): Promise<{ student: StudentDto; recentAttendance: AttendanceDto[] }> {
  const settings = await getSettings();
  const student = await getStudentOrThrow(studentId);
  const todayStatus = await computeTodayStatus(
    student,
    settings.timezone,
    parseSchoolDays(settings.schoolDays),
  );
  const rows = await prisma.attendance.findMany({
    where: { studentId },
    orderBy: [{ date: 'desc' }],
    take: 10,
    include: { student: true },
  });

  return {
    student: studentToDto(student, settings.timezone, todayStatus),
    recentAttendance: rows.map((row) => attendanceToDto(row, settings.timezone)),
  };
}

export async function updateStudent(
  studentId: string,
  patch: UpdateStudentInput,
): Promise<StudentDto> {
  const student = await getStudentOrThrow(studentId);
  const data: Prisma.StudentUpdateInput = {};
  if (patch.firstName !== undefined) data.firstName = patch.firstName;
  if (patch.lastName !== undefined) data.lastName = patch.lastName;
  if (patch.dob !== undefined) data.dob = parseDateOnly(patch.dob);
  if (patch.sex !== undefined) data.sex = patch.sex;
  if (patch.class !== undefined) data.class = patch.class;
  if (patch.form !== undefined) data.form = patch.form;
  if (patch.status !== undefined) data.status = patch.status;

  const updated = await prisma.student.update({ where: { studentId: student.studentId }, data });
  if (patch.status === 'INACTIVE') invalidateDescriptorCache();

  const settings = await getSettings();
  const todayStatus = await computeTodayStatus(
    updated,
    settings.timezone,
    parseSchoolDays(settings.schoolDays),
  );
  return studentToDto(updated, settings.timezone, todayStatus);
}

export async function deactivateStudent(
  studentId: string,
): Promise<{ studentId: string; status: 'INACTIVE' }> {
  const student = await getStudentOrThrow(studentId);
  await prisma.student.update({ where: { studentId: student.studentId }, data: { status: 'INACTIVE' } });
  invalidateDescriptorCache();
  return { studentId: student.studentId, status: 'INACTIVE' };
}

export async function resetStudentPassword(
  studentId: string,
  newPassword?: string,
): Promise<{ studentId: string; temporaryPassword: string }> {
  const student = await getStudentOrThrow(studentId);
  const temporaryPassword = newPassword ?? generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  await prisma.student.update({
    where: { studentId: student.studentId },
    data: { passwordHash },
  });
  return { studentId: student.studentId, temporaryPassword };
}

export async function getStudentMetaOptions(): Promise<{ classes: string[]; forms: string[] }> {
  const rows = await prisma.student.findMany({
    where: { status: 'ACTIVE' },
    select: { class: true, form: true },
  });
  const classes = [...new Set(rows.map((row) => row.class))].sort((a, b) => a.localeCompare(b));
  const forms = [...new Set(rows.map((row) => row.form))].sort((a, b) => a.localeCompare(b));
  return { classes, forms };
}

export { absentAttendanceToDto, fullName };
