"use client";

import { useEffect } from "react";
import { getOfflineTeacherSession, getOfflineTeacherSnapshot } from "../../lib/teacherOfflineDb";

function parseRequest(input) {
  const raw = typeof input === "string" ? input : input?.url;
  return new URL(raw, window.location.origin);
}

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function buildOfflineExcel(period, mode) {
  const session = await getOfflineTeacherSession();
  const userId = Number(session?.user?.id || 0);
  if (!userId || Number(session?.expiresAt || 0) <= Date.now()) return null;

  const snapshot = await getOfflineTeacherSnapshot(userId);
  const learners = Array.isArray(snapshot?.learners) ? snapshot.learners : [];
  const assessments = Array.isArray(snapshot?.assessments) ? snapshot.assessments : [];
  const learnerMap = new Map(learners.map((learner) => [Number(learner?.id), learner]));
  const filtered = assessments.filter((assessment) => !period || String(assessment?.assessment_period || "") === period);

  const rows = [
    ["CRL-App Assessment Records"],
    ["Teacher", session.user?.full_name || session.user?.username || "Teacher"],
    ["Period", period || "All"],
    ["Mode", mode || "records"],
    [],
    ["LRN", "Learner", "Grade", "Section", "Assessment Period", "Date", "Task 1", "Task 2", "Total Miscues", "Reading Accuracy", "Comprehension", "Classification", "Timer (sec)", "Remarks"],
  ];

  for (const assessment of filtered) {
    const learner = learnerMap.get(Number(assessment?.learner_id));
    const learnerName = learner
      ? `${learner.last_name || ""}, ${learner.first_name || ""} ${learner.middle_name || ""}`.trim()
      : `Learner #${assessment?.learner_id ?? ""}`;
    rows.push([
      learner?.lrn || "",
      learnerName,
      learner?.grade_level ?? "",
      learner?.section || "",
      assessment?.assessment_period || "",
      assessment?.date_administered ? new Date(assessment.date_administered).toLocaleDateString() : "",
      Number(assessment?.task1_score || 0),
      Number(assessment?.task2_score || 0),
      Number(assessment?.total_miscues || 0),
      assessment?.miscue_accuracy ?? "",
      Number(assessment?.comprehension_score || 0),
      assessment?.classification_label || assessment?.overall_classification || "",
      assessment?.timer_seconds ?? "",
      assessment?.remarks || "",
    ]);
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;

  try {
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Assessment Records");
    const array = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    return new Response(array, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="CRL-App-${period || "All"}-Offline.xlsx"`,
        "X-CRL-Offline": "true",
      },
    });
  } catch {
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="CRL-App-${period || "All"}-Offline.xls"`,
        "X-CRL-Offline": "true",
      },
    });
  }
}

export default function OfflineReportRuntime() {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (window.__crlReportFetchInstalled) return undefined;

    const previousFetch = window.fetch.bind(window);
    window.__crlReportFetchInstalled = true;

    window.fetch = async (input, init) => {
      try {
        return await previousFetch(input, init);
      } catch (error) {
        let url;
        try {
          url = parseRequest(input);
        } catch {
          throw error;
        }

        if (url.pathname !== "/api/reports/excel") throw error;

        const report = await buildOfflineExcel(
          url.searchParams.get("period") || "",
          url.searchParams.get("mode") || "records"
        );
        if (report) return report;
        throw error;
      }
    };

    return () => {
      // Keep the wrapper for the lifetime of the app; other offline components
      // may already have captured it, and restoring it during route changes can
      // create a race between wrappers.
    };
  }, []);

  return null;
}
