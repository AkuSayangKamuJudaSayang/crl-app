"use client";

import {
  useEffect,
  useState,
} from "react";

export default function TeacherPage() {
  const [user, setUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [logoutModal, setLogoutModal] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
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
          window.location.replace(
            "/login"
          );
          return;
        }

        const data =
          await response.json();

        if (
          !data.valid ||
          !data.user
        ) {
          window.location.replace(
            "/login"
          );
          return;
        }

        if (
          data.user.role !==
          "teacher"
        ) {
          window.location.replace(
            "/login"
          );
          return;
        }

        if (!cancelled) {
          setUser(
            data.user
          );
        }
      } catch (error) {
        console.error(
          "Session verification failed:",
          error
        );

        window.location.replace(
          "/login"
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    verifySession();

    return () => {
      cancelled = true;
    };
  }, []);

  function openLogoutModal() {
    if (loggingOut) {
      return;
    }

    setLogoutModal(true);
  }

  function closeLogoutModal() {
    if (loggingOut) {
      return;
    }

    setLogoutModal(false);
  }

  async function logout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      const response =
        await fetch(
          "/api/auth?action=logout",
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

      /*
       * We deliberately don't depend on
       * the response body here.
       *
       * The server clears the HttpOnly
       * cookie.
       */
      if (!response.ok) {
        console.error(
          "Logout request returned:",
          response.status
        );
      }
    } catch (error) {
      console.error(
        "Logout request failed:",
        error
      );
    } finally {
      /*
       * Remove possible legacy client-side
       * session values.
       */
      try {
        localStorage.removeItem(
          "crla_token"
        );

        localStorage.removeItem(
          "crla_user"
        );

        sessionStorage.removeItem(
          "crla_token"
        );

        sessionStorage.removeItem(
          "crla_user"
        );
      } catch (storageError) {
        console.warn(
          "Unable to clear browser storage:",
          storageError
        );
      }

      /*
       * IMPORTANT:
       * Use replace(), not push().
       * This fully leaves the teacher page.
       */
      window.location.replace(
        "/login"
      );
    }
  }

  if (loading) {
    return (
      <main
        style={{
          minHeight:
            "100vh",
          display:
            "flex",
          alignItems:
            "center",
          justifyContent:
            "center",
          background:
            "#f4f8fc",
          color:
            "#1455a0",
          fontFamily:
            "Arial, Helvetica, sans-serif",
        }}
      >
        Loading...
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight:
          "100vh",
        background:
          "#f4f8fc",
        fontFamily:
          "Arial, Helvetica, sans-serif",
      }}
    >
      <header
        style={{
          height: 70,
          display:
            "flex",
          alignItems:
            "center",
          justifyContent:
            "space-between",
          padding:
            "0 30px",
          background:
            "#fff",
          borderBottom:
            "1px solid #dfe7f0",
        }}
      >
        <strong
          style={{
            color:
              "#172337",
            fontSize:
              22,
          }}
        >
          CRL-App
        </strong>

        <button
          type="button"
          onClick={
            openLogoutModal
          }
          style={{
            border: 0,
            background:
              "none",
            color:
              "#c92335",
            fontWeight:
              800,
            cursor:
              "pointer",
          }}
        >
          Logout
        </button>
      </header>

      <section
        style={{
          maxWidth:
            1200,
          margin:
            "0 auto",
          padding:
            "40px 25px",
        }}
      >
        <div
          style={{
            background:
              "#fff",
            border:
              "1px solid #dfe7f0",
            borderRadius:
              14,
            padding:
              30,
          }}
        >
          <h1
            style={{
              margin:
                0,
              color:
                "#172337",
            }}
          >
            Teacher Dashboard
          </h1>

          <p
            style={{
              marginTop:
                8,
              color:
                "#718097",
            }}
          >
            Welcome,{" "}
            {user?.full_name ||
              user?.username ||
              "Teacher"}
          </p>
        </div>
      </section>

      {logoutModal ? (
        <div
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeLogoutModal();
            }
          }}
          style={{
            position:
              "fixed",
            inset: 0,
            zIndex: 1000,
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "center",
            padding: 20,
            background:
              "rgba(18, 31, 47, 0.42)",
            backdropFilter:
              "blur(3px)",
          }}
        >
          <div
            style={{
              width:
                "100%",
              maxWidth:
                420,
              background:
                "#fff",
              borderRadius:
                14,
              padding:
                25,
              boxShadow:
                "0 24px 60px rgba(20,38,63,.2)",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                margin:
                  "0 auto 14px",
                borderRadius:
                  "50%",
                background:
                  "#fff1f3",
                color:
                  "#c92335",
                fontSize:
                  20,
                fontWeight:
                  800,
              }}
            >
              ↪
            </div>

            <h2
              style={{
                margin: 0,
                color:
                  "#26384e",
                fontSize:
                  18,
                textAlign:
                  "center",
              }}
            >
              Log out of CRL-App?
            </h2>

            <p
              style={{
                margin:
                  "9px auto 0",
                maxWidth:
                  320,
                color:
                  "#76869a",
                fontSize:
                  11,
                lineHeight:
                  1.6,
                textAlign:
                  "center",
              }}
            >
              Are you sure you want to log
              out of your teacher account?
            </p>

            <div
              style={{
                marginTop:
                  17,
                padding:
                  "10px 12px",
                borderRadius:
                  8,
                background:
                  "#fff7f7",
                border:
                  "1px solid #f1d3d7",
                color:
                  "#a22130",
                fontSize:
                  10,
                lineHeight:
                  1.5,
              }}
            >
              Your current session will be
              ended and you will be returned
              to the login page.
            </div>

            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "flex-end",
                gap: 8,
                marginTop:
                  18,
              }}
            >
              <button
                type="button"
                disabled={
                  loggingOut
                }
                onClick={
                  closeLogoutModal
                }
                style={{
                  minHeight:
                    40,
                  padding:
                    "0 15px",
                  borderRadius:
                    8,
                  border:
                    "1px solid #cfdbe8",
                  background:
                    "#fff",
                  color:
                    "#1455a0",
                  fontWeight:
                    800,
                  cursor:
                    "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  loggingOut
                }
                onClick={
                  logout
                }
                style={{
                  minHeight:
                    40,
                  padding:
                    "0 15px",
                  borderRadius:
                    8,
                  border:
                    "1px solid #c92335",
                  background:
                    "#c92335",
                  color:
                    "#fff",
                  fontWeight:
                    800,
                    cursor:
                    "pointer",
                }}
              >
                {loggingOut
                  ? "Logging Out..."
                  : "Yes, Log Out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}