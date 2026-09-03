import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AUTH_COOKIE_NAME = "crla_token";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.AUTH_SECRET;

/* -------------------------------------------------------------------------- */
/* Response helpers                                                           */
/* -------------------------------------------------------------------------- */

function jsonResponse(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Request helpers                                                            */
/* -------------------------------------------------------------------------- */

async function readJsonBody(request) {
  try {
    /*
     * Read from a clone so the original Request body remains
     * available to the existing handlers.
     */
    return await request.clone().json();
  } catch {
    return {};
  }
}

function normalizeAction(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getActionFromQuery(request) {
  return normalizeAction(
    request.nextUrl.searchParams.get("action")
  );
}

/* -------------------------------------------------------------------------- */
/* JWT helpers                                                                */
/* -------------------------------------------------------------------------- */

function requireJwtSecret() {
  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET or AUTH_SECRET is not configured."
    );
  }
}

function createToken(user) {
  requireJwtSecret();

  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}

function verifyToken(token) {
  if (!token || !JWT_SECRET) {
    return null;
  }

  try {
    return jwt.verify(
      token,
      JWT_SECRET
    );
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Cookie helpers                                                             */
/* -------------------------------------------------------------------------- */

function getAuthToken(request) {
  const cookieToken =
    request.cookies.get(
      AUTH_COOKIE_NAME
    )?.value;

  if (cookieToken) {
    return cookieToken;
  }

  const authorization =
    request.headers.get(
      "authorization"
    );

  if (
    authorization &&
    authorization.startsWith("Bearer ")
  ) {
    return authorization.substring(
      7
    );
  }

  return null;
}

function setAuthCookie(
  response,
  token
) {
  response.cookies.set(
    AUTH_COOKIE_NAME,
    token,
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        "production",
      sameSite: "lax",
      path: "/",
      maxAge:
        60 * 60 * 24 * 7,
    }
  );

  return response;
}

function clearAuthCookies(
  response
) {
  const cookieNames = [
    "crla_token",
    "token",
    "auth_token",
    "crla-auth",
  ];

  for (const cookieName of cookieNames) {
    response.cookies.set(
      cookieName,
      "",
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        path: "/",
        expires: new Date(0),
        maxAge: 0,
      }
    );
  }

  return response;
}

/* -------------------------------------------------------------------------- */
/* User serialization                                                         */
/* -------------------------------------------------------------------------- */

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name:
      user.fullName ?? "",
    section:
      user.section ?? "",
    role:
      user.role ?? "teacher",
  };
}

/* -------------------------------------------------------------------------- */
/* ADMIN SIGNUP                                                               */
/* -------------------------------------------------------------------------- */

function getAdminAllowlist() {
  return String(process.env.ADMIN_ALLOWED_USERNAMES || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function handleAdminSignup(request) {
  try {
    const body = await request.json();

    const username = String(body?.username ?? "")
      .trim()
      .toLowerCase();
    const fullName = String(body?.full_name ?? body?.fullName ?? "").trim();
    const section = String(body?.section ?? "").trim();
    const password = String(body?.password ?? "");
    const suppliedKey = String(body?.admin_signup_key ?? body?.adminSignupKey ?? "").trim();

    if (!username || !fullName || !password || !suppliedKey) {
      return jsonResponse(
        { error: "Administrator name, username, password, and registration key are required." },
        400
      );
    }

    if (username.length > 50) {
      return jsonResponse({ error: "Username must be 50 characters or fewer." }, 400);
    }

    if (password.length < 6) {
      return jsonResponse({ error: "Password must be at least 6 characters." }, 400);
    }

    const configuredKey = String(process.env.ADMIN_SIGNUP_KEY || "");
    const allowlist = getAdminAllowlist();

    // Administrator self-registration is intentionally disabled unless the
    // owner explicitly configures both a private key and an allowlist.
    if (!configuredKey || allowlist.length === 0) {
      return jsonResponse(
        { error: "Administrator self-registration is not enabled. Please contact the system owner." },
        403
      );
    }

    if (suppliedKey !== configuredKey) {
      return jsonResponse({ error: "Invalid administrator registration key." }, 403);
    }

    if (!allowlist.includes(username)) {
      return jsonResponse(
        { error: "This username is not approved for administrator registration." },
        403
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true, role: true },
    });

    if (existingUser) {
      return jsonResponse(
        {
          error:
            String(existingUser.role).toLowerCase() === "admin"
              ? "An administrator account with this username already exists."
              : "This username already belongs to another account and cannot be promoted through administrator registration.",
        },
        409
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await prisma.user.create({
      data: {
        username,
        passwordHash,
        fullName,
        section: section || null,
        role: "admin",
      },
    });

    const token = createToken(newUser);
    const response = jsonResponse({
      status: "ok",
      message: "Administrator account created successfully.",
      user: serializeUser(newUser),
    });

    setAuthCookie(response, token);
    return response;
  } catch (error) {
    console.error("Admin signup error:", error);

    if (error?.code === "P2002") {
      return jsonResponse({ error: "That username is already in use." }, 409);
    }

    return jsonResponse(
      { error: "Unable to create the administrator account." },
      500
    );
  }
}

/* -------------------------------------------------------------------------- */
/* LOGIN                                                                      */
/* -------------------------------------------------------------------------- */

async function handleLogin(
  request
) {
  try {
    const body =
      await request.json();

    const username = String(
      body?.username ?? ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      body?.password ?? ""
    );

    if (!username || !password) {
      return jsonResponse(
        {
          error:
            "Username and password are required.",
        },
        400
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          username,
        },
      });

    if (!user) {
      return jsonResponse(
        {
          error:
            "Invalid username or password.",
        },
        401
      );
    }

    /*
     * IMPORTANT:
     * The Prisma schema uses passwordHash.
     * The database column is password_hash.
     */
    /*
     * Never pass an undefined password hash to bcrypt.compare().
     * This prevents the production error:
     * "Illegal arguments: string, undefined".
     *
     * Prisma exposes the schema field as passwordHash, while
     * the database column is password_hash.
     */
    const storedPasswordHash =
      typeof user.passwordHash ===
        "string"
        ? user.passwordHash
        : "";

    if (!storedPasswordHash) {
      console.error(
        "Login error: user record has no valid passwordHash.",
        {
          userId: user.id,
          username: user.username,
        }
      );

      return jsonResponse(
        {
          error:
            "This account has no valid password configured. Please contact an administrator.",
        },
        500
      );
    }

    const passwordMatches =
      await bcrypt.compare(
        password,
        storedPasswordHash
      );

    if (!passwordMatches) {
      return jsonResponse(
        {
          error:
            "Invalid username or password.",
        },
        401
      );
    }

    const token =
      createToken(user);

    const response =
      jsonResponse({
        status: "ok",
        message:
          "Login successful.",
        user: serializeUser(
          user
        ),
      });

    setAuthCookie(
      response,
      token
    );

    return response;
  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return jsonResponse(
      {
        error:
          "Internal server error during login.",
      },
      500
    );
  }
}

/* -------------------------------------------------------------------------- */
/* SIGNUP                                                                     */
/* -------------------------------------------------------------------------- */

async function handleSignup(
  request
) {
  try {
    const body =
      await request.json();

    const inviteCode =
      String(
        body?.invite_code ??
          body?.inviteCode ??
          ""
      )
        .trim()
        .toUpperCase();

    const fullName = String(
      body?.full_name ??
        body?.fullName ??
        ""
    ).trim();

    const section = String(
      body?.section ?? ""
    ).trim();

    const username = String(
      body?.username ?? ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      body?.password ?? ""
    );

    if (
      !inviteCode ||
      !fullName ||
      !section ||
      !username ||
      !password
    ) {
      return jsonResponse(
        {
          error:
            "Please complete all required fields.",
        },
        400
      );
    }

    if (password.length < 6) {
      return jsonResponse(
        {
          error:
            "Password must contain at least 6 characters.",
        },
        400
      );
    }

    /*
     * Check username before creating
     * the new account.
     */
    const existingUser =
      await prisma.user.findUnique({
        where: {
          username,
        },
      });

    if (existingUser) {
      return jsonResponse(
        {
          error:
            "That username is already in use.",
        },
        409
      );
    }

    /*
     * The Prisma schema uses:
     *
     * isUsed
     *
     * not:
     *
     * used
     */
    const invite =
      await prisma.inviteCode.findUnique(
        {
          where: {
            code: inviteCode,
          },
        }
      );

    if (!invite) {
      return jsonResponse(
        {
          error:
            "Invalid admin invite code.",
        },
        400
      );
    }

    if (invite.isUsed) {
      return jsonResponse(
        {
          error:
            "This invite code has already been used.",
        },
        400
      );
    }

    if (
      invite.expiresAt &&
      new Date() >
        invite.expiresAt
    ) {
      return jsonResponse(
        {
          error:
            "This invite code has expired.",
        },
        400
      );
    }

    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );

    /*
     * Your User model uses:
     *
     * passwordHash
     * fullName
     *
     * Your InviteCode model uses:
     *
     * isUsed
     *
     * generatedBy
     *
     * There is no usedAt or usedBy
     * in your schema, so those fields
     * are intentionally not written.
     */
    const newUser =
      await prisma.$transaction(
        async (tx) => {
          const createdUser =
            await tx.user.create({
              data: {
                username,
                passwordHash,
                fullName,
                section,
                role: "teacher",
              },
            });

          await tx.inviteCode.update({
            where: {
              id: invite.id,
            },
            data: {
              isUsed: true,
            },
          });

          return createdUser;
        }
      );

    const token =
      createToken(newUser);

    const response =
      jsonResponse({
        status: "ok",
        message:
          "Account created successfully.",
        user: serializeUser(
          newUser
        ),
      });

    setAuthCookie(
      response,
      token
    );

    return response;
  } catch (error) {
    console.error(
      "Signup error:",
      error
    );

    return jsonResponse(
      {
        error:
          "Internal server error during account creation.",
      },
      500
    );
  }
}

/* -------------------------------------------------------------------------- */
/* VERIFY SESSION                                                             */
/* -------------------------------------------------------------------------- */

async function handleVerify(
  request
) {
  try {
    const token =
      getAuthToken(request);

    const decoded =
      verifyToken(token);

    if (!decoded) {
      return jsonResponse(
        {
          valid: false,
          error:
            "Your session is invalid or expired.",
        },
        401
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: Number(
            decoded.id
          ),
        },
      });

    if (!user) {
      return jsonResponse(
        {
          valid: false,
          error:
            "User account no longer exists.",
        },
        401
      );
    }

    return jsonResponse({
      valid: true,
      user: serializeUser(
        user
      ),
    });
  } catch (error) {
    console.error(
      "Session verification error:",
      error
    );

    return jsonResponse(
      {
        valid: false,
        error:
          "Unable to verify the session.",
      },
      500
    );
  }
}

/* -------------------------------------------------------------------------- */
/* LOGOUT                                                                     */
/* -------------------------------------------------------------------------- */

async function handleLogout() {
  const response =
    jsonResponse({
      status: "ok",
      message:
        "Logged out successfully.",
    });

  clearAuthCookies(
    response
  );

  return response;
}

/* -------------------------------------------------------------------------- */
/* UPDATE USER                                                                */
/* -------------------------------------------------------------------------- */

async function handleUpdateUser(
  request
) {
  try {
    const token =
      getAuthToken(request);

    const decoded =
      verifyToken(token);

    if (!decoded) {
      return jsonResponse(
        {
          error:
            "Your session has expired.",
        },
        401
      );
    }

    const body =
      await request.json();

    const fullName = String(
      body?.full_name ??
        body?.fullName ??
        ""
    ).trim();

    const section = String(
      body?.section ?? ""
    ).trim();

    const newPassword =
      String(
        body?.new_password ??
          body?.newPassword ??
          ""
      );

    if (!fullName || !section) {
      return jsonResponse(
        {
          error:
            "Full name and section are required.",
        },
        400
      );
    }

    const updateData = {
      fullName,
      section,
    };

    if (newPassword) {
      if (newPassword.length < 6) {
        return jsonResponse(
          {
            error:
              "Password must contain at least 6 characters.",
          },
          400
        );
      }

      updateData.passwordHash =
        await bcrypt.hash(
          newPassword,
          12
        );
    }

    const updatedUser =
      await prisma.user.update({
        where: {
          id: Number(
            decoded.id
          ),
        },
        data: updateData,
      });

    /*
     * If the password was changed,
     * create a new JWT so the user's
     * session remains valid.
     */
    let response;

    if (newPassword) {
      const newToken =
        createToken(
          updatedUser
        );

      response =
        jsonResponse({
          status: "ok",
          message:
            "Profile and password updated successfully.",
          user:
            serializeUser(
              updatedUser
            ),
        });

      setAuthCookie(
        response,
        newToken
      );
    } else {
      response =
        jsonResponse({
          status: "ok",
          message:
            "Profile updated successfully.",
          user:
            serializeUser(
              updatedUser
            ),
        });
    }

    return response;
  } catch (error) {
    console.error(
      "Update user error:",
      error
    );

    return jsonResponse(
      {
        error:
          "Unable to update your profile.",
      },
      500
    );
  }
}

/* -------------------------------------------------------------------------- */
/* INVITE CODE VALIDATION                                                     */
/* -------------------------------------------------------------------------- */

async function handleInviteValidation(
  request
) {
  try {
    const body =
      await request.json();

    const inviteCode =
      String(
        body?.invite_code ??
          body?.inviteCode ??
          ""
      )
        .trim()
        .toUpperCase();

    if (!inviteCode) {
      return jsonResponse(
        {
          valid: false,
          error:
            "Invite code is required.",
        },
        400
      );
    }

    const invite =
      await prisma.inviteCode.findUnique(
        {
          where: {
            code: inviteCode,
          },
        }
      );

    if (!invite) {
      return jsonResponse({
        valid: false,
        error:
          "Invalid invite code.",
      });
    }

    if (invite.isUsed) {
      return jsonResponse({
        valid: false,
        error:
          "This invite code has already been used.",
      });
    }

    if (
      invite.expiresAt &&
      new Date() >
        invite.expiresAt
    ) {
      return jsonResponse({
        valid: false,
        error:
          "This invite code has expired.",
      });
    }

    return jsonResponse({
      valid: true,
      message:
        "Invite code is valid.",
    });
  } catch (error) {
    console.error(
      "Invite validation error:",
      error
    );

    return jsonResponse(
      {
        valid: false,
        error:
          "Unable to validate invite code.",
      },
      500
    );
  }
}

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(
  request
) {
  const action =
    getActionFromQuery(
      request
    );

  switch (action) {
    case "verify":
      return handleVerify(
        request
      );

    case "logout":
      return handleLogout();

    case "health":
      return jsonResponse({
        status: "ok",
        service: "auth",
        jwt_configured: Boolean(JWT_SECRET),
      });

    default:
      return jsonResponse(
        {
          error:
            action
              ? `Unknown authentication action: ${action}`
              : "Authentication action is required.",
        },
        400
      );
  }
}

/* -------------------------------------------------------------------------- */
/* POST                                                                       */
/* -------------------------------------------------------------------------- */

export async function POST(
  request
) {
  /*
   * Support both query-string and JSON-body actions.
   * The clone keeps the original request body readable by
   * the existing handler functions.
   */
  const body =
    await readJsonBody(request);

  const action =
    normalizeAction(
      request.nextUrl.searchParams.get(
        "action"
      ) ||
        body?.action
    );

  switch (action) {
    case "login":
      return handleLogin(
        request
      );

    case "signup":
      return handleSignup(
        request
      );

    case "admin_signup":
      return handleAdminSignup(
        request
      );

    case "logout":
      return handleLogout();

    case "update_user":
      return handleUpdateUser(
        request
      );

    case "validate_invite":
      return handleInviteValidation(
        request
      );

    default:
      return jsonResponse(
        {
          error:
            action
              ? `Unknown authentication action: ${action}`
              : "Authentication action is required.",
        },
        400
      );
  }
}

/* -------------------------------------------------------------------------- */
/* OPTIONS                                                                    */
/* -------------------------------------------------------------------------- */

export async function OPTIONS() {
  return jsonResponse({
    status: "ok",
  });
}
