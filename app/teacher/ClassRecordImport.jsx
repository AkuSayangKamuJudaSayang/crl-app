"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function ClassRecordImport({ onImported }) {
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const chooseFile = () => {
    if (!busy) inputRef.current?.click();
  };

  const processFile = async (file) => {
    if (!file || busy) return;
    setOpen(true);
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const allowed = /\.(xls|xlsx|csv)$/i.test(file.name);
      if (!allowed) throw new Error("Please upload an .xls, .xlsx, or .csv class record file.");

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/teacher/import-learners", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        body: formData,
        headers: { Accept: "application/json" },
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Unable to import the class record.");

      setResult(data);
      await onImported?.(data);
    } catch (err) {
      setError(err?.message || "Unable to import the class record.");
    } finally {
      setBusy(false);
      setDragActive(false);
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await processFile(file);
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await processFile(file);
  };

  const importSuccessStyles = `
    .importBusyCard { min-width: min(420px, 100%); border-radius: 18px; }\n    .importSuccessState {
      min-height: 250px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      text-align: center;
      padding: 28px;
    }
    .importSuccessIcon {
      width: 58px;
      height: 58px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: #e9f1f9;
      color: #2f8a68;
      font-size: 30px;
      font-weight: 900;
      box-shadow: 8px 8px 16px rgba(161,180,201,.40), -8px -8px 16px rgba(255,255,255,.94);
    }
    .importSuccessState strong {
      font-size: 18px;
      color: #22415f;
    }
    .importSuccessState span {
      color: #73879d;
      font-size: 13px;
    }
  `;

  return (
    <>
      <style>{importSuccessStyles}</style>
      <input
        ref={inputRef}
        type="file"
        accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        onChange={handleFile}
        style={{ display: "none" }}
      />

      <button
        type="button"
        className="toolbarButton importGreenButton"
        onClick={() => setOpen(true)}
        disabled={busy}
        title="Import learners from an Excel class record"
      >
        Import Class Record
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="modalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modalHeader">
              <h2>Import Class Record</h2>
              <button
                type="button"
                className="closeButton"
                onClick={() => !busy && setOpen(false)}
                disabled={busy}
              >
                ×
              </button>
            </div>

            <div className="modalBody">
              {!busy && !result && !error && (
                <div
                  className={`classRecordDropZone ${dragActive ? "dragActive" : ""}`}
                  onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); setDragActive(true); }}
                  onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDragActive(true); }}
                  onDragLeave={(event) => { event.preventDefault(); event.stopPropagation(); if (event.currentTarget === event.target) setDragActive(false); }}
                  onDrop={handleDrop}
                  onClick={chooseFile}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") chooseFile(); }}
                >
                  <div className="classRecordDropIcon">↑</div>
                  <strong>Drop class record here</strong>
                  <span>or choose a file from your computer</span>
                  <button type="button" className="toolbarButton importGreenButton" onClick={(event) => { event.stopPropagation(); chooseFile(); }}>
                    Browse Computer
                  </button>
                  <small>.xls · .xlsx · .csv</small>
                </div>
              )}

              {busy && (
                <div className="busyCard importBusyCard" role="status" aria-live="polite">
                  <span className="busySpinner" />
                  <div>
                    <strong>Importing Class Record</strong>
                    <div className="busySubtext">
                      Please wait while the learner records are being imported.
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div
                  style={{
                    padding: 18,
                    borderRadius: 14,
                    background: "#fff2f2",
                    color: "#c62828",
                    fontWeight: 700,
                  }}
                >
                  {error}
                </div>
              )}

              {result && (
                <div className="importSuccessState">
                  <div className="importSuccessIcon" aria-hidden="true">✓</div>
                  <strong>Successfully Imported</strong>
                  <span>
                    {Number(result.importedCount ?? 0)} learner
                    {Number(result.importedCount ?? 0) === 1 ? "" : "s"} successfully imported.
                  </span>
                </div>
              )}

            </div>

            {!busy && (
              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => setOpen(false)}
                >
                  {result || error ? "Close" : "Cancel"}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
