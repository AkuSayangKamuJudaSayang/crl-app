"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const BLUE = "#1559a6";
const RED = "#c92335";
const TEXT = "#10243f";
const MUTED = "#6f8196";
const BG = "#f7fbff";

function Icon({ children, size = 20, stroke = 2 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function ShieldIcon() {
  return <Icon size={22}><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></Icon>;
}

function KeyIcon() {
  return <Icon size={18}><circle cx="8" cy="15" r="3"/><path d="M10.5 13.5L19 5l-1.5-1.5L16 5l-1.5-1.5L13 5l1.5 1.5-2 2"/></Icon>;
}

const fieldStyle = {
  width: "100%",
  height: 48,
  boxSizing: "border-box",
  border: "1px solid #cad7e7",
  borderRadius: 12,
  background: "#fff",
  color: TEXT,
  padding: "0 14px",
  outline: "none",
  fontSize: 13,
  fontFamily: "inherit",
};

function Field({ label, value, onChange, placeholder, autoComplete }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 8, color: TEXT }}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} style={fieldStyle} />
    </div>
  );
}

function Alert({ tone, children }) {
  const good = tone === "success";
  return <div role="alert" style={{ padding: "12px 13px", borderRadius: 13, background: good ? "#ecf9f0" : "#fff0f2", border: `1px solid ${good ? "#c6ebd0" : "#f4c8cf"}`, color: good ? "#24723a" : RED, fontSize: 12, lineHeight: 1.5 }}>{children}</div>;
}

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [section, setSection] = useState("");
  const [password, setPassword] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  const title = useMemo(() => mode === "signup" ? "Create administrator account" : "Administrator sign in", [mode]);
  const subtitle = useMemo(() => mode === "signup"
    ? "Only approved administrator usernames with the private registration key can create an admin account."
    : "Access the CRL-App administrator workspace.", [mode]);

  function switchMode(next) {
    setMode(next);
    setError("");
    setSuccess("");
    setAdminKey("");
    router.replace(`/admin/login${next === "signup" ? "?mode=signup" : ""}`);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setSuccess("");

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || !password) return setError("Username and password are required.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (mode === "signup" && (!fullName.trim() || !adminKey.trim())) return setError("Full name and administrator registration key are required.");

    setBusy(true);
    try {
      const signup = mode === "signup";
      const response = await fetch(`/api/auth?action=${signup ? "admin_signup" : "login"}`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(signup ? {
          action: "admin_signup",
          username: cleanUsername,
          password,
          full_name: fullName.trim(),
          section: section.trim(),
          admin_signup_key: adminKey.trim(),
        } : {
          action: "login",
          username: cleanUsername,
          password,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to complete administrator authentication.");

      if (String(data.user?.role || "").toLowerCase() !== "admin") {
        await fetch("/api/auth?action=logout", { method: "POST", credentials: "include" }).catch(() => {});
        throw new Error("This account is not an administrator account.");
      }

      setSuccess(signup ? "Administrator account created. Opening workspace…" : "Signed in. Opening workspace…");
      window.location.replace("/admin");
    } catch (requestError) {
      setError(requestError.message || "Unable to complete the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100dvh", background: "radial-gradient(circle at 12% 8%, rgba(21,89,166,.11), transparent 28%), radial-gradient(circle at 92% 88%, rgba(201,35,53,.08), transparent 24%), linear-gradient(180deg,#fafdff 0%,#f4f8fd 100%)", color: TEXT, fontFamily: "var(--font-outfit), system-ui, sans-serif", padding: 24, boxSizing: "border-box", display: "grid", placeItems: "center" }}>
      <div style={{ width: "min(1080px,100%)", minHeight: 680, display: "grid", gridTemplateColumns: "1.02fr .98fr", background: "#fff", border: "1px solid rgba(16,36,63,.08)", borderRadius: 32, overflow: "hidden", boxShadow: "0 28px 80px rgba(15,53,96,.16)" }}>
        <section style={{ position: "relative", padding: "48px", background: "linear-gradient(145deg,#0b3368 0%,#1559a6 56%,#1d75cf 100%)", color: "#fff", overflow: "hidden" }}>
          <div aria-hidden="true" style={{ position: "absolute", width: 320, height: 320, borderRadius: "50%", top: -150, right: -130, background: "rgba(255,255,255,.08)" }} />
          <div aria-hidden="true" style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", bottom: -160, left: -120, background: "rgba(201,35,53,.18)" }} />
          <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 14, marginBottom: 48 }}>
              <div style={{ width: 58, height: 58, borderRadius: 18, display: "grid", placeItems: "center", background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.15)", backdropFilter: "blur(8px)" }}><ShieldIcon /></div>
              <div><div style={{ fontSize: 24, fontWeight: 800 }}>CRL<span style={{ color: "#ff6878" }}>-</span>App</div><div style={{ fontSize: 12, opacity: .78, marginTop: 2, letterSpacing: ".06em", textTransform: "uppercase" }}>Administrator Portal</div></div>
            </div>
            <div style={{ maxWidth: 520 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", opacity: .74 }}>Controlled access</div>
              <h1 style={{ margin: "14px 0 18px", fontSize: "clamp(42px,5vw,70px)", lineHeight: .98, letterSpacing: "-.045em", fontWeight: 900 }}>One secure place to manage CRL-App.</h1>
              <p style={{ margin: 0, maxWidth: 500, fontSize: 16, lineHeight: 1.7, opacity: .84 }}>Manage teacher invitation codes and keep administrator access separate from the classroom workspace.</p>
            </div>
            <div style={{ marginTop: "auto", display: "grid", gap: 12 }}>
              {[
                "Teacher registration controls",
                "Dedicated administrator workspace",
                "Server-side role verification",
              ].map((text) => <div key={text} style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 9, height: 9, borderRadius: 50, background: "#ff5264", boxShadow: "0 0 0 5px rgba(255,82,100,.12)" }} /><span style={{ fontSize: 14, opacity: .85 }}>{text}</span></div>)}
            </div>
          </div>
        </section>

        <section style={{ padding: "42px 46px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ maxWidth: 470, width: "100%", margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
              <div><div style={{ fontWeight: 900, fontSize: 24 }}><span style={{ color: BLUE }}>CRL</span><span style={{ color: RED }}>-App</span></div><div style={{ marginTop: 12, color: MUTED, fontSize: 13, lineHeight: 1.55 }}>{subtitle}</div></div>
              <div style={{ width: 50, height: 50, borderRadius: 16, display: "grid", placeItems: "center", background: "#eef5fd", color: BLUE }}><ShieldIcon /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 5, borderRadius: 16, background: "#eef3f9", marginBottom: 28 }}>
              <button type="button" onClick={() => switchMode("signin")} style={{ border: 0, borderRadius: 12, padding: "13px 14px", background: mode === "signin" ? "#fff" : "transparent", boxShadow: mode === "signin" ? "0 4px 16px rgba(15,53,96,.08)" : "none", color: mode === "signin" ? BLUE : MUTED, fontWeight: 800, cursor: "pointer" }}>Sign In</button>
              <button type="button" onClick={() => switchMode("signup")} style={{ border: 0, borderRadius: 12, padding: "13px 14px", background: mode === "signup" ? "#fff" : "transparent", boxShadow: mode === "signup" ? "0 4px 16px rgba(15,53,96,.08)" : "none", color: mode === "signup" ? BLUE : MUTED, fontWeight: 800, cursor: "pointer" }}>Sign Up</button>
            </div>
            <h2 style={{ margin: 0, fontSize: 31, lineHeight: 1.12, letterSpacing: "-.035em", fontWeight: 900 }}>{title}</h2>
            <form onSubmit={submit} style={{ marginTop: 26, display: "grid", gap: 16 }}>
              {mode === "signup" && <><Field label="Administrator name" value={fullName} onChange={setFullName} placeholder="Full name" autoComplete="name" /><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><Field label="Username" value={username} onChange={setUsername} placeholder="Approved username" autoComplete="username" /><Field label="Section" value={section} onChange={setSection} placeholder="Optional" /></div></>}
              {mode === "signin" && <Field label="Username" value={username} onChange={setUsername} placeholder="Administrator username" autoComplete="username" />}
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 8, color: TEXT }}>Password</label>
                <div style={{ position: "relative" }}><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete={mode === "signin" ? "current-password" : "new-password"} style={{ ...fieldStyle, paddingRight: 52 }} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 38, height: 38, border: 0, borderRadius: 10, background: "transparent", color: "#8090a5", cursor: "pointer" }}><Icon size={18}><path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></Icon></button></div>
              </div>
              {mode === "signup" && <div><label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 8, color: TEXT }}>Private administrator registration key</label><div style={{ position: "relative" }}><input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="Provided only to approved admins" autoComplete="off" style={{ ...fieldStyle, paddingLeft: 42 }} /><div style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: BLUE }}><KeyIcon /></div></div><div style={{ marginTop: 7, color: MUTED, fontSize: 11, lineHeight: 1.5 }}>The username must be present in the server-side administrator allowlist.</div></div>}
              {error && <Alert tone="error">{error}</Alert>}
              {success && <Alert tone="success">{success}</Alert>}
              <button type="submit" disabled={busy} style={{ marginTop: 4, border: 0, borderRadius: 14, minHeight: 52, background: busy ? "#86a8ce" : `linear-gradient(135deg,${BLUE},#247ad2)`, color: "#fff", fontWeight: 900, fontSize: 14, cursor: busy ? "wait" : "pointer", boxShadow: "0 10px 28px rgba(21,89,166,.23)" }}>{busy ? (mode === "signup" ? "Creating account…" : "Signing in…") : mode === "signup" ? "Create Administrator Account" : "Sign In"}</button>
            </form>
            <div style={{ marginTop: 20, padding: "13px 14px", borderRadius: 14, background: BG, border: "1px solid #e3ebf4", color: MUTED, fontSize: 11, lineHeight: 1.55 }}>Administrator access is separate from teacher access. A normal teacher account cannot enter this portal.</div>
          </div>
        </section>
      </div>
      <style>{`@media (max-width: 900px){main{padding:12px!important}.admin-grid{grid-template-columns:1fr!important}}`}</style>
    </main>
  );
}


function AdminLoginLoading() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f7fbff", color: "#10243f", fontFamily: "var(--font-outfit), system-ui, sans-serif" }}>
      <div style={{ padding: "18px 22px", borderRadius: 16, background: "#fff", border: "1px solid #e3ebf4", boxShadow: "0 16px 40px rgba(15,53,96,.08)", fontWeight: 800 }}>Loading administrator portal…</div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<AdminLoginLoading />}>
      <AdminLoginContent />
    </Suspense>
  );
}
