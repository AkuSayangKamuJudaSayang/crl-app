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
    if (busy) return;
    setOpen(true);
    setError("");
    setResult(null);
    setDragActive(false);
    inputRef.current?.click();
  };

  const openImportModal = () => {
    if (busy) return;
    setOpen(true);
    setError("");
    setResult(null);
    setDragActive(false);
  };

  const closeImportModal = () => {
    if (busy) return;
    setOpen(false);
    setError("");
    setResult(null);
    setDragActive(false);
  };

  const processFile = async (file) => {
    if (!file || busy) return;
    setOpen(true);
    setBusy(true);
    setError("");
    setResult(null);
    setDragActive(false);

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
    html[data-crl-theme="dark"] .importBusyCard {
      background: #1b2530 !important;
      color: #eaf3fa !important;
      box-shadow: 10px 10px 22px rgba(4,8,14,.48), -8px -8px 17px rgba(45,63,80,.28);
    }
    html[data-crl-theme="dark"] .importBusyCard strong {
      color: #f0f6fb !important;
    }
    html[data-crl-theme="dark"] .importBusyCard .busySubtext {
      color: #9fb2c5 !important;
    }
    html[data-crl-theme="dark"] .importBusyCard .busySpinner {
      border-color: rgba(84,151,207,.22);
      border-top-color: #72b2e7;
    }
    html[data-crl-theme="dark"] .classRecordDropZone {
      background: #1b2530 !important;
      color: #dce8f2 !important;
      border-color: #3d556a !important;
      box-shadow: inset 5px 5px 12px rgba(4,8,14,.38), inset -5px -5px 12px rgba(46,63,80,.28);
    }
    html[data-crl-theme="dark"] .classRecordDropZone strong {
      color: #eef5fb !important;
    }
    html[data-crl-theme="dark"] .classRecordDropZone span,
    html[data-crl-theme="dark"] .classRecordDropZone small {
      color: #9eb1c4 !important;
    }
    html[data-crl-theme="dark"] .importSuccessState strong {
      color: #f0f6fb !important;
    }
    html[data-crl-theme="dark"] .importSuccessState span {
      color: #9eb3c6 !important;
    }
    html[data-crl-theme="dark"] .importSuccessIcon {
      background: #233341 !important;
      color: #6fce9d !important;
      box-shadow: 7px 7px 15px rgba(4,8,14,.44), -6px -6px 14px rgba(45,63,80,.30);
    }

    .importBusyCard { min-width: min(420px, 100%); border-radius: 18px; }\n    @media (max-width: 720px) {
      .modal {
        width: calc(100vw - 20px) !important;
        max-width: calc(100vw - 20px) !important;
        max-height: calc(100svh - 20px) !important;
        margin: 10px !important;
        overflow-y: auto !important;
        border-radius: 16px !important;
      }

      .modalHeader {
        padding: 14px 16px !important;
      }

      .modalHeader h2 {
        font-size: 16px !important;
      }

      .modalBody {
        padding: 12px !important;
      }

      .classRecordDropZone {
        min-height: 190px !important;
        padding: 18px 12px !important;
      }

      .classRecordDropZone strong {
        font-size: 15px !important;
      }

      .classRecordDropZone span {
        font-size: 12px !important;
      }

      .importSuccessState {
        min-height: 210px !important;
        padding: 22px 14px !important;
      }

      .importSuccessState strong {
        font-size: 16px !important;
      }

      .importBusyCard {
        min-width: 0 !important;
        width: 100% !important;
      }

      .modalFooter {
        padding: 12px !important;
      }

      .modalFooter > button {
        min-height: 44px !important;
      }
    }

    @media (max-width: 420px) {
      .modal {
        width: calc(100vw - 12px) !important;
        max-width: calc(100vw - 12px) !important;
        max-height: calc(100svh - 12px) !important;
        margin: 6px !important;
      }

      .classRecordDropIcon {
        width: 48px !important;
        height: 48px !important;
        font-size: 24px !important;
      }
    }

    .importSuccessState {
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
        onClick={openImportModal}
        disabled={busy}
        title="Import learners from an Excel class record"
      >
        Import Class Record
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="modalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeImportModal();
          }}
        >
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modalHeader">
              <h2>Import Class Record</h2>
              <button
                type="button"
                className="closeButton"
                onClick={closeImportModal}
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
                  onClick={closeImportModal}
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
