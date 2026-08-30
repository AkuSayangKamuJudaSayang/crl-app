"use client";

import {
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] =
    useState("login");

  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [inviteCode, setInviteCode] =
    useState("");

  const [fullName, setFullName] =
    useState("");

  const [section, setSection] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [switching, setSwitching] =
    useState(false);

  /*
   * If an authenticated teacher opens
   * /login, send them to the dashboard.
   */
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const response =
          await fetch(
            "/api/auth?action=verify",
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
              headers: {
                Accept:
                  "application/json",
              },
            }
          );

        if (!response.ok) {
          return;
        }

        const data =
          await response.json();

        if (
          !cancelled &&
          data.valid &&
          data.user
        ) {
          if (
            data.user.role ===
            "teacher"
          ) {
            router.replace(
              "/teacher"
            );
          }
        }
      } catch {
        /*
         * Not being authenticated is
         * completely fine on this page.
         */
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  function switchMode(
    nextMode
  ) {
    if (
      nextMode === mode ||
      switching
    ) {
      return;
    }

    clearMessages();

    setSwitching(true);

    window.setTimeout(() => {
      setMode(nextMode);

      setPassword("");
      setShowPassword(false);

      setSwitching(false);
    }, 180);
  }

  async function handleSubmit(
    event
  ) {
    event.preventDefault();

    clearMessages();
    setLoading(true);

    try {
      if (mode === "login") {
        if (
          !username.trim() ||
          !password
        ) {
          throw new Error(
            "Please enter your username and password."
          );
        }

        /*
         * IMPORTANT:
         * The action parameter must be present.
         *
         * /api/auth?action=login
         *
         * not simply:
         *
         * /api/auth
         */
        const response =
          await fetch(
            "/api/auth?action=login",
            {
              method: "POST",
              credentials:
                "include",
              cache: "no-store",
              headers: {
                "Content-Type":
                  "application/json",
                Accept:
                  "application/json",
              },
              body: JSON.stringify({
                username:
                  username.trim(),
                password,
              }),
            }
          );

        const contentType =
          response.headers.get(
            "content-type"
          ) || "";

        let data;

        if (
          contentType.includes(
            "application/json"
          )
        ) {
          data =
            await response.json();
        } else {
          const text =
            await response.text();

          data = {
            error:
              text ||
              "The server returned an invalid response.",
          };
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              "Unable to sign in."
          );
        }

        setSuccess(
          "Login successful. Redirecting..."
        );

        /*
         * Hard navigation makes sure
         * the new authentication cookie
         * is recognized by the next page.
         */
        window.setTimeout(
          () => {
            window.location.replace(
              data.user
                ?.role ===
                "teacher"
                ? "/teacher"
                : "/learner"
            );
          },
          250
        );

        return;
      }

      /*
       * ----------------------------------------------------------
       * SIGNUP
       * ----------------------------------------------------------
       */

      if (
        !inviteCode.trim() ||
        !fullName.trim() ||
        !section.trim() ||
        !username.trim() ||
        !password
      ) {
        throw new Error(
          "Please complete all required fields."
        );
      }

      if (
        password.length < 6
      ) {
        throw new Error(
          "Password must contain at least 6 characters."
        );
      }

      const response =
        await fetch(
          "/api/auth?action=signup",
          {
            method: "POST",
            credentials:
              "include",
            cache: "no-store",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },
            body: JSON.stringify({
              invite_code:
                inviteCode
                  .trim()
                  .toUpperCase(),
              full_name:
                fullName.trim(),
              section:
                section.trim(),
              username:
                username
                  .trim()
                  .toLowerCase(),
              password,
            }),
          }
        );

      const contentType =
        response.headers.get(
          "content-type"
        ) || "";

      let data;

      if (
        contentType.includes(
          "application/json"
        )
      ) {
        data =
          await response.json();
      } else {
        const text =
          await response.text();

        data = {
          error:
            text ||
            "The server returned an invalid response.",
        };
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to create your account."
        );
      }

      setSuccess(
        "Account created successfully. Redirecting..."
      );

      window.setTimeout(
        () => {
          window.location.replace(
            "/teacher"
          );
        },
        250
      );
    } catch (submitError) {
      console.error(
        "Authentication error:",
        submitError
      );

      setError(
        submitError.message ||
          "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          min-height: 100%;
          margin: 0;
        }

        body {
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          color: #172337;
          background:
            linear-gradient(
              180deg,
              #f8fbff 0%,
              #edf4fb 100%
            );
        }

        button,
        input {
          font: inherit;
        }

        .login-page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 30px 18px;
        }

        /*
         * Simple background decorations.
         * They keep the page from looking empty
         * without becoming visually distracting.
         */
        .bg-shape {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(1px);
        }

        .bg-shape-blue {
          width: 300px;
          height: 300px;
          top: -110px;
          right: -90px;
          background:
            rgba(
              20,
              85,
              160,
              0.09
            );
        }

        .bg-shape-red {
          width: 230px;
          height: 230px;
          right: -80px;
          bottom: 80px;
          background:
            rgba(
              201,
              35,
              53,
              0.08
            );
        }

        .bg-shape-blue-bottom {
          width: 180px;
          height: 180px;
          left: -90px;
          bottom: -70px;
          background:
            rgba(
              20,
              85,
              160,
              0.07
            );
        }

        .top-accent {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          display: flex;
        }

        .top-accent-blue {
          flex: 1;
          background: #1455a0;
        }

        .top-accent-red {
          width: 42%;
          background: #c92335;
        }

        .auth-card {
          position: relative;
          z-index: 2;
          width: min(
            100%,
            400px
          );
          overflow: hidden;
          background: #ffffff;
          border: 1px solid
            #e0e7ef;
          border-radius: 15px;
          box-shadow:
            0 20px 50px
              rgba(
                31,
                52,
                78,
                0.12
              );
          transition:
            opacity 0.18s ease,
            transform 0.18s ease;
        }

        .auth-card.switching {
          opacity: 0;
          transform:
            translateY(8px);
        }

        .card-header {
          padding: 28px 25px 24px;
          text-align: center;
          border-bottom: 1px solid
            #edf2f6;
        }

        .brand {
          display: inline-block;
          color: #1455a0;
          font-size: 29px;
          font-weight: 900;
          letter-spacing: -1px;
        }

        .brand span {
          color: #c92335;
        }

        .brand-line {
          width: 48px;
          height: 4px;
          margin: 8px auto 0;
          background:
            linear-gradient(
              90deg,
              #1455a0 0 50%,
              #c92335 50% 100%
            );
          border-radius: 999px;
        }

        .card-body {
          padding: 25px;
        }

        .title {
          margin: 0;
          color: #172337;
          font-size: 21px;
          font-weight: 800;
          text-align: center;
        }

        .subtitle {
          margin: 6px 0 20px;
          color: #718097;
          font-size: 11px;
          line-height: 1.6;
          text-align: center;
        }

        .form {
          display: grid;
          gap: 14px;
        }

        .field {
          display: grid;
          gap: 6px;
        }

        .field label {
          color: #33455c;
          font-size: 11px;
          font-weight: 800;
        }

        .input-wrap {
          position: relative;
        }

        .input {
          width: 100%;
          min-height: 44px;
          padding: 0 12px;
          border: 1px solid
            #cedae7;
          border-radius: 8px;
          outline: none;
          background: #ffffff;
          color: #24364d;
          font-size: 12px;
          transition:
            border-color 0.18s ease,
            box-shadow 0.18s ease;
        }

        .input.password-input {
          padding-right: 45px;
        }

        .input:focus {
          border-color: #1455a0;
          box-shadow:
            0 0 0 3px
              rgba(
                20,
                85,
                160,
                0.08
              );
        }

        .password-toggle {
          position: absolute;
          top: 50%;
          right: 7px;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          transform:
            translateY(-50%);
          border: 0;
          border-radius: 7px;
          background: transparent;
          color: #728197;
          cursor: pointer;
          transition:
            background 0.18s ease,
            color 0.18s ease;
        }

        .password-toggle:hover {
          background: #f2f6fa;
          color: #1455a0;
        }

        .helper {
          margin-top: -3px;
          color: #95a2b2;
          font-size: 9px;
        }

        .message {
          padding: 11px 12px;
          border-radius: 8px;
          font-size: 10px;
          line-height: 1.5;
        }

        .message-error {
          background: #fff1f3;
          border: 1px solid
            #f2cbd0;
          color: #a52131;
        }

        .message-success {
          background: #eef8f1;
          border: 1px solid
            #c9e5cf;
          color: #2b7040;
        }

        .submit {
          width: 100%;
          min-height: 44px;
          margin-top: 2px;
          border: 0;
          border-radius: 8px;
          background: #c92335;
          color: #ffffff;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          box-shadow:
            0 6px 14px
              rgba(
                201,
                35,
                53,
                0.15
              );
          transition:
            background 0.18s ease,
            box-shadow 0.18s ease,
            transform 0.14s ease;
        }

        .submit:hover {
          background: #af1f2f;
          box-shadow:
            0 8px 18px
              rgba(
                201,
                35,
                53,
                0.2
              );
        }

        .submit:active {
          transform:
            scale(0.985);
        }

        .submit:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        .switch {
          margin-top: 17px;
          color: #78879b;
          font-size: 10px;
          text-align: center;
        }

        .switch button {
          padding: 0;
          border: 0;
          background: none;
          color: #1455a0;
          font-weight: 800;
          cursor: pointer;
        }

        .switch button:hover {
          color: #c92335;
        }

        .footer-note {
          padding: 13px 20px;
          border-top: 1px solid
            #edf2f6;
          color: #97a3b2;
          font-size: 8px;
          text-align: center;
        }

        .footer-note strong {
          color: #1455a0;
          font-weight: 800;
        }

        @media (max-width: 480px) {
          .login-page {
            padding:
              24px 14px;
          }

          .auth-card {
            width: 100%;
          }

          .card-header {
            padding:
              24px 20px
              21px;
          }

          .card-body {
            padding: 21px;
          }

          .brand {
            font-size: 26px;
          }
        }
      `}</style>

      <main className="login-page">
        <div className="top-accent">
          <div className="top-accent-blue" />
          <div className="top-accent-red" />
        </div>

        <div className="bg-shape bg-shape-blue" />
        <div className="bg-shape bg-shape-red" />
        <div className="bg-shape bg-shape-blue-bottom" />

        <section
          className={`auth-card ${
            switching
              ? "switching"
              : ""
          }`}
        >
          <header className="card-header">
            <div className="brand">
              CRL-
              <span>App</span>
            </div>

            <div className="brand-line" />
          </header>

          <div className="card-body">
            <h1 className="title">
              {mode === "login"
                ? "Welcome Back"
                : "Create Account"}
            </h1>

            <p className="subtitle">
              {mode === "login"
                ? "Sign in to continue to your account."
                : "Register using an Admin Invite Code."}
            </p>

            {error ? (
              <div className="message message-error">
                {error}
              </div>
            ) : null}

            {success ? (
              <div
                className="message message-success"
                style={{
                  marginTop:
                    error
                      ? 9
                      : 0,
                }}
              >
                {success}
              </div>
            ) : null}

            <form
              className="form"
              style={{
                marginTop:
                  error ||
                  success
                    ? 14
                    : 0,
              }}
              onSubmit={
                handleSubmit
              }
            >
              {mode ===
              "signup" ? (
                <>
                  <div className="field">
                    <label htmlFor="invite-code">
                      Admin Invite Code
                    </label>

                    <input
                      id="invite-code"
                      className="input"
                      type="text"
                      placeholder="Enter admin invite code"
                      value={
                        inviteCode
                      }
                      onChange={(
                        event
                      ) =>
                        setInviteCode(
                          event
                            .target
                            .value
                            .toUpperCase()
                        )
                      }
                      autoComplete="off"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="full-name">
                      Full Name
                    </label>

                    <input
                      id="full-name"
                      className="input"
                      type="text"
                      placeholder="Enter your full name"
                      value={
                        fullName
                      }
                      onChange={(
                        event
                      ) =>
                        setFullName(
                          event
                            .target
                            .value
                        )
                      }
                      autoComplete="name"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="section">
                      Section
                    </label>

                    <input
                      id="section"
                      className="input"
                      type="text"
                      placeholder="Enter your section"
                      value={
                        section
                      }
                      onChange={(
                        event
                      ) =>
                        setSection(
                          event
                            .target
                            .value
                        )
                      }
                    />
                  </div>
                </>
              ) : null}

              <div className="field">
                <label htmlFor="username">
                  Username
                </label>

                <input
                  id="username"
                  className="input"
                  type="text"
                  placeholder="Enter your username"
                  value={
                    username
                  }
                  onChange={(
                    event
                  ) =>
                    setUsername(
                      event
                        .target
                        .value
                    )
                  }
                  autoComplete="username"
                />
              </div>

              <div className="field">
                <label htmlFor="password">
                  Password
                </label>

                <div className="input-wrap">
                  <input
                    id="password"
                    className="input password-input"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="Enter your password"
                    value={
                      password
                    }
                    onChange={(
                      event
                    ) =>
                      setPassword(
                        event
                          .target
                          .value
                      )
                    }
                    autoComplete={
                      mode ===
                      "login"
                        ? "current-password"
                        : "new-password"
                    }
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    onClick={() =>
                      setShowPassword(
                        (
                          current
                        ) =>
                          !current
                      )
                    }
                  >
                    {showPassword ? (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                        <circle
                          cx="12"
                          cy="12"
                          r="3"
                        />
                      </svg>
                    ) : (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                        <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-3.1 4.2" />
                        <path d="M6.1 6.1C3.6 8.1 2 12 2 12s3.5 8 10 8a10.7 10.7 0 0 0 3.7-.7" />
                      </svg>
                    )}
                  </button>
                </div>

                {mode ===
                "signup" ? (
                  <div className="helper">
                    Minimum 6 characters
                  </div>
                ) : null}
              </div>

              <button
                type="submit"
                className="submit"
                disabled={
                  loading
                }
              >
                {loading
                  ? mode ===
                    "login"
                    ? "Signing In..."
                    : "Creating Account..."
                  : mode ===
                      "login"
                    ? "Sign In"
                    : "Create Account"}
              </button>
            </form>

            <div className="switch">
              {mode === "login" ? (
                <>
                  Don’t have an account?{" "}
                  <button
                    type="button"
                    onClick={() =>
                      switchMode(
                        "signup"
                      )
                    }
                  >
                    Sign Up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() =>
                      switchMode(
                        "login"
                      )
                    }
                  >
                    Sign In
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="footer-note">
            <strong>
              CRL-App
            </strong>{" "}
            • Comprehensive Rapid Literacy Assessment
          </div>
        </section>
      </main>
    </>
  );
}