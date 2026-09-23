"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./PrivacyNotice.module.css";

const CONSENT_KEY = "crl_policy_consent_v1";

export default function PrivacyNotice() {
  const [visible, setVisible] = useState(true);
  const [canAccept, setCanAccept] = useState(false);
  const [closing, setClosing] = useState(false);
  const policyBody = useRef(null);

  useEffect(() => {
    if (!visible) return undefined;

    const hasConsent = window.localStorage.getItem(CONSENT_KEY) === "accepted"
      || document.cookie.split("; ").some((item) => item === "crl_policy_consent=v1");

    if (hasConsent) {
      setVisible(false);
      return undefined;
    }

    const pageContent = document.querySelector("[data-landing-content]");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (pageContent) {
      pageContent.inert = true;
      pageContent.setAttribute("aria-hidden", "true");
    }
    window.requestAnimationFrame(() => policyBody.current?.focus({ preventScroll: true }));

    return () => {
      document.body.style.overflow = previousOverflow;
      if (pageContent) {
        pageContent.inert = false;
        pageContent.removeAttribute("aria-hidden");
      }
    };
  }, [visible]);

  const checkScroll = (event) => {
    const element = event.currentTarget;
    const atEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 8;
    if (atEnd) setCanAccept(true);
  };

  const accept = () => {
    if (!canAccept) return;
    window.localStorage.setItem(CONSENT_KEY, "accepted");
    document.cookie = "crl_policy_consent=v1; Max-Age=31536000; Path=/; SameSite=Lax";
    setClosing(true);

    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;
    window.setTimeout(() => setVisible(false), delay);
  };

  if (!visible) return null;

  return (
    <div className={`${styles.overlay} ${closing ? styles.closing : ""}`} role="presentation">
      <section
        className={styles.notice}
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-title"
        aria-describedby="policy-instruction"
      >
        <header className={styles.header}>
          <p>CRL-APP NOTICE</p>
          <h2 id="policy-title">Privacy &amp; cookies</h2>
          <span id="policy-instruction">Read to the end to continue.</span>
        </header>

        <div
          ref={policyBody}
          className={styles.body}
          onScroll={checkScroll}
          tabIndex={0}
          aria-label="Privacy and cookie policy"
        >
          <h3>Privacy policy</h3>
          <p>
            CRL-App supports teacher-guided reading assessment. It may process teacher account details, learner identifiers, assessment responses, scores, reading profiles, and progress records needed to operate the service.
          </p>
          <p>
            Information is used to run assessments, calculate results, monitor progress, maintain school records, and support authorized teachers. Access should be limited to authorized school personnel and the learner participating in an assigned assessment.
          </p>
          <p>
            CRL-App may store assessment data on the device while offline and synchronize it when a connection becomes available. Reasonable safeguards are used to protect records. Data should be retained only for legitimate educational and administrative needs under the school&apos;s applicable policies.
          </p>
          <p>
            For questions about access, correction, or removal of information, contact the school administrator responsible for CRL-App.
          </p>

          <h3>Cookie policy</h3>
          <p>
            CRL-App uses essential browser storage and cookies to remember this notice, maintain a signed-in session, support security, and keep core app features working. Offline features may also save required app files and assessment data locally on the device.
          </p>
          <p>
            These technologies are used for service operation, not advertising. Disabling essential storage may prevent sign-in, offline use, or other required functions from working correctly.
          </p>

          <p className={styles.updated}>Last updated: September 23, 2026</p>
          <div className={styles.endMarker}>End of notice</div>
        </div>

        <footer className={styles.footer}>
          <span>{canAccept ? "You may continue." : "Scroll to the end."}</span>
          <button type="button" disabled={!canAccept || closing} onClick={accept}>
            Accept and continue
          </button>
        </footer>
      </section>
    </div>
  );
}
