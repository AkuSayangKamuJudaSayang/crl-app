"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { hasPolicyConsent } from "../../lib/policyConsent";

function requiresConsent(pathname) {
  return (
    pathname === "/login" ||
    pathname === "/teacher" ||
    pathname?.startsWith("/teacher/") ||
    pathname === "/learner" ||
    pathname?.startsWith("/learner/")
  );
}

export default function PolicyConsentGate({ children }) {
  const pathname = usePathname();
  const protectedRoute = requiresConsent(pathname);
  const [decision, setDecision] = useState({ pathname: "", allowed: false });

  useEffect(() => {
    if (!protectedRoute) {
      setDecision((current) =>
        current.pathname ? { pathname: "", allowed: false } : current
      );
      return;
    }

    if (hasPolicyConsent()) {
      setDecision({ pathname, allowed: true });
      return;
    }

    setDecision({ pathname, allowed: false });
    window.location.replace("/");
  }, [protectedRoute, pathname]);

  if (
    protectedRoute &&
    (decision.pathname !== pathname || decision.allowed !== true)
  ) {
    return (
      <main
        aria-label="Checking privacy consent"
        style={{ minHeight: "100svh", background: "#fffdf8" }}
      />
    );
  }

  return children;
}
