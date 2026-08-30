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

  const [isSignupMode, setIsSignupMode] = useState(false);

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

  useEffect(() => {
    const verifySession = async () => {
      try {
        const response = await fetch(
          "/api/auth?action=verify",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (data?.valid) {
          router.replace("/teacher");
        }
      } catch {
        // Keep the login page visible if verification fails.
      }
    };

    verifySession();
  }, [router]);

  function switchToSignup() {
    setIsSignupMode(true);
    setLoginError("");
    setSignupError("");
    setLoginSuccess(false);
    setSignupSuccess(false);
  }

  function switchToLogin() {
    setIsSignupMode(false);
    setLoginError("");
    setSignupError("");
    setLoginSuccess(false);
    setSignupSuccess(false);
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
    const password = loginForm.password.trim();

    setLoginError("");
    setLoginSuccess(false);

    if (!username || !password) {
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

      if (!response.ok || data.status !== "success") {
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
            role: data.role || "teacher",
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
    const password = signupForm.password.trim();

    setSignupError("");
    setSignupSuccess(false);

    if (
      !invite ||
      !fullName ||
      !section ||
      !username ||
      !password
    ) {
      setSignupError("All fields are required.");
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
      const validationResponse = await fetch(
        "/api/auth",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "validate_invite",
            invite_code: invite,
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
          "Content-Type": "application/json",
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

      setTimeout(() => {
        setIsSignupMode(false);

        setLoginForm({
          username,
          password: "",
        });

        setSignupSuccess(false);
        setLoginSuccess(true);
        setLoginError(
          "Account created successfully. Please log in."
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
          font-family: Arial, Helvetica, sans-serif;
          background: #f5f7fb;
          color: #1e293b;
        }

        button,
        input {
          font: inherit;
        }

        .page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
          background:
            linear-gradient(
              135deg,
              #f8fafc 0%,
              #ffffff 50%,
              #f1f5f9 100%
            );
        }

        .top-line {
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
          z-index: 10;
        }

        .bottom-accent {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 5px;
          background: linear-gradient(
            90deg,
            #ce1126 0%,
            #ce1126 50%,
            #0b4ea2 50%,
            #0b4ea2 100%
          );
          z-index: 10;
        }

        .card {
          width: 100%;
          max-width: 430px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          box-shadow:
            0 12px 35px
              rgba(15, 23, 42, 0.12);
          overflow: hidden;
        }

        .header {
          text-align: center;
          padding: 32px 28px 24px;
          border-bottom: 1px solid #edf1f5;
        }

        .logo {
          width: 66px;
          height: 66px;
          margin: 0 auto 14px;
          border-radius: 50%;
          background: #0b4ea2;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.5px;
          border: 4px solid #ce1126;
        }

        .brand {
          font-size: 1.8rem;
          font-weight: 800;
          color: #0b4ea2;
          line-height: 1.1;
        }

        .brand span {
          color: #ce1126;
        }

        .subtitle {
          margin-top: 7px;
          font-size: 0.82rem;
          color: #64748b;
          line-height: 1.5;
        }

        .content {
          padding: 28px;
        }

        .form {
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .title {
          text-align: center;
          margin-bottom: 22px;
        }

        .title h2 {
          font-size: 1.35rem;
          color: #0f172a;
          margin-bottom: 6px;
        }

        .title p {
          font-size: 0.86rem;
          color: #64748b;
        }

        .message {
          border-radius: 9px;
          padding: 11px 13px;
          margin-bottom: 16px;
          font-size: 0.83rem;
          line-height: 1.45;
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
          margin-bottom: 16px;
        }

        .group label {
          display: block;
          margin-bottom: 7px;
          font-size: 0.82rem;
          font-weight: 700;
          color: #334155;
        }

        .required {
          color: #ce1126;
        }

        .input {
          width: 100%;
          height: 46px;
          padding: 0 14px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: #ffffff;
          color: #0f172a;
          outline: none;
          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease;
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
                0.12
              );
        }

        .hint {
          margin-top: 5px;
          color: #94a3b8;
          font-size: 0.72rem;
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
            opacity 0.15s ease;
        }

        .button:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .button:active:not(:disabled) {
          transform: translateY(0);
        }

        .button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .button.login {
          background: #ce1126;
        }

        .button.signup {
          background: #0b4ea2;
        }

        .button.login:hover:not(
            :disabled
          ) {
          background: #b20f21;
        }

        .button.signup:hover:not(
            :disabled
          ) {
          background: #093f83;
        }

        .toggle {
          margin-top: 22px;
          text-align: center;
          font-size: 0.84rem;
          color: #64748b;
        }

        .toggle button {
          border: none;
          background: none;
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

        .footer {
          border-top: 1px solid #edf1f5;
          padding: 15px 20px;
          text-align: center;
          color: #94a3b8;
          font-size: 0.7rem;
        }

        .loading {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid
            rgba(255, 255, 255, 0.35);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
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
            padding: 26px 20px 20px;
          }

          .content {
            padding: 22px 20px;
          }

          .brand {
            font-size: 1.55rem;
          }
        }
      `}</style>

      <main className="page">
        <div className="top-line" />
        <div className="bottom-accent" />

        <section className="card">
          <header className="header">
            <div className="logo">DepEd</div>

            <div className="brand">
              CRL-
              <span>App</span>
            </div>

            <p className="subtitle">
              Comprehensive Rapid Literacy Assessment
            </p>
          </header>

          <div className="content">
            {!isSignupMode ? (
              <div className="form">
                <div className="title">
                  <h2>Welcome Back</h2>
                  <p>
                    Sign in to continue to your
                    account
                  </p>
                </div>

                {loginError && (
                  <div
                    className={`message ${
                      loginSuccess
                        ? "success"
                        : "error"
                    }`}
                  >
                    {loginError}
                  </div>
                )}

                <form onSubmit={handleLogin}>
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

                    <input
                      id="loginPassword"
                      className="input"
                      type="password"
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
                  </div>

                  <button
                    type="submit"
                    className="button login"
                    disabled={isLoggingIn}
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
                  Don't have an account?
                  <button
                    type="button"
                    className="red"
                    onClick={switchToSignup}
                  >
                    Sign Up
                  </button>
                </div>
              </div>
            ) : (
              <div className="form">
                <div className="title">
                  <h2>Create Account</h2>
                  <p>
                    Register using an Admin
                    Invite Code
                  </p>
                </div>

                {signupError && (
                  <div className="message error">
                    {signupError}
                  </div>
                )}

                {signupSuccess && (
                  <div className="message success">
                    Account created successfully.
                    Please log in.
                  </div>
                )}

                <form
                  onSubmit={handleSignup}
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

                    <input
                      id="signupPassword"
                      className="input"
                      type="password"
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

                    <div className="hint">
                      Minimum 6 characters
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="button signup"
                    disabled={isSigningUp}
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
                  Already have an account?
                  <button
                    type="button"
                    className="blue"
                    onClick={switchToLogin}
                  >
                    Sign In
                  </button>
                </div>
              </div>
            )}
          </div>

          <footer className="footer">
            CRL-App • Comprehensive Rapid Literacy
            Assessment
          </footer>
        </section>
      </main>
    </>
  );
}
