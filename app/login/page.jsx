"use client";

import {
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { rememberOfflineCredential, verifyOfflineCredential } from "../../lib/offlineAuth";

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

  const [redirecting, setRedirecting] =
    useState(false);

  const [switching, setSwitching] =
    useState(false);

  const [switchDirection, setSwitchDirection] =
    useState("forward");

  const [switchPhase, setSwitchPhase] =
    useState("idle");

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
          const role = String(
            data.user.role || ""
          ).toLowerCase();

          if (role === "admin") {
            router.replace(
              "/admin"
            );
          } else if (role === "teacher") {
            router.replace(
              "/teacher"
            );
          } else if (role === "learner") {
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

    const direction =
      nextMode === "signup" ? "forward" : "backward";

    setSwitchDirection(direction);
    setSwitching(true);
    setSwitchPhase("exit");

    window.setTimeout(() => {
      setMode(nextMode);
      setPassword("");
      setShowPassword(false);
      setSwitchPhase("enter");

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setSwitchPhase("settle");
          window.setTimeout(() => {
            setSwitching(false);
          }, 420);
        });
      });
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
          throw new Error(
            data.error ||
              "Unable to sign in."
          );
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
            window.location.replace(
              data.user?.role === "admin"
                ? "/admin"
                : data.user?.role === "teacher"
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
              action: "signup",
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
            data.user?.role === "admin"
              ? "/admin"
              : "/teacher"
          );
        },
        250
      );
    } catch (submitError) {
      console.error(
        "Authentication error:",
        submitError
      );

      if (mode === "login") {
        try {
          const offline = await verifyOfflineCredential(
            username.trim(),
            password
          );

          if (offline?.valid && offline.user) {
            setSuccess("Offline mode enabled. Redirecting...");
            setRedirecting(true);
            window.setTimeout(() => {
              window.location.replace(
                offline.user.role === "admin"
                  ? "/admin"
                  : "/teacher"
              );
            }, 150);
            return;
          }
        } catch {
          /* Continue to the normal online error message. */
        }
      }

      setError(
        submitError.message ||
          "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }




  const [activeSlide, setActiveSlide] = useState(0);

  const slideData = [
    {
      image: "/login-slides/classroom-1.png",
      alt: "Filipino learners working together in a classroom",
    },
    {
      image: "/login-slides/classroom-2.png",
      alt: "Young Filipino learners completing reading activities",
    },
    {
      image: "/login-slides/classroom-3.png",
      alt: "Filipino learners participating in a classroom activity",
    },
  ];

  useEffect(() => {
    if (redirecting || slideData.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slideData.length);
    }, 5500);

    return () => window.clearInterval(timer);
  }, [redirecting, slideData.length]);

  function goToSlide(index) {
    setActiveSlide(index);
  }

  function handleImageError(event) {
    event.currentTarget.style.opacity = "0";
  }

  return (
    <>
      <style jsx global>{`
        :root {
          --login-blue-950: #072758;
          --login-blue-900: #0b3477;
          --login-blue-850: #0d438f;
          --login-blue-800: #1255aa;
          --login-blue-700: #1768c6;
          --login-blue-600: #2479db;
          --login-blue-100: #eaf3ff;
          --login-blue-050: #f5f9ff;
          --login-red-700: #b51f31;
          --login-red-600: #c92b3d;
          --login-red-500: #df4052;
          --login-red-100: #fff0f2;
          --login-ink: #14253d;
          --login-muted: #69798e;
          --login-soft: #eef4fb;
          --login-border: #d8e2ef;
          --login-white: #ffffff;
          --login-shadow: rgba(9, 43, 91, 0.14);
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          min-height: 100%;
          margin: 0;
          padding: 0;
        }

        body {
          background:
            radial-gradient(circle at 8% 16%, rgba(36, 121, 219, 0.09), transparent 23%),
            radial-gradient(circle at 94% 86%, rgba(201, 43, 61, 0.08), transparent 18%),
            linear-gradient(145deg, #f7faff 0%, #eef4fb 50%, #f8fbff 100%);
          color: var(--login-ink);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          overflow-x: hidden;
        }

        button,
        input {
          font: inherit;
        }

        .login-page {
          min-height: 100vh;
          min-height: 100svh;
          position: relative;
          display: grid;
          place-items: center;
          padding: 28px;
          overflow: hidden;
          isolation: isolate;
        }

        .page-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(2px);
          z-index: -1;
        }

        .page-glow-one {
          width: 420px;
          height: 420px;
          top: -220px;
          left: -180px;
          background: rgba(25, 104, 198, 0.09);
        }

        .page-glow-two {
          width: 360px;
          height: 360px;
          right: -180px;
          bottom: -170px;
          background: rgba(201, 43, 61, 0.07);
        }

        .page-line {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 4px;
          display: flex;
          z-index: 20;
        }

        .page-line-blue {
          flex: 1;
          background: linear-gradient(90deg, var(--login-blue-950), var(--login-blue-700));
        }

        .page-line-red {
          width: 16%;
          background: linear-gradient(90deg, var(--login-red-600), var(--login-red-500));
        }

        .login-shell {
          width: min(1180px, calc(100vw - 56px));
          height: 720px;
          min-height: 720px;
          max-height: 720px;
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 430px;
          overflow: hidden;
          border: 1px solid rgba(23, 104, 198, 0.15);
          border-radius: 30px;
          background: rgba(255, 255, 255, 0.94);
          box-shadow:
            0 34px 80px rgba(8, 42, 88, 0.13),
            0 8px 28px rgba(8, 42, 88, 0.07);
        }

        .visual-panel {
          min-width: 0;
          min-height: 0;
          position: relative;
          overflow: hidden;
          color: #fff;
          background:
            radial-gradient(circle at 78% 18%, rgba(255, 255, 255, 0.16), transparent 24%),
            linear-gradient(145deg, #082d64 0%, #0d4b9a 53%, #1a6bc4 100%);
        }

        .visual-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), transparent 22%);
          z-index: 1;
        }

        /* Keep the lower blue field clean. The photo edge itself handles the fade. */
        .visual-panel::after {
          display: none;
        }

        .visual-content {
          position: relative;
          z-index: 6;
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 42px 44px 36px;
        }

        .visual-brand {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          position: relative;
          z-index: 8;
        }

        .deped-logo-box {
          width: 86px;
          margin-left: -14px;
          height: 86px;
          display: grid;
          place-items: center;
          background: transparent;
          border: 0;
          box-shadow: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }

        .deped-logo {
          width: 76px;
          height: 76px;
          display: block;
          object-fit: contain;
          filter: drop-shadow(0 7px 16px rgba(3, 24, 58, 0.17));
        }

        .visual-copy {
          width: min(520px, 60%);
          margin-top: auto;
          padding-bottom: 12px;
          position: relative;
          z-index: 7;
        }

        .visual-kicker {
          margin: 0 0 12px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.78);
        }

        .visual-title {
          margin: 0;
          max-width: 530px;
          font-size: clamp(38px, 4.15vw, 56px);
          line-height: 0.98;
          letter-spacing: -0.055em;
          font-weight: 900;
          text-wrap: balance;
        }

        .visual-description {
          max-width: 485px;
          margin: 18px 0 0;
          color: rgba(255, 255, 255, 0.77);
          font-size: 14px;
          line-height: 1.75;
        }

                .photo-stage {
          position: absolute;
          top: -3.5%;
          right: -5.5%;
          width: 91%;
          aspect-ratio: 4 / 3;
          z-index: 4;
          pointer-events: none;
          overflow: visible;
        }

        .photo-slide {
          position: absolute;
          top: 0;
          right: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          transform: translate3d(10px, -2px, 0) scale(1.015);
          transition: opacity 0.7s ease, transform 0.7s ease;
          background: transparent;
          overflow: visible;
        }

        .photo-slide.active {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }

        /*
         * The supplied PNGs already contain the exact curved silhouette.
         * Keep that silhouette untouched and place a slightly enlarged,
         * strong blurred copy underneath it. This makes the blur follow the
         * real curve and feather both outward into the blue panel and inward
         * beneath the image edge, eliminating the visible halo/line.
         */
        .photo-slide::before {
          content: "";
          position: absolute;
          inset: -3.2%;
          background-image: var(--slide-image);
          background-repeat: no-repeat;
          background-position: top right;
          background-size: contain;
          pointer-events: none;
          opacity: 0.82;
          filter: blur(22px) brightness(1.10) saturate(0.72);
          transform: scale(1.022);
          z-index: 1;
        }

        .photo-slide::after {
          content: "";
          position: absolute;
          inset: -1.6%;
          background: linear-gradient(180deg, rgba(8, 45, 100, 0.04), rgba(8, 45, 100, 0.16));
          -webkit-mask-image: var(--slide-image);
          mask-image: var(--slide-image);
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: top right;
          mask-position: top right;
          -webkit-mask-size: contain;
          mask-size: contain;
          pointer-events: none;
          opacity: 0.12;
          filter: blur(7px);
          z-index: 2;
        }

        .photo-slide img {
          position: relative;
          z-index: 3;
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
          object-position: top right;
          filter: brightness(0.98) saturate(0.84) contrast(0.98);
        }

        .slide-controls {
          position: absolute;
          right: 42px;
          bottom: 34px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          z-index: 8;
        }

        .slide-dot {
          width: 22px;
          height: 6px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.34);
          cursor: pointer;
          transition: width 0.25s ease, background 0.25s ease, transform 0.2s ease;
        }

        .slide-dot:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.62);
        }

        .slide-dot.active {
          width: 42px;
          background: #fff;
        }

        .auth-panel {
          min-width: 0;
          min-height: 0;
          position: relative;
          display: flex;
          align-items: stretch;
          justify-content: center;
          padding: 26px 28px 26px 24px;
          background: #fff;
        }

        .auth-card {
          width: 100%;
          height: 668px;
          min-height: 668px;
          max-height: 668px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 0;
          border-radius: 0;
          background: #fff;
          box-shadow: none;
          transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.42s ease;
          will-change: transform, opacity;
        }

        .auth-card.switching.forward.exit {
          opacity: 0;
          transform: translate3d(-34px, 0, 0);
        }

        .auth-card.switching.forward.enter {
          opacity: 0;
          transform: translate3d(34px, 0, 0);
          transition: none;
        }

        .auth-card.switching.forward.settle {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }

        .auth-card.switching.backward.exit {
          opacity: 0;
          transform: translate3d(34px, 0, 0);
        }

        .auth-card.switching.backward.enter {
          opacity: 0;
          transform: translate3d(-34px, 0, 0);
          transition: none;
        }

        .auth-card.switching.backward.settle {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }

        .auth-header {
          padding: 26px 28px 20px;
          border-bottom: 1px solid #edf2f7;
          flex: 0 0 auto;
        }

        .auth-brand-row {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 14px;
        }

        .auth-brand {
          display: inline-flex;
          align-items: baseline;
          color: var(--login-blue-800);
          font-size: 23px;
          font-weight: 950;
          letter-spacing: -0.045em;
        }

        .auth-brand span {
          color: var(--login-red-600);
        }

                .auth-heading {
          margin-top: 20px;
        }

        .auth-heading h1 {
          margin: 0;
          color: var(--login-ink);
          font-size: 27px;
          line-height: 1.06;
          letter-spacing: -0.04em;
          font-weight: 900;
        }

        .auth-heading p {
          margin: 8px 0 0;
          max-width: 340px;
          color: var(--login-muted);
          font-size: 11px;
          line-height: 1.6;
        }

        .mode-switch {
          margin: 20px 26px 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          padding: 4px;
          border-radius: 11px;
          background: #f1f5fa;
        }

        .mode-button {
          min-height: 38px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #6e7e93;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.16s ease;
        }

        .mode-button:hover {
          color: var(--login-blue-800);
        }

        .mode-button:active {
          transform: scale(0.985);
        }

        .mode-button.active {
          background: #fff;
          color: var(--login-blue-800);
          box-shadow: 0 4px 12px rgba(15, 69, 137, 0.08);
        }

        .form-scroll {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: #cdd8e6 transparent;
        }

        .form-scroll::-webkit-scrollbar {
          width: 6px;
        }

        .form-scroll::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: #cdd8e6;
        }

        .form-body {
          padding: 20px 26px 24px;
        }

        .form {
          display: grid;
          gap: 13px;
        }

        .field-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .field {
          display: grid;
          gap: 6px;
        }

        .field label {
          color: #32465f;
          font-size: 10px;
          font-weight: 900;
        }

        .input-wrap {
          position: relative;
        }

        .input {
          width: 100%;
          min-height: 42px;
          padding: 0 11px;
          border: 1px solid #ccd8e6;
          border-radius: 9px;
          outline: none;
          background: #fff;
          color: var(--login-ink);
          font-size: 11px;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.15s ease;
        }

        .input::placeholder {
          color: #9aa8b8;
        }

        .input:hover {
          border-color: #b8c9dc;
        }

        .input:focus {
          border-color: var(--login-blue-600);
          box-shadow: 0 0 0 3px rgba(36, 121, 219, 0.09);
        }

        .password-input {
          padding-right: 42px;
        }

        .password-toggle {
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
          color: #7b8a9d;
          cursor: pointer;
          transition: color 0.18s ease, background 0.18s ease, transform 0.15s ease;
        }

        .password-toggle:hover {
          color: var(--login-blue-800);
          background: #f0f5fb;
        }

        .password-toggle:active {
          transform: translateY(-50%) scale(0.94);
        }

        .helper {
          color: #8795a8;
          font-size: 9px;
          line-height: 1.45;
        }

        .message {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 10px 11px;
          border-radius: 9px;
          font-size: 10px;
          line-height: 1.45;
          animation: messageIn 0.22s ease both;
        }

        .message-icon {
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 50%;
          font-size: 10px;
          font-weight: 900;
        }

        .message-error {
          background: var(--login-red-100);
          border: 1px solid #f1ccd2;
          color: #a52131;
        }

        .message-error .message-icon {
          background: #f9dfe3;
        }

        .message-success {
          background: #eef8f2;
          border: 1px solid #cbe5d3;
          color: #2d7245;
        }

        .message-success .message-icon {
          background: #d7efdf;
        }

        .submit {
          min-height: 45px;
          margin-top: 3px;
          border: 0;
          border-radius: 9px;
          background: linear-gradient(135deg, var(--login-blue-800), var(--login-blue-600));
          color: #fff;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 8px 18px rgba(18, 85, 170, 0.16);
          transition: transform 0.16s ease, box-shadow 0.18s ease, filter 0.18s ease;
        }

        .submit:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.03);
          box-shadow: 0 11px 22px rgba(18, 85, 170, 0.2);
        }

        .submit:active:not(:disabled) {
          transform: translateY(1px) scale(0.992);
        }

        .submit:disabled {
          cursor: not-allowed;
          opacity: 0.72;
        }

        .submit-content {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .button-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.36);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.72s linear infinite;
        }

                .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes messageIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }

        @media (max-width: 1080px) {
          .login-shell {
            width: min(100%, 960px);
            grid-template-columns: minmax(0, 1fr) 390px;
          }

          .visual-content {
            padding: 36px 34px 30px;
          }

          .photo-stage {
            top: -5%;
            right: -10%;
            width: 101%;
            height: auto;
            aspect-ratio: 4 / 3;
          }

          .visual-copy {
            width: 58%;
          }
        }

        @media (max-width: 900px) {
          .login-page {
            padding: 20px;
          }

          .login-shell {
            width: min(680px, 100%);
            height: auto;
            min-height: 0;
            max-height: none;
            display: block;
          }

          .visual-panel {
            height: 360px;
          }

          .visual-content {
            padding: 28px;
          }

          .photo-stage {
            top: -4%;
            right: -12%;
            width: 105%;
            height: auto;
            aspect-ratio: 4 / 3;
          }

          .visual-copy {
            width: 52%;
            padding-bottom: 0;
          }

          .visual-title {
            font-size: 36px;
          }

          .auth-panel {
            padding: 20px;
          }


          .auth-card {
            height: 668px;
            min-height: 668px;
            max-height: 668px;
          }
        }

        @media (max-width: 600px) {
          .login-page {
            padding: 12px;
            align-items: start;
          }

          .login-shell {
            width: 100%;
            border-radius: 0;
          }

          .visual-panel {
            height: 295px;
          }

          .visual-content {
            padding: 22px;
          }

          .deped-logo-box {
            width: 78px;
            height: 78px;
          }

          .deped-logo {
            width: 68px;
            height: 68px;
          }

          .photo-stage {
            top: -4%;
            right: -10%;
            width: 104%;
            height: auto;
            aspect-ratio: 4 / 3;
          }

          .visual-copy {
            width: 60%;
          }

          .visual-kicker {
            font-size: 9px;
            letter-spacing: 0.11em;
          }

          .visual-title {
            font-size: 27px;
          }

          .visual-description {
            margin-top: 11px;
            font-size: 10px;
            line-height: 1.55;
          }

                    .slide-controls {
            right: 22px;
            bottom: 20px;
            z-index: 9;
          }

          .auth-panel {
            padding: 12px;
          }

          .auth-card {
            height: 650px;
            min-height: 650px;
            max-height: 650px;
            border-radius: 0;
          }

          .auth-header {
            padding: 22px 20px 16px;
          }

          .auth-heading h1 {
            font-size: 24px;
          }

          .mode-switch {
            margin: 16px 20px 0;
          }

          .form-body {
            padding: 18px 20px 20px;
          }
        }

        @media (max-width: 420px) {
          .visual-panel {
            height: 275px;
          }

          .photo-stage {
            top: -2%;
            right: -5%;
            width: 95%;
            height: auto;
            aspect-ratio: 4 / 3;
          }

          .visual-copy {
            width: 70%;
          }

          .visual-title {
            font-size: 24px;
          }

          .visual-description {
            max-width: 215px;
          }

          .field-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <main className="login-page">
        <div className="page-glow page-glow-one" aria-hidden="true" />
        <div className="page-glow page-glow-two" aria-hidden="true" />
        <div className="page-line" aria-hidden="true">
          <div className="page-line-blue" />
          <div className="page-line-red" />
        </div>

        <section className="login-shell" aria-label="CRL-App authentication">
          <aside className="visual-panel">
            <div className="visual-content">
              <div className="visual-brand" aria-label="Department of Education">
                <div className="deped-logo-box">
                  <img
                    className="deped-logo"
                    src="/deped-logo.png"
                    alt="Department of Education seal"
                  />
                </div>
              </div>

              <div className="photo-stage" aria-label="Classroom slideshow">
                {slideData.map((slide, index) => (
                  <div
                    key={slide.image}
                    className={`photo-slide ${index === activeSlide ? "active" : ""}`}
                    style={{ "--slide-image": `url(${slide.image})` }}
                    aria-hidden={index !== activeSlide}
                  >
                    <img
                      src={slide.image}
                      alt={slide.alt}
                      onError={handleImageError}
                    />
                  </div>
                ))}
              </div>

              <div className="visual-copy">
                <p className="visual-kicker">Reading assessment, made clear</p>
                <h2 className="visual-title">
                  Helping every learner take the next step.
                </h2>
                <p className="visual-description">
                  A focused digital workspace for teacher-led literacy assessment,
                  designed around the reading journey of every child.
                </p>

              </div>

              <div className="slide-controls" aria-label="Choose classroom photo">
                {slideData.map((slide, index) => (
                  <button
                    key={`dot-${slide.image}`}
                    type="button"
                    className={`slide-dot ${index === activeSlide ? "active" : ""}`}
                    onClick={() => goToSlide(index)}
                    aria-label={`Show classroom photo ${index + 1}`}
                    aria-pressed={index === activeSlide}
                  />
                ))}
              </div>
            </div>
          </aside>

          <section className="auth-panel">
            <div
              className={`auth-card ${switching ? `switching ${switchDirection} ${switchPhase}` : ""}`}
              aria-live="polite"
            >
              <header className="auth-header">
                <div className="auth-brand-row">
                  <div className="auth-brand">
                    CRL-<span>App</span>
                  </div>
                </div>

                <div className="auth-heading">
                  <h1>
                    {mode === "login" ? "Welcome back" : "Create your account"}
                  </h1>
                  <p>
                    {mode === "login"
                      ? "Sign in to continue to your assessment workspace."
                      : "Register with your administrator invite code to begin."}
                  </p>
                </div>
              </header>

              <div className="mode-switch" role="tablist" aria-label="Authentication mode">
                <button
                  type="button"
                  role="tab"
                  className={`mode-button ${mode === "login" ? "active" : ""}`}
                  onClick={() => switchMode("login")}
                  aria-selected={mode === "login"}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`mode-button ${mode === "signup" ? "active" : ""}`}
                  onClick={() => switchMode("signup")}
                  aria-selected={mode === "signup"}
                >
                  Sign Up
                </button>
              </div>

              <div className="form-scroll">
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
                          <div className="helper">
                            Your invite code authorizes teacher registration.
                          </div>
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
                        <div className="helper">Minimum 6 characters.</div>
                      ) : null}
                    </div>

                    <button
                      type="submit"
                      className="submit"
                      disabled={loading}
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
    </>
  );
}
