"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const BLUE = "#1559a6";
const RED = "#c92335";
const TEXT = "#10243f";

const fieldStyle = {
  width: "100%",
  height: 52,
  boxSizing: "border-box",
  border: "1px solid #cfdbe9",
  borderRadius: 12,
  background: "#fff",
  color: TEXT,
  padding: "0 15px",
  outline: "none",
  fontSize: 14,
  fontFamily: "inherit",
};

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
    <main style={{ minHeight: "100dvh", background: "#f7fbff", color: TEXT, fontFamily: "var(--font-outfit), system-ui, sans-serif", padding: 24, boxSizing: "border-box", display: "grid", placeItems: "center" }}>
      <form
        onSubmit={submit}
        style={{ width: "min(400px,100%)", background: "#fff", border: "1px solid rgba(16,36,63,.09)", borderRadius: 20, padding: "36px 32px", boxShadow: "0 20px 54px rgba(15,53,96,.10)", display: "grid", gap: 18 }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>Admin</h1>
          <span aria-hidden="true" style={{ width: 40, height: 3, borderRadius: 2, background: RED, display: "block" }} />
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="admin-username" style={{ fontSize: 13, fontWeight: 700 }}>Username</label>
          <input
            id="admin-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            style={fieldStyle}
          />
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="admin-password" style={{ fontSize: 13, fontWeight: 700 }}>Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ ...fieldStyle, paddingRight: 64 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              style={{ position: "absolute", top: 0, right: 0, height: 52, padding: "0 14px", border: 0, background: "transparent", color: BLUE, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {error ? <div role="alert" style={{ padding: "11px 13px", borderRadius: 12, background: "#fff0f2", border: "1px solid #f4c8cf", color: RED, fontSize: 13, lineHeight: 1.5 }}>{error}</div> : null}

        <button
          type="submit"
          disabled={busy}
          style={{ height: 52, border: 0, borderRadius: 12, background: busy ? "#5b86b8" : BLUE, color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: busy ? "progress" : "pointer" }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
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
