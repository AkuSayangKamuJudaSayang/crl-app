import { Suspense } from "react";
import AssessmentClient from "./AssessmentClient";

function AssessmentLoading() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        background:
          "linear-gradient(180deg, #f8fbff 0%, #edf4fb 100%)",
        fontFamily:
          "Arial, Helvetica, sans-serif",
        color: "#1559a6",
      }}
    >
      <div
        style={{
          width: "min(100%, 430px)",
          padding: "28px",
          background: "#ffffff",
          border: "1px solid #dce6f0",
          borderRadius: "12px",
          textAlign: "center",
          boxShadow:
            "0 10px 30px rgba(31, 60, 90, 0.07)",
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
              "crlSpin 0.8s linear infinite",
          }}
        />

        <h1
          style={{
            margin: 0,
            fontSize: "18px",
            fontWeight: 900,
            color: "#1d3048",
          }}
        >
          Loading Assessment
        </h1>

        <p
          style={{
            margin: "7px 0 0",
            fontSize: "10px",
            lineHeight: 1.6,
            color: "#78899c",
          }}
        >
          Preparing the teacher assessment
          interface...
        </p>
      </div>

      <style>{`
        @keyframes crlSpin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}

export default function AssessmentPage() {
  return (
    <Suspense fallback={<AssessmentLoading />}>
      <AssessmentClient />
    </Suspense>
  );
}