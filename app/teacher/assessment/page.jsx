"use client";

import {
  Component,
  useEffect,
  useState,
} from "react";
import dynamic from "next/dynamic";

const AssessmentClient = dynamic(
  () => import("./AssessmentClient"),
  {
    ssr: false,
    loading: () => (
      <LoadingAssessment />
    ),
  }
);

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
          background: "#f5f6f8",
          fontFamily:
            '"Outfit", Arial, Helvetica, sans-serif',
        }}
      >
        <div
          style={{
            width: "min(100%,430px)",
            padding: "30px",
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #e5e8ed",
            borderRadius: "16px",
            boxShadow: "none",
          }}
        >
          <div
            style={{
              width: "44px",
              height: "44px",
              margin: "0 auto 14px",
              borderRadius: "50%",
              border: "4px solid #e5e8ed",
              borderTopColor: "#3a5a7d",
              animation:
                "crlAssessmentSpin .72s linear infinite",
            }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: "21px",
              fontWeight: 900,
              color: "#1f2937",
            }}
          >
            Loading Assessment
          </h1>
          <p
            style={{
              margin: "9px 0 0",
              fontSize: "13px",
              lineHeight: 1.6,
              color: "#64748b",
            }}
          >
            Preparing the teacher assessment interface...
          </p>
        </div>
      </main>
    </>
  );
}

class AssessmentErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(
      "CRL-App assessment runtime error:",
      error,
      info
    );

    try {
      sessionStorage.setItem(
        "crla_assessment_runtime_diagnostic",
        JSON.stringify({
          name: String(error?.name || ""),
          message: String(error?.message || error || ""),
          stack: String(error?.stack || ""),
          componentStack: String(
            info?.componentStack || ""
          ),
          path: window.location.pathname,
          query: window.location.search,
          time: new Date().toISOString(),
        })
      );
    } catch {}
  }

  render() {
    if (this.state.error) {
      return (
        <AssessmentDiagnosticScreen
          error={this.state.error}
          reset={() =>
            this.setState({
              error: null,
            })
          }
        />
      );
    }

    return this.props.children;
  }
}

function AssessmentDiagnosticScreen({
  error,
  reset,
}) {
  const [
    diagnosticCopied,
    setDiagnosticCopied,
  ] = useState(false);

  const message = String(
    error?.message ||
      error ||
      "Unknown assessment runtime error."
  );

  const diagnostic = [
    `Name: ${String(
      error?.name || "Error"
    )}`,
    `Message: ${message}`,
    `URL: ${typeof window !== "undefined" ? window.location.href : "unknown"}`,
    `Time: ${new Date().toISOString()}`,
    `Stack:\n${String(
      error?.stack || "No stack available."
    ).slice(0, 6000)}`,
  ].join("\n\n");

  const copyDiagnostic = async () => {
    try {
      await navigator.clipboard.writeText(
        diagnostic
      );
      setDiagnosticCopied(true);
      window.setTimeout(
        () => setDiagnosticCopied(false),
        1800
      );
    } catch {}
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f6f8",
        color: "#1f2937",
        fontFamily:
          '"Outfit", Arial, Helvetica, sans-serif',
      }}
    >
      <section
        style={{
          width: "min(760px,96vw)",
          maxHeight: "92vh",
          overflow: "auto",
          padding: "30px",
          borderRadius: "16px",
          background: "#ffffff",
          border: "1px solid #e5e8ed",
          boxShadow: "none",
        }}
      >
        <div
          style={{
            width: "54px",
            height: "54px",
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            background: "#f4e9ec",
            color: "#9c4a5b",
            fontSize: "28px",
            fontWeight: 950,
          }}
        >
          !
        </div>

        <div
          style={{
            marginTop: "16px",
            color: "#64748b",
            fontSize: "12px",
            fontWeight: 900,
            letterSpacing: ".12em",
            textTransform: "uppercase",
          }}
        >
          Assessment Runtime Diagnostic
        </div>

        <h1
          style={{
            margin: "7px 0 0",
            color: "#1f2937",
            fontSize: "28px",
            fontWeight: 950,
          }}
        >
          The assessment interface encountered an error.
        </h1>

        <p
          style={{
            margin: "12px 0 18px",
            color: "#64748b",
            fontSize: "15px",
            lineHeight: 1.6,
          }}
        >
          The rest of your signed-in application is not being
          intentionally reset. The exact runtime diagnosis is
          shown below so the failing component can be identified
          instead of displaying a generic loading message.
        </p>

        <div
          style={{
            padding: "15px",
            borderRadius: "14px",
            background: "#f4e9ec",
            border: "1px solid #e8d4da",
            color: "#7a3746",
            fontSize: "14px",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {message}
        </div>

        <pre
          style={{
            marginTop: "14px",
            padding: "15px",
            maxHeight: "310px",
            overflow: "auto",
            borderRadius: "14px",
            background: "#1f2937",
            color: "#eef0f4",
            fontSize: "11px",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {diagnostic}
        </pre>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginTop: "16px",
          }}
        >
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "46px",
              padding: "0 18px",
              border: 0,
              borderRadius: "11px",
              background: "#3a5a7d",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Retry Assessment
          </button>

          <button
            type="button"
            onClick={copyDiagnostic}
            style={{
              minHeight: "46px",
              padding: "0 18px",
              border: "1px solid #e5e8ed",
              borderRadius: "11px",
              background: "#e9eef4",
              color: "#3a5a7d",
              fontSize: "14px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {diagnosticCopied
              ? "Diagnostic Copied"
              : "Copy Diagnostic"}
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.assign(
                "/teacher"
              );
            }}
            style={{
              minHeight: "46px",
              padding: "0 18px",
              border: "1px solid #e5e8ed",
              borderRadius: "11px",
              background: "#ffffff",
              color: "#475569",
              fontSize: "14px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Back to Dashboard
          </button>
        </div>
      </section>
    </main>
  );
}

export default function AssessmentPage() {
  const [
    params,
    setParams,
  ] = useState(null);

  useEffect(() => {
    const search =
      new URLSearchParams(
        window.location.search
      );

    const code =
      search.get("code") || "";

    const learnerId =
      search.get("learner_id") || "";

    const period =
      search.get("period") ||
      "BoSY";

    setParams({
      code,
      learnerId,
      period,
    });
  }, []);

  if (!params) {
    return <LoadingAssessment />;
  }

  return (
    <AssessmentErrorBoundary>
      <AssessmentClient
        initialCode={params.code}
        initialLearnerId={
          params.learnerId
        }
        initialPeriod={
          params.period
        }
      />
    </AssessmentErrorBoundary>
  );
}
