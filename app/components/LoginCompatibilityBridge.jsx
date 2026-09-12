"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./LoginCompatibilityBridge.css";
import {
  getOfflineTeacherSession,
  saveOfflineTeacherSession,
} from "../../lib/teacherOfflineDb";

const PENDING_2FA_KEY = "crla-login-pending-2fa";

function parseRequest(input, init) {
  const raw = typeof input === "string" ? input : input?.url || "";
  try {
    const url = new URL(raw, window.location.origin);
    let body = {};
    const source =
      typeof init?.body === "string"
        ? init.body
        : typeof input?.body === "string"
          ? input.body
          : "";
    if (source) {
      try { body = JSON.parse(source); } catch {}
    }
    return {
      url,
      action: String(url.searchParams.get("action") || body.action || "")
        .trim()
        .toLowerCase(),
      body,
    };
  } catch {
    return { url: null, action: "", body: {} };
  }
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function bootstrapOfflineSession() {
  try {
    const response = await fetch("/api/auth/offline", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.offlineToken || !data?.user?.id) return null;
    const now = Date.now();
    const session = {
      version: 1,
      user: data.user,
      offlineToken: data.offlineToken,
      expiresAt: Number(data.expiresAt || 0),
      createdAt: now,
      updatedAt: now,
    };
    await saveOfflineTeacherSession(session);
    return session;
  } catch {
    return null;
  }
}

export default function LoginCompatibilityBridge() {
  const [hydrated, setHydrated] = useState(false);
  const [mount, setMount] = useState(null);
  const [offlineSession, setOfflineSession] = useState(null);
  const [signInMode, setSignInMode] = useState(true);
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState("");
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || window.location.pathname !== "/login") return undefined;

    let cancelled = false;
    let observer = null;

    try { sessionStorage.removeItem(PENDING_2FA_KEY); } catch {}

    const refresh = () => {
      if (cancelled) return;
      const body = document.querySelector(".form-body");
      if (body) {
        let node = body.querySelector(".crl-legacy-offline-login-mount");
        if (!node) {
          node = document.createElement("div");
          node.className = "crl-legacy-offline-login-mount";
          body.appendChild(node);
        }
        setMount(node);
      }

      const active = document.querySelector(".mode-button.active");
      setSignInMode(
        String(active?.textContent || "Sign In").trim().toLowerCase() === "sign in"
      );
    };

    refresh();
    observer = new MutationObserver(refresh);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    void getOfflineTeacherSession()
      .then((session) => {
        if (
          !cancelled &&
          session &&
          Number(session.expiresAt || 0) > Date.now() &&
          String(session.user?.role || "").toLowerCase() === "teacher"
        ) {
          setOfflineSession(session);
        }
      })
      .catch(() => {});

    const onTwoFactor = () => {
      setTwoFactorPending(true);
      setTwoFactorCode("");
      setTwoFactorError("");
      try { sessionStorage.setItem(PENDING_2FA_KEY, "1"); } catch {}
    };

    window.addEventListener("crl-login-requires-2fa", onTwoFactor);

    if (!window.__crlLoginCompatibilityFetch) {
      const original = window.fetch.bind(window);
      window.__crlLoginCompatibilityFetch = original;
      window.fetch = async (input, init) => {
        let requestInput = input;
        const parsed = parseRequest(input, init);

        if (parsed.url?.pathname === "/api/auth" && parsed.action === "signup") {
          requestInput = "/api/auth/register";
        }

        const response = await original(requestInput, init);

        if (
          parsed.url?.pathname === "/api/auth" &&
          parsed.action === "login" &&
          response.ok
        ) {
          const payload = await response.clone().json().catch(() => null);
          if (payload?.requires_2fa) {
            window.dispatchEvent(new Event("crl-login-requires-2fa"));
            return jsonResponse(
              { error: "Two-factor authentication is required." },
              401
            );
          }
        }

        return response;
      };
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener("crl-login-requires-2fa", onTwoFactor);
    };
  }, [hydrated]);

  async function verifyTwoFactor() {
    setTwoFactorError("");
    const code = twoFactorCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setTwoFactorError("Enter the 6-digit authenticator code.");
      return;
    }

    setTwoFactorBusy(true);
    try {
      const fetcher = window.__crlLoginCompatibilityFetch || window.fetch;
      const response = await fetcher("/api/auth?action=verify_login_2fa", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ action: "verify_login_2fa", code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to verify the authenticator code."
        );
      }

      await bootstrapOfflineSession();
      try { sessionStorage.removeItem(PENDING_2FA_KEY); } catch {}
      setTwoFactorPending(false);
      setTwoFactorCode("");

      window.location.replace(
        data?.user?.role === "admin"
          ? "/admin"
          : data?.user?.role === "learner"
            ? "/learner"
            : "/teacher"
      );
    } catch (error) {
      setTwoFactorError(
        error?.message || "Unable to verify the authenticator code."
      );
    } finally {
      setTwoFactorBusy(false);
    }
  }

  function useOfflineLogin() {
    if (!offlineSession || Number(offlineSession.expiresAt || 0) <= Date.now()) return;
    window.location.replace("/teacher");
  }

  if (!hydrated) return null;

  return (
    <>
      {mount && signInMode && offlineSession && !twoFactorPending
        ? createPortal(
            <button
              type="button"
              className="crl-legacy-offline-login"
              onClick={useOfflineLogin}
            >
              <span className="crl-legacy-offline-dot" aria-hidden="true" />
              <span>
                <strong>Offline Login</strong>
                <small>Use the CRL-App saved on this device</small>
              </span>
            </button>,
            mount
          )
        : null}

      {twoFactorPending
        ? createPortal(
            <div className="crl-login-2fa-backdrop" role="presentation">
              <div
                className="crl-login-2fa-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="crl-login-2fa-title"
              >
                <div className="crl-login-2fa-eyebrow">ACCOUNT SECURITY</div>
                <h2 id="crl-login-2fa-title">Two-Factor Authentication</h2>
                <p>
                  Your username and password are correct. Enter the 6-digit code
                  from your authenticator app to continue.
                </p>
                <input
                  className="crl-login-2fa-input"
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={twoFactorCode}
                  onChange={(event) =>
                    setTwoFactorCode(
                      event.target.value.replace(/\D/g, "").slice(0, 6)
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void verifyTwoFactor();
                  }}
                  placeholder="000000"
                />
                {twoFactorError ? (
                  <div className="crl-login-2fa-error" role="alert">
                    {twoFactorError}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="crl-login-2fa-button"
                  disabled={twoFactorBusy}
                  onClick={() => void verifyTwoFactor()}
                >
                  {twoFactorBusy ? "Verifying..." : "Verify & Continue"}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
