import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__crla_prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__crla_prisma = prisma;
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ||
    "change-this-secret-in-production"
);

const COOKIE_NAME = "crla_session";

const INVITE_CODE_LIFETIME_SECONDS = 35;

const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function normalize(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function generateShortCode(length = 6) {
  let result = "";

  for (let i = 0; i < length; i += 1) {
    const index = crypto.randomInt(
      0,
      ALPHABET.length
    );

    result += ALPHABET[index];
  }

  return result;
}

async function createJwt(user) {
  return new SignJWT({
    sub: String(user.id),
    username: user.username,
    role: user.role,
    fullName: user.fullName,
    section: user.section || "",
  })
    .setProtectedHeader({
      alg: "HS256",
    })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

async function getSessionUser(request) {
  const cookieToken =
    request.cookies.get(COOKIE_NAME)?.value;

  const authHeader =
    request.headers.get("authorization") ||
    request.headers.get("x-authorization");

  let token = cookieToken;

  if (!token && authHeader) {
    token = authHeader
      .replace(/^Bearer\s+/i, "")
      .trim();
  }

  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(
      token,
      JWT_SECRET
    );

    const userId = Number(
      verified.payload.sub
    );

    if (!Number.isInteger(userId)) {
      return null;
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          username: true,
          role: true,
          fullName: true,
          section: true,
        },
      });

    return user || null;
  } catch {
    return null;
  }
}

async function requireUser(request) {
  const user =
    await getSessionUser(request);

  if (!user) {
    return {
      error: json(
        {
          error:
            "Missing or invalid session.",
        },
        401
      ),
    };
  }

  return {
    user,
  };
}

async function requireAdmin(request) {
  const auth =
    await requireUser(request);

  if (auth.error) {
    return auth;
  }

  if (auth.user.role !== "admin") {
    return {
      error: json(
        {
          error:
            "Admin access required.",
        },
        403
      ),
    };
  }

  return auth;
}

function setAuthCookie(
  response,
  token
) {
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax",
    path: "/",
    maxAge:
      60 * 60 * 24 * 7,
  });

  return response;
}

function clearAuthCookie(
  response
) {
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}

async function validateInviteCode(
  code
) {
  const normalizedCode =
    normalize(code).toUpperCase();

  if (!normalizedCode) {
    return null;
  }

  return prisma.inviteCode.findFirst({
    where: {
      code: normalizedCode,
      isUsed: false,
      OR: [
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            gt: new Date(),
          },
        },
      ],
    },
  });
}

export async function POST(
  request
) {
  try {
    const body =
      await request
        .json()
        .catch(() => ({}));

    const action =
      normalize(body.action).toLowerCase();

    switch (action) {
      case "signup": {
        const inviteCode =
          normalize(
            body.invite_code
          ).toUpperCase();

        const username =
          normalize(body.username);

        const password =
          typeof body.password ===
          "string"
            ? body.password
            : "";

        const fullName =
          normalize(body.full_name);

        const section =
          normalize(body.section);

        if (
          !inviteCode ||
          !username ||
          !password ||
          !fullName ||
          !section
        ) {
          return json(
            {
              error:
                "All fields (including section and invite code) are required.",
            },
            400
          );
        }

        if (password.length < 6) {
          return json(
            {
              error:
                "Password must be at least 6 characters.",
            },
            400
          );
        }

        const passwordHash =
          await bcrypt.hash(
            password,
            10
          );

        const result =
          await prisma.$transaction(
            async (tx) => {
              const invite =
                await tx.inviteCode.findFirst(
                  {
                    where: {
                      code: inviteCode,
                      isUsed: false,
                      OR: [
                        {
                          expiresAt:
                            null,
                        },
                        {
                          expiresAt: {
                            gt: new Date(),
                          },
                        },
                      ],
                    },
                  }
                );

              if (!invite) {
                throw new Error(
                  "INVALID_INVITE"
                );
              }

              const existingUser =
                await tx.user.findUnique({
                  where: {
                    username,
                  },
                });

              if (existingUser) {
                throw new Error(
                  "USERNAME_TAKEN"
                );
              }

              const user =
                await tx.user.create({
                  data: {
                    username,
                    passwordHash,
                    fullName,
                    section,
                    role: "teacher",
                  },
                  select: {
                    id: true,
                    username: true,
                    role: true,
                    fullName: true,
                    section: true,
                  },
                });

              const claimed =
                await tx.inviteCode.updateMany(
                  {
                    where: {
                      id: invite.id,
                      isUsed: false,
                    },
                    data: {
                      isUsed: true,
                    },
                  }
                );

              if (claimed.count !== 1) {
                throw new Error(
                  "INVITE_ALREADY_USED"
                );
              }

              return user;
            }
          );

        return json({
          status: "success",
          message:
            "Account successfully created.",
          user: result,
        });
      }

      case "login": {
        const username =
          normalize(body.username);

        const password =
          typeof body.password ===
          "string"
            ? body.password
            : "";

        if (
          !username ||
          !password
        ) {
          return json(
            {
              error:
                "Please enter both username and password.",
            },
            400
          );
        }

        const user =
          await prisma.user.findUnique(
            {
              where: {
                username,
              },
            }
          );

        if (!user) {
          return json(
            {
              error:
                "Invalid username or password.",
            },
            401
          );
        }

        const valid =
          await bcrypt.compare(
            password,
            user.passwordHash
          );

        if (!valid) {
          return json(
            {
              error:
                "Invalid username or password.",
            },
            401
          );
        }

        const token =
          await createJwt(user);

        const response = json({
          status: "success",
          role: user.role,
          full_name:
            user.fullName,
          section:
            user.section,
          username:
            user.username,
        });

        return setAuthCookie(
          response,
          token
        );
      }

      case "verify": {
        const auth =
          await requireUser(request);

        if (auth.error) {
          return auth.error;
        }

        return json({
          valid: true,
          user: {
            id: auth.user.id,
            username:
              auth.user.username,
            role: auth.user.role,
            full_name:
              auth.user.fullName,
            section:
              auth.user.section,
          },
        });
      }

      case "validate_invite": {
        const code =
          normalize(
            body.invite_code
          ).toUpperCase();

        if (!code) {
          return json(
            {
              valid: false,
              error:
                "Invite code is required.",
            },
            400
          );
        }

        const invite =
          await validateInviteCode(
            code
          );

        if (!invite) {
          return json({
            valid: false,
            error:
              "Invalid or expired Admin Invite Code.",
          });
        }

        return json({
          valid: true,
          code: invite.code,
          expires_at:
            invite.expiresAt,
        });
      }

      case "generate_invite": {
        const auth =
          await requireAdmin(request);

        if (auth.error) {
          return auth.error;
        }

        await prisma.inviteCode.updateMany(
          {
            where: {
              isUsed: false,
            },
            data: {
              isUsed: true,
            },
          }
        );

        let code = "";
        let created = null;

        for (
          let attempt = 0;
          attempt < 10;
          attempt += 1
        ) {
          const candidate =
            generateShortCode(6);

          try {
            created =
              await prisma.inviteCode.create(
                {
                  data: {
                    code: candidate,
                    isUsed: false,
                    expiresAt:
                      new Date(
                        Date.now() +
                          INVITE_CODE_LIFETIME_SECONDS *
                            1000
                      ),
                    generatedBy:
                      auth.user.id,
                  },
                }
              );

            code = candidate;
            break;
          } catch (error) {
            if (
              error?.code !==
              "P2002"
            ) {
              throw error;
            }
          }
        }

        if (!created || !code) {
          return json(
            {
              error:
                "Unable to generate a unique invite code.",
            },
            500
          );
        }

        return json({
          status: "ok",
          code,
          expires_at:
            created.expiresAt,
          lifetime_seconds:
            INVITE_CODE_LIFETIME_SECONDS,
        });
      }

      case "get_user": {
        const auth =
          await requireUser(request);

        if (auth.error) {
          return auth.error;
        }

        return json({
          status: "ok",
          user: {
            id: auth.user.id,
            username:
              auth.user.username,
            full_name:
              auth.user.fullName,
            role: auth.user.role,
            section:
              auth.user.section,
          },
        });
      }

      case "update_user": {
        const auth =
          await requireUser(request);

        if (auth.error) {
          return auth.error;
        }

        const fullName =
          normalize(body.full_name);

        const section =
          normalize(body.section);

        const newPassword =
          typeof body.new_password ===
          "string"
            ? body.new_password
            : "";

        if (
          !fullName &&
          !section &&
          !newPassword
        ) {
          return json({
            status: "error",
            message:
              "No fields to update.",
          });
        }

        const data = {};

        if (fullName) {
          data.fullName =
            fullName;
        }

        if (section) {
          data.section =
            section;
        }

        if (newPassword) {
          if (
            newPassword.length < 6
          ) {
            return json(
              {
                status: "error",
                message:
                  "New password must be at least 6 characters.",
              },
              400
            );
          }

          data.passwordHash =
            await bcrypt.hash(
              newPassword,
              10
            );
        }

        const updated =
          await prisma.user.update({
            where: {
              id: auth.user.id,
            },
            data,
            select: {
              id: true,
              username: true,
              fullName: true,
              role: true,
              section: true,
            },
          });

        return json({
          status: "ok",
          message:
            "Profile updated.",
          user: {
            id: updated.id,
            username:
              updated.username,
            full_name:
              updated.fullName,
            role: updated.role,
            section:
              updated.section,
          },
        });
      }

      case "logout": {
        const response = json({
          status: "ok",
          message: "Logged out.",
        });

        return clearAuthCookie(
          response
        );
      }

      default:
        return json(
          {
            error:
              "Invalid authentication action.",
          },
          404
        );
    }
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message ===
        "INVALID_INVITE"
      ) {
        return json(
          {
            error:
              "Invalid or expired Admin Invite Code.",
          },
          400
        );
      }

      if (
        error.message ===
        "USERNAME_TAKEN"
      ) {
        return json(
          {
            error:
              "Username is already taken.",
          },
          400
        );
      }

      if (
        error.message ===
        "INVITE_ALREADY_USED"
      ) {
        return json(
          {
            error:
              "This invite code has already been used.",
          },
          400
        );
      }
    }

    console.error(
      "CRL-App auth error:",
      error
    );

    return json(
      {
        error:
          "Internal server error.",
      },
      500
    );
  }
}

export async function GET(
  request
) {
  const action =
    new URL(request.url)
      .searchParams.get(
        "action"
      )
      ?.trim()
      .toLowerCase() ||
    "verify";

  if (action === "verify") {
    const auth =
      await requireUser(request);

    if (auth.error) {
      return auth.error;
    }

    return json({
      valid: true,
      user: {
        id: auth.user.id,
        username:
          auth.user.username,
        role: auth.user.role,
        full_name:
          auth.user.fullName,
        section:
          auth.user.section,
      },
    });
  }

  return json(
    {
      error:
        "Invalid authentication action.",
    },
    404
  );
}
