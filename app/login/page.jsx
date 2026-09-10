"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOfflineTeacherSession } from "../../lib/teacherOfflineDb";

const slideData = [
  {
    image: "/login-slides/classroom-1.png",
    alt: "Learners working together in a classroom",
  },
  {
    image: "/login-slides/classroom-2.png",
    alt: "Learners completing reading activities",
  },
  {
    image: "/login-slides/classroom-3.png",
    alt: "Learners participating in a classroom activity",
  },
];

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return { error: "The server returned an invalid response." };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [section, setSection] = useState("");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [offlineSession, setOfflineSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const local = await getOfflineTeacherSession().catch(() => null);
      if (!cancelled) {
        setOfflineSession(local && Number(local.expiresAt || 0) > Date.now() ? local : null);
      }

      try {
        const response = await fetch("/api/auth?action=verify", {
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const data = await readJson(response);
        if (cancelled || !data?.valid || !data?.user) return;
        const role = String(data.user.role || "").toLowerCase();
        if (role === "admin") router.replace("/admin");
        else if (role === "teacher") router.replace("/teacher");
        else if (role === "learner") router.replace("/learner");
      } catch {
        // Offline login is handled separately below.
      }
    }

    void initialize();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (slideData.length < 2 || redirecting) return undefined;
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slideData.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [redirecting]);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  function switchMode(nextMode) {
    if (loading || nextMode === mode) return;
    clearMessages();
    setMode(nextMode);
    setPassword("");
    setTwoFactorRequired(false);
    setTwoFactorCode("");
  }

  function redirectForRole(role) {
    const normalized = String(role || "").toLowerCase();
    if (normalized === "admin") return "/admin";
    if (normalized === "learner") return "/learner";
    return "/teacher";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearMessages();

    if (mode === "login") {
      if (!username.trim() || !password) {
        setError("Please enter your username and password.");
        return;
      }
    } else if (!inviteCode.trim() || !fullName.trim() || !section.trim() || !username.trim() || !password) {
      setError("Please complete all required fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth?action=login" : "/api/auth/register";
      const body = mode === "login"
        ? { action: "login", username: username.trim(), password }
        : {
            invite_code: inviteCode.trim().toUpperCase(),
            full_name: fullName.trim(),
            section: section.trim(),
            username: username.trim().toLowerCase(),
            password,
          };

      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(data?.error || "Unable to continue.");
      }

      if (data?.requires_2fa) {
        setTwoFactorRequired(true);
        setTwoFactorCode("");
        return;
      }

      setSuccess(mode === "login" ? "Login successful." : "Account created successfully.");
      setRedirecting(true);
      window.setTimeout(() => {
        window.location.replace(redirectForRole(data?.user?.role));
      }, 200);
    } catch (submitError) {
      setError(submitError?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyTwoFactor() {
    clearMessages();
    if (twoFactorCode.replace(/\D/g, "").length !== 6) {
      setError("Enter the 6-digit authenticator code.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth?action=verify_login_2fa", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ action: "verify_login_2fa", code: twoFactorCode }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data?.error || "Unable to verify the authenticator code.");
      setSuccess("Login successful.");
      setRedirecting(true);
      window.setTimeout(() => {
        window.location.replace(redirectForRole(data?.user?.role));
      }, 200);
    } catch (verifyError) {
      setError(verifyError?.message || "Unable to verify the authenticator code.");
    } finally {
      setLoading(false);
    }
  }

  function useOfflineLogin() {
    clearMessages();
    if (!offlineSession || Number(offlineSession.expiresAt || 0) <= Date.now()) {
      setError("Offline access is not available on this device yet. Connect once and sign in successfully first.");
      return;
    }
    setSuccess(`Offline login: ${offlineSession.user?.full_name || offlineSession.user?.username || "Teacher"}`);
    setRedirecting(true);
    window.setTimeout(() => window.location.replace("/teacher"), 150);
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="CRL-App">
        <div className="auth-visual-overlay" />
        {slideData.map((slide, index) => (
          <img
            key={slide.image}
            src={slide.image}
            alt={slide.alt}
            className={`auth-slide ${index === activeSlide ? "active" : ""}`}
          />
        ))}
        <div className="auth-brand">
          <img src="/CRL-App Logo.png" alt="CRL-App" />
          <div>
            <span>CRL-APP</span>
            <strong>Comprehensive Rapid Literacy Assessment</strong>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-header">
            <span className="auth-eyebrow">TEACHER WORKSPACE</span>
            <h1>{mode === "login" ? "Welcome back" : "Create your teacher account"}</h1>
            <p>
              {mode === "login"
                ? "Sign in to manage learners, assessments, and your CRL-App records."
                : "Use your administrator invite code to create a teacher account."}
            </p>
          </div>

          {twoFactorRequired ? (
            <div className="two-factor-card">
              <span className="auth-eyebrow">ACCOUNT SECURITY</span>
              <h2>Two-Factor Authentication</h2>
              <p>Your credentials are correct. Enter the 6-digit code from your authenticator app.</p>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={(event) => { if (event.key === "Enter") void verifyTwoFactor(); }}
                placeholder="000000"
                className="auth-input auth-code"
              />
              <button className="auth-primary" type="button" disabled={loading} onClick={() => void verifyTwoFactor()}>
                {loading ? "Verifying..." : "Verify & Continue"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {mode === "signup" && (
                <>
                  <label>Administrator Invite Code<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} autoComplete="off" /></label>
                  <label>Full Name<input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>
                  <label>Section<input value={section} onChange={(event) => setSection(event.target.value)} autoComplete="organization" /></label>
                </>
              )}

              <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label>
              <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>

              <button className="auth-primary" type="submit" disabled={loading || redirecting}>
                {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>
          )}

          {mode === "login" && !twoFactorRequired && offlineSession && !redirecting && (
            <button className="offline-login-button" type="button" onClick={useOfflineLogin}>
              <span className="offline-dot" />
              <span>
                <strong>Offline Login</strong>
                <small>Use the CRL-App saved on this device</small>
              </span>
            </button>
          )}

          {error && <div className="auth-message error">{error}</div>}
          {success && <div className="auth-message success">{success}</div>}

          {!twoFactorRequired && (
            <div className="auth-switch">
              {mode === "login" ? "Need a teacher account?" : "Already have an account?"}
              <button type="button" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>
                {mode === "login" ? "Create one" : "Sign in"}
              </button>
            </div>
          )}
        </div>
      </section>

      <style jsx global>{`
        * { box-sizing: border-box; }
        body { margin: 0; font-family: var(--font-outfit), system-ui, sans-serif; }
        .auth-page { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(430px, .92fr); background: #f8fbff; }
        .auth-visual { position: relative; min-height: 100vh; overflow: hidden; background: #0e396c; }
        .auth-slide { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .65s ease; }
        .auth-slide.active { opacity: 1; }
        .auth-visual-overlay { position: absolute; inset: 0; z-index: 2; background: linear-gradient(180deg, rgba(10,33,61,.18), rgba(7,29,56,.74)); }
        .auth-brand { position: absolute; z-index: 3; left: clamp(28px, 6vw, 84px); bottom: clamp(34px, 8vw, 92px); display: flex; gap: 18px; align-items: center; color: white; max-width: 620px; }
        .auth-brand img { width: 76px; height: 76px; object-fit: contain; filter: drop-shadow(0 8px 20px rgba(0,0,0,.28)); }
        .auth-brand span { display: block; letter-spacing: .18em; font-weight: 800; font-size: 13px; opacity: .88; }
        .auth-brand strong { display: block; margin-top: 5px; font-size: clamp(20px, 2.4vw, 33px); line-height: 1.08; }
        .auth-panel { display: flex; align-items: center; justify-content: center; padding: clamp(24px, 5vw, 72px); }
        .auth-card { width: min(100%, 540px); }
        .auth-card-header { margin-bottom: 28px; }
        .auth-eyebrow { color: #1559a6; font-weight: 800; letter-spacing: .13em; font-size: 11px; }
        .auth-card h1 { margin: 8px 0 8px; color: #12365f; font-size: clamp(31px, 4vw, 45px); letter-spacing: -.03em; line-height: 1.04; }
        .auth-card-header p, .two-factor-card p { margin: 0; color: #5d6f83; line-height: 1.6; font-size: 15px; }
        .auth-card form { display: grid; gap: 16px; }
        .auth-card label { display: grid; gap: 7px; color: #35526f; font-weight: 700; font-size: 13px; }
        .auth-input, .auth-card input { width: 100%; border: 1px solid #c8d6e6; border-radius: 14px; padding: 14px 15px; outline: none; background: white; color: #183755; font: inherit; transition: border-color .18s, box-shadow .18s; }
        .auth-card input:focus { border-color: #2c76c9; box-shadow: 0 0 0 4px rgba(44,118,201,.12); }
        .auth-code { margin: 20px 0 8px; font-size: 26px; letter-spacing: .24em; text-align: center; }
        .auth-primary { width: 100%; border: 0; border-radius: 14px; padding: 14px 18px; margin-top: 6px; background: #1559a6; color: white; font: inherit; font-weight: 800; cursor: pointer; box-shadow: 0 12px 24px rgba(21,89,166,.2); }
        .auth-primary:disabled { opacity: .62; cursor: wait; }
        .offline-login-button { width: 100%; display: flex; align-items: center; gap: 13px; margin-top: 14px; padding: 13px 15px; border: 1px solid #b9d7bd; border-radius: 14px; background: #f4fbf5; color: #214f2b; text-align: left; cursor: pointer; }
        .offline-login-button strong, .offline-login-button small { display: block; }
        .offline-login-button small { margin-top: 3px; opacity: .76; }
        .offline-dot { width: 10px; height: 10px; border-radius: 50%; background: #2f9e44; box-shadow: 0 0 0 5px rgba(47,158,68,.11); flex: 0 0 auto; }
        .auth-message { margin-top: 16px; padding: 12px 14px; border-radius: 12px; font-size: 13px; line-height: 1.45; }
        .auth-message.error { background: #fff2f2; color: #9f2c2c; }
        .auth-message.success { background: #eef9f0; color: #2f6d36; }
        .auth-switch { display: flex; justify-content: center; gap: 6px; margin-top: 24px; color: #6c7d8f; font-size: 14px; }
        .auth-switch button { border: 0; background: transparent; color: #1559a6; font: inherit; font-weight: 800; cursor: pointer; padding: 0; }
        .two-factor-card { padding: 22px; border: 1px solid #d7e4f2; border-radius: 18px; background: #fff; box-shadow: 0 16px 36px rgba(29,72,117,.08); }
        .two-factor-card h2 { margin: 8px 0 8px; color: #12365f; }
        @media (max-width: 900px) { .auth-page { grid-template-columns: 1fr; } .auth-visual { min-height: 30vh; max-height: 330px; } .auth-panel { padding: 34px 22px 48px; } .auth-brand { left: 24px; bottom: 24px; } .auth-brand img { width: 56px; height: 56px; } }
      `}</style>
    </main>
  );
}
