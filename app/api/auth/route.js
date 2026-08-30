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
        "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

function getTokenFromRequest(request) {
  const cookieToken =
    request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (cookieToken) {
    return cookieToken;
  }

  const authorization =
    request.headers.get("authorization");

  if (
    authorization &&
    authorization.startsWith("Bearer ")
  ) {
    return authorization.slice(7);
  }

  return null;
}

function signToken(user) {
  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET or AUTH_SECRET is not configured."
    );
  }

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
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function setAuthCookie(response, token) {
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
      maxAge: 60 * 60 * 24 * 7,
    }
  );

  return response;
}

function clearAuthCookie(response) {
  response.cookies.set(
    AUTH_COOKIE_NAME,
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

  /*
   * Clear possible legacy cookies as well.
   * This prevents an older authentication
   * cookie from keeping the user logged in.
   */
  const legacyCookieNames = [
    "token",
    "crla-auth",
    "auth_token",
  ];

  for (const name of legacyCookieNames) {
    response.cookies.set(
      name,
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

async function handleLogin(request) {
  try {
    const body = await request.json();

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

    const token = signToken(user);

    const response = jsonResponse({
      status: "ok",
      message: "Login successful.",
      user: {
        id: user.id,
        username: user.username,
        full_name:
          user.fullName ??
          user.full_name ??
          "",
        section:
          user.section ?? "",
        role: user.role,
      },
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
          "Internal server error.",
      },
      500
    );
  }
}

async function handleVerify(request) {
  const token =
    getTokenFromRequest(request);

  const decoded =
    verifyToken(token);

  if (!decoded) {
    return jsonResponse(
      {
        valid: false,
      },
      401
    );
  }

  try {
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
        },
        401
      );
    }

    return jsonResponse({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        full_name:
          user.fullName ??
          user.full_name ??
          "",
        section:
          user.section ?? "",
        role: user.role,
      },
    });
  } catch (error) {
    console.error(
      "Verify error:",
      error
    );

    return jsonResponse(
      {
        valid: false,
        error:
          "Unable to verify session.",
      },
      500
    );
  }
}

async function handleLogout() {
  const response = jsonResponse({
    status: "ok",
    message:
      "Logged out successfully.",
  });

  clearAuthCookie(response);

  return response;
}

async function handleUpdateUser(
  request
) {
  const token =
    getTokenFromRequest(request);

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

  try {
    const body =
      await request.json();

    const fullName = String(
      body?.full_name || ""
    ).trim();

    const section = String(
      body?.section || ""
    ).trim();

    const newPassword = String(
      body?.new_password || ""
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

      updateData.password =
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
        data: updateData,
      });

    return jsonResponse({
      status: "ok",
      user: {
        id: updatedUser.id,
        username:
          updatedUser.username,
        full_name:
          updatedUser.fullName ??
          "",
        section:
          updatedUser.section ??
          "",
        role: updatedUser.role,
      },
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

async function handleInviteValidation(
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

export async function GET(request) {
  const action =
    request.nextUrl.searchParams.get(
      "action"
    );

  switch (action) {
    case "verify":
      return handleVerify(request);

    case "logout":
      return handleLogout();

    default:
      return jsonResponse(
        {
          error:
            "Unknown authentication action.",
        },
        400
      );
  }
}

export async function POST(request) {
  const action =
    request.nextUrl.searchParams.get(
      "action"
    );

  switch (action) {
    case "login":
      return handleLogin(request);

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
            "Unknown authentication action.",
        },
        400
      );
  }
}