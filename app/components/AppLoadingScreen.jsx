"use client";

import { useEffect, useState } from "react";

const MIN_LOADING_MS = 3000;

const BOOT_CSS = ".crlBootScreen{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(circle at 50% 38%,rgba(255,255,255,.99),rgba(239,247,253,.98) 36%,rgba(220,234,246,1));font-family:var(--font-outfit),Outfit,Arial,sans-serif;color:#163f63;animation:crlIn .6s ease both}.crlBootScreenExit{pointer-events:none;animation:crlOut .7s ease forwards}.crlBackdrop{position:absolute;inset:-20%;background:radial-gradient(circle at 20% 20%,rgba(35,118,198,.16),transparent 24%),radial-gradient(circle at 82% 74%,rgba(231,48,48,.1),transparent 23%);animation:crlDrift 7s ease-in-out infinite}.crlGrid{position:absolute;inset:-30%;opacity:.22;background-image:linear-gradient(rgba(21,89,166,.065) 1px,transparent 1px),linear-gradient(90deg,rgba(21,89,166,.065) 1px,transparent 1px);background-size:46px 46px;transform:perspective(700px) rotateX(62deg) translateY(26%);animation:crlGrid 10s linear infinite}.crlOrb{position:absolute;width:30vw;height:30vw;max-width:440px;max-height:440px;border-radius:50%;filter:blur(28px);opacity:.28;animation:crlOrb 6.5s ease-in-out infinite}.crlOrbOne{top:-9%;left:9%;background:rgba(45,132,210,.25)}.crlOrbTwo{right:3%;bottom:-12%;background:rgba(226,54,54,.13);animation-delay:-2.2s}.crlBootContent{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;width:min(94vw,820px);text-align:center}.crlLogoWrap{position:relative;width:min(92vw,760px);height:min(34vw,250px);display:grid;place-items:center;margin-bottom:2px;animation:crlFloat 3.2s ease-in-out infinite}.crlLogoAura{position:absolute;width:70%;height:70%;border-radius:40%;background:rgba(255,255,255,.5);filter:blur(22px);box-shadow:0 0 90px rgba(22,96,168,.16),0 0 120px rgba(231,47,47,.07);animation:crlAura 2.8s ease-in-out infinite}.crlLogoRing{position:absolute;border-radius:50%;border:1px solid rgba(43,112,170,.17);animation:crlSpin 8s linear infinite}.crlRingOne{width:56%;height:74%}.crlRingTwo{width:78%;height:92%;border-color:rgba(218,58,58,.11);animation-direction:reverse;animation-duration:12s}.crlLogoImage{position:relative;width:min(88vw,700px);height:auto;max-height:240px;object-fit:contain;filter:drop-shadow(0 20px 28px rgba(36,74,107,.16)) drop-shadow(0 2px 2px rgba(255,255,255,.9));animation:crlPulse 2.35s ease-in-out infinite}.crlTitle{margin-top:4px;color:#163f63;font-size:clamp(36px,5vw,56px);line-height:1;font-weight:950;letter-spacing:-.045em;text-shadow:0 9px 25px rgba(22,63,99,.12);animation:crlText .72s .08s both}.crlSubtitle{margin-top:10px;color:#6d879e;font-size:clamp(13px,1.7vw,17px);line-height:1.5;font-weight:650;letter-spacing:.02em;animation:crlText .72s .16s both}.crlStatus{display:inline-flex;align-items:center;gap:9px;margin-top:22px;padding:11px 16px;border:1px solid rgba(203,219,232,.96);border-radius:999px;background:rgba(247,251,255,.76);color:#5f7890;font-size:11px;font-weight:800;box-shadow:8px 8px 17px rgba(130,155,179,.14),-6px -6px 14px rgba(255,255,255,.86);animation:crlText .72s .24s both}.crlDot{width:8px;height:8px;border-radius:50%;background:#2f83cf;box-shadow:0 0 0 5px rgba(47,131,207,.1),0 0 18px rgba(47,131,207,.32);animation:crlDot .95s ease-in-out infinite}.crlTrack{position:relative;width:min(76vw,470px);height:11px;margin-top:22px;overflow:hidden;border:1px solid rgba(200,216,230,.96);border-radius:999px;background:#e6f0f7;box-shadow:inset 4px 4px 8px rgba(148,169,190,.2),inset -4px -4px 8px rgba(255,255,255,.8),0 14px 24px rgba(116,143,166,.1);animation:crlText .72s .32s both}.crlBar{position:absolute;inset:0 auto 0 0;border-radius:inherit;background:linear-gradient(90deg,#195eaf 0%,#2d84c9 55%,#e52a2a 100%);box-shadow:0 0 18px rgba(47,125,194,.3);transition:width .08s linear}.crlShimmer{position:absolute;inset:0;width:34%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.7),transparent);transform:translateX(-150%);animation:crlShimmer 1.05s linear infinite}.crlMeta{display:flex;justify-content:space-between;width:min(76vw,470px);margin-top:9px;color:#7890a4;font-size:10px;font-weight:800;letter-spacing:.04em;animation:crlText .72s .38s both}@keyframes crlIn{from{opacity:0;transform:scale(1.02)}to{opacity:1;transform:scale(1)}}@keyframes crlOut{0%{opacity:1;transform:scale(1);filter:blur(0)}70%{opacity:.62;transform:scale(1.025);filter:blur(2px)}100%{opacity:0;transform:scale(1.06);filter:blur(8px)}}@keyframes crlFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}@keyframes crlPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.018)}}@keyframes crlAura{0%,100%{opacity:.45;transform:scale(.98)}50%{opacity:.78;transform:scale(1.04)}}@keyframes crlSpin{to{transform:rotate(360deg)}}@keyframes crlOrb{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(2vw,-1.5vw,0) scale(1.08)}}@keyframes crlDrift{0%,100%{transform:scale(1) translate(0,0)}50%{transform:scale(1.04) translate(-1%,1%)}}@keyframes crlGrid{to{transform:perspective(700px) rotateX(62deg) translateY(34%)}}@keyframes crlText{from{opacity:0;transform:translateY(13px)}to{opacity:1;transform:translateY(0)}}@keyframes crlDot{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.32);opacity:1}}@keyframes crlShimmer{to{transform:translateX(440%)}}@media(max-width:600px){.crlLogoWrap{width:96vw;height:37vw}.crlLogoImage{width:94vw;max-height:150px}.crlStatus{font-size:10px;padding:9px 13px}}@media(prefers-reduced-motion:reduce){.crlBootScreen *{animation-duration:.01ms!important;animation-iteration-count:1!important}}";

export default function AppLoadingScreen() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const started = performance.now();
    let raf;

    const tick = (now) => {
      const ratio = Math.min((now - started) / MIN_LOADING_MS, 1);
      setProgress(Math.round(ratio * 100));

      if (ratio < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setExiting(true);
        window.setTimeout(() => setVisible(false), 700);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={exiting ? "crlBootScreen crlBootScreenExit" : "crlBootScreen"}
      role="status"
      aria-live="polite"
      aria-label="Loading CRL-App"
    >
      <style dangerouslySetInnerHTML={{ __html: BOOT_CSS }} />
      <div className="crlBackdrop" />
      <div className="crlGrid" />
      <div className="crlOrb crlOrbOne" />
      <div className="crlOrb crlOrbTwo" />

      <div className="crlBootContent">
        <div className="crlLogoWrap">
          <div className="crlLogoAura" />
          <div className="crlRing crlRingOne" />
          <div className="crlRing crlRingTwo" />
          <img
            src="/crl-app-logo.webp"
            alt="CRL-App"
            className="crlLogoImage"
          />
        </div>

        <div className="crlTitle">CRL-App</div>
        <div className="crlSubtitle">Comprehensive Rapid Literacy Assessment</div>

        <div className="crlStatus">
          <span className="crlDot" />
          <span>Preparing your assessment workspace</span>
        </div>

        <div className="crlTrack">
          <div className="crlBar" style={{ width: progress + "%" }} />
          <div className="crlShimmer" />
        </div>

        <div className="crlMeta">
          <span>Loading CRL-App</span>
          <span>{progress}%</span>
        </div>
      </div>
    </div>
  );
}
