import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const AUTH_COOKIE_NAME = "auth-token";
const JWT_SECRET =
  process.env.JWT_SECRET || "slice_evidencias_secret_change_in_production";

const DEFAULT_USER = {
  userId: process.env.AUTH_USER_ID || "infra",
  name: process.env.AUTH_NAME || "Infraestrutura TI",
  role: "admin" as const,
  username: process.env.AUTH_USERNAME || "infra",
  email: process.env.AUTH_EMAIL || "infra@slice.global",
};

const DEFAULT_PASSWORD = process.env.AUTH_PASSWORD || "infra";
const secretKey = new TextEncoder().encode(JWT_SECRET);

export interface AuthUser {
  userId: string;
  name: string;
  role: "admin" | "member";
  username: string;
  email: string;
}

export async function generateToken(payload: AuthUser, expiresIn = "12h") {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const verified = await jwtVerify(token, secretKey);
    return verified.payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyToken(token);
}

export function resolveUserFromCredentials(identifier: string, password: string): AuthUser | null {
  const normalized = identifier.trim().toLowerCase();
  const validIdentity =
    normalized === DEFAULT_USER.username.toLowerCase() ||
    normalized === DEFAULT_USER.email.toLowerCase();

  if (!validIdentity || password !== DEFAULT_PASSWORD) {
    return null;
  }

  return DEFAULT_USER;
}

export { AUTH_COOKIE_NAME };
