"use client";

import { isProbablyOnline } from "./localFirstStore";

// Wi-Fi alone is not proof that the cloud can be reached.
export async function detectAssessmentConnectionMode() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const result = await isProbablyOnline(1200);
  return result?.ok ? "online" : "offline";
}
