import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Tek kullanıcılı, minimum yüzeyli admin oturumu.
 *
 * Kullanıcı veritabanı yok: ADMIN_PASSWORD ortam değişkeni doğrulanır ve
 * imzalı, httpOnly bir çerez bırakılır. İmza anahtarı parolanın kendisinden
 * türetilir; böylece parolayı değiştirmek tüm oturumları geçersiz kılar.
 */

const COOKIE_NAME = "radio_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const adminEnabled = Boolean(process.env.ADMIN_PASSWORD);

function sign(payload: string): string {
  return createHmac("sha256", process.env.ADMIN_PASSWORD ?? "")
    .update(payload)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected) && safeEqual(candidate, expected!);
}

export async function startSession(): Promise<void> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = `${expiresAt}.${sign(String(expiresAt))}`;

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  if (!adminEnabled) return false;

  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;

  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature) return false;
  if (Number(expiresAt) < Date.now()) return false;

  return safeEqual(signature, sign(expiresAt));
}
