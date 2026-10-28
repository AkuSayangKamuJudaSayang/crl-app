"use client";

import AppTextSelectionGuard from "../../components/AppTextSelectionGuard";

// Both browser tabs and installed learner apps follow the shared policy.
export default function LearnerClipboardGuard() {
  return <AppTextSelectionGuard />;
}
