"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
    const source = typeof init?.body === "string" ? init.body : typeof input?.body === "string" ? input.body : "";
    if (source) {
      try { body = JSON.parse(source); } catch {}
    }
    return { url, action: String(url.searchParams.get("action") || body.action || "").trim().toLowerCase(), body };
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
    const session = {
      version: 1,
      user: data.user,
      offlineToken: data.offlineToken,
      expiresAt: Number(data.expiresAt || 0),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveOfflineTeacherSession(session);
    return session;
  } catch {
    return null;
  }
}

export default function LoginCompatibilityBridge() {
  const [mount, setMount] = useState(null);
  const [offlineSession, setOfflineSession] = useState(null);
  const [signInMode, setSignInMode] = useState(true);
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState("");
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);

  useEffect(() => {
    if (window.location.pathname !== "/login") return undefined;

    let cancelled = false;
    let observer = null;

    // A stale marker from a previous failed/cancelled challenge must not block
    // a later normal login attempt on the same browser tab.
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
      setSignInMode(String(active?.textContent || "Sign In").trim().toLowerCase() === "sign in");
    };

    refresh();
    observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    void getOfflineTeacherSession()
      .then((session) => {
        if (!cancelled && session && Number(session.expiresAt || 0) > Date.now() && String(session.user?.role || "").toLowerCase() === "teacher") {
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
        let requestInit = init;
        const parsed = parseRequest(input, init);

        // Keep the old login page intact while routing its email-free signup
        // request to the dedicated endpoint introduced for the new system.
        if (parsed.url?.pathname === "/api/auth" && parsed.action === "signup") {
          requestInput = "/api/auth/register";
        }

        const response = await original(requestInput, requestInit);

        if (parsed.url?.pathname === "/api/auth" && parsed.action === "login" && response.ok) {
          const payload = await response.clone().json().catch(() => null);
          if (payload?.requires_2fa) {
            window.dispatchEvent(new Event("crl-login-requires-2fa"));
            return jsonResponse({ error: "Two-factor authentication is required." }, 401);
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
  }, []);

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
      if (!response.ok) throw new Error(data?.error || "Unable to verify the authenticator code.");

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
      setTwoFactorError(error?.message || "Unable to verify the authenticator code.");
    } finally {
      setTwoFactorBusy(false);
    }
  }

  function useOfflineLogin() {
    if (!offlineSession || Number(offlineSession.expiresAt || 0) <= Date.now()) return;
    window.location.replace("/teacher");
  }

  if (typeof window === "undefined" || window.location.pathname !== "/login") return null;

  return (
    <>
      {mount && signInMode && offlineSession && !twoFactorPending && createPortal(
        <button type="button" className="crl-legacy-offline-login" onClick={useOfflineLogin}>
          <span className="crl-legacy-offline-dot" aria-hidden="true" />
          <span>
            <strong>Offline Login</strong>
            <small>Use the CRL-App saved on this device</small>
          </span>
        </button>,
        mount
      )}

      {twoFactorPending && createPortal(
        <div className="crl-login-2fa-backdrop" role="presentation">
          <div className="crl-login-2fa-card" role="dialog" aria-modal="true" aria-labelledby="crl-login-2fa-title">
            <div className="crl-login-2fa-eyebrow">ACCOUNT SECURITY</div>
            <h2 id="crl-login-2fa-title">Two-Factor Authentication</h2>
            <p>Your username and password are correct. Enter the 6-digit code from your authenticator app to continue.</p>
            <input
              className="crl-login-2fa-input"
              autoFocus
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={twoFactorCode}
              onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(event) => { if (event.key === "Enter") void verifyTwoFactor(); }}
              placeholder="000000"
            />
            {twoFactorError ? <div className="crl-login-2fa-error" role="alert">{twoFactorError}</div> : null}
            <button type="button" className="crl-login-2fa-button" disabled={twoFactorBusy} onClick={() => void verifyTwoFactor()}>
              {twoFactorBusy ? "Verifying..." : "Verify & Continue"}
            </button>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .crl-legacy-offline-login { width: 100%; display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 10px 11px; border: 1px solid #cbe5d3; border-radius: 9px; background: #f2faf5; color: #2d7245; text-align: left; cursor: pointer; transition: transform .16s ease, box-shadow .18s ease, border-color .18s ease; }
        .crl-legacy-offline-login:hover { transform: translateY(-1px); border-color: #a9cfb5; box-shadow: 0 7px 15px rgba(45,114,69,.08); }
        .crl-legacy-offline-login:active { transform: translateY(1px) scale(.992); }
        .crl-legacy-offline-dot { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: #4d9a64; box-shadow: 0 0 0 4px rgba(77,154,100,.10); }
        .crl-legacy-offline-login strong, .crl-legacy-offline-login small { display: block; }
        .crl-legacy-offline-login strong { font-size: 10px; font-weight: 900; line-height: 1.25; }
        .crl-legacy-offline-login small { margin-top: 2px; font-size: 9px; color: #668372; line-height: 1.35; }
        .crl-login-2fa-backdrop { position: fixed; inset: 0; z-index: 12000; display: grid; place-items: center; padding: 18px; background: rgba(8,29,54,.48); backdrop-filter: blur(9px); }
        .crl-login-2fa-card { width: min(440px, 100%); padding: 26px; border: 1px solid #d8e2ef; border-radius: 22px; background: #f2f7fc; box-shadow: 12px 12px 28px rgba(9,43,91,.20), -8px -8px 18px rgba(255,255,255,.82); color: #14253d; }
        .crl-login-2fa-eyebrow { color: #1559a6; font-size: 11px; font-weight: 900; letter-spacing: .13em; }
        .crl-login-2fa-card h2 { margin: 7px 0 7px; font-size: 23px; font-weight: 950; letter-spacing: -.03em; }
        .crl-login-2fa-card p { margin: 0; color: #69798e; font-size: 13px; line-height: 1.55; }
        .crl-login-2fa-input { width: 100%; margin-top: 17px; min-height: 48px; padding: 0 13px; border: 1px solid #ccd8e6; border-radius: 10px; outline: none; background: #fff; color: #14253d; font-size: 22px; font-weight: 900; letter-spacing: .28em; text-align: center; }
        .crl-login-2fa-input:focus { border-color: #2479db; box-shadow: 0 0 0 3px rgba(36,121,219,.10); }
        .crl-login-2fa-error { margin-top: 9px; padding: 9px 10px; border-radius: 9px; border: 1px solid #f1ccd2; background: #fff0f2; color: #a52131; font-size: 10px; line-height: 1.45; }
        .crl-login-2fa-button { width: 100%; margin-top: 12px; min-height: 45px; border: 0; border-radius: 9px; background: linear-gradient(135deg,#1255aa,#2479db); color: #fff; font-size: 11px; font-weight: 900; cursor: pointer; box-shadow: 0 8px 18px rgba(18,85,170,.16); }
        .crl-login-2fa-button:disabled { opacity: .72; cursor: not-allowed; }
      `}</style>
    </>
  );
}
