import type { Admin, Device, Student } from '@prisma/client';

export type AuthContext =
  | { actorType: 'admin'; admin: Admin }
  | { actorType: 'student'; student: Student };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      device?: Device;
    }
  }
}
