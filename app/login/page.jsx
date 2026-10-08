"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import LoginSlideshow from "./LoginSlideshow";
import styles from "./login.module.css";
import { getRegistrationPasswordChecks, getRegistrationPasswordError } from "../../lib/registrationPassword.mjs";
import { useRouter } from "next/navigation";
import { rememberOfflineCredential, verifyOfflineCredential } from "../../lib/offlineAuth";
import {
  activateOfflineTeacherSession,
  getOfflineTeacherSession,
} from "../../lib/teacherOfflineDb";

export default function LoginPage() {
  const router = useRouter();
  const authPanelRef = useRef(null);

  const [mode, setMode] =
    useState("login");

  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordChecks = getRegistrationPasswordChecks(password);
  const passwordScore = passwordChecks.filter(check => check.met).length;
  const passwordStrength = !password ? "Not entered" : ["Weak", "Weak", "Fair", "Good", "Strong"][passwordScore];

  const [inviteCode, setInviteCode] =
    useState("");

  const [fullName, setFullName] =
    useState("");

  const [section, setSection] =
    useState("");

  const [schoolId, setSchoolId] =
    useState("");

  const [schoolName, setSchoolName] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  useEffect(() => {
    authPanelRef.current?.scrollTo({ top: 0 });
  }, [mode, error]);

  const [loading, setLoading] =
    useState(false);

  const [redirecting, setRedirecting] =
    useState(false);

  /*
   * Hold the form back until the session probe finishes. Without this the
   * sign-in form flashes before an already-authenticated teacher is redirected
   * to the dashboard, which reads as "the login page keeps coming back".
   */
  const [checkingSession, setCheckingSession] =
    useState(true);

  useEffect(() => {
    const surfaces = [document.documentElement, document.body];
    const previous = surfaces.map(element => element.style.overflow);
    surfaces.forEach(element => { element.style.overflow = "hidden"; });
    return () => surfaces.forEach((element, index) => { element.style.overflow = previous[index]; });
  }, []);

  /*
   * If an authenticated teacher opens
   * /login, send them to the dashboard.
   */
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      let redirectingAway = false;

      try {
        // Logout is authoritative even if the network request that clears the
        // HttpOnly cookie was interrupted. Do not let a stale server cookie
        // bounce the teacher straight back into the dashboard.
        const offlineSession = await getOfflineTeacherSession().catch(() => null);
        if (offlineSession?.signedOut) return;

        /*
         * Bound the probe: if the request hangs the form must still appear, so
         * an offline teacher is never left staring at a hidden form.
         */
        const controller =
          typeof AbortController !== "undefined"
            ? new AbortController()
            : null;
        const probeTimeout = controller
          ? window.setTimeout(() => controller.abort(), 4000)
          : null;

        let response;
        try {
          response = await fetch(
            "/api/auth?action=verify",
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
              headers: {
                Accept:
                  "application/json",
              },
              ...(controller ? { signal: controller.signal } : {}),
            }
          );
        } finally {
          if (probeTimeout) window.clearTimeout(probeTimeout);
        }

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
          const role = String(
            data.user.role || ""
          ).toLowerCase();

          /*
           * This page signs you into the teacher/learner app. An existing
           * administrator session is deliberately NOT forwarded to /admin:
           * doing so turned "Teacher login" into a one-click route into the
           * administrator console for anyone using a device where an admin
           * session was still open. Administrators reach the console through
           * /admin/login, which has its own separate session.
           */
          if (role === "admin") {
            redirectingAway = true;
            router.replace(
              "/teacher"
            );
          } else if (role === "teacher") {
            redirectingAway = true;
            router.replace(
              "/teacher"
            );
          } else if (role === "learner") {
            redirectingAway = true;
            router.replace(
              "/learner"
            );
          }
        }
      } catch {
        /*
         * Not being authenticated is
         * completely fine on this page.
         */
      } finally {
        /* Keep the form hidden while a redirect is in flight. */
        if (!cancelled && !redirectingAway) setCheckingSession(false);
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

  async function tryStoredOfflineLogin() {
    try {
      const offline = await verifyOfflineCredential(
        username.trim(),
        password
      );

      if (!offline?.valid || !offline.user) {
        return false;
      }

      const restoredSession = await activateOfflineTeacherSession();
      if (!restoredSession) {
        return false;
      }

      setSuccess("Offline mode enabled. Redirecting...");
      setRedirecting(true);
      window.setTimeout(() => {
        /*
         * This is the teacher/learner app, so administrators land in the app
         * too. Never here: the console has its own session and its own page.
         */
        window.location.replace("/teacher");
      }, 150);

      return true;
    } catch {
      return false;
    }
  }

  function switchMode(nextMode) {
    if (nextMode === mode || loading || redirecting) return;
    clearMessages();
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
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
          setError("Please enter your username and password.");
          return;
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
                action: "login",
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
          if (await tryStoredOfflineLogin()) return;

          setError(
            data.error ||
              "Unable to sign in."
          );
          return;
        }

        await rememberOfflineCredential(
          username.trim(),
          password,
          data.user
        );

        setSuccess(
          "Login successful. Redirecting..."
        );
        setRedirecting(true);

        /*
         * Hard navigation makes sure
         * the new authentication cookie
         * is recognized by the next page.
         */
        window.setTimeout(
          () => {
            /*
             * Signing in here creates the app session only. An administrator
             * therefore continues into the teacher app; the console is reached
             * separately at /admin/login.
             */
            window.location.replace(
              data.user?.role === "learner"
                ? "/learner"
                : "/teacher"
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
        !schoolId.trim() ||
        !schoolName.trim() ||
        !username.trim() ||
        !password
      ) {
        setError("Please complete all required fields.");
        return;
      }

      if (!/^\d{6}$/.test(schoolId.trim())) {
        setError("School ID must contain exactly 6 numbers.");
        return;
      }

      const passwordError = getRegistrationPasswordError(password, confirmPassword);
      if (passwordError) {
        setError(passwordError);
        return;
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
              action: "signup",
              invite_code:
                inviteCode
                  .trim()
                  .toUpperCase(),
              full_name:
                fullName.trim(),
              section:
                section.trim(),
              school_id:
                schoolId.trim(),
              school_name:
                schoolName.trim(),
              username:
                username
                  .trim()
                  .toLowerCase(),
              password,
              confirm_password: confirmPassword,
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
        setError(
          data.error ||
            "Unable to create your account."
        );
        return;
      }

      setSuccess(
        "Account created successfully. Redirecting..."
      );
      setRedirecting(true);

      window.setTimeout(
        () => {
          window.location.replace(
            data.user?.role === "learner"
              ? "/learner"
              : "/teacher"
          );
        },
        250
      );
    } catch (submitError) {
      if (mode === "login") {
        if (await tryStoredOfflineLogin()) return;
      }

      setError(
        submitError?.message ||
          "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }




  return (
    <div className={styles.root}>
      <main className={`login-page ${checkingSession ? "is-checking" : ""}`}>
        {checkingSession && (
          <div className="session-check" role="status" aria-live="polite">
            <span className="session-check-spinner" aria-hidden="true" />
            <span className="sr-only">Checking your session</span>
          </div>
        )}
        <section className="login-layout" aria-label="CRL-App authentication">
          <LoginSlideshow />

          <section className="auth-panel" ref={authPanelRef} aria-label="Sign in or create an account" tabIndex={0}>
            <div
              className="auth-card"
            >
              <header className="auth-header">
                <img className="auth-logo" src="/crl-app-logo.png" alt="CRL-App" width="1883" height="755" decoding="async" />

                <div className="auth-heading">
                  <h1>
                    {mode === "login" ? "Hello!" : "Create your account"}
                  </h1>
                  <p>
                    {mode === "login"
                      ? "Your reading assessment workspace."
                      : "Use your administrator’s invite code."}
                  </p>
                </div>
              </header>

              <div className="mode-switch" role="group" aria-label="Authentication mode">
                <button
                  type="button"
                  className={`mode-button ${mode === "login" ? "active" : ""}`}
                  onClick={() => switchMode("login")}
                  aria-pressed={mode === "login"} disabled={loading || redirecting}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`mode-button ${mode === "signup" ? "active" : ""}`}
                  onClick={() => switchMode("signup")}
                  aria-pressed={mode === "signup"} disabled={loading || redirecting}
                >
                  Sign Up
                </button>
              </div>

              <div className="form-scroll" inert={checkingSession || redirecting ? true : undefined}>
                <div className="form-body">
                  {error ? (
                    <div className="message message-error" role="alert">
                      <span className="message-icon" aria-hidden="true">!</span>
                      <span>{error}</span>
                    </div>
                  ) : null}

                  {success ? (
                    <div
                      className="message message-success"
                      role="status"
                      style={{ marginTop: error ? 9 : 0 }}
                    >
                      <span className="message-icon" aria-hidden="true">✓</span>
                      <span>{success}</span>
                    </div>
                  ) : null}

                  <form
                    className="form"
                    style={{ marginTop: error || success ? 13 : 0 }}
                    onSubmit={handleSubmit}
                    noValidate
                  >
                    {mode === "signup" ? (
                      <>
                        <div className="field">
                          <label htmlFor="invite-code">Admin Invite Code</label>
                          <input
                            id="invite-code"
                            className="input"
                            type="text"
                            placeholder="Enter admin invite code"
                            value={inviteCode}
                            onChange={(event) =>
                              setInviteCode(event.target.value.toUpperCase())
                            }
                            autoComplete="off"
                            inputMode="text"
                            spellCheck={false}
                          />
                        </div>

                        <div className="field-grid">
                          <div className="field">
                            <label htmlFor="full-name">Full Name</label>
                            <input
                              id="full-name"
                              className="input"
                              type="text"
                              placeholder="Full name"
                              value={fullName}
                              onChange={(event) => setFullName(event.target.value)}
                              autoComplete="name"
                            />
                          </div>

                          <div className="field">
                            <label htmlFor="section">Section</label>
                            <input
                              id="section"
                              className="input"
                              type="text"
                              placeholder="Section"
                              value={section}
                              onChange={(event) => setSection(event.target.value)}
                              autoComplete="organization"
                            />
                          </div>
                        </div>

                        <div className="field-grid">
                          <div className="field">
                            <label htmlFor="school-id">School ID</label>
                            <input
                              id="school-id"
                              className="input"
                              type="text"
                              placeholder="6-digit School ID"
                              value={schoolId}
                              onChange={(event) =>
                                setSchoolId(
                                  event.target.value.replace(/\D/g, "").slice(0, 6)
                                )
                              }
                              inputMode="numeric"
                              autoComplete="off"
                              maxLength={6}
                              pattern="[0-9]{6}"
                            />
                          </div>

                          <div className="field">
                            <label htmlFor="school-name">School Name</label>
                            <input
                              id="school-name"
                              className="input"
                              type="text"
                              placeholder="School name"
                              value={schoolName}
                              onChange={(event) => setSchoolName(event.target.value)}
                              autoComplete="organization"
                              maxLength={150}
                            />
                          </div>
                        </div>
                      </>
                    ) : null}

                    <div className="field">
                      <label htmlFor="username">Username</label>
                      <input
                        id="username"
                        className="input"
                        type="text"
                        placeholder="Enter your username"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="password">Password</label>
                      <div className="input-wrap">
                        <input
                          id="password"
                          className="input password-input"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          aria-describedby={mode === "signup" ? "password-rules" : undefined}
                          minLength={mode === "signup" ? 12 : undefined}
                          autoComplete={
                            mode === "login" ? "current-password" : "new-password"
                          }
                        />
                        <button
                          type="button"
                          className="password-toggle"
                          onClick={() => setShowPassword((current) => !current)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
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
                              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          ) : (
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
                              <path d="M3 3l18 18" />
                              <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                              <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-3.1 4.2" />
                              <path d="M6.1 6.1C3.6 8.1 2 12 2 12s3.5 8 10 8a10.7 10.7 0 0 0 3.7-.7" />
                            </svg>
                          )}
                        </button>
                      </div>
                      {mode === "signup" ? (
                        <div className="password-feedback">
                          <div className="password-strength-label" role="status">Password strength: {passwordStrength}</div>
                          <div className={`password-meter score-${passwordScore}`} role="meter" aria-label="Password requirements met" aria-valuemin={0} aria-valuemax={4} aria-valuenow={passwordScore} aria-valuetext={`${passwordScore} of 4 requirements met`}>
                            {passwordChecks.map((check, index) => <span key={check.id} className={index < passwordScore ? "filled" : ""} />)}
                          </div>
                          <ul id="password-rules" className="password-rules">
                            {passwordChecks.map(check => <li key={check.id} className={check.met ? "met" : ""}><span aria-hidden="true">{check.met ? "✓" : "○"}</span><span className="sr-only">{check.met ? "Met: " : "Needed: "}</span>{check.label}</li>)}
                          </ul>
                        </div>
                      ) : null}
                    </div>

                    {mode === "signup" ? (
                      <div className="field">
                        <label htmlFor="confirm-password">Confirm Password</label>
                        <input id="confirm-password" className="input" type="password" placeholder="Re-enter your password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} aria-invalid={Boolean(confirmPassword && confirmPassword !== password)} aria-describedby={confirmPassword ? "password-match" : undefined} />
                        {confirmPassword ? <div id="password-match" className={`helper ${confirmPassword === password ? "password-match" : "password-mismatch"}`} role="status">{confirmPassword === password ? "Passwords match." : "Passwords do not match."}</div> : null}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      className="submit"
                      disabled={loading || redirecting}
                    >
                      <span className="submit-content">
                        {(loading || redirecting) && (
                          <span className="button-spinner" aria-hidden="true" />
                        )}
                        {redirecting
                          ? "Redirecting..."
                          : loading
                            ? mode === "login"
                              ? "Signing In..."
                              : "Creating Account..."
                            : mode === "login"
                              ? "Sign In"
                              : "Create Account"}
                      </span>
                    </button>
                  </form>

                </div>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
