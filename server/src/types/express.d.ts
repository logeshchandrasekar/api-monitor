export interface AuthUser {
  id: string;
  name: string;
  email: string;
  plan: "FREE" | "PRO" | "TEAM";
  createdAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
