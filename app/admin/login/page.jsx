"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const BLUE = "#1559a6";
const RED = "#c92335";
const TEXT = "#10243f";
const QUIET = "#7b8a9d";

function EyeIcon({ off = false }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {off ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-3.1 4.2" />
          <path d="M6.1 6.1C3.6 8.1 2 12 2 12s3.5 8 10 8a10.7 10.7 0 0 0 3.7-.7" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

function AdminLoginContent() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/auth?action=verify", { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
        const data = await response.json().catch(() => ({}));
        if (!cancelled && data.valid && String(data.user?.role || "").toLowerCase() === "admin") router.replace("/admin");
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [router]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");

    const cleanUsername = username.trim();
    if (!cleanUsername || !password) return setError("Username and password are required.");

    setBusy(true);
    try {
      const response = await fetch("/api/auth?action=login", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "login", username: cleanUsername, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to sign in.");

      if (String(data.user?.role || "").toLowerCase() !== "admin") {
        await fetch("/api/auth?action=logout", { method: "POST", credentials: "include" }).catch(() => {});
        throw new Error("This account is not an administrator account.");
      }

      window.location.replace("/admin");
    } catch (requestError) {
      setError(requestError.message || "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="adminLoginPage">
      <form className="adminLoginCard" onSubmit={submit}>
        <div className="adminLoginBrand">
          <Image src="/crl-app-logo.png" alt="CRL-App" width={1883} height={755} priority />
          <h1>Admin</h1>
        </div>

        <div className="adminLoginField">
          <label htmlFor="admin-username">Username</label>
          <input
            id="admin-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>

        <div className="adminLoginField">
          <label htmlFor="admin-password">Password</label>
          <div className="adminLoginInputWrap">
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="adminPasswordToggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <EyeIcon off={showPassword} />
            </button>
          </div>
        </div>

        {error ? <div className="adminLoginError" role="alert">{error}</div> : null}

        <button type="submit" className="adminLoginSubmit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <style jsx global>{`
        .adminLoginPage {
          min-height: 100dvh;
          display: grid;
          place-items: center;
          padding: 24px;
          box-sizing: border-box;
          background: #f7fbff;
          color: ${TEXT};
          font-family: var(--font-outfit), system-ui, sans-serif;
        }

        .adminLoginCard {
          width: min(400px, 100%);
          display: grid;
          gap: 18px;
          padding: 36px 32px;
          box-sizing: border-box;
          background: #ffffff;
          border: 1px solid rgba(16, 36, 63, .09);
          border-radius: 20px;
          box-shadow: 0 20px 54px rgba(15, 53, 96, .10);
        }

        /* Logo above a centred title, and no rule under it. */
        .adminLoginBrand {
          display: grid;
          justify-items: center;
          gap: 24px;
          margin-bottom: 6px;
        }

        .adminLoginBrand img {
          height: 58px;
          width: auto;
        }

        .adminLoginBrand h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -.02em;
          text-align: center;
        }

        .adminLoginField {
          display: grid;
          gap: 8px;
        }

        .adminLoginField label {
          font-size: 13px;
          font-weight: 700;
        }

        .adminLoginField input {
          width: 100%;
          height: 52px;
          padding: 0 15px;
          box-sizing: border-box;
          border: 1px solid #cfdbe9;
          border-radius: 12px;
          background: #ffffff;
          color: ${TEXT};
          outline: none;
          font-family: inherit;
          font-size: 14px;
        }

        .adminLoginField input:focus {
          border-color: ${BLUE};
          box-shadow: 0 0 0 3px rgba(21, 89, 166, .16);
        }

        .adminLoginInputWrap {
          position: relative;
        }

        .adminLoginInputWrap input {
          padding-right: 48px;
        }

        /* Same eye toggle as the teacher login page. */
        .adminPasswordToggle {
          position: absolute;
          top: 50%;
          right: 5px;
          width: 32px;
          height: 32px;
          display: grid;
          place-items: center;
          transform: translateY(-50%);
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: ${QUIET};
          cursor: pointer;
          transition: color .18s ease, background .18s ease, transform .15s ease;
        }

        .adminPasswordToggle:hover {
          color: ${BLUE};
          background: #f0f5fb;
        }

        .adminPasswordToggle:active {
          transform: translateY(-50%) scale(.94);
        }

        .adminPasswordToggle:focus-visible {
          outline: 2px solid ${BLUE};
          outline-offset: 2px;
        }

        .adminLoginError {
          padding: 11px 13px;
          border: 1px solid #f4c8cf;
          border-radius: 12px;
          background: #fff0f2;
          color: ${RED};
          font-size: 13px;
          line-height: 1.5;
        }

        .adminLoginSubmit {
          height: 52px;
          border: 0;
          border-radius: 12px;
          background: ${BLUE};
          color: #ffffff;
          font-family: inherit;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          transition: background-color .18s ease, transform .15s ease, box-shadow .18s ease;
        }

        .adminLoginSubmit:hover:not(:disabled) {
          background: #114a8c;
          box-shadow: 0 8px 20px rgba(21, 89, 166, .22);
        }

        .adminLoginSubmit:active:not(:disabled) {
          transform: translateY(1px) scale(.99);
          box-shadow: none;
        }

        .adminLoginSubmit:disabled {
          background: #5b86b8;
          cursor: progress;
        }

        @media (prefers-reduced-motion: reduce) {
          .adminLoginSubmit,
          .adminPasswordToggle { transition: none; }
        }
      `}</style>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginContent />
    </Suspense>
  );
}
