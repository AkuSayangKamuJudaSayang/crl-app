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

function getTokenFromRequest(request) {
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
    return authorization.substring(7);
  }

  return null;
}

function ensureJwtSecret() {
  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is not configured in the environment variables."
    );
  }
}

function signToken(user) {
  ensureJwtSecret();

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

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
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

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

async function handleLogin(
  request
) {
  try {
    const body =
      await request.json();

    const username = String(
      body?.username || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      body?.password || ""
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

    const passwordMatches =
      await bcrypt.compare(
        password,
        user.password
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
      signToken(user);

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

/*
|--------------------------------------------------------------------------
| SIGNUP
|--------------------------------------------------------------------------
*/

async function handleSignup(
  request
) {
  try {
    const body =
      await request.json();

    const inviteCode = String(
      body?.invite_code ||
        body?.inviteCode ||
        ""
    )
      .trim()
      .toUpperCase();

    const fullName = String(
      body?.full_name ||
        body?.fullName ||
        ""
    ).trim();

    const section = String(
      body?.section || ""
    ).trim();

    const username = String(
      body?.username || ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      body?.password || ""
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

    const invite =
      await prisma.inviteCode.findUnique({
        where: {
          code: inviteCode,
        },
      });

    if (!invite) {
      return jsonResponse(
        {
          error:
            "Invalid admin invite code.",
        },
        400
      );
    }

    if (invite.used) {
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

    const hashedPassword =
      await bcrypt.hash(
        password,
        12
      );

    const result =
      await prisma.$transaction(
        async (tx) => {
          const newUser =
            await tx.user.create({
              data: {
                username,
                password:
                  hashedPassword,
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
              used: true,
              usedAt: new Date(),
              usedBy:
                newUser.id,
            },
          });

          return newUser;
        }
      );

    const token =
      signToken(result);

    const response =
      jsonResponse({
        status: "ok",
        message:
          "Account created successfully.",
        user: serializeUser(
          result
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

/*
|--------------------------------------------------------------------------
| VERIFY SESSION
|--------------------------------------------------------------------------
*/

async function handleVerify(
  request
) {
  try {
    const token =
      getTokenFromRequest(
        request
      );

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
          id: decoded.id,
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

/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| UPDATE USER
|--------------------------------------------------------------------------
*/

async function handleUpdateUser(
  request
) {
  try {
    const token =
      getTokenFromRequest(
        request
      );

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
      body?.full_name ||
        body?.fullName ||
        ""
    ).trim();

    const section = String(
      body?.section || ""
    ).trim();

    const newPassword =
      String(
        body?.new_password ||
          body?.newPassword ||
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

    const data = {
      fullName,
      section,
    };

    if (newPassword) {
      if (
        newPassword.length <
        6
      ) {
        return jsonResponse(
          {
            error:
              "Password must contain at least 6 characters.",
          },
          400
        );
      }

      data.password =
        await bcrypt.hash(
          newPassword,
          12
        );
    }

    const updatedUser =
      await prisma.user.update({
        where: {
          id: decoded.id,
        },
        data,
      });

    return jsonResponse({
      status: "ok",
      user: serializeUser(
        updatedUser
      ),
    });
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

/*
|--------------------------------------------------------------------------
| VALIDATE INVITE
|--------------------------------------------------------------------------
*/

async function handleInviteValidation(
  request
) {
  try {
    const body =
      await request.json();

    const inviteCode =
      String(
        body?.invite_code ||
          body?.inviteCode ||
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
      await prisma.inviteCode.findUnique({
        where: {
          code: inviteCode,
        },
      });

    if (!invite) {
      return jsonResponse({
        valid: false,
        error:
          "Invalid invite code.",
      });
    }

    if (invite.used) {
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

/*
|--------------------------------------------------------------------------
| GET
|--------------------------------------------------------------------------
*/

export async function GET(
  request
) {
  const action =
    request.nextUrl.searchParams.get(
      "action"
    );

  switch (action) {
    case "verify":
      return handleVerify(
        request
      );

    case "logout":
      return handleLogout();

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

/*
|--------------------------------------------------------------------------
| POST
|--------------------------------------------------------------------------
*/

export async function POST(
  request
) {
  const action =
    request.nextUrl.searchParams.get(
      "action"
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