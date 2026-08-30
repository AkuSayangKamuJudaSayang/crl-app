"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const initialLogin = {
  username: "",
  password: "",
};

const initialSignup = {
  invite: "",
  fullName: "",
  section: "",
  username: "",
  password: "",
};

export default function LoginPage() {
  const router = useRouter();

  const [isSignupMode, setIsSignupMode] =
    useState(false);

  const [loginForm, setLoginForm] =
    useState(initialLogin);

  const [signupForm, setSignupForm] =
    useState(initialSignup);

  const [loginError, setLoginError] =
    useState("");

  const [signupError, setSignupError] =
    useState("");

  const [loginSuccess, setLoginSuccess] =
    useState(false);

  const [signupSuccess, setSignupSuccess] =
    useState(false);

  const [isLoggingIn, setIsLoggingIn] =
    useState(false);

  const [isSigningUp, setIsSigningUp] =
    useState(false);

  const [showLoginPassword, setShowLoginPassword] =
    useState(false);

  const [showSignupPassword, setShowSignupPassword] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      try {
        const response = await fetch(
          "/api/auth?action=verify",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        if (cancelled || !response.ok) {
          return;
        }

        const data = await response.json();

        if (!cancelled && data?.valid) {
          router.replace("/teacher");
        }
      } catch {
        // Keep the login page visible if session
        // verification cannot be completed.
      }
    }

    verifySession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function switchToSignup() {
    setLoginError("");
    setSignupError("");
    setLoginSuccess(false);
    setSignupSuccess(false);

    setIsSignupMode(true);
  }

  function switchToLogin() {
    setLoginError("");
    setSignupError("");
    setLoginSuccess(false);
    setSignupSuccess(false);

    setIsSignupMode(false);
  }

  function updateLoginField(field, value) {
    setLoginForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateSignupField(field, value) {
    setSignupForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleLogin(event) {
    event.preventDefault();

    const username = loginForm.username.trim();
    const password = loginForm.password;

    setLoginError("");
    setLoginSuccess(false);

    if (!username || !password.trim()) {
      setLoginError(
        "Please enter both username and password."
      );
      return;
    }

    setIsLoggingIn(true);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "login",
          username,
          password,
        }),
      });

      const data = await response.json();

      if (
        !response.ok ||
        data.status !== "success"
      ) {
        setLoginError(
          data.error ||
            "Invalid username or password."
        );
        return;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem(
          "crla_user",
          JSON.stringify({
            username:
              data.username || username,
            role:
              data.role || "teacher",
            full_name:
              data.full_name || "",
            section:
              data.section || "",
          })
        );
      }

      router.replace("/teacher");
    } catch (error) {
      console.error("Login error:", error);

      setLoginError(
        "Unable to connect to the server. Please try again."
      );
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();

    const invite = signupForm.invite.trim();
    const fullName = signupForm.fullName.trim();
    const section = signupForm.section.trim();
    const username = signupForm.username.trim();
    const password = signupForm.password;

    setSignupError("");
    setSignupSuccess(false);

    if (
      !invite ||
      !fullName ||
      !section ||
      !username ||
      !password.trim()
    ) {
      setSignupError(
        "All fields are required."
      );
      return;
    }

    if (password.length < 6) {
      setSignupError(
        "Password must be at least 6 characters."
      );
      return;
    }

    setIsSigningUp(true);

    try {
      const validationResponse =
        await fetch(
          "/api/auth",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              action:
                "validate_invite",
              invite_code:
                invite,
            }),
          }
        );

      const validationData =
        await validationResponse.json();

      if (
        !validationResponse.ok ||
        !validationData.valid
      ) {
        setSignupError(
          validationData.error ||
            "Invalid or expired Admin Invite Code."
        );
        return;
      }

      const response = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          action: "signup",
          invite_code: invite,
          full_name: fullName,
          section,
          username,
          password,
        }),
      });

      const data = await response.json();

      if (
        !response.ok ||
        data.status !== "success"
      ) {
        setSignupError(
          data.error ||
            "Signup failed. Please try again."
        );
        return;
      }

      setSignupSuccess(true);

      setSignupForm(initialSignup);
      setShowSignupPassword(false);

      window.setTimeout(() => {
        setIsSignupMode(false);

        setLoginForm({
          username,
          password: "",
        });

        setSignupSuccess(false);
        setLoginSuccess(true);

        setLoginError(
          "Account created successfully. Please sign in."
        );
      }, 1200);
    } catch (error) {
      console.error("Signup error:", error);

      setSignupError(
        "Unable to connect to the server. Please try again."
      );
    } finally {
      setIsSigningUp(false);
    }
  }

  function EyeIcon({ visible }) {
    if (visible) {
      return (
        <svg
          className="eye-icon"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M3 3L21 21"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />

          <path
            d="M10.58 10.58C10.22 10.94 10 11.44 10 12C10 13.1 10.9 14 12 14C12.56 14 13.06 13.78 13.42 13.42"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />

          <path
            d="M9.88 5.09C10.57 4.86 11.28 4.75 12 4.75C16.5 4.75 19.5 8.1 21 12C20.52 13.25 19.84 14.41 18.98 15.42"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />

          <path
            d="M6.61 6.61C4.86 7.73 3.67 9.44 3 12C4.5 15.9 7.5 19.25 12 19.25C13.42 19.25 14.68 18.91 15.79 18.36"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    return (
      <svg
        className="eye-icon"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M2.5 12C4.2 7.8 7.4 5 12 5C16.6 5 19.8 7.8 21.5 12C19.8 16.2 16.6 19 12 19C7.4 19 4.2 16.2 2.5 12Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        <circle
          cx="12"
          cy="12"
          r="3"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );
  }

  return (
    <>
      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html,
        body {
          min-height: 100%;
        }

        body {
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          color: #0f172a;
          background: #eef3f9;
        }

        button,
        input {
          font: inherit;
        }

        .page {
          position: relative;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 24px;
          overflow: hidden;
          background:
            linear-gradient(
              135deg,
              #f7faff 0%,
              #eef4fb 50%,
              #f8fafc 100%
            );
        }

        .background {
          position: fixed;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .shape {
          position: absolute;
          border-radius: 50%;
          filter: blur(1px);
          opacity: 0.75;
        }

        .shape-blue-1 {
          width: 420px;
          height: 420px;
          background: rgba(
            11,
            78,
            162,
            0.16
          );
          top: -190px;
          right: -130px;
        }

        .shape-blue-2 {
          width: 280px;
          height: 280px;
          background: rgba(
            11,
            78,
            162,
            0.1
          );
          bottom: -130px;
          left: -100px;
        }

        .shape-red-1 {
          width: 330px;
          height: 330px;
          background: rgba(
            206,
            17,
            38,
            0.1
          );
          top: 52%;
          right: -140px;
        }

        .shape-red-2 {
          width: 200px;
          height: 200px;
          background: rgba(
            206,
            17,
            38,
            0.08
          );
          top: -80px;
          left: -65px;
        }

        .grid {
          position: absolute;
          inset: 0;
          opacity: 0.3;
          background-image:
            linear-gradient(
              rgba(
                11,
                78,
                162,
                0.045
              )
              1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(
                11,
                78,
                162,
                0.045
              )
              1px,
              transparent 1px
            );
          background-size: 40px 40px;
          mask-image: linear-gradient(
            to bottom,
            black,
            transparent 90%
          );
          -webkit-mask-image: linear-gradient(
            to bottom,
            black,
            transparent 90%
          );
        }

        .accent-top {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 6px;
          background: linear-gradient(
            90deg,
            #0b4ea2 0%,
            #0b4ea2 50%,
            #ce1126 50%,
            #ce1126 100%
          );
          z-index: 20;
        }

        .card {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 430px;
          background: #ffffff;
          border: 1px solid
            rgba(
              15,
              23,
              42,
              0.08
            );
          border-radius: 18px;
          box-shadow:
            0 18px 50px
              rgba(
                15,
                23,
                42,
                0.14
              );
          overflow: hidden;
        }

        .header {
          text-align: center;
          padding: 30px 28px 24px;
          border-bottom: 1px solid
            #edf1f6;
        }

        .brand {
          font-size: 2rem;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: #0b4ea2;
          line-height: 1;
        }

        .brand span {
          color: #ce1126;
        }

        .brand-line {
          width: 55px;
          height: 4px;
          margin: 14px auto 0;
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            #0b4ea2 0%,
            #0b4ea2 50%,
            #ce1126 50%,
            #ce1126 100%
          );
        }

        .slider-window {
          width: 100%;
          overflow: hidden;
        }

        .slider {
          display: flex;
          width: 200%;
          align-items: flex-start;
          transition:
            transform 0.5s
              cubic-bezier(
                0.65,
                0,
                0.35,
                1
              );
        }

        .slider.signup {
          transform: translateX(-50%);
        }

        .panel {
          width: 50%;
          padding: 28px;
          flex-shrink: 0;
        }

        .title {
          text-align: center;
          margin-bottom: 22px;
        }

        .title h2 {
          font-size: 1.35rem;
          color: #0f172a;
          margin-bottom: 6px;
          font-weight: 700;
        }

        .title p {
          font-size: 0.84rem;
          color: #64748b;
        }

        .message {
          padding: 11px 13px;
          border-radius: 9px;
          margin-bottom: 16px;
          font-size: 0.82rem;
          line-height: 1.4;
        }

        .message.error {
          color: #b42318;
          background: #fff1f2;
          border: 1px solid #fecdd3;
        }

        .message.success {
          color: #166534;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
        }

        .group {
          margin-bottom: 15px;
        }

        .group label {
          display: block;
          margin-bottom: 7px;
          color: #334155;
          font-size: 0.81rem;
          font-weight: 700;
        }

        .required {
          color: #ce1126;
        }

        .password-wrapper {
          position: relative;
          width: 100%;
        }

        .input {
          width: 100%;
          height: 46px;
          padding: 0 14px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          outline: none;
          background: #ffffff;
          color: #0f172a;
          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .password-wrapper .input {
          padding-right: 48px;
        }

        .input::placeholder {
          color: #94a3b8;
        }

        .input:focus {
          border-color: #0b4ea2;
          box-shadow:
            0 0 0 3px
              rgba(
                11,
                78,
                162,
                0.11
              );
        }

        .password-toggle {
          position: absolute;
          top: 50%;
          right: 10px;
          transform: translateY(-50%);
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: #64748b;
          cursor: pointer;
          border-radius: 7px;
          padding: 0;
          transition:
            color 0.2s ease,
            background 0.2s ease;
        }

        .password-toggle:hover {
          color: #0b4ea2;
          background: #f1f5f9;
        }

        .password-toggle:active {
          background: #e2e8f0;
        }

        .password-toggle:focus-visible {
          outline: 2px solid #0b4ea2;
          outline-offset: 2px;
        }

        .eye-icon {
          width: 19px;
          height: 19px;
          display: block;
        }

        .hint {
          margin-top: 5px;
          color: #94a3b8;
          font-size: 0.7rem;
        }

        .button {
          width: 100%;
          height: 46px;
          border: none;
          border-radius: 9px;
          color: #ffffff;
          font-weight: 700;
          cursor: pointer;
          transition:
            transform 0.15s ease,
            background 0.2s ease,
            opacity 0.2s ease;
        }

        .button:hover:not(
            :disabled
          ) {
          transform: translateY(-1px);
        }

        .button:active:not(
            :disabled
          ) {
          transform: translateY(0);
        }

        .button:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .button.login {
          background: #ce1126;
        }

        .button.login:hover:not(
            :disabled
          ) {
          background: #b70f22;
        }

        .button.signup {
          background: #0b4ea2;
        }

        .button.signup:hover:not(
            :disabled
          ) {
          background: #093f83;
        }

        .toggle {
          margin-top: 21px;
          text-align: center;
          color: #64748b;
          font-size: 0.83rem;
        }

        .toggle button {
          border: none;
          background: transparent;
          padding: 0;
          margin-left: 4px;
          cursor: pointer;
          font-weight: 700;
        }

        .toggle .red {
          color: #ce1126;
        }

        .toggle .blue {
          color: #0b4ea2;
        }

        .loading {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid
            rgba(
              255,
              255,
              255,
              0.35
            );
          border-top-color: #ffffff;
          animation:
            spin 0.7s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(
              360deg
            );
          }
        }

        @media (max-width: 480px) {
          .page {
            padding: 16px;
          }

          .card {
            border-radius: 14px;
          }

          .header {
            padding: 26px 20px 22px;
          }

          .panel {
            padding: 22px 20px;
          }

          .brand {
            font-size: 1.75rem;
          }

          .shape-blue-1 {
            width: 280px;
            height: 280px;
          }

          .shape-red-1 {
            width: 220px;
            height: 220px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .slider,
          .button,
          .input,
          .password-toggle {
            transition: none;
          }

          .spinner {
            animation: none;
          }
        }
      `}</style>

      <main className="page">
        <div
          className="background"
          aria-hidden="true"
        >
          <div className="grid" />

          <div className="shape shape-blue-1" />
          <div className="shape shape-blue-2" />

          <div className="shape shape-red-1" />
          <div className="shape shape-red-2" />
        </div>

        <div className="accent-top" />

        <section className="card">
          <header className="header">
            <div className="brand">
              CRL-
              <span>App</span>
            </div>

            <div className="brand-line" />
          </header>

          <div className="slider-window">
            <div
              className={`slider ${
                isSignupMode
                  ? "signup"
                  : ""
              }`}
            >
              {/* LOGIN PANEL */}
              <section
                className="panel"
                aria-label="Login"
              >
                <div className="title">
                  <h2>
                    Welcome Back
                  </h2>

                  <p>
                    Sign in to continue
                    to your account
                  </p>
                </div>

                {loginError ? (
                  <div
                    className={`message ${
                      loginSuccess
                        ? "success"
                        : "error"
                    }`}
                    role={
                      loginSuccess
                        ? "status"
                        : "alert"
                    }
                  >
                    {loginError}
                  </div>
                ) : null}

                <form
                  onSubmit={
                    handleLogin
                  }
                >
                  <div className="group">
                    <label htmlFor="loginUsername">
                      Username
                    </label>

                    <input
                      id="loginUsername"
                      className="input"
                      type="text"
                      value={
                        loginForm.username
                      }
                      placeholder="Enter your username"
                      autoComplete="username"
                      onChange={(event) =>
                        updateLoginField(
                          "username",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="loginPassword">
                      Password
                    </label>

                    <div className="password-wrapper">
                      <input
                        id="loginPassword"
                        className="input"
                        type={
                          showLoginPassword
                            ? "text"
                            : "password"
                        }
                        value={
                          loginForm.password
                        }
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        onChange={(event) =>
                          updateLoginField(
                            "password",
                            event.target.value
                          )
                        }
                      />

                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() =>
                          setShowLoginPassword(
                            (current) =>
                              !current
                          )
                        }
                        aria-label={
                          showLoginPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        title={
                          showLoginPassword
                            ? "Hide password"
                            : "Show password"
                        }
                      >
                        <EyeIcon
                          visible={
                            showLoginPassword
                          }
                        />
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="button login"
                    disabled={
                      isLoggingIn
                    }
                  >
                    {isLoggingIn ? (
                      <span className="loading">
                        <span className="spinner" />
                        Signing in...
                      </span>
                    ) : (
                      "Sign In"
                    )}
                  </button>
                </form>

                <div className="toggle">
                  Don't have an
                  account?

                  <button
                    type="button"
                    className="red"
                    onClick={
                      switchToSignup
                    }
                  >
                    Sign Up
                  </button>
                </div>
              </section>

              {/* SIGN UP PANEL */}
              <section
                className="panel"
                aria-label="Sign Up"
              >
                <div className="title">
                  <h2>
                    Create Account
                  </h2>

                  <p>
                    Register using an
                    Admin Invite Code
                  </p>
                </div>

                {signupError ? (
                  <div
                    className="message error"
                    role="alert"
                  >
                    {signupError}
                  </div>
                ) : null}

                {signupSuccess ? (
                  <div
                    className="message success"
                    role="status"
                  >
                    Account created
                    successfully. Please
                    sign in.
                  </div>
                ) : null}

                <form
                  onSubmit={
                    handleSignup
                  }
                >
                  <div className="group">
                    <label htmlFor="signupInvite">
                      Admin Invite Code{" "}
                      <span className="required">
                        *
                      </span>
                    </label>

                    <input
                      id="signupInvite"
                      className="input"
                      type="text"
                      value={
                        signupForm.invite
                      }
                      placeholder="e.g. CRLA-XXXX-XXXX"
                      autoComplete="off"
                      maxLength={30}
                      onChange={(event) =>
                        updateSignupField(
                          "invite",
                          event.target.value.toUpperCase()
                        )
                      }
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="signupFullName">
                      Full Name{" "}
                      <span className="required">
                        *
                      </span>
                    </label>

                    <input
                      id="signupFullName"
                      className="input"
                      type="text"
                      value={
                        signupForm.fullName
                      }
                      placeholder="First and Last Name"
                      onChange={(event) =>
                        updateSignupField(
                          "fullName",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="signupSection">
                      Section{" "}
                      <span className="required">
                        *
                      </span>
                    </label>

                    <input
                      id="signupSection"
                      className="input"
                      type="text"
                      value={
                        signupForm.section
                      }
                      placeholder="e.g. Mars, Jupiter, Molave"
                      onChange={(event) =>
                        updateSignupField(
                          "section",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="signupUsername">
                      Username{" "}
                      <span className="required">
                        *
                      </span>
                    </label>

                    <input
                      id="signupUsername"
                      className="input"
                      type="text"
                      value={
                        signupForm.username
                      }
                      placeholder="Choose a username"
                      autoComplete="username"
                      onChange={(event) =>
                        updateSignupField(
                          "username",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="group">
                    <label htmlFor="signupPassword">
                      Password{" "}
                      <span className="required">
                        *
                      </span>
                    </label>

                    <div className="password-wrapper">
                      <input
                        id="signupPassword"
                        className="input"
                        type={
                          showSignupPassword
                            ? "text"
                            : "password"
                        }
                        value={
                          signupForm.password
                        }
                        placeholder="Create a password"
                        autoComplete="new-password"
                        onChange={(event) =>
                          updateSignupField(
                            "password",
                            event.target.value
                          )
                        }
                      />

                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() =>
                          setShowSignupPassword(
                            (current) =>
                              !current
                          )
                        }
                        aria-label={
                          showSignupPassword
                            ? "Hide password"
                            : "Show password"
                        }
                        title={
                          showSignupPassword
                            ? "Hide password"
                            : "Show password"
                        }
                      >
                        <EyeIcon
                          visible={
                            showSignupPassword
                          }
                        />
                      </button>
                    </div>

                    <div className="hint">
                      Minimum 6 characters
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="button signup"
                    disabled={
                      isSigningUp
                    }
                  >
                    {isSigningUp ? (
                      <span className="loading">
                        <span className="spinner" />
                        Creating account...
                      </span>
                    ) : (
                      "Create Account"
                    )}
                  </button>
                </form>

                <div className="toggle">
                  Already have an
                  account?

                  <button
                    type="button"
                    className="blue"
                    onClick={
                      switchToLogin
                    }
                  >
                    Sign In
                  </button>
                </div>
              </section>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
