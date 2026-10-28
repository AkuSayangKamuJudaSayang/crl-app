"use client";

import { useEffect } from "react";
import { installAppClipboardGuard } from "../lib/learnerClipboard";

export default function AppTextSelectionGuard() {
  useEffect(() => installAppClipboardGuard(document), []);
  return <style>{`
    html[data-crl-text-protected] *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none}
    html[data-crl-text-protected] img{-webkit-user-drag:none}
    html[data-crl-text-protected] input:not([readonly]):not([disabled]),
    html[data-crl-text-protected] textarea:not([readonly]):not([disabled]),
    html[data-crl-text-protected] [contenteditable="true"],
    html[data-crl-text-protected] [contenteditable="true"] *,
    html[data-crl-text-protected] [contenteditable=""],
    html[data-crl-text-protected] [contenteditable=""] *,
    html[data-crl-text-protected] [data-crl-code-field],
    html[data-crl-text-protected] [data-crl-copyable-code],
    html[data-crl-text-protected] [data-crl-copyable-code] *{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default}
  `}</style>;
}
