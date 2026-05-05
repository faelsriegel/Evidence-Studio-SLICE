import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { Users } from "@/lib/db";

const AUTH_COOKIE_NAME = "auth-token";
const JWT_SECRET =
  process.env.JWT_SECRET || "slice_evidencias_secret_change_in_production";
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

export async function resolveUserFromCredentials(
  identifier: string,
  password: string,
): Promise<AuthUser | null> {
  const normalized = identifier.trim().toLowerCase();
  let user = Users.findByEmail(normalized);
  if (!user) {
    user = Users.findByUsername(normalized);
  }

  if (!user) {
    return null;
  }

  const userWithPassword = Users.findByIdWithPassword(user.id);
  if (!userWithPassword) {
    return null;
  }

  const passwordMatch = await bcrypt.compare(password, userWithPassword.password_hash);
  if (!passwordMatch) {
    return null;
  }

  return {
    userId: user.id,
    name: user.name,
    role: user.role,
    username: user.username,
    email: user.email,
  };
}

export { AUTH_COOKIE_NAME };
