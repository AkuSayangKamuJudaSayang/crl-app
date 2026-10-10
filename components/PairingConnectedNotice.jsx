"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function PairingConnectedNotice({ onOkay }) {
  const noticeRef = useRef(null);
  const okayRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const background = Array.from(document.body.children)
      .filter(element => !element.contains(noticeRef.current))
      .map(element => [element, element.inert]);
    background.forEach(([element]) => { element.inert = true; });
    okayRef.current?.focus();
    return () => {
      background.forEach(([element, inert]) => { element.inert = inert; });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="crl-pairing-notice" ref={noticeRef} role="alertdialog" aria-modal="true" aria-labelledby="crl-pairing-notice-title" onKeyDown={event => {
      if (event.key === "Tab") { event.preventDefault(); okayRef.current?.focus(); }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
    }}>
      <style>{`.crl-pairing-notice{position:fixed;inset:0;z-index:16000;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:rgba(10,20,36,.6);overscroll-behavior:contain}.crl-pairing-notice-card{box-sizing:border-box;width:min(100%,360px);padding:24px;border:1px solid #d8e0e8;border-radius:14px;background:#fff;color:#1a2b4c;font-family:Arial,Helvetica,sans-serif;text-align:center}.crl-pairing-notice h2{margin:0 0 20px;font-size:21px;line-height:1.4}.crl-pairing-notice button{min-height:44px;min-width:100px;padding:10px 18px;border:0;border-radius:9px;background:#244d73;color:#fff;font:700 14px/1.4 Arial,sans-serif;cursor:pointer}.crl-pairing-notice button:focus-visible{outline:2px solid #4a6fa5;outline-offset:3px}`}</style>
      <section className="crl-pairing-notice-card">
        <h2 id="crl-pairing-notice-title">Successfully connected</h2>
        <button type="button" ref={okayRef} onClick={onOkay}>Okay</button>
      </section>
    </div>, document.body
  );
}
