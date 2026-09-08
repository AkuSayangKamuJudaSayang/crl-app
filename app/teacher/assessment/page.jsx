"use client";

import {
  useEffect,
  useState,
} from "react";
import AssessmentClient from "./AssessmentClient";

function LoadingAssessment() {
  return (
    <>
      <style>{`
        @keyframes crlAssessmentSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          background:
            "linear-gradient(180deg,#f8fbff 0%,#edf4fb 100%)",
          fontFamily:
            "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            width: "min(100%,430px)",
            padding: "28px",
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #dce6f0",
            borderRadius: "14px",
            boxShadow:
              "0 10px 30px rgba(31,60,90,.07)",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              margin: "0 auto 14px",
              borderRadius: "50%",
              border: "4px solid #dfeaf5",
              borderTopColor: "#1559a6",
              animation:
                "crlAssessmentSpin .72s linear infinite",
            }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: "20px",
              fontWeight: 900,
              color: "#1d3048",
            }}
          >
            Loading Assessment
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: "13px",
              lineHeight: 1.6,
              color: "#78899c",
            }}
          >
            Preparing the teacher assessment interface...
          </p>
        </div>
      </main>
    </>
  );
}

function readQueryParam(
  search,
  key,
  fallback = ""
) {
  const value =
    search.get(key);

  return value == null
    ? fallback
    : value;
}

export default function AssessmentPage() {
  const [params, setParams] =
    useState(null);

  useEffect(() => {
    const search =
      new URLSearchParams(
        window.location.search
      );

    setParams({
      code: readQueryParam(
        search,
        "code"
      ),
      learnerId: readQueryParam(
        search,
        "learner_id"
      ),
      period: readQueryParam(
        search,
        "period",
        "BoSY"
      ) || "BoSY",
    });
  }, []);

  if (!params) {
    return <LoadingAssessment />;
  }

  return (
    <AssessmentClient
      initialCode={params.code}
      initialLearnerId={
        params.learnerId
      }
      initialPeriod={params.period}
    />
  );
}
