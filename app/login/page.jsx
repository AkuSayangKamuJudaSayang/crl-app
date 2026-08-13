"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";

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

  const canvasRef = useRef(null);

  const sliderContainerRef =
    useRef(null);

  const [
    isSignupMode,
    setIsSignupMode,
  ] = useState(false);

  const [
    loginForm,
    setLoginForm,
  ] = useState(initialLogin);

  const [
    signupForm,
    setSignupForm,
  ] = useState(initialSignup);

  const [
    loginError,
    setLoginError,
  ] = useState("");

  const [
    signupError,
    setSignupError,
  ] = useState("");

  const [
    loginSuccess,
    setLoginSuccess,
  ] = useState(false);

  const [
    signupSuccess,
    setSignupSuccess,
  ] = useState(false);

  const [
    isLoggingIn,
    setIsLoggingIn,
  ] = useState(false);

  const [
    isSigningUp,
    setIsSigningUp,
  ] = useState(false);

  const speedBoostRef =
    useRef(1);

  const targetZRef =
    useRef(500);

  const isMountedRef =
    useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    let animationFrame = null;

    let renderer = null;

    const scene =
      new THREE.Scene();

    const camera =
      new THREE.PerspectiveCamera(
        60,
        window.innerWidth /
          window.innerHeight,
        1,
        2000
      );

    camera.position.z = 500;

    try {
      renderer =
        new THREE.WebGLRenderer(
          {
            canvas,
            alpha: true,
            antialias: true,
          }
        );
    } catch (error) {
      console.error(
        "Unable to initialize Three.js:",
        error
      );

      return undefined;
    }

    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );

    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        1.5
      )
    );

    const particleCount = 600;

    const particleGeometry =
      new THREE.BufferGeometry();

    const particlePositions =
      new Float32Array(
        particleCount * 3
      );

    const particleColors =
      new Float32Array(
        particleCount * 3
      );

    const particleSizes =
      new Float32Array(
        particleCount
      );

    for (
      let i = 0;
      i < particleCount;
      i += 1
    ) {
      particlePositions[
        i * 3
      ] =
        (Math.random() - 0.5) *
        1400;

      particlePositions[
        i * 3 + 1
      ] =
        (Math.random() - 0.5) *
        900;

      particlePositions[
        i * 3 + 2
      ] =
        (Math.random() - 0.5) *
        900;

      const hue =
        0.7 +
        Math.random() *
          0.2;

      const color =
        new THREE.Color().setHSL(
          hue,
          0.8,
          0.5 +
            Math.random() *
              0.3
        );

      particleColors[
        i * 3
      ] = color.r;

      particleColors[
        i * 3 + 1
      ] = color.g;

      particleColors[
        i * 3 + 2
      ] = color.b;

      particleSizes[i] =
        1.5 +
        Math.random() * 3;
    }

    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        particlePositions,
        3
      )
    );

    particleGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(
        particleColors,
        3
      )
    );

    particleGeometry.setAttribute(
      "size",
      new THREE.BufferAttribute(
        particleSizes,
        1
      )
    );

    const particleMaterial =
      new THREE.PointsMaterial({
        size: 3,
        vertexColors: true,
        transparent: true,
        opacity: 0.7,
        blending:
          THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });

    const particles =
      new THREE.Points(
        particleGeometry,
        particleMaterial
      );

    scene.add(particles);

    const orbGroup =
      new THREE.Group();

    for (
      let i = 0;
      i < 8;
      i += 1
    ) {
      const radius =
        30 +
        Math.random() * 60;

      const sphereGeometry =
        new THREE.SphereGeometry(
          radius,
          20,
          20
        );

      const sphereMaterial =
        new THREE.MeshBasicMaterial(
          {
            color:
              new THREE.Color().setHSL(
                0.7 +
                  Math.random() *
                    0.2,
                0.7,
                0.25 +
                  Math.random() *
                    0.1
              ),
            transparent: true,
            opacity:
              0.05 +
              Math.random() *
                0.05,
            wireframe: false,
          }
        );

      const mesh =
        new THREE.Mesh(
          sphereGeometry,
          sphereMaterial
        );

      mesh.position.set(
        (Math.random() - 0.5) *
          1000,
        (Math.random() - 0.5) *
          700,
        (Math.random() - 0.5) *
            500 -
          100
      );

      orbGroup.add(mesh);
    }

    scene.add(orbGroup);

    let time = 0;

    const animate = () => {
      animationFrame =
        window.requestAnimationFrame(
          animate
        );

      speedBoostRef.current +=
        (1 -
          speedBoostRef.current) *
        0.05;

      camera.position.z +=
        (targetZRef.current -
          camera.position.z) *
        0.05;

      time +=
        0.001 *
        speedBoostRef.current;

      particles.rotation.y =
        time * 0.025;

      particles.rotation.x =
        Math.sin(
          time * 0.008
        ) * 0.015;

      orbGroup.rotation.y =
        time * 0.008;

      orbGroup.rotation.x =
        Math.sin(
          time * 0.004
        ) * 0.015;

      renderer.render(
        scene,
        camera
      );
    };

    animate();

    const handleResize =
      () => {
        if (!renderer) {
          return;
        }

        renderer.setSize(
          window.innerWidth,
          window.innerHeight
        );

        camera.aspect =
          window.innerWidth /
          window.innerHeight;

        camera.updateProjectionMatrix();
      };

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(
          animationFrame
        );
      }

      window.removeEventListener(
        "resize",
        handleResize
      );

      particleGeometry.dispose();

      particleMaterial.dispose();

      orbGroup.children.forEach(
        (child) => {
          if (
            child instanceof
            THREE.Mesh
          ) {
            child.geometry.dispose();

            if (
              Array.isArray(
                child.material
              )
            ) {
              child.material.forEach(
                (material) =>
                  material.dispose()
              );
            } else {
              child.material.dispose();
            }
          }
        }
      );

      if (renderer) {
        renderer.dispose();
      }
    };
  }, []);

  useEffect(() => {
    const tokenExists =
      typeof window !== "undefined" &&
      document.cookie.includes(
        "crla_session="
      );

    if (!tokenExists) {
      return;
    }

    fetch(
      "/api/auth?action=verify",
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }
    )
      .then(
        async (response) => {
          if (!response.ok) {
            return null;
          }

          return response.json();
        }
      )
      .then((data) => {
        if (data?.valid) {
          router.replace(
            "/teacher"
          );
        }
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    const activeElement =
      isSignupMode
        ? document.getElementById(
            "signupSlide"
          )
        : document.getElementById(
            "loginSlide"
          );

    if (
      !activeElement ||
      !sliderContainerRef.current
    ) {
      return;
    }

    const updateHeight = () => {
      if (
        sliderContainerRef.current
      ) {
        sliderContainerRef.current.style.height =
          `${activeElement.scrollHeight}px`;
      }
    };

    const timeout =
      window.setTimeout(
        updateHeight,
        50
      );

    return () =>
      window.clearTimeout(
        timeout
      );
  }, [
    isSignupMode,
    loginError,
    signupError,
    signupSuccess,
    loginSuccess,
  ]);

  function switchToSignup() {
    setIsSignupMode(true);

    speedBoostRef.current = 25;

    targetZRef.current = 350;

    setLoginError("");
    setSignupError("");

    setLoginSuccess(false);
    setSignupSuccess(false);

    window.setTimeout(
      () => {
        document
          .getElementById(
            "signupInvite"
          )
          ?.focus();
      },
      400
    );
  }

  function switchToLogin() {
    setIsSignupMode(false);

    speedBoostRef.current =
      -25;

    targetZRef.current = 500;

    setLoginError("");
    setSignupError("");

    setLoginSuccess(false);
    setSignupSuccess(false);

    window.setTimeout(
      () => {
        document
          .getElementById(
            "loginUsername"
          )
          ?.focus();
      },
      400
    );
  }

  async function handleLogin(
    event
  ) {
    event?.preventDefault();

    const username =
      loginForm.username.trim();

    const password =
      loginForm.password.trim();

    if (!username || !password) {
      setLoginSuccess(false);

      setLoginError(
        "Please enter both username and password."
      );

      return;
    }

    setIsLoggingIn(true);

    setLoginError("");
    setLoginSuccess(false);

    try {
      const response =
        await fetch(
          "/api/auth",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              {
                action: "login",
                username,
                password,
              }
            ),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.status
      ) {
        setLoginError(
          data.error ||
            "Invalid credentials. Please try again."
        );

        return;
      }

      if (
        typeof window !==
        "undefined"
      ) {
        localStorage.setItem(
          "crla_user",
          JSON.stringify({
            username:
              data.username ||
              username,
            role:
              data.role ||
              "teacher",
            full_name:
              data.full_name ||
              "",
            section:
              data.section ||
              "",
          })
        );
      }

      router.replace(
        data.role ===
          "admin"
          ? "/teacher"
          : "/teacher"
      );
    } catch (error) {
      console.error(error);

      setLoginError(
        "Network error. Please check your connection."
      );
    } finally {
      if (
        isMountedRef.current
      ) {
        setIsLoggingIn(false);
      }
    }
  }

  async function handleSignup(
    event
  ) {
    event?.preventDefault();

    const invite =
      signupForm.invite.trim();

    const fullName =
      signupForm.fullName.trim();

    const section =
      signupForm.section.trim();

    const username =
      signupForm.username.trim();

    const password =
      signupForm.password.trim();

    if (
      !invite ||
      !fullName ||
      !section ||
      !username ||
      !password
    ) {
      setSignupSuccess(false);

      setSignupError(
        "All fields are required."
      );

      return;
    }

    if (password.length < 6) {
      setSignupSuccess(false);

      setSignupError(
        "Password must be at least 6 characters."
      );

      return;
    }

    setIsSigningUp(true);

    setSignupError("");
    setSignupSuccess(false);

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
            body: JSON.stringify(
              {
                action:
                  "validate_invite",
                invite_code:
                  invite,
              }
            ),
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

      const response =
        await fetch(
          "/api/auth",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              {
                action:
                  "signup",
                invite_code:
                  invite,
                full_name:
                  fullName,
                section,
                username,
                password,
              }
            ),
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data.status !==
          "success"
      ) {
        setSignupError(
          data.error ||
            "Signup failed. Please check your invite code."
        );

        return;
      }

      setSignupSuccess(true);

      setSignupForm({
        ...initialSignup,
      });

      window.setTimeout(
        () => {
          switchToLogin();

          setLoginForm({
            username,
            password: "",
          });

          setLoginSuccess(
            true
          );

          setLoginError(
            "Account created! Please log in."
          );
        },
        1500
      );
    } catch (error) {
      console.error(error);

      setSignupError(
        "Network error. Please check your connection."
      );
    } finally {
      if (
        isMountedRef.current
      ) {
        setIsSigningUp(false);
      }
    }
  }

  function updateLoginField(
    field,
    value
  ) {
    setLoginForm(
      (current) => ({
        ...current,
        [field]: value,
      })
    );
  }

  function updateSignupField(
    field,
    value
  ) {
    setSignupForm(
      (current) => ({
        ...current,
        [field]: value,
      })
    );
  }

  return (
    <>
      <style jsx global>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
        }

        html,
        body {
          height: 100%;
          overflow: hidden;
          font-family: "Outfit", sans-serif;
          background: #0a0a1a;
          color: #fff;
        }

        body {
          background: #0a0a1a;
        }

        button,
        input {
          font: inherit;
        }

        .auth-page {
          min-height: 100vh;
          overflow: hidden;
          background: #0a0a1a;
          color: #fff;
        }

        #bg-canvas {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
        }

        .auth-wrapper {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          padding: 20px;
        }

        .auth-card {
          background: rgba(
            20,
            20,
            40,
            0.85
          );
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );
          border-radius: 24px;
          padding: 0;
          width: 100%;
          max-width: 440px;
          box-shadow: 0 30px
            80px
            rgba(0, 0, 0, 0.6);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .brand {
          text-align: center;
          padding: 28px 28px 8px 28px;
        }

        .brand-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          background: linear-gradient(
            135deg,
            #6c5ce7,
            #00cec9
          );
          border-radius: 16px;
          font-size: 24px;
          font-weight: 800;
          color: #fff;
          box-shadow: 0 8px
            30px
            rgba(
              108,
              92,
              231,
              0.35
            );
          margin-bottom: 12px;
        }

        .brand h1 {
          font-size: 1.6rem;
          font-weight: 800;
          background: linear-gradient(
            135deg,
            #fff,
            #a29bfe
          );
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .brand-sub {
          font-size: 0.75rem;
          color: rgba(
            255,
            255,
            255,
            0.5
          );
          letter-spacing: 0.5px;
          margin-top: 2px;
        }

        .form-slider-container {
          width: 100%;
          overflow: hidden;
          position: relative;
          transition: height
            0.4s
            cubic-bezier(
              0.25,
              1,
              0.5,
              1
            );
        }

        .form-slider {
          display: flex;
          width: 200%;
          transition: transform
            0.5s
            cubic-bezier(
              0.34,
              1.56,
              0.64,
              1
            );
          align-items: flex-start;
        }

        .form-slider.shifted {
          transform: translateX(-50%);
        }

        .form-slide {
          width: 50%;
          padding: 10px 28px 35px 28px;
          box-sizing: border-box;
        }

        .form-slide h3 {
          font-size: 1.2rem;
          font-weight: 700;
          margin-bottom: 18px;
          text-align: center;
        }

        .form-slide h3 .icon {
          color: #6c5ce7;
          margin-right: 8px;
        }

        .form-group {
          margin-bottom: 14px;
        }

        .form-group label {
          display: block;
          font-size: 0.7rem;
          font-weight: 600;
          color: rgba(
            255,
            255,
            255,
            0.5
          );
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .form-group input {
          width: 100%;
          padding: 12px 14px;
          background: rgba(
            255,
            255,
            255,
            0.06
          );
          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );
          border-radius: 12px;
          color: #fff;
          font-family: "Outfit", sans-serif;
          font-size: 0.95rem;
          transition: all 0.25s ease;
          outline: none;
        }

        .form-group input:focus {
          border-color: #6c5ce7;
          box-shadow: 0 0 0 3px
            rgba(
              108,
              92,
              231,
              0.15
            );
          background: rgba(
            255,
            255,
            255,
            0.08
          );
        }

        .form-group input::placeholder {
          color: rgba(
            255,
            255,
            255,
            0.25
          );
        }

        .form-group .hint {
          font-size: 0.65rem;
          color: rgba(
            255,
            255,
            255,
            0.3
          );
          margin-top: 4px;
        }

        .btn-auth {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 12px;
          font-family: "Outfit", sans-serif;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .btn-auth.primary {
          background: linear-gradient(
            135deg,
            #6c5ce7,
            #4834d4
          );
          color: #fff;
          box-shadow: 0 4px
            20px
            rgba(
              108,
              92,
              231,
              0.3
            );
        }

        .btn-auth.success {
          background: linear-gradient(
            135deg,
            #00b894,
            #009f7a
          );
          color: #fff;
          box-shadow: 0 4px
            20px
            rgba(
              0,
              184,
              148,
              0.3
            );
        }

        .btn-auth:hover:not(
            :disabled
          ) {
          transform: translateY(
            -2px
          );
        }

        .btn-auth:active:not(
            :disabled
          ) {
          transform: scale(
            0.98
          );
        }

        .btn-auth:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .auth-toggle {
          text-align: center;
          margin-top: 16px;
          font-size: 0.85rem;
          color: rgba(
            255,
            255,
            255,
            0.5
          );
        }

        .auth-toggle button {
          background: none;
          border: none;
          color: #a29bfe;
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
        }

        .auth-toggle button:hover {
          color: #6c5ce7;
        }

        .message {
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 0.8rem;
          margin-bottom: 12px;
          animation: shake 0.4s ease;
        }

        .message.error {
          background: rgba(
            225,
            112,
            85,
            0.15
          );
          border: 1px solid
            rgba(
              225,
              112,
              85,
              0.3
            );
          color: #e17055;
        }

        .message.success {
          background: rgba(
            0,
            184,
            148,
            0.15
          );
          border: 1px solid
            rgba(
              0,
              184,
              148,
              0.3
            );
          color: #00b894;
        }

        .spinner {
          display: inline-block;
          width: 18px;
          height: 18px;
          border: 2px solid
            rgba(
              255,
              255,
              255,
              0.2
            );
          border-top: 2px solid
            #fff;
          border-radius: 50%;
          animation: spin
            0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(
              360deg
            );
          }
        }

        @keyframes shake {
          0%,
          100% {
            transform: translateX(
              0
            );
          }

          20% {
            transform: translateX(
              -8px
            );
          }

          40% {
            transform: translateX(
              8px
            );
          }

          60% {
            transform: translateX(
              -4px
            );
          }

          80% {
            transform: translateX(
              4px
            );
          }
        }

        @media (max-width: 480px) {
          .auth-card {
            max-width: 100%;
            border-radius: 16px;
          }

          .brand {
            padding: 20px 20px 4px 20px;
          }

          .brand h1 {
            font-size: 1.3rem;
          }

          .form-slide {
            padding: 0 16px 20px 16px;
          }

          .form-group input {
            padding: 10px 12px;
            font-size: 0.9rem;
          }

          .btn-auth {
            padding: 12px;
            font-size: 0.9rem;
          }
        }
      `}</style>

      <main className="auth-page">
        <canvas
          id="bg-canvas"
          ref={canvasRef}
          aria-hidden="true"
        />

        <div className="auth-wrapper">
          <div className="auth-card">
            <div className="brand">
              <div className="brand-logo">
                CRL
              </div>

              <h1>CRL-App</h1>

              <div className="brand-sub">
                Comprehensive Reading Literacy
              </div>
            </div>

            <div
              className="form-slider-container"
              ref={
                sliderContainerRef
              }
            >
              <div
                className={`form-slider ${
                  isSignupMode
                    ? "shifted"
                    : ""
                }`}
              >
                <section
                  className="form-slide"
                  id="loginSlide"
                >
                  <h3>
                    <span className="icon">
                      ↪
                    </span>
                    Welcome Back
                  </h3>

                  {loginError ? (
                    <div
                      className={`message ${
                        loginSuccess
                          ? "success"
                          : "error"
                      }`}
                    >
                      {loginError}
                    </div>
                  ) : null}

                  <form
                    onSubmit={
                      handleLogin
                    }
                  >
                    <div className="form-group">
                      <label htmlFor="loginUsername">
                        Username
                      </label>

                      <input
                        id="loginUsername"
                        type="text"
                        value={
                          loginForm.username
                        }
                        placeholder="Enter your username"
                        autoComplete="username"
                        onChange={(
                          event
                        ) =>
                          updateLoginField(
                            "username",
                            event.target
                              .value
                          )
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="loginPassword">
                        Password
                      </label>

                      <input
                        id="loginPassword"
                        type="password"
                        value={
                          loginForm.password
                        }
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        onChange={(
                          event
                        ) =>
                          updateLoginField(
                            "password",
                            event.target
                              .value
                          )
                        }
                      />
                    </div>

                    <button
                      type="submit"
                      className="btn-auth primary"
                      disabled={
                        isLoggingIn
                      }
                    >
                      {isLoggingIn ? (
                        <>
                          <span className="spinner" />
                          Logging in...
                        </>
                      ) : (
                        <>
                          <span>
                            →
                          </span>
                          Log In
                        </>
                      )}
                    </button>
                  </form>

                  <div className="auth-toggle">
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={
                        switchToSignup
                      }
                    >
                      Sign up
                    </button>
                  </div>
                </section>

                <section
                  className="form-slide"
                  id="signupSlide"
                >
                  <h3>
                    <span className="icon">
                      ＋
                    </span>
                    Create Account
                  </h3>

                  {signupError ? (
                    <div className="message error">
                      {signupError}
                    </div>
                  ) : null}

                  {signupSuccess ? (
                    <div className="message success">
                      ✅ Account created successfully!
                      Please log in.
                    </div>
                  ) : null}

                  <form
                    onSubmit={
                      handleSignup
                    }
                  >
                    <div className="form-group">
                      <label htmlFor="signupInvite">
                        Admin Invite Code{" "}
                        <span
                          style={{
                            color:
                              "#e17055",
                          }}
                        >
                          *
                        </span>
                      </label>

                      <input
                        id="signupInvite"
                        type="text"
                        value={
                          signupForm.invite
                        }
                        placeholder="e.g. ABC123"
                        autoComplete="off"
                        maxLength={
                          20
                        }
                        onChange={(
                          event
                        ) =>
                          updateSignupField(
                            "invite",
                            event.target.value
                              .toUpperCase()
                          )
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="signupFullName">
                        Full Name{" "}
                        <span
                          style={{
                            color:
                              "#e17055",
                          }}
                        >
                          *
                        </span>
                      </label>

                      <input
                        id="signupFullName"
                        type="text"
                        value={
                          signupForm.fullName
                        }
                        placeholder="First and Last Name"
                        onChange={(
                          event
                        ) =>
                          updateSignupField(
                            "fullName",
                            event.target
                              .value
                          )
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="signupSection">
                        Section{" "}
                        <span
                          style={{
                            color:
                              "#e17055",
                          }}
                        >
                          *
                        </span>
                      </label>

                      <input
                        id="signupSection"
                        type="text"
                        value={
                          signupForm.section
                        }
                        placeholder="e.g. Jupiter, Molave, etc."
                        onChange={(
                          event
                        ) =>
                          updateSignupField(
                            "section",
                            event.target
                              .value
                          )
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="signupUsername">
                        Username{" "}
                        <span
                          style={{
                            color:
                              "#e17055",
                          }}
                        >
                          *
                        </span>
                      </label>

                      <input
                        id="signupUsername"
                        type="text"
                        value={
                          signupForm.username
                        }
                        placeholder="Choose a username"
                        autoComplete="username"
                        onChange={(
                          event
                        ) =>
                          updateSignupField(
                            "username",
                            event.target
                              .value
                          )
                        }
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="signupPassword">
                        Password{" "}
                        <span
                          style={{
                            color:
                              "#e17055",
                          }}
                        >
                          *
                        </span>
                      </label>

                      <input
                        id="signupPassword"
                        type="password"
                        value={
                          signupForm.password
                        }
                        placeholder="Create a strong password"
                        autoComplete="new-password"
                        onChange={(
                          event
                        ) =>
                          updateSignupField(
                            "password",
                            event.target
                              .value
                          )
                        }
                      />

                      <div className="hint">
                        Minimum 6 characters
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="btn-auth success"
                      disabled={
                        isSigningUp
                      }
                    >
                      {isSigningUp ? (
                        <>
                          <span className="spinner" />
                          Creating account...
                        </>
                      ) : (
                        <>
                          <span>
                            ✓
                          </span>
                          Create Account
                        </>
                      )}
                    </button>
                  </form>

                  <div className="auth-toggle">
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={
                        switchToLogin
                      }
                    >
                      Log in
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
