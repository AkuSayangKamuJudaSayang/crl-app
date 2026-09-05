"use client";

import { useRef, useState } from "react";

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

  return (
    <>
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

      {open && (
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
                <div
                  style={{
                    padding: 18,
                    borderRadius: 14,
                    background: "#eef6ff",
                    color: "#1559a6",
                    fontWeight: 700,
                  }}
                >
                  Reading the class record and importing only LRN, last name,
                  first name, middle name, and sex…
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
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      padding: 18,
                      borderRadius: 14,
                      background: "#effaf4",
                      color: "#17683f",
                      fontWeight: 800,
                    }}
                  >
                    {result.message}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 10,
                    }}
                  >
                    <div className="profileItem">
                      <div className="profileLabel">Extracted</div>
                      <div className="profileValue">{result.extractedCount}</div>
                    </div>
                    <div className="profileItem">
                      <div className="profileLabel">Imported</div>
                      <div className="profileValue">{result.importedCount}</div>
                    </div>
                    <div className="profileItem">
                      <div className="profileLabel">Skipped</div>
                      <div className="profileValue">{result.skippedCount}</div>
                    </div>
                  </div>

                  {result.duplicateCount > 0 && (
                    <p style={{ margin: 0, color: "#53657a" }}>
                      Duplicate LRNs already registered in the system were not added again.
                    </p>
                  )}

                  {Array.isArray(result.skippedRows) && result.skippedRows.length > 0 && (
                    <div
                      style={{
                        padding: 14,
                        borderRadius: 12,
                        background: "#fff9ec",
                        color: "#7b5a16",
                        fontSize: 13,
                      }}
                    >
                      Some spreadsheet rows were skipped because they did not contain a
                      valid learner record. No unrelated columns were imported.
                    </div>
                  )}
                </div>
              )}

            </div>

            <div className="modalFooter">
              <button
                type="button"
                className="secondaryButton"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                {result || error ? "Close" : "Cancel"}
              </button>


            </div>
          </div>
        </div>
      )}
    </>
  );
}
