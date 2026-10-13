import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
export const adminProfileSelect = { id: true, username: true, fullName: true, firstName: true, lastName: true, middleName: true, nameSuffix: true, role: true, section: true, schoolId: true, schoolName: true, createdAt: true };
export async function getAdminUser(request) {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET;
  if (!secret) return null;
  const token = request ? request.cookies.get("crla_admin_token")?.value || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") : (await cookies()).get("crla_admin_token")?.value;
  if (!token || token.length > 8192) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    if (payload.scope !== "admin" || payload.role !== "admin" || !Number.isInteger(Number(payload.id)) || Number(payload.id) <= 0) return null;
    const user = await prisma.user.findUnique({ where: { id: Number(payload.id) }, select: { ...adminProfileSelect, adminSessionVersion: true } });
    if (user?.role !== "admin" || !Number.isInteger(payload.session_version) || payload.session_version !== user.adminSessionVersion) return null;
    const { adminSessionVersion, ...profile } = user;
    return profile;
  } catch { return null; }
}
