"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function TeacherDashboard() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] =
    useState("dashboard");

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const response = await fetch(
          "/api/auth?action=verify",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        const data =
          await response.json();

        if (cancelled) {
          return;
        }

        if (
          !response.ok ||
          !data.valid
        ) {
          router.replace("/login");
          return;
        }

        if (
          data.user?.role &&
          data.user.role !== "teacher" &&
          data.user.role !== "admin"
        ) {
          router.replace("/login");
          return;
        }

        setUser(data.user);

        if (
          typeof window !== "undefined"
        ) {
          localStorage.setItem(
            "crla_user",
            JSON.stringify({
              username:
                data.user.username,
              role:
                data.user.role,
              full_name:
                data.user.full_name || "",
              section:
                data.user.section || "",
            })
          );
        }
      } catch (err) {
        console.error(
          "Teacher dashboard authentication error:",
          err
        );

        if (!cancelled) {
          setError(
            "Unable to verify your account. Please try logging in again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    try {
      await fetch(
        "/api/auth?action=logout",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );
    } catch (err) {
      console.error(
        "Logout request failed:",
        err
      );
    }

    if (
      typeof window !== "undefined"
    ) {
      localStorage.removeItem(
        "crla_token"
      );

      localStorage.removeItem(
        "crla_user"
      );
    }

    router.replace("/login");
  }

  function goToAssessment() {
    router.push(
      "/teacher/assessment"
    );
  }

  function goToLearnerPortal() {
    router.push("/learner");
  }

  if (loading) {
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
            background: #0a0a1a;
          }

          .loading-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background:
              radial-gradient(
                circle at 15% 20%,
                rgba(
                  108,
                  92,
                  231,
                  0.2
                ),
                transparent 30%
              ),
              radial-gradient(
                circle at 85% 75%,
                rgba(
                  0,
                  206,
                  201,
                  0.1
                ),
                transparent 30%
              ),
              #0a0a1a;
            color: #ffffff;
          }

          .loading-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 18px;
          }

          .spinner {
            width: 42px;
            height: 42px;
            border: 3px solid
              rgba(
                255,
                255,
                255,
                0.15
              );
            border-top-color: #6c5ce7;
            border-radius: 50%;
            animation:
              spin 0.8s linear
                infinite;
          }

          @keyframes spin {
            to {
              transform: rotate(
                360deg
              );
            }
          }

          .loading-text {
            color: rgba(
              255,
              255,
              255,
              0.7
            );
            font-size: 0.95rem;
          }
        `}</style>

        <main className="loading-page">
          <div className="loading-box">
            <div className="spinner" />
            <div className="loading-text">
              Loading CRL-App...
            </div>
          </div>
        </main>
      </>
    );
  }

  if (error) {
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
            background: #0a0a1a;
          }

          .error-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: #0a0a1a;
            color: #ffffff;
          }

          .error-card {
            width: 100%;
            max-width: 450px;
            padding: 32px;
            border-radius: 20px;
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
                0.1
              );
            box-shadow:
              0 20px 60px
                rgba(
                  0,
                  0,
                  0,
                  0.45
                );
            text-align: center;
          }

          .error-card h1 {
            margin-bottom: 12px;
            color: #ffffff;
            font-size: 1.5rem;
          }

          .error-card p {
            margin-bottom: 22px;
            color: rgba(
              255,
              255,
              255,
              0.7
            );
            line-height: 1.5;
          }

          .error-card button {
            border: none;
            border-radius: 10px;
            padding: 12px 22px;
            background: #6c5ce7;
            color: #ffffff;
            font-weight: 700;
            cursor: pointer;
          }
        `}</style>

        <main className="error-page">
          <section className="error-card">
            <h1>
              Unable to load dashboard
            </h1>

            <p>{error}</p>

            <button
              onClick={() =>
                router.replace(
                  "/login"
                )
              }
            >
              Return to Login
            </button>
          </section>
        </main>
      </>
    );
  }

  const displayName =
    user?.full_name ||
    user?.username ||
    "Teacher";

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
          background: #0a0a1a;
          color: #ffffff;
        }

        button {
          font: inherit;
        }

        .dashboard {
          min-height: 100vh;
          display: flex;
          background:
            radial-gradient(
              circle at 10% 15%,
              rgba(
                108,
                92,
                231,
                0.13
              ),
              transparent 28%
            ),
            radial-gradient(
              circle at 90% 85%,
              rgba(
                0,
                206,
                201,
                0.08
              ),
              transparent 28%
            ),
            #0a0a1a;
          overflow-x: hidden;
        }

        .sidebar {
          width: 240px;
          min-height: 100vh;
          position: fixed;
          top: 0;
          left: 0;
          z-index: 10;
          display: flex;
          flex-direction: column;
          padding: 22px 14px;
          background: rgba(
            12,
            12,
            32,
            0.92
          );
          border-right: 1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );
          backdrop-filter: blur(
            15px
          );
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 10px 28px;
        }

        .brand-mark {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: linear-gradient(
            135deg,
            #6c5ce7,
            #4834d4
          );
          font-size: 1rem;
          font-weight: 900;
        }

        .brand-text {
          display: flex;
          flex-direction: column;
        }

        .brand-title {
          font-size: 1.15rem;
          font-weight: 800;
        }

        .brand-subtitle {
          margin-top: 2px;
          font-size: 0.68rem;
          color: rgba(
            255,
            255,
            255,
            0.5
          );
        }

        .nav {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .nav-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 14px;
          border: none;
          border-radius: 12px;
          color: rgba(
            255,
            255,
            255,
            0.67
          );
          background: transparent;
          text-align: left;
          cursor: pointer;
          transition:
            background 0.2s ease,
            color 0.2s ease,
            transform 0.2s ease;
        }

        .nav-button:hover {
          background: rgba(
            255,
            255,
            255,
            0.06
          );
          color: #ffffff;
        }

        .nav-button.active {
          background: rgba(
            108,
            92,
            231,
            0.18
          );
          color: #ffffff;
          box-shadow:
            inset 3px 0 0
              #6c5ce7;
        }

        .nav-icon {
          width: 20px;
          text-align: center;
          font-size: 0.95rem;
        }

        .sidebar-bottom {
          margin-top: auto;
          padding-top: 20px;
          border-top: 1px solid
            rgba(
              255,
              255,
              255,
              0.07
            );
        }

        .user-mini {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 10px;
          margin-bottom: 9px;
        }

        .avatar {
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: linear-gradient(
            135deg,
            #6c5ce7,
            #00cec9
          );
          color: #ffffff;
          font-weight: 800;
          font-size: 0.85rem;
        }

        .user-mini-text {
          min-width: 0;
        }

        .user-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 0.84rem;
          font-weight: 700;
        }

        .user-role {
          margin-top: 2px;
          font-size: 0.7rem;
          color: rgba(
            255,
            255,
            255,
            0.5
          );
          text-transform: capitalize;
        }

        .logout {
          color: #ff7675;
        }

        .logout:hover {
          background: rgba(
            225,
            112,
            85,
            0.1
          );
          color: #ff7675;
        }

        .main {
          width: 100%;
          min-height: 100vh;
          margin-left: 240px;
        }

        .topbar {
          position: sticky;
          top: 0;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 18px 30px;
          background: rgba(
            10,
            10,
            26,
            0.82
          );
          border-bottom: 1px solid
            rgba(
              255,
              255,
              255,
              0.07
            );
          backdrop-filter: blur(
            15px
          );
        }

        .topbar-left h1 {
          font-size: 1.5rem;
          font-weight: 800;
        }

        .topbar-left p {
          margin-top: 4px;
          color: rgba(
            255,
            255,
            255,
            0.5
          );
          font-size: 0.8rem;
        }

        .topbar-user {
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(
            255,
            255,
            255,
            0.75
          );
          font-size: 0.85rem;
        }

        .content {
          padding: 30px;
          max-width: 1400px;
        }

        .hero {
          padding: 28px;
          border-radius: 22px;
          background:
            linear-gradient(
              135deg,
              rgba(
                108,
                92,
                231,
                0.2
              ),
              rgba(
                72,
                52,
                212,
                0.08
              )
            ),
            rgba(
              255,
              255,
              255,
              0.04
            );
          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );
          box-shadow:
            0 20px 60px
              rgba(
                0,
                0,
                0,
                0.25
              );
        }

        .hero h2 {
          font-size: 1.7rem;
          margin-bottom: 9px;
        }

        .hero p {
          max-width: 700px;
          line-height: 1.6;
          color: rgba(
            255,
            255,
            255,
            0.68
          );
          font-size: 0.93rem;
        }

        .cards {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 18px;
          margin-top: 22px;
        }

        .card {
          padding: 22px;
          border-radius: 18px;
          background: rgba(
            255,
            255,
            255,
            0.045
          );
          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );
        }

        .card-label {
          color: rgba(
            255,
            255,
            255,
            0.5
          );
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.7px;
        }

        .card-number {
          margin-top: 10px;
          font-size: 2rem;
          font-weight: 800;
        }

        .actions {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 18px;
          margin-top: 22px;
        }

        .action-card {
          padding: 24px;
          border-radius: 18px;
          background: rgba(
            255,
            255,
            255,
            0.045
          );
          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );
        }

        .action-card h3 {
          font-size: 1.05rem;
          margin-bottom: 8px;
        }

        .action-card p {
          min-height: 42px;
          color: rgba(
            255,
            255,
            255,
            0.58
          );
          font-size: 0.83rem;
          line-height: 1.55;
        }

        .action-button {
          margin-top: 18px;
          min-height: 44px;
          padding: 0 18px;
          border: none;
          border-radius: 10px;
          color: #ffffff;
          font-weight: 700;
          cursor: pointer;
          transition:
            transform 0.2s ease,
            opacity 0.2s ease;
        }

        .action-button:hover {
          transform: translateY(
            -1px
          );
        }

        .primary {
          background: #6c5ce7;
        }

        .secondary {
          background: #00a8a5;
        }

        .info-section {
          margin-top: 22px;
          padding: 24px;
          border-radius: 18px;
          background: rgba(
            255,
            255,
            255,
            0.04
          );
          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );
        }

        .info-section h3 {
          font-size: 1rem;
          margin-bottom: 15px;
        }

        .info-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 12px;
        }

        .info-item {
          padding: 14px;
          border-radius: 11px;
          background: rgba(
            255,
            255,
            255,
            0.035
          );
        }

        .info-item span {
          display: block;
        }

        .info-label {
          margin-bottom: 5px;
          color: rgba(
            255,
            255,
            255,
            0.45
          );
          font-size: 0.72rem;
        }

        .info-value {
          font-weight: 600;
          font-size: 0.9rem;
        }

        @media (max-width: 1000px) {
          .sidebar {
            width: 76px;
            padding-left: 10px;
            padding-right: 10px;
          }

          .brand-text,
          .nav-button span:not(.nav-icon),
          .user-mini-text {
            display: none;
          }

          .brand {
            justify-content: center;
            padding-left: 0;
            padding-right: 0;
          }

          .nav-button {
            justify-content: center;
            padding-left: 8px;
            padding-right: 8px;
          }

          .user-mini {
            justify-content: center;
          }

          .main {
            margin-left: 76px;
          }
        }

        @media (max-width: 760px) {
          .topbar {
            padding: 16px 18px;
          }

          .content {
            padding: 18px;
          }

          .cards,
          .actions,
          .info-grid {
            grid-template-columns:
              1fr;
          }

          .topbar-user {
            display: none;
          }

          .hero {
            padding: 22px;
          }

          .hero h2 {
            font-size: 1.35rem;
          }
        }
      `}</style>

      <main className="dashboard">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              CRL
            </div>

            <div className="brand-text">
              <div className="brand-title">
                CRL-App
              </div>

              <div className="brand-subtitle">
                Literacy Assessment
              </div>
            </div>
          </div>

          <nav className="nav">
            <button
              type="button"
              className={`nav-button ${
                activeTab ===
                "dashboard"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActiveTab(
                  "dashboard"
                )
              }
            >
              <span className="nav-icon">
                ◉
              </span>
              <span>Home</span>
            </button>

            <button
              type="button"
              className={`nav-button ${
                activeTab ===
                "assess"
                  ? "active"
                  : ""
              }`}
              onClick={() => {
                setActiveTab(
                  "assess"
                );
                goToAssessment();
              }}
            >
              <span className="nav-icon">
                ✓
              </span>
              <span>Assess</span>
            </button>

            <button
              type="button"
              className={`nav-button ${
                activeTab ===
                "records"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActiveTab(
                  "records"
                )
              }
            >
              <span className="nav-icon">
                ▤
              </span>
              <span>Records</span>
            </button>

            <button
              type="button"
              className={`nav-button ${
                activeTab ===
                "content"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActiveTab(
                  "content"
                )
              }
            >
              <span className="nav-icon">
                ◫
              </span>
              <span>Content</span>
            </button>

            <button
              type="button"
              className={`nav-button ${
                activeTab ===
                "profile"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActiveTab(
                  "profile"
                )
              }
            >
              <span className="nav-icon">
                ●
              </span>
              <span>Profile</span>
            </button>
          </nav>

          <div className="sidebar-bottom">
            <div className="user-mini">
              <div className="avatar">
                {displayName
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="user-mini-text">
                <div className="user-name">
                  {displayName}
                </div>

                <div className="user-role">
                  {user?.role ||
                    "teacher"}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="nav-button logout"
              onClick={handleLogout}
            >
              <span className="nav-icon">
                ↪
              </span>
              <span>
                Logout
              </span>
            </button>
          </div>
        </aside>

        <section className="main">
          <header className="topbar">
            <div className="topbar-left">
              <h1>
                Teacher Dashboard
              </h1>

              <p>
                Manage your CRL-App
                literacy assessments
              </p>
            </div>

            <div className="topbar-user">
              {displayName}
            </div>
          </header>

          <div className="content">
            <section className="hero">
              <h2>
                Welcome,{" "}
                {displayName}
              </h2>

              <p>
                Use the teacher
                dashboard to conduct
                Comprehensive Rapid
                Literacy Assessments,
                manage your assessment
                workflow, and access
                learner information.
              </p>
            </section>

            {activeTab ===
            "dashboard" ? (
              <>
                <section className="cards">
                  <div className="card">
                    <div className="card-label">
                      Account
                    </div>

                    <div className="card-number">
                      Teacher
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-label">
                      Section
                    </div>

                    <div className="card-number">
                      {user?.section ||
                        "Not set"}
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-label">
                      Assessment
                    </div>

                    <div className="card-number">
                      CRLA
                    </div>
                  </div>
                </section>

                <section className="actions">
                  <div className="action-card">
                    <h3>
                      Conduct Assessment
                    </h3>

                    <p>
                      Start a new
                      teacher-led CRLA
                      assessment and
                      connect the learner
                      device using an
                      assessment code.
                    </p>

                    <button
                      type="button"
                      className="action-button primary"
                      onClick={
                        goToAssessment
                      }
                    >
                      Start Assessment
                    </button>
                  </div>

                  <div className="action-card">
                    <h3>
                      Learner Interface
                    </h3>

                    <p>
                      Open the learner
                      interface on a
                      separate tablet or
                      device and enter the
                      teacher's assessment
                      code.
                    </p>

                    <button
                      type="button"
                      className="action-button secondary"
                      onClick={
                        goToLearnerPortal
                      }
                    >
                      Open Learner Page
                    </button>
                  </div>
                </section>

                <section className="info-section">
                  <h3>
                    Account Information
                  </h3>

                  <div className="info-grid">
                    <div className="info-item">
                      <span className="info-label">
                        Full Name
                      </span>

                      <span className="info-value">
                        {user?.full_name ||
                          "Not set"}
                      </span>
                    </div>

                    <div className="info-item">
                      <span className="info-label">
                        Username
                      </span>

                      <span className="info-value">
                        {user?.username ||
                          "Not set"}
                      </span>
                    </div>

                    <div className="info-item">
                      <span className="info-label">
                        Role
                      </span>

                      <span className="info-value">
                        {user?.role ||
                          "Teacher"}
                      </span>
                    </div>

                    <div className="info-item">
                      <span className="info-label">
                        Section
                      </span>

                      <span className="info-value">
                        {user?.section ||
                          "Not set"}
                      </span>
                    </div>
                  </div>
                </section>
              </>
            ) : null}

            {activeTab ===
            "records" ? (
              <section className="info-section">
                <h3>
                  Assessment Records
                </h3>

                <p
                  style={{
                    color:
                      "rgba(255,255,255,0.6)",
                    lineHeight: 1.6,
                    fontSize:
                      "0.9rem",
                  }}
                >
                  Assessment records
                  will appear here
                  once the assessment
                  management API is
                  connected to the
                  dashboard.
                </p>
              </section>
            ) : null}

            {activeTab ===
            "content" ? (
              <section className="info-section">
                <h3>
                  Assessment Content
                </h3>

                <p
                  style={{
                    color:
                      "rgba(255,255,255,0.6)",
                    lineHeight: 1.6,
                    fontSize:
                      "0.9rem",
                  }}
                >
                  CRLA assessment
                  content and reading
                  materials will be
                  managed here.
                </p>
              </section>
            ) : null}

            {activeTab ===
            "profile" ? (
              <section className="info-section">
                <h3>
                  My Profile
                </h3>

                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">
                      Full Name
                    </span>

                    <span className="info-value">
                      {user?.full_name ||
                        "Not set"}
                    </span>
                  </div>

                  <div className="info-item">
                    <span className="info-label">
                      Username
                    </span>

                    <span className="info-value">
                      {user?.username ||
                        "Not set"}
                    </span>
                  </div>

                  <div className="info-item">
                    <span className="info-label">
                      Section
                    </span>

                    <span className="info-value">
                      {user?.section ||
                        "Not set"}
                    </span>
                  </div>

                  <div className="info-item">
                    <span className="info-label">
                      Role
                    </span>

                    <span className="info-value">
                      {user?.role ||
                        "Teacher"}
                    </span>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}
