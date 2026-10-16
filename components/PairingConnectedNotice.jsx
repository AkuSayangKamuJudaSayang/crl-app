"use client";

// Render in the settings overlay, and only while its data channel is open.
export default function PairingConnectedNotice({ role, deviceName }) {
  const otherDevice = role === "teacher" ? "Learner device" : "Teacher device";
  return (
    <div className="crl-pairing-notice" role="status" aria-live="polite" aria-atomic="true">
      <style>{`.crl-pairing-notice{position:sticky;bottom:0;display:flex;align-items:flex-start;gap:10px;box-sizing:border-box;width:100%;margin-top:16px;padding:12px 14px;border:1px solid #a7d8b9;border-radius:10px;background:#e7f5ec;color:#155b35;font:14px/1.5 Arial,Helvetica,sans-serif;overflow-wrap:anywhere}.crl-pairing-notice-icon{flex:0 0 auto;font-weight:800}.crl-pairing-notice strong{display:block;font-size:14px}.crl-pairing-notice p{margin:2px 0 0;font-size:13px;color:inherit}`}</style>
      <span className="crl-pairing-notice-icon" aria-hidden="true">✓</span>
      <div>
        <strong>{otherDevice} successfully connected</strong>
        <p>{deviceName || otherDevice}. Ready for offline assessments.</p>
      </div>
    </div>
  );
}
