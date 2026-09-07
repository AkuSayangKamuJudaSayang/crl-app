import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { prisma } from "../../../lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AUTH_COOKIE_NAME = "crla_token";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.AUTH_SECRET;

const TWO_FACTOR_CHALLENGE_COOKIE = "crla_2fa_challenge";
const RESET_TOKEN_MAX_AGE_MS = 1000 * 60 * 30;
const TWO_FACTOR_CHALLENGE_MAX_AGE_SECONDS = 60 * 5;

function base32Encode(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = String(input || "").toUpperCase().replace(/=+$/g, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const output = [];
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function getTotpCode(secret, timestamp = Date.now()) {
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, "0");
}

function verifyTotp(secret, code) {
  const normalizedCode = String(code || "").replace(/\D/g, "").slice(0, 6);
  if (!secret || normalizedCode.length !== 6) return false;
  for (let delta = -1; delta <= 1; delta += 1) {
    if (getTotpCode(secret, Date.now() + delta * 30000) === normalizedCode) return true;
  }
  return false;
}

function createTwoFactorChallenge(userId) {
  requireJwtSecret();
  return jwt.sign({ type: "2fa_challenge", userId: Number(userId) }, JWT_SECRET, {
    expiresIn: TWO_FACTOR_CHALLENGE_MAX_AGE_SECONDS + "s",
  });
}

function verifyTwoFactorChallenge(token) {
  if (!token || !JWT_SECRET) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded?.type !== "2fa_challenge") return null;
    const userId = Number(decoded.userId);
    return Number.isInteger(userId) && userId > 0 ? { userId } : null;
  } catch {
    return null;
  }
}

function setTwoFactorChallengeCookie(response, token) {
  response.cookies.set(TWO_FACTOR_CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TWO_FACTOR_CHALLENGE_MAX_AGE_SECONDS,
  });
  return response;
}

function clearTwoFactorChallengeCookie(response) {
  response.cookies.set(TWO_FACTOR_CHALLENGE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}


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
    full_name: user.fullName ?? "",
    section: user.section ?? "",
    email: user.email ?? "",
    email_verified: Boolean(user.emailVerifiedAt),
    two_factor_enabled: Boolean(user.twoFactorEnabled),
    role: user.role ?? "teacher",
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
      !email ||
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

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return jsonResponse({ error: "Please enter a valid email address." }, 400);
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
                email,
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

    const email = String(
      body?.email ?? ""
    ).trim().toLowerCase();

    const newPassword =
      String(
        body?.new_password ??
          body?.newPassword ??
          ""
      );

    if (!fullName || !section || !email) {
      return jsonResponse(
        {
          error:
            "Full name and section are required.",
        },
        400
      );
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return jsonResponse({ error: "Please enter a valid email address." }, 400);
    }

    const updateData = {
      fullName,
      section,
      email,
      emailVerifiedAt: null,
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
/* SECURITY / RECOVERY                                                        */
/* -------------------------------------------------------------------------- */

async function getCurrentUserFromRequest(request) {
  const decoded = verifyToken(getAuthToken(request));
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { id: Number(decoded.id) } });
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmailSyntax(email) {
  return /^(?=.{3,254}$)[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createEmailOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function hashEmailOtp(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

async function sendRecoveryEmailOtp({ to, code, purpose }) {
  const resendKey = String(process.env.RESEND_API_KEY || "");
  const from = String(process.env.PASSWORD_RESET_FROM || "");

  if (!resendKey || !from) {
    return { ok: false, status: 503, error: "Email delivery is not configured yet. Please contact the system administrator." };
  }

  const subject =
    purpose === "authorize_change"
      ? "CRL-App email change verification"
      : "CRL-App recovery email verification";

  const html =
    "<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#1f3d59\">" +
    "<h2 style=\"margin:0 0 12px\">CRL-App Security Verification</h2>" +
    "<p>Your six-digit verification code is:</p>" +
    "<div style=\"font-size:32px;font-weight:800;letter-spacing:8px;padding:14px 0\">" +
    code +
    "</div>" +
    "<p>This code expires in 10 minutes. Never share it with anyone.</p>" +
    "<p style=\"color:#6f879d\">Purpose: " +
    (purpose === "authorize_change" ? "authorize a recovery-email change." : "verify your recovery email address.") +
    "</p>" +
    "</div>";

  try {
    const mailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + resendKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    });

    if (!mailResponse.ok) {
      const providerText = await mailResponse.text();
      console.error("Recovery email OTP provider error:", providerText);
      return { ok: false, status: 502, error: "Unable to send the verification email right now. Check the email address and try again." };
    }

    return { ok: true };
  } catch (error) {
    console.error("Recovery email OTP delivery error:", error);
    return { ok: false, status: 502, error: "Unable to send the verification email right now." };
  }
}

async function handleStartRecoveryEmailVerification(request) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return jsonResponse({ error: "Authentication required." }, 401);

  const body = await request.json();
  const targetEmail = normalizeEmail(body?.email);

  if (!isValidEmailSyntax(targetEmail)) {
    return jsonResponse({ error: "Please enter a valid email address." }, 400);
  }

  const existing = await prisma.user.findFirst({
    where: {
      email: targetEmail,
      NOT: { id: user.id },
    },
    select: { id: true },
  });

  if (existing) {
    return jsonResponse({ error: "That email address is already registered to another CRL-App account." }, 409);
  }

  const currentEmail = normalizeEmail(user.email || "");
  const purpose = currentEmail && currentEmail !== targetEmail
    ? "authorize_change"
    : "verify_target";
  const recipient = purpose === "authorize_change" ? currentEmail : targetEmail;

  const code = createEmailOtp();
  const codeHash = hashEmailOtp(code);

  await prisma.recoveryEmailOtp.deleteMany({
    where: { userId: user.id },
  });

  await prisma.recoveryEmailOtp.create({
    data: {
      userId: user.id,
      email: targetEmail,
      codeHash,
      purpose,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    },
  });

  const delivery = await sendRecoveryEmailOtp({
    to: recipient,
    code,
    purpose,
  });

  if (!delivery.ok) {
    await prisma.recoveryEmailOtp.deleteMany({ where: { userId: user.id } });
    return jsonResponse({ error: delivery.error }, delivery.status);
  }

  return jsonResponse({
    status: "ok",
    step: purpose === "authorize_change" ? "authorize_current" : "verify_target",
    target_email: targetEmail,
    sent_to: recipient,
    message:
      purpose === "authorize_change"
        ? "A security code was sent to your current recovery email."
        : "A verification code was sent to the email address you entered.",
  });
}

async function handleVerifyRecoveryEmailOtp(request) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return jsonResponse({ error: "Authentication required." }, 401);

  const body = await request.json();
  const code = String(body?.code ?? "").replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) {
    return jsonResponse({ error: "Enter the 6-digit verification code." }, 400);
  }

  const otp = await prisma.recoveryEmailOtp.findFirst({
    where: {
      userId: user.id,
      expiresAt: { gt: new Date() },
      attempts: { lt: 5 },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    return jsonResponse({ error: "That verification code has expired or too many attempts were made. Request a new code." }, 400);
  }

  const valid = crypto.timingSafeEqual(
    Buffer.from(hashEmailOtp(code), "hex"),
    Buffer.from(otp.codeHash, "hex")
  );

  if (!valid) {
    await prisma.recoveryEmailOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    return jsonResponse({ error: "Incorrect verification code." }, 400);
  }

  if (otp.purpose === "authorize_change") {
    const nextCode = createEmailOtp();
    const nextHash = hashEmailOtp(nextCode);

    await prisma.recoveryEmailOtp.update({
      where: { id: otp.id },
      data: {
        email: otp.email,
        codeHash: nextHash,
        purpose: "verify_target",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
        createdAt: new Date(),
      },
    });

    const delivery = await sendRecoveryEmailOtp({
      to: otp.email,
      code: nextCode,
      purpose: "verify_target",
    });

    if (!delivery.ok) {
      await prisma.recoveryEmailOtp.delete({ where: { id: otp.id } });
      return jsonResponse({ error: delivery.error }, delivery.status);
    }

    return jsonResponse({
      status: "ok",
      step: "verify_target",
      target_email: otp.email,
      message: "Current email verified. A second code was sent to your new email address.",
    });
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      email: otp.email,
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.recoveryEmailOtp.delete({ where: { id: otp.id } });

  return jsonResponse({
    status: "ok",
    step: "complete",
    user: serializeUser(updatedUser),
    message: "Recovery email verified and saved successfully.",
  });
}

async function handleSecurityStatus(request) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return jsonResponse({ error: "Authentication required." }, 401);
  return jsonResponse({
    email: user.email || "",
    email_verified: Boolean(user.emailVerifiedAt),
    two_factor_enabled: Boolean(user.twoFactorEnabled),
  });
}

async function handleSetup2FA(request) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return jsonResponse({ error: "Authentication required." }, 401);
  if (user.twoFactorEnabled) return jsonResponse({ error: "Two-factor authentication is already enabled." }, 400);

  const secret = base32Encode(crypto.randomBytes(20));
  const issuer = "CRL-App";
  const label = encodeURIComponent(issuer + ":" + user.username);
  const otpauthUrl =
    "otpauth://totp/" +
    label +
    "?secret=" +
    secret +
    "&issuer=" +
    encodeURIComponent(issuer) +
    "&algorithm=SHA1&digits=6&period=30";

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: secret },
  });

  return jsonResponse({
    status: "ok",
    secret,
    otpauth_url: otpauthUrl,
    message: "Add this account to Google Authenticator, Duo Mobile, or another TOTP authenticator, then enter the six-digit code.",
  });
}

async function handleVerify2FASetup(request) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return jsonResponse({ error: "Authentication required." }, 401);
  const body = await request.json();
  const code = String(body?.code ?? "").replace(/\D/g, "").slice(0, 6);

  if (!user.twoFactorSecret || !verifyTotp(user.twoFactorSecret, code)) {
    return jsonResponse({ error: "Invalid authenticator code." }, 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true },
  });

  return jsonResponse({
    status: "ok",
    message: "Two-factor authentication enabled successfully.",
    two_factor_enabled: true,
  });
}

async function handleDisable2FA(request) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return jsonResponse({ error: "Authentication required." }, 401);
  const body = await request.json();
  const code = String(body?.code ?? "").replace(/\D/g, "").slice(0, 6);

  if (!user.twoFactorEnabled || !verifyTotp(user.twoFactorSecret, code)) {
    return jsonResponse({ error: "Invalid authenticator code." }, 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorSecret: null,
    },
  });

  return jsonResponse({
    status: "ok",
    message: "Two-factor authentication disabled.",
    two_factor_enabled: false,
  });
}

async function handleVerifyLogin2FA(request) {
  const challenge = verifyTwoFactorChallenge(
    request.cookies.get(TWO_FACTOR_CHALLENGE_COOKIE)?.value
  );
  if (!challenge) return jsonResponse({ error: "The two-factor sign-in request has expired." }, 401);

  const body = await request.json();
  const code = String(body?.code ?? "").replace(/\D/g, "").slice(0, 6);
  const user = await prisma.user.findUnique({ where: { id: challenge.userId } });

  if (!user || !user.twoFactorEnabled || !verifyTotp(user.twoFactorSecret, code)) {
    return jsonResponse({ error: "Invalid authenticator code." }, 401);
  }

  const token = createToken(user);
  const response = jsonResponse({
    status: "ok",
    message: "Login successful.",
    user: serializeUser(user),
  });
  setAuthCookie(response, token);
  clearTwoFactorChallengeCookie(response);
  return response;
}

async function handleForgotPassword(request) {
  const body = await request.json();
  const email = String(body?.email ?? "").trim().toLowerCase();

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return jsonResponse({ error: "Enter the email registered to your CRL-App account." }, 400);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    return jsonResponse({
      status: "ok",
      message: "If an account uses that email, a reset message will be sent.",
    });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetTokenHash,
      resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_MAX_AGE_MS),
    },
  });

  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const resetUrl =
    baseUrl +
    "/login?reset=" +
    encodeURIComponent(resetToken);

  const resendKey = String(process.env.RESEND_API_KEY || "");
  const from = String(process.env.PASSWORD_RESET_FROM || "");

  if (!resendKey || !from) {
    return jsonResponse(
      { error: "Password recovery is not configured yet. Please contact the system administrator." },
      503
    );
  }

  const mailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + resendKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [user.email],
      subject: "CRL-App password reset",
      html:
        "<p>A password-reset request was received for your CRL-App account.</p>" +
        "<p><a href=\"" +
        resetUrl +
        "\">Reset your password</a>. This link expires in 30 minutes.</p>",
    }),
  });

  if (!mailResponse.ok) {
    console.error("Password reset provider error:", await mailResponse.text());
    return jsonResponse({ error: "Unable to send the password-reset email right now." }, 502);
  }

  return jsonResponse({
    status: "ok",
    message: "If an account uses that email, a reset message will be sent.",
  });
}

async function handleResetPassword(request) {
  const body = await request.json();
  const token = String(body?.token ?? "").trim();
  const newPassword = String(body?.new_password ?? body?.newPassword ?? "");

  if (!token || newPassword.length < 6) {
    return jsonResponse({ error: "A valid reset link and a password of at least 6 characters are required." }, 400);
  }

  const hash = crypto.createHash("sha256").update(token).digest("hex");

  const user = await prisma.user.findFirst({
    where: {
      resetTokenHash: hash,
      resetTokenExpiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (!user) {
    return jsonResponse({ error: "This password-reset link is invalid or expired." }, 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  });

  return jsonResponse({
    status: "ok",
    message: "Password updated successfully.",
  });
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

    case "security_status":
      return handleSecurityStatus(request);

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
    case "security_status":
      return handleSecurityStatus(request);

    case "start_recovery_email_verification":
      return handleStartRecoveryEmailVerification(request);

    case "verify_recovery_email_otp":
      return handleVerifyRecoveryEmailOtp(request);

    case "setup_2fa":
      return handleSetup2FA(request);

    case "verify_2fa_setup":
      return handleVerify2FASetup(request);

    case "disable_2fa":
      return handleDisable2FA(request);

    case "verify_login_2fa":
      return handleVerifyLogin2FA(request);

    case "forgot_password":
      return handleForgotPassword(request);

    case "reset_password":
      return handleResetPassword(request);

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
