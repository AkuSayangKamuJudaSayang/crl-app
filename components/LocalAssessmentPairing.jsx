"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AssessmentCodeScanner from "./AssessmentCodeScanner";
import PairingConnectedNotice from "./PairingConnectedNotice";
import PairingSettingsDialog from "./PairingSettingsDialog";
import qrcode from "../lib/vendor/qrcode.mjs";
import {
  acceptLearnerAssessmentOffer,
  acceptTeacherDeviceOffer,
  completeLearnerDevicePairing,
  getTeacherDevicePairingCode,
  getDevicePairingState,
  subscribeDevicePairingState,
  readAssessmentPairingPacket,
  startLearnerDevicePairing,
  completeTeacherAssessmentPairing,
  getAssessmentPeerStatus,
  getAssessmentPairingCodes,
  startTeacherAssessmentPairing,
  subscribeAssessmentPeerStatus,
  resetAssessmentDevicePairing,
  checkAssessmentPeerConnection,
  getAssessmentDeviceName,
  setAssessmentDeviceName,
} from "../lib/assessmentPeer";

function normalizeCode(code) {
  return String(code || "").replace(/\s+/g, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function createQrMarkup(value) {
  if (!value) return "";
  try {
    const qr = qrcode(0, "L");
    qr.addData(value);
    qr.make();
    return qr.createSvgTag(3, 12, "Offline pairing QR");
  } catch {
    return "";
  }
}

export default function LocalAssessmentPairing({
  code,
  role,
  offline,
  onCodeResolved,
  onConnected,
  onPeerConnected,
  initialOffer = "",
  hideWhenConnected = false,
  deviceOnly = false,
  displayOnly = false,
}) {
  const [ownCode, setOwnCode] = useState(() => deviceOnly ? getTeacherDevicePairingCode(role) : "");
  const [resolvedCode, setResolvedCode] = useState(() => deviceOnly ? getDevicePairingState(role).peerCode : normalizeCode(code));
  const [status, setStatus] = useState(() => getAssessmentPeerStatus(resolvedCode));
  const [offerPacket, setOfferPacket] = useState(() => deviceOnly ? getDevicePairingState(role).offer : getAssessmentPairingCodes(resolvedCode).offer);
  const [answerPacket, setAnswerPacket] = useState(() => deviceOnly ? getDevicePairingState(role).answer : getAssessmentPairingCodes(resolvedCode).answer);
  const [scanning, setScanning] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [codesError, setCodesError] = useState("");
  const [fullscreenQr, setFullscreenQr] = useState(false);
  /* The hub-free text exchange: a copyable code out, a pasted code in. */
  const [codeCopied, setCodeCopied] = useState("");
  const [typedCode, setTypedCode] = useState("");
  const [codeDialog, setCodeDialog] = useState("");
  const [expandedQr, setExpandedQr] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [localDeviceName, setLocalDeviceName] = useState(getAssessmentDeviceName);
  const [editingDeviceName, setEditingDeviceName] = useState(false);
  const [deviceNameDraft, setDeviceNameDraft] = useState("");
  const [preparationAttempt, setPreparationAttempt] = useState(0);
  const [confirmBack, setConfirmBack] = useState(false);
  const backButtonRef = useRef(null);
  const cancelBackRef = useRef(null);
  const busyRef = useRef(false);
  const consumedOfferRef = useRef("");
  const offerRequestRef = useRef(0);
  const scopeRef = useRef("");
  scopeRef.current = `${role}:${deviceOnly ? ownCode : resolvedCode}`;
  const onConnectedRef = useRef(onConnected);
  const onPeerConnectedRef = useRef(onPeerConnected);
  // Reopening settings is a view of an existing link, not another learner join.
  const notifiedConnectionRef = useRef(status.connected || status.established ? `${role}:${deviceOnly ? ownCode : resolvedCode}` : "");

  useEffect(() => { onConnectedRef.current = onConnected; }, [onConnected]);
  useEffect(() => { onPeerConnectedRef.current = onPeerConnected; }, [onPeerConnected]);
  useEffect(() => {
    if (deviceOnly) return;
    const next = normalizeCode(code);
    if (next && next !== resolvedCode) {
      setResolvedCode(next);
      setOfferPacket("");
      setAnswerPacket("");
      setPairingError("");
      consumedOfferRef.current = "";
    }
  }, [code, resolvedCode, deviceOnly]);

  useEffect(() => {
    if (!deviceOnly) return undefined;
    const refresh = event => {
      if (event?.role && event.role !== role) return;
      const state = getDevicePairingState(role);
      setLocalDeviceName(getAssessmentDeviceName());
      setOwnCode(state.code);
      setResolvedCode(state.peerCode);
      setStatus(getAssessmentPeerStatus(state.peerCode));
      setOfferPacket(state.offer);
      setAnswerPacket(state.answer);
    };
    refresh();
    return subscribeDevicePairingState(refresh);
  }, [deviceOnly, role]);

  useEffect(() => {
    if (!resolvedCode) return undefined;
    return subscribeAssessmentPeerStatus(resolvedCode, setStatus);
  }, [resolvedCode]);

  useEffect(() => {
    if (!offline && !displayOnly && !deviceOnly) {
      setScanning(false);
      setPairingError("");
      return undefined;
    }
    const invitationCode = deviceOnly ? ownCode : resolvedCode;
    // Reopening settings or changing internet status must not create an
    // invitation while the established transport is recovering or answering.
    if (deviceOnly && (getDevicePairingState(role).retained || getDevicePairingState(role).answer)) return undefined;
    if ((role !== "teacher" && !deviceOnly) || invitationCode.length !== 6 || status.connected || (!deviceOnly && getAssessmentPairingCodes(resolvedCode).answer)) return undefined;
    let cancelled = false;
    const request = ++offerRequestRef.current;
    setPairingError("");
    // The shared offer survives closing the settings and React effect replays.
    void (role === "learner" ? startLearnerDevicePairing(invitationCode) : startTeacherAssessmentPairing(invitationCode, { deviceOnly }))
      .then((packet) => { if (!cancelled && request === offerRequestRef.current) setOfferPacket(packet); })
      .catch((error) => {
        if (!cancelled && request === offerRequestRef.current) setPairingError(error?.message || "Local connection setup failed.");
      });
    return () => { cancelled = true; };
  }, [offline, displayOnly, role, resolvedCode, ownCode, deviceOnly, status.connected, preparationAttempt]);

  useEffect(() => {
    if (!deviceOnly || typeof window === "undefined" || !window.addEventListener) return undefined;
    const wake = () => {
      const state = getDevicePairingState(role);
      checkAssessmentPeerConnection(state.peerCode);
      // A previous no-route error must not become permanent after Wi-Fi comes
      // back while navigator.onLine stays true. Never replace a usable code.
      if (!state.retained && !state.offer && !state.answer) setPreparationAttempt(value => value + 1);
    };
    for (const event of ["online", "offline", "focus", "pageshow"]) window.addEventListener(event, wake);
    return () => { for (const event of ["online", "offline", "focus", "pageshow"]) window.removeEventListener(event, wake); };
  }, [deviceOnly, role]);

  useEffect(() => {
    if (displayOnly && !deviceOnly) setScanning(false);
  }, [displayOnly, deviceOnly]);

  const handleLearnerScan = useCallback(async (packet) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    const scope = scopeRef.current;
    setScanning(false);
    setPairingError("");
    try {
      const decoded = await readAssessmentPairingPacket(packet);
      if (deviceOnly && !String(decoded.t || "").startsWith("device_")) {
        throw new Error("Use a connection code from Offline Mode Settings.");
      }
      if (deviceOnly && decoded.k === "a") {
        await completeLearnerDevicePairing(ownCode, packet);
        return true;
      }
      const result = await acceptLearnerAssessmentOffer(packet, deviceOnly ? "" : resolvedCode);
      if (scopeRef.current !== scope) return;
      setResolvedCode(result.code);
      if (!deviceOnly) setOfferPacket("");
      setAnswerPacket(result.answer);
      setConfirmBack(false);
      setCodeDialog("");
      onCodeResolved?.(result.code);
      return true;
    } catch (error) {
      if (scopeRef.current === scope) setPairingError(error?.message || "The teacher connection code could not be read.");
      return false;
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }, [onCodeResolved, resolvedCode, ownCode, deviceOnly]);

  useEffect(() => {
    if (!offline || displayOnly || role !== "learner" || !initialOffer || consumedOfferRef.current === initialOffer) return;
    consumedOfferRef.current = initialOffer;
    void handleLearnerScan(initialOffer);
  }, [offline, displayOnly, role, initialOffer, handleLearnerScan]);

  const handleTeacherScan = useCallback(async (packet) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    const scope = scopeRef.current;
    setScanning(false);
    setPairingError("");
    try {
      const decoded = await readAssessmentPairingPacket(packet);
      if (deviceOnly && decoded.k === "o") {
        const result = await acceptTeacherDeviceOffer(packet);
        if (scopeRef.current !== scope) return false;
        setResolvedCode(result.code);
        setAnswerPacket(result.answer);
        setConfirmBack(false);
        setCodeDialog("");
        onCodeResolved?.(result.code);
      } else await completeTeacherAssessmentPairing(deviceOnly ? ownCode : resolvedCode, packet);
      if (scopeRef.current !== scope) return false;
      return true;
    } catch (error) {
      if (scopeRef.current === scope) {
        if (error?.code === "PAIRING_EXPIRED") {
          try {
            const packet = await startTeacherAssessmentPairing(deviceOnly ? ownCode : resolvedCode, { restart: true, deviceOnly });
            if (scopeRef.current !== scope) return;
            setOfferPacket(packet);
            setPairingError("Invitation replaced. Let the learner scan the new teacher QR.");
          } catch (retryError) { if (scopeRef.current === scope) setPairingError(retryError?.message || "Create a new teacher QR."); }
        } else setPairingError(error?.message || "The learner response code could not be read.");
      }
      return false;
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }, [resolvedCode, ownCode, deviceOnly, onCodeResolved]);

  const regenerateOffer = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setScanning(false);
    setPairingError("");
    setOfferPacket("");
    const scope = scopeRef.current;
    const request = ++offerRequestRef.current;
    try {
      const invitationCode = deviceOnly ? ownCode : resolvedCode;
      const packet = role === "learner" && deviceOnly
        ? await startLearnerDevicePairing(invitationCode, { restart: true })
        : await startTeacherAssessmentPairing(invitationCode, { restart: true, deviceOnly });
      if (scopeRef.current === scope && request === offerRequestRef.current) setOfferPacket(packet);
    } catch (error) {
      if (scopeRef.current === scope && request === offerRequestRef.current) setPairingError(error?.message || "Local connection setup failed.");
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  const cancelScan = useCallback(() => setScanning(false), []);
  const connected = Boolean(status.connected);
  useEffect(() => {
    if (connected) { setCodeDialog(""); setConfirmBack(false); }
  }, [connected]);
  useEffect(() => {
    if (confirmBack) cancelBackRef.current?.focus();
  }, [confirmBack]);
  useEffect(() => {
    if (status.state !== "disconnected" || getAssessmentPeerStatus(resolvedCode).state !== "disconnected") return;
    setOfferPacket("");
    setAnswerPacket("");
    setPairingError(previous => previous || status.detail || "Local link interrupted. Check Wi-Fi, then use a new teacher QR.");
  }, [status.state, resolvedCode]);
  useEffect(() => {
    if (!connected) {
      if (status.state === "idle" || status.state === "disconnected") notifiedConnectionRef.current = "";
      return;
    }
    const notificationKey = `${role}:${deviceOnly ? ownCode : resolvedCode}`;
    if (notifiedConnectionRef.current === notificationKey) return;
    notifiedConnectionRef.current = notificationKey;
    onPeerConnectedRef.current?.({ code: resolvedCode, role, status });
  }, [connected, resolvedCode, role, status, deviceOnly, ownCode]);

  // Device setup can happen before internet is lost; it never starts a run.
  const canPair = deviceOnly || (offline && !displayOnly);
  const blocked = !canPair && !displayOnly;
  const outgoingPacket = deviceOnly ? offerPacket : answerPacket || offerPacket;
  // QR and text carry the same self-contained compressed packet. No lookup.
  const pairingCode = useMemo(() => outgoingPacket, [outgoingPacket]);
  const qrMarkup = useMemo(() => createQrMarkup(pairingCode), [pairingCode]);
  const reconnectRequired = status.state === "reconnect_required";
  const restoring = Boolean(status.established && !connected && status.state !== "disconnected");
  const canReceive = !restoring && !answerPacket;
  const otherRole = role === "teacher" ? "learner" : "teacher";
  const incomingLabel = deviceOnly ? `Enter ${otherRole} connection or response code` : role === "teacher" ? "Learner connection code" : "Teacher connection code";
  const outgoingLabel = !deviceOnly && answerPacket ? `${role === "teacher" ? "Teacher" : "Learner"} response code` : `${role === "teacher" ? "Teacher" : "Learner"} connection code`;
  const responseLabel = `${role === "teacher" ? "Teacher" : "Learner"} response code`;
  const responseQrMarkup = useMemo(() => deviceOnly && answerPacket ? createQrMarkup(answerPacket) : "", [deviceOnly, answerPacket]);
  const qrCaption = role === "teacher" ? "Show this to the learner" : "Show this to the teacher";
  const showCodeDialog = kind => { setExpandedQr(false); setCodesError(""); setCodeCopied(""); setCodeDialog(kind); };
  const disconnectDevice = () => {
    // Only the confirmation button reaches this action. Retire all setup
    // peers for this role, including crossed invitations, before pairing anew.
    ++offerRequestRef.current;
    const freshCode = resetAssessmentDevicePairing(role);
    scopeRef.current = `${role}:${freshCode}`;
    setOwnCode(freshCode);
    setResolvedCode(freshCode);
    setStatus(getAssessmentPeerStatus(freshCode));
    setOfferPacket(""); setAnswerPacket(""); setTypedCode("");
    setPairingError(""); setCodesError(""); setScanning(false);
    setCodeDialog(""); setConfirmDisconnect(false);
    setConfirmBack(false);
    setCodeCopied(""); setFullscreenQr(false); setExpandedQr(false);
    notifiedConnectionRef.current = "";
  };
  const cancelBack = () => {
    setConfirmBack(false);
    backButtonRef.current?.focus();
  };
  const resetPendingPairing = () => {
    // Check the transport now: a response may finish pairing while this small
    // confirmation is open. Back must never tear down a newly established link.
    const current = getDevicePairingState(role);
    const currentStatus = getAssessmentPeerStatus(current.peerCode);
    if (current.retained || currentStatus.connected || currentStatus.established) {
      setConfirmBack(false);
      return;
    }
    disconnectDevice();
  };
  /*
   * No camera on either device: the same code that would have been scanned is
   * copied out of one device and pasted into the other. Nothing here needs a
   * hub, and the pasted value goes through the same reader a scan does.
   */
  const copyPairingCode = async (value = pairingCode) => {
    setCodeCopied("");
    setCodesError("");
    try {
      await navigator.clipboard.writeText(value);
      setCodeCopied(value);
      window.setTimeout(() => setCodeCopied(""), 2500);
    } catch {
      setCodeCopied("");
      setCodesError("Copy was blocked. Select the code and copy it by hand.");
    }
  };
  const submitTypedCode = async () => {
    const value = String(typedCode || "").trim();
    if (value.length < 20) {
      setPairingError("Paste the whole connection code from the other device.");
      return;
    }
    const accepted = await (role === "teacher" ? handleTeacherScan(value) : handleLearnerScan(value));
    if (accepted) setTypedCode("");
  };
  const stateLabel = displayOnly ? (connected ? "Devices connected" : outgoingPacket ? outgoingLabel : "Preparing the connection code…")
    : blocked ? "Available when offline"
    : connected ? "Devices connected"
    : submitting ? `Reading the ${otherRole} connection code…`
    : pairingError ? "Connection needs attention"
    : reconnectRequired ? "The local link needs to reconnect"
    : restoring ? `Restoring the connection to the ${otherRole}…`
    : status.state === "reconnecting" ? `Restoring the connection to the ${otherRole}…`
    : answerPacket ? deviceOnly ? `${role === "teacher" ? "Learner" : "Teacher"} code received. Finish connection below.` : "Show this response to the other device"
    : status.state === "connecting" ? `Response accepted. Connecting to the ${otherRole}…`
    : deviceOnly && outgoingPacket ? `Waiting for the ${otherRole} code or response…`
    : outgoingPacket ? "Scan or enter a code from the other device"
    : "Preparing the connection code…";

  if (hideWhenConnected && connected) return null;
  return (
    <>
    <section className={`local-pair-section${deviceOnly ? " is-device-setup" : ""}${blocked ? " is-blocked" : ""}`} aria-label="Offline device pairing">
      <style>{`
        .local-pair-section{box-sizing:border-box;width:100%;min-width:0;margin:16px 0;padding:16px;border:1px solid var(--crl-line,#d8e0e8);border-radius:14px;background:var(--crl-surface,#fff);color:var(--crl-text,#1a2b4c);font-family:Arial,Helvetica,sans-serif;text-align:left}
        .local-pair-section.is-blocked{background:#f6f6f4;border-color:#e2e2dd}
        .local-pair-title{margin:0;font-size:18px;font-weight:800}.local-pair-copy{margin:6px 0 0;color:var(--crl-muted,#526176);font-size:12.5px;line-height:1.5}
        .local-pair-content{margin-top:14px;padding:15px;border:1px solid var(--crl-line,#e3e8ee);border-radius:14px;background:var(--crl-surface-2,#fbfcfe)}
        .local-pair-state{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:700;color:var(--crl-muted,#526176)}
        .local-pair-dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:#31745a}
        .local-pair-spinner{width:16px;height:16px;flex:0 0 16px;border:2px solid #cfd8e2;border-top-color:var(--crl-text,#1a2b4c);border-radius:50%;animation:localPairSpin .8s linear infinite}
        .local-pair-qr{display:block;width:min(100%,260px);box-sizing:border-box;margin:14px auto 0;padding:10px;border:1px solid var(--crl-line,#d8e0e8);border-radius:12px;background:#fff;cursor:zoom-in}.local-pair-qr.is-compact{width:min(100%,200px)}.local-pair-qr svg{display:block;width:100%;height:auto}
        .local-pair-device{margin:12px 0 0;font-size:13px;font-weight:800;color:var(--crl-green,#2e5d49)}.local-pair-error{margin:12px 0 0;color:var(--crl-red,#9b2e22);font-size:12.5px;line-height:1.45}
        .local-pair-code-field{display:grid;gap:8px;margin-top:16px;font-size:13px;font-weight:800}
        .local-pair-code-field input{box-sizing:border-box;width:100%;min-width:0;min-height:46px;padding:10px;border:1px solid var(--crl-line-strong,#aab8cb);border-radius:9px;background:var(--crl-surface,#fff);color:var(--crl-text,#1a2b4c);font:12px/1.5 monospace;overflow-wrap:anywhere;word-break:break-all;letter-spacing:.15em}
        .local-pair-code-field input:focus{outline:2px solid #4a6fa5;outline-offset:2px}
        .local-pair-code{display:block;margin:10px 0;color:var(--crl-text,#1a2b4c);font:900 28px/1.3 monospace;letter-spacing:.18em;text-align:center}
        .local-pair-codes{margin-top:16px;padding:12px;border:1px solid var(--crl-line,#e3e8ee);border-radius:12px;background:var(--crl-surface,#fff)}
        .local-pair-incoming-label{display:block;margin-top:12px}
        .local-pair-codes summary{cursor:pointer;font-size:12.5px;font-weight:800}
        .local-pair-codes .local-pair-copy{margin-top:10px}
        .local-pair-finish{margin-top:18px}.local-pair-finish h4{margin:0;font-size:15px;line-height:1.4}
        .local-pair-name{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin:12px 0;color:var(--crl-muted,#526176);font-size:12.5px;overflow-wrap:anywhere}.local-pair-name span{flex:1 1 180px;min-width:0}.local-pair-name .local-pair-button{padding:6px 10px;background:transparent;color:var(--crl-text,#1a2b4c)}
        .local-pair-name-editor{margin:10px 0;padding:12px;border:1px solid var(--crl-line,#d8e0e8);border-radius:12px}.local-pair-name-editor label{display:block;font-size:13px;font-weight:700}.local-pair-name-editor input{box-sizing:border-box;width:100%;min-width:0;min-height:44px;margin-top:8px;padding:9px 10px;border:1px solid var(--crl-line-strong,#aab8cb);border-radius:9px;background:var(--crl-surface,#fff);color:var(--crl-text,#1a2b4c);font:inherit}
        .local-pair-reset{position:relative;box-sizing:border-box;width:min(100%,280px);margin:12px 0 0 auto;padding:12px;border:1px solid var(--crl-line,#d8e0e8);border-radius:12px;background:var(--crl-surface-2,#fbfcfe);color:var(--crl-text,#1a2b4c)}
        .local-pair-reset:before{content:"";position:absolute;top:-5px;right:32px;width:8px;height:8px;transform:rotate(45deg);border-top:1px solid var(--crl-line,#d8e0e8);border-left:1px solid var(--crl-line,#d8e0e8);background:var(--crl-surface-2,#fbfcfe)}
        .local-pair-reset p{margin:0;font-size:13px;font-weight:700;line-height:1.5}.local-pair-reset .local-pair-actions{margin-top:9px}
        .local-pair-long{box-sizing:border-box;width:100%;min-width:0;margin-top:8px;padding:9px;border:1px solid var(--crl-line-strong,#aab8cb);border-radius:9px;background:var(--crl-surface-2,#fbfcfe);color:var(--crl-text,#1a2b4c);font:11px/1.5 monospace;overflow-wrap:anywhere;word-break:break-all;resize:vertical}
        .local-pair-long:focus{outline:2px solid #4a6fa5;outline-offset:2px}
        .local-pair-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}.local-pair-button{min-height:44px;padding:8px 16px;border:0;border-radius:11px;background:var(--crl-active-bg,#1a2b4c);color:var(--crl-active-fg,#fff);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:transform .16s ease,background .16s ease}.local-pair-button:hover:not(:disabled){background:#243b66}.local-pair-button:active:not(:disabled){transform:scale(.98)}.local-pair-button.secondary{border:1px solid #cfd8e2;background:var(--crl-surface,#fff);color:var(--crl-text,#1a2b4c)}.local-pair-button:disabled{opacity:.6;cursor:wait}
        .local-pair-actions .local-pair-button{flex:1 1 auto}
        .local-pair-button.danger{border:1px solid #9b2e22;background:#9b2e22;color:#fff}.local-pair-button.danger:hover:not(:disabled){background:#7e251c}
        .local-pair-button:focus-visible{outline:2px solid #4a6fa5;outline-offset:3px}
        .local-pair-fullscreen{position:fixed;inset:0;z-index:13200;display:grid;place-items:center;padding:16px;background:rgba(10,20,36,.88);box-sizing:border-box}
        .local-pair-fullscreen-card{display:grid;gap:12px;justify-items:center;width:min(100%,560px)}
        .local-pair-fullscreen-caption{margin:0;color:#fff;font-size:15px;font-weight:800;text-align:center}
        .local-pair-fullscreen-qr{box-sizing:border-box;width:min(86vmin,520px);max-width:100%;padding:12px;border-radius:16px;background:#fff}
        .local-pair-fullscreen-qr svg{display:block;width:100%;height:auto}
        .local-pair-fullscreen .local-pair-button{min-width:150px}
        .local-pair-section.is-device-setup{margin:16px 0 0;padding:0;border:0;border-radius:0;background:transparent}
        .is-device-setup .local-pair-content{margin:0;padding:0;border:0;border-radius:0;background:transparent}
        .is-device-setup .local-pair-codes{padding:0;border:0;border-radius:0;background:transparent}
        .is-device-setup .local-pair-qr{border:0;border-radius:0}
        @keyframes localPairSpin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.local-pair-spinner{animation:none}.local-pair-button{transition:none}}
      `}</style>
      {!deviceOnly ? <h3 className="local-pair-title">{role === "teacher" ? "Teacher offline connection" : "Connect to teacher offline"}</h3> : null}
      <div className="local-pair-content">
        <div className="local-pair-state" role="status">
          {!blocked && !connected && !reconnectRequired && status.state !== "disconnected" && !pairingError && (!displayOnly || (role === "teacher" && !outgoingPacket)) ? <span className="local-pair-spinner" aria-hidden="true" /> : connected ? <span className="local-pair-dot" aria-hidden="true" /> : null}
          {stateLabel}
        </div>
        {deviceOnly ? <div className="local-pair-name"><span>This device: {localDeviceName}</span><button type="button" className="local-pair-button secondary" aria-expanded={editingDeviceName} aria-controls={`local-pair-name-${role}`} onClick={() => { setDeviceNameDraft(localDeviceName); setEditingDeviceName(value => !value); }}>Edit device name</button></div> : null}
        {deviceOnly && editingDeviceName ? <form id={`local-pair-name-${role}`} className="local-pair-name-editor" onSubmit={event => {
          event.preventDefault(); setLocalDeviceName(setAssessmentDeviceName(deviceNameDraft)); setEditingDeviceName(false);
        }}>
          <label htmlFor={`local-pair-name-input-${role}`}>Device name</label>
          <input id={`local-pair-name-input-${role}`} aria-label="Device name" value={deviceNameDraft} onChange={event => setDeviceNameDraft(event.target.value)} maxLength={80} autoComplete="off" />
          <p className="local-pair-copy">Use the name you want the paired device to show. For a computer, you can enter its name from system settings.</p>
          <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" onClick={() => setEditingDeviceName(false)}>Cancel</button><button type="submit" className="local-pair-button" disabled={!deviceNameDraft.trim()}>Save device name</button></div>
        </form> : null}
        {deviceOnly && !connected && !restoring && !answerPacket ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" aria-haspopup="dialog" onClick={() => showCodeDialog("invitation")}>Show my QR and connection code</button></div> : null}
        {deviceOnly && restoring ? <>
          <p className="local-pair-copy" role="status">{reconnectRequired ? "The old link is not responding. Keep both devices on the same Wi-Fi or hotspot, then reconnect using a new code if needed. Saved work and pending sync items stay on this device." : "Checking your paired device. Keep both devices on the same Wi-Fi or hotspot. Internet access is not required."}</p>
          <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" onClick={() => checkAssessmentPeerConnection(resolvedCode)}>Check connection</button></div>
        </> : null}
        {deviceOnly && !restoring && !answerPacket && pairingError ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" disabled={submitting} onClick={regenerateOffer}>Retry setup</button></div> : null}
        {!deviceOnly && !blocked && qrMarkup ? <>
          <button type="button" className="local-pair-qr is-compact" aria-label={role === "teacher" ? "Teacher pairing QR" : !deviceOnly && answerPacket ? "Learner response QR" : "Learner pairing QR"} onClick={() => setFullscreenQr("invitation")} dangerouslySetInnerHTML={{ __html: qrMarkup }} />
          <p className="local-pair-copy">{displayOnly ? qrCaption : `${qrCaption} · tap to enlarge.`}</p>
        </> : null}
        {canPair && !deviceOnly && !connected && canReceive ? <p className="local-pair-copy">{role === "teacher"
          ? "Scan or paste the learner’s code."
          : "Scan or paste the teacher’s code."}</p> : null}
        {canPair && !deviceOnly && !connected && role === "learner" && answerPacket ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" disabled={submitting} onClick={() => { setAnswerPacket(""); setScanning(false); setPairingError(""); }}>Use a new teacher code</button></div> : null}
        {pairingError ? <p className="local-pair-error" role="alert">{pairingError}</p> : null}
        {canPair && !deviceOnly && !connected && role === "teacher" ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" disabled={submitting} onClick={regenerateOffer}>New teacher QR</button></div> : null}
        {!deviceOnly && !blocked && pairingCode ? <>
          <textarea data-crl-code-field className="local-pair-long" readOnly value={pairingCode} rows={3} spellCheck={false} aria-label={outgoingLabel} onFocus={(event) => event.currentTarget.select()} />
          <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" onClick={() => void copyPairingCode()}>{codeCopied === pairingCode ? "Copied" : "Copy code"}</button></div>
        </> : null}
        {deviceOnly && !connected && !restoring && answerPacket ? <section className="local-pair-finish" aria-label="Finish connection">
          <h4>Finish connection</h4>
          <p className="local-pair-copy">On the {otherRole} device, scan or enter this response to finish pairing.</p>
          {responseQrMarkup ? <button type="button" className="local-pair-qr is-compact" aria-label={`${responseLabel} QR`} onClick={() => setFullscreenQr("response")} dangerouslySetInnerHTML={{ __html: responseQrMarkup }} /> : null}
          <label className="local-pair-copy local-pair-incoming-label" htmlFor={`local-pair-response-${role}`}>{responseLabel}</label>
          <textarea id={`local-pair-response-${role}`} data-crl-code-field className="local-pair-long" readOnly value={answerPacket} rows={3} spellCheck={false} aria-label={responseLabel} onFocus={event => event.currentTarget.select()} />
          <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" onClick={() => void copyPairingCode(answerPacket)}>{codeCopied === answerPacket ? "Copied" : "Copy response code"}</button><button ref={backButtonRef} type="button" className="local-pair-button secondary" aria-expanded={confirmBack} aria-controls={`local-pair-reset-${role}`} onClick={() => setConfirmBack(value => !value)}>Back</button></div>
          {confirmBack ? <div id={`local-pair-reset-${role}`} className="local-pair-reset" role="group" aria-labelledby={`local-pair-reset-question-${role}`} onKeyDown={event => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelBack(); }
          }}>
            <p id={`local-pair-reset-question-${role}`}>Reset connection?</p>
            <div className="local-pair-actions">
              <button ref={cancelBackRef} type="button" className="local-pair-button secondary" onClick={cancelBack}>Cancel</button>
              <button type="button" className="local-pair-button" onClick={resetPendingPairing}>Confirm</button>
            </div>
          </div> : null}
        </section> : null}
        {displayOnly && !connected && role === "learner" && !pairingCode ? <p className="local-pair-copy">Preparing your connection code…</p> : null}
        {/*
          * No camera on either device. The code below is the very same text the
          * QR would have carried, so copying it out of one device and pasting
          * it into the other connects them with nothing installed on the
          * network - no hub, no certificate, no server.
          */}
        {canPair && !connected && canReceive ? <div className="local-pair-codes">
          <div className="local-pair-actions"><button type="button" className="local-pair-button" disabled={submitting || scanning} onClick={() => setScanning(true)}>{role === "teacher" ? "Scan learner QR" : "Scan teacher QR"}</button></div>
          <AssessmentCodeScanner active={canPair && !connected && scanning} mode="pairing" onScan={role === "teacher" ? handleTeacherScan : handleLearnerScan} onCancel={cancelScan} />
          {canReceive ? <>
            {deviceOnly && !answerPacket ? <p className="local-pair-copy">Scan or enter the {otherRole} connection code, including a response to your code.</p> : null}
            <label className="local-pair-copy local-pair-incoming-label" htmlFor={`local-pair-incoming-${role}`}>{incomingLabel}</label>
            <textarea id={`local-pair-incoming-${role}`} data-crl-code-field className="local-pair-long" value={typedCode} onChange={(event) => { setTypedCode(event.target.value); setPairingError(""); }} rows={3} spellCheck={false} autoCapitalize="off" autoCorrect="off" placeholder="Paste the code from the other device" aria-label={incomingLabel} />
            <div className="local-pair-actions">
              <button type="button" className="local-pair-button" disabled={submitting || typedCode.trim().length < 20} onClick={() => void submitTypedCode()}>{submitting ? "Connecting…" : role === "teacher" ? "Connect to learner" : "Connect to teacher"}</button>
            </div>
          </> : null}
        </div> : null}
        {codesError ? <p className="local-pair-error" role="alert">{codesError}</p> : null}
        {canPair && connected && onConnected ? <div className="local-pair-actions"><button type="button" className="local-pair-button" onClick={() => onConnectedRef.current?.()}>Continue</button></div> : null}
        {deviceOnly && (connected || restoring || status.state === "disconnected") ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" aria-haspopup="dialog" onClick={() => setConfirmDisconnect(true)}>{reconnectRequired ? "Reconnect device" : connected || restoring ? "Disconnect device" : "Start a new connection"}</button></div> : null}
        {deviceOnly && connected ? <PairingConnectedNotice role={role} deviceName={status.remoteDeviceName} /> : null}
      </div>
    </section>
    {deviceOnly && codeDialog ? <PairingSettingsDialog
      title={codeDialog === "response" ? responseLabel : outgoingLabel}
      description={codeDialog === "response" ? `On the ${otherRole} device, scan or enter this response to finish connecting.` : `Let the ${otherRole} scan this QR or enter the connection code. Tap the QR to enlarge it.`}
      onClose={() => setCodeDialog("")}
    >
      {(codeDialog === "response" ? responseQrMarkup : qrMarkup) ? <button type="button" className={`local-pair-qr${expandedQr ? " is-expanded" : ""}`} aria-label={`${codeDialog === "response" ? responseLabel : outgoingLabel} QR`} aria-expanded={expandedQr} onClick={() => setExpandedQr(value => !value)} dangerouslySetInnerHTML={{ __html: codeDialog === "response" ? responseQrMarkup : qrMarkup }} /> : <p role="status">{pairingError || "Preparing the connection code…"}</p>}
      {(codeDialog === "response" ? answerPacket : pairingCode) ? <>
        <label className="local-pair-copy" htmlFor={`local-pair-outgoing-${role}`}>{codeDialog === "response" ? responseLabel : outgoingLabel}</label>
        <textarea id={`local-pair-outgoing-${role}`} data-crl-code-field className="local-pair-long" readOnly value={codeDialog === "response" ? answerPacket : pairingCode} rows={3} spellCheck={false} aria-label={codeDialog === "response" ? responseLabel : outgoingLabel} onFocus={event => event.currentTarget.select()} />
        <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" onClick={() => void copyPairingCode(codeDialog === "response" ? answerPacket : pairingCode)}>{codeCopied === (codeDialog === "response" ? answerPacket : pairingCode) ? "Copied" : "Copy code"}</button></div>
      </> : null}
      {codesError ? <p className="local-pair-error" role="alert">{codesError}</p> : null}
      {codeDialog === "invitation" ? <div className="local-pair-actions"><button type="button" className="local-pair-button secondary" disabled={submitting} onClick={regenerateOffer}>{role === "teacher" ? "New teacher QR" : "New learner QR"}</button></div> : null}
    </PairingSettingsDialog> : null}
    {deviceOnly && confirmDisconnect ? <PairingSettingsDialog
      title={reconnectRequired ? "Reconnect device?" : "Disconnect device?"}
      description={`Disconnect the ${otherRole} device and prepare a new connection? ${(connected || restoring) && !status.deviceOnly ? "An assessment using this offline link will be interrupted. " : ""}Saved assessments and pending sync items will stay on this device.`}
      onClose={() => setConfirmDisconnect(false)}
    >
      <div className="local-pair-actions">
        <button type="button" className="local-pair-button secondary" onClick={() => setConfirmDisconnect(false)}>Cancel</button>
        <button type="button" className="local-pair-button danger" onClick={disconnectDevice}>Disconnect and start new</button>
      </div>
    </PairingSettingsDialog> : null}
    {fullscreenQr && (fullscreenQr === "response" ? responseQrMarkup : qrMarkup) && typeof document !== "undefined" ? createPortal(
      <div className="local-pair-fullscreen" role="dialog" aria-modal="true" aria-label={fullscreenQr === "response" ? responseLabel : qrCaption} onClick={(event) => { if (event.target === event.currentTarget) setFullscreenQr(false); }}>
        <div className="local-pair-fullscreen-card">
          <p className="local-pair-fullscreen-caption">{fullscreenQr === "response" ? responseLabel : qrCaption}</p>
          <div className="local-pair-fullscreen-qr" dangerouslySetInnerHTML={{ __html: fullscreenQr === "response" ? responseQrMarkup : qrMarkup }} />
          <button type="button" className="local-pair-button" onClick={() => setFullscreenQr(false)}>Close</button>
        </div>
      </div>,
      document.body
    ) : null}
    </>
  );
}
