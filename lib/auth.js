import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const AUTH_COOKIE_NAME = "crla_token";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.AUTH_SECRET ||
  "";

const TOKEN_MAX_AGE_SECONDS =
  60 * 60 * 24 * 7;

function getJwtSecret() {
  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET or AUTH_SECRET is not configured."
    );
  }

  return new TextEncoder().encode(
    JWT_SECRET
  );
}

/*
 * Create the authentication token used by the login route.
 *
 * The payload intentionally contains only non-sensitive identity information.
 */
export async function createAuthToken(
  user
) {
  const secret =
    getJwtSecret();

  const { SignJWT } =
    await import("jose");

  return new SignJWT({
    id: user.id,
    username: user.username,
    role: user.role,
  })
    .setProtectedHeader({
      alg: "HS256",
    })
    .setIssuedAt()
    .setExpirationTime(
      `${TOKEN_MAX_AGE_SECONDS}s`
    )
    .sign(secret);
}

export async function verifyAuthToken(
  token
) {
  if (
    !token ||
    !JWT_SECRET
  ) {
    return null;
  }

  try {
    const result =
      await jwtVerify(
        token,
        getJwtSecret()
      );

    return result.payload;
  } catch {
    return null;
  }
}

/*
 * Read the token from the HttpOnly cookie first.
 * Authorization: Bearer ... is also supported so server-side callers
 * and older client integrations can authenticate without depending on
 * cookie parsing.
 */
export async function getAuthToken(
  request
) {
  if (request) {
    const cookieToken =
      request.cookies?.get?.(
        AUTH_COOKIE_NAME
      )?.value;

    if (cookieToken) {
      return cookieToken;
    }

    const authorization =
      request.headers?.get?.(
        "authorization"
      );

    if (
      authorization &&
      /^Bearer\s+/i.test(
        authorization
      )
    ) {
      return authorization.replace(
        /^Bearer\s+/i,
        ""
      ).trim();
    }

    const legacyAuthorization =
      request.headers?.get?.(
        "x-authorization"
      );

    if (
      legacyAuthorization &&
      /^Bearer\s+/i.test(
        legacyAuthorization
      )
    ) {
      return legacyAuthorization.replace(
        /^Bearer\s+/i,
        ""
      ).trim();
    }
  }

  /*
   * Route handlers such as the Excel export route do not pass a Request.
   * In that case use Next.js server-side cookie storage.
   */
  try {
    const cookieStore =
      await cookies();

    return (
      cookieStore.get(
        AUTH_COOKIE_NAME
      )?.value || null
    );
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser(
  request
) {
  const token =
    await getAuthToken(
      request
    );

  if (!token) {
    return null;
  }

  return verifyAuthToken(
    token
  );
}

/*
 * Require an authenticated user.
 *
 * Returns the decoded JWT payload or throws an Error with a status property.
 * Keeping this small makes it usable from API routes without coupling auth.js
 * to NextResponse.
 */
export async function requireAuth(
  request
) {
  const user =
    await getAuthenticatedUser(
      request
    );

  if (!user) {
    const error =
      new Error(
        "Authentication required."
      );

    error.status = 401;

    throw error;
  }

  const id = Number(
    user.id ??
      user.sub ??
      0
  );

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    const error =
      new Error(
        "Invalid authenticated user."
      );

    error.status = 401;

    throw error;
  }

  return {
    ...user,
    id,
  };
}

/*
 * Require teacher/admin access.
 *
 * This matches the assessment and report routes:
 *
 * const teacher = await requireTeacher();
 *
 * or:
 *
 * const teacher = await requireTeacher(request);
 */
export async function requireTeacher(
  request
) {
  const user =
    await requireAuth(
      request
    );

  const role =
    String(
      user.role || ""
    ).toLowerCase();

  if (
    role !== "teacher" &&
    role !== "admin"
  ) {
    const error =
      new Error(
        "Teacher access required."
      );

    error.status = 403;

    throw error;
  }

  return user;
}

export async function requireAdmin(
  request
) {
  const user =
    await requireAuth(
      request
    );

  const role =
    String(
      user.role || ""
    ).toLowerCase();

  if (role !== "admin") {
    const error =
      new Error(
        "Admin access required."
      );

    error.status = 403;

    throw error;
  }

  return user;
}

/*
 * Build the cookie options in one place so login and logout stay consistent
 * across localhost and Vercel.
 */
export function authCookieOptions() {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite:
      "lax",
    path: "/",
    maxAge:
      TOKEN_MAX_AGE_SECONDS,
  };
}

export function setAuthCookie(
  response,
  token
) {
  response.cookies.set(
    AUTH_COOKIE_NAME,
    token,
    authCookieOptions()
  );

  return response;
}

/*
 * Clear both the current CRL-App cookie and the legacy cookie names that
 * appeared in earlier versions of the application.
 */
export function clearAuthCookie(
  response
) {
  const names = [
    AUTH_COOKIE_NAME,
    "token",
    "auth_token",
    "crla-auth",
  ];

  for (const name of names) {
    response.cookies.set(
      name,
      "",
      {
        ...authCookieOptions(),
        maxAge: 0,
        expires:
          new Date(0),
      }
    );
  }

  return response;
}

export function serializeAuthUser(
  user
) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username:
      user.username || "",
    full_name:
      user.fullName ??
      user.full_name ??
      "",
    section:
      user.section ?? "",
    role:
      user.role ?? "teacher",
  };
}

export {
  AUTH_COOKIE_NAME,
  TOKEN_MAX_AGE_SECONDS,
};
