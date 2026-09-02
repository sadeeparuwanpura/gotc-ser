import type { Role, PermissionMap } from '../constants/domain';

export interface AuthContext {
  userId: string;
  name: string;
  email: string;
  role: Role;
  permissions: PermissionMap;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. Read through `authContext(req)`, never directly. */
      auth?: AuthContext;
    }
  }
}

export {};
