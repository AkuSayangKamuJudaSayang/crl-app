// Keep this file aligned with the working teacher dashboard baseline.
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import ClassRecordImport from "./ClassRecordImport";

const TABS = [
  {
    id: "dashboard",
    label: "Home",
    icon: "⌂",
  },
  {
    id: "conduct",
    label: "Conduct Assessment",
    icon: "▶",
  },
  {
    id: "records",
    label: "Assessment Records",
    icon: "▤",
  },
  {
    id: "activities",
    label: "Manage Assessment",
    icon: "▥",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "◔",
  },
  {
    id: "profile",
    label: "Profile",
    icon: "●",
  },
];

const PERIODS = [
  "BoSY",
  "MoSY",
  "EoSY",
];

const LETTERS = [
  "M",
  "S",
  "A",
  "L",
  "O",
  "B",
  "E",
  "U",
  "R",
  "T",
];

const WORDS = [
  "clap",
  "jump",
  "eat",
  "drink",
  "stand",
  "dance",
  "fly",
  "pencil",
  "basket",
  "helmet",
];

const DEFAULT_CONTENT = {
  BoSY: {
    letters: LETTERS,
    words: WORDS,
    stories: [
      {
        id: 1,
        title: "Para the Parrot",
        text: "Para is a helpful parrot. Every morning, Para greets the children and helps them find their books.",
      },
      {
        id: 2,
        title: "The Helpful Friend",
        text: "A child sees a friend carrying a heavy basket. The child helps carry it home.",
      },
    ],
  },
  MoSY: {
    letters: LETTERS,
    words: WORDS,
    stories: [
      {
        id: 1,
        title: "A Morning Walk",
        text: "The children walk together and help one another on their way to school.",
      },
    ],
  },
  EoSY: {
    letters: LETTERS,
    words: WORDS,
    stories: [
      {
        id: 1,
        title: "The Kind Child",
        text: "A kind child notices someone who needs help and chooses to lend a hand.",
      },
    ],
  },
};

function recordSummaryFor(
  currentRecords,
  group
) {
  const rows = currentRecords.map(
    ({
      assessment,
      learner,
    }) => ({
      assessment,
      learner,
      total:
        Number(
          assessment.task1_score ||
            0
        ) +
        Number(
          assessment.task2_score ||
            0
        ),
      profile:
        assessment.overall_classification ||
        assessment.classification_label ||
        calculateFallbackProfile(
          assessment.miscue_accuracy,
          assessment.comprehension_score
        ),
    })
  );

  if (group === "Total") {
    return rows.filter(
      (row) =>
        row.assessment.is_completed
    );
  }

  return rows.filter(
    (row) =>
      row.assessment.is_completed &&
      String(
        row.learner?.sex ||
          ""
      ).toLowerCase() ===
        group.toLowerCase()
  );
}

function countPart1(
  rows,
  label
) {
  return rows.filter(
    (row) => {
      if (
        label ===
        "Full Refresher"
      ) {
        return row.total <= 0;
      }

      if (
        label ===
        "Moderate Refresher"
      ) {
        return (
          row.total >= 1 &&
          row.total <= 10
        );
      }

      if (
        label ===
        "Light Refresher"
      ) {
        return (
          row.total >= 11 &&
          row.total <= 16
        );
      }

      return row.total >= 17;
    }
  ).length;
}

function formatName(
  learner
) {
  if (!learner) {
    return "";
  }

  const last =
    learner.last_name || "";
  const first =
    learner.first_name || "";
  const middle =
    learner.middle_name || "";

  const initial = middle
    ? `${middle
        .trim()
        .charAt(0)
        .toUpperCase()}.`
    : "";

  return [
    last,
    first,
    initial,
  ]
    .filter(Boolean)
    .join(", ");
}

function profileClass(
  profile
) {
  if (!profile) {
    return "neutral";
  }

  if (
    profile.includes(
      "Grade Level"
    )
  ) {
    return "grade";
  }

  if (
    profile.includes(
      "Emerging"
    )
  ) {
    return "danger";
  }

  if (
    profile.includes(
      "Developing"
    ) ||
    profile.includes(
      "Refresher"
    )
  ) {
    return "warning";
  }

  return "info";
}

function calculateFallbackProfile(
  accuracy,
  comprehension
) {
  if (
    accuracy ===
      null ||
    accuracy === undefined
  ) {
    return "Not Assessed";
  }

  const a = Number(
    accuracy
  );

  const c = Number(
    comprehension || 0
  );

  if (a <= 25) {
    return "High Emerging Reader";
  }

  if (
    a >= 26 &&
    a <= 50 &&
    c === 0
  ) {
    return "High Emerging Reader";
  }

  if (
    a >= 26 &&
    a <= 50 &&
    c >= 1
  ) {
    return "Developing Reader";
  }

  if (
    a >= 51 &&
    a <= 75 &&
    c <= 2
  ) {
    return "Developing Reader";
  }

  if (
    a >= 51 &&
    a <= 75 &&
    c >= 3
  ) {
    return "Transitioning Reader";
  }

  if (
    a >= 76 &&
    c >= 5
  ) {
    return "Reading at Grade Level";
  }

  return "Transitioning Reader";
}

function statusForLearner(
  learnerId,
  assessments
) {
  const rows =
    assessments.filter(
      (assessment) =>
        Number(
          assessment.learner_id
        ) ===
        Number(learnerId)
    );

  const bosy = rows.some(
    (item) =>
      item.assessment_period ===
        "BoSY" &&
      item.is_completed
  );

  const mosy = rows.some(
    (item) =>
      item.assessment_period ===
        "MoSY" &&
      item.is_completed
  );

  const eosy = rows.some(
    (item) =>
      item.assessment_period ===
        "EoSY" &&
      item.is_completed
  );

  if (bosy && mosy) {
    return {
      key: "both",
      label:
        "Completed: BoSY & MoSY",
    };
  }

  if (eosy) {
    return {
      key: "eosy",
      label:
        "Completed: EoSY",
    };
  }

  if (mosy) {
    return {
      key: "mosy",
      label:
        "Completed: MoSY",
    };
  }

  if (bosy) {
    return {
      key: "bosy",
      label:
        "Completed: BoSY",
    };
  }

  return {
    key: "none",
    label: "No Assessment",
  };
}

function Icon({
  children,
}) {
  return (
    <span className="iconGlyph">
      {children}
    </span>
  );
}

export default function TeacherPage() {
  const router = useRouter();

  const [user, setUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [activeTab, setActiveTab] =
    useState("dashboard");

  const [transitioning, setTransitioning] =
    useState(false);

  const [learners, setLearners] =
    useState([]);

  const [assessments, setAssessments] =
    useState([]);

  const [selectedLearnerIds, setSelectedLearnerIds] =
    useState([]);

  const [deletingProgress, setDeletingProgress] =
    useState(null);

  const [sidebarOpen, setSidebarOpen] =
    useState(true);

  const [darkMode, setDarkMode] = useState(false);

  const [loadingData, setLoadingData] =
    useState(false);

  const [toast, setToast] =
    useState(null);

  const [
    exportingExcel,
    setExportingExcel,
  ] = useState(false);

  const [
    startingAssessment,
    setStartingAssessment,
  ] = useState("");

  const [logoutOpen, setLogoutOpen] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const [
    addLearnerOpen,
    setAddLearnerOpen,
  ] = useState(false);

  const [
    learnerForm,
    setLearnerForm,
  ] = useState({
    lrn: "",
    lastName: "",
    firstName: "",
    middleName: "",
    sex: "Male",
  });

  const [learnerRows, setLearnerRows] = useState([
    { id: 1, lrn: "", lastName: "", firstName: "", middleName: "", sex: "Male" },
  ]);

  const [
    savingLearner,
    setSavingLearner,
  ] = useState(false);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    sexFilter,
    setSexFilter,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("");

  const [
    sortMode,
    setSortMode,
  ] = useState("name_asc");

  const [
    deleteTarget,
    setDeleteTarget,
  ] = useState(null);

  const [
    bulkDeleteConfirm,
    setBulkDeleteConfirm,
  ] = useState(false);

  const [
    detailsTarget,
    setDetailsTarget,
  ] = useState(null);

  const [
    currentPeriod,
    setCurrentPeriod,
  ] = useState("BoSY");

  const [
    recordsView,
    setRecordsView,
  ] = useState("scoresheet");

  const [
    activityPeriod,
    setActivityPeriod,
  ] = useState("BoSY");

  const [
    activityTab,
    setActivityTab,
  ] = useState("letters");

  const [
    activities,
    setActivities,
  ] = useState(
    DEFAULT_CONTENT
  );

  const [
    activityEditor,
    setActivityEditor,
  ] = useState(null);

  const [
    profileEditOpen,
    setProfileEditOpen,
  ] = useState(false);

  const [
    profileForm,
    setProfileForm,
  ] = useState({
    fullName: "",
    section: "",
  });

  const [
    activeHostSession,
    setActiveHostSession,
  ] = useState(null);

  const [
    analyticsPeriod,
    setAnalyticsPeriod,
  ] = useState("All");

  const showToast = useCallback(
    (message, type = "success") => {
      setToast({
        message,
        type,
      });

      window.setTimeout(
        () => {
          setToast(null);
        },
        3200
      );
    },
    []
  );

  const api = useCallback(
    async (
      action,
      {
        method = "GET",
        body = undefined,
      } = {}
    ) => {
      const url =
        `/api/assessment?action=${encodeURIComponent(
          action
        )}`;

      const response =
        await fetch(url, {
          method,
          credentials:
            "include",
          cache: "no-store",
          headers: {
            Accept:
              "application/json",
            ...(method !== "GET"
              ? {
                  "Content-Type":
                    "application/json",
                }
              : {}),
          },
          body:
            method !== "GET"
              ? JSON.stringify({
                  action,
                  ...(body || {}),
                })
              : undefined,
        });

      const contentType =
        response.headers.get(
          "content-type"
        ) || "";

      let data;

      if (
        contentType.includes(
          "application/json"
        )
      ) {
        data =
          await response.json();
      } else {
        const text =
          await response.text();

        throw new Error(
          text ||
            "The server returned an invalid response."
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Request failed with status ${response.status}.`
        );
      }

      return data;
    },
    []
  );

  const verifySession =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              "/api/auth?action=verify",
              {
                credentials:
                  "include",
                cache:
                  "no-store",
                headers: {
                  Accept:
                    "application/json",
                },
              }
            );

          if (
            !response.ok
          ) {
            router.replace(
              "/login"
            );
            return;
          }

          const data =
            await response.json();

          if (
            !data.valid ||
            !data.user
          ) {
            router.replace(
              "/login"
            );
            return;
          }

          if (
            data.user.role !==
              "teacher" &&
            data.user.role !==
              "admin"
          ) {
            router.replace(
              "/login"
            );
            return;
          }

          setUser(
            data.user
          );

          setProfileForm({
            fullName:
              data.user
                .full_name ||
              "",
            section:
              data.user.section ||
              "",
          });
        } catch {
          router.replace(
            "/login"
          );
        } finally {
          setLoading(false);
        }
      },
      [router]
    );

  const loadData =
    useCallback(
      async (
        silent = false
      ) => {
        if (!silent) {
          setLoadingData(
            true
          );
        }

        try {
          const [
            learnersData,
            assessmentsData,
            activitiesData,
          ] =
            await Promise.all([
              api(
                "get_learners"
              ),
              api(
                "get_assessments"
              ),
              api(
                "get_activities"
              ),
            ]);

          setLearners(
            (
              learnersData.learners ||
              []
            ).map(
              (learner) => ({
                ...learner,
                id:
                  learner.id ??
                  learner.learner_id ??
                  learner.learnerId ??
                  null,
                lrn:
                  learner.lrn ??
                  learner.LRN ??
                  "",
              })
            )
          );

          setAssessments(
            assessmentsData.assessments ||
              []
          );

          if (activitiesData?.activities) {
            setActivities(
              activitiesData.activities
            );
          }

        } catch (error) {
          showToast(
            error.message ||
              "Unable to load dashboard data.",
            "error"
          );
        } finally {
          if (!silent) {
            setLoadingData(
              false
            );
          }
        }
      },
      [api, showToast]
    );

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("crla_theme");
      const initialDark = savedTheme === "dark";
      setDarkMode(initialDark);
      document.documentElement.setAttribute(
        "data-crl-theme",
        initialDark ? "dark" : "light"
      );
      document.body.style.colorScheme = initialDark ? "dark" : "light";
    } catch {
      document.documentElement.setAttribute("data-crl-theme", "light");
    }
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((current) => {
      const next = !current;
      try {
        localStorage.setItem("crla_theme", next ? "dark" : "light");
      } catch {
        /* Browser storage may be unavailable. */
      }
      document.documentElement.setAttribute(
        "data-crl-theme",
        next ? "dark" : "light"
      );
      document.body.style.colorScheme = next ? "dark" : "light";
      return next;
    });
  }, []);


  useEffect(() => {
    if (!loading) {
      loadData();
    }
  }, [
    loading,
    loadData,
  ]);

  useEffect(() => {
    if (loading) {
      return undefined;
    }

    const interval =
      window.setInterval(
        () => {
          loadData(true);
        },
        4000
      );

    return () =>
      window.clearInterval(
        interval
      );
  }, [
    loading,
    loadData,
  ]);

  const saveActivities = useCallback(
    async (next) => {
      setActivities(next);

      try {
        const result = await api(
          "save_activities",
          {
            method: "POST",
            body: {
              content: next,
            },
          }
        );

        if (result?.activities) {
          setActivities(
            result.activities
          );
        }

        return true;
      } catch (error) {
        showToast(
          error?.message ||
            "Unable to save assessment content.",
          "error"
        );
        return false;
      }
    },
    [api, showToast]
  );

  const dashboardRows =
    useMemo(() => {
      return learners.map(
        (learner) => {
          const learnerAssessments =
            assessments.filter(
              (item) =>
                Number(
                  item.learner_id
                ) ===
                Number(
                  learner.id
                )
            );

          const hasBosy =
            learnerAssessments.some(
              (item) =>
                item
                  .assessment_period ===
                  "BoSY" &&
                item.is_completed
            );

          const hasMosy =
            learnerAssessments.some(
              (item) =>
                item
                  .assessment_period ===
                  "MoSY" &&
                item.is_completed
            );

          const hasEosy =
            learnerAssessments.some(
              (item) =>
                item
                  .assessment_period ===
                  "EoSY" &&
                item.is_completed
            );

          const completed =
            learnerAssessments
              .filter(
                (item) =>
                  item.is_completed
              )
              .sort(
                (a, b) =>
                  new Date(
                    b.date_administered
                  ) -
                  new Date(
                    a.date_administered
                  )
              );

          const latest =
            completed[0];

          const profile =
            latest
              ? latest.overall_classification ||
                latest.classification_label ||
                calculateFallbackProfile(
                  latest.miscue_accuracy,
                  latest.comprehension_score
                )
              : "Not Assessed";

          return {
            learner,
            hasBosy,
            hasMosy,
            hasEosy,
            profile,
          };
        }
      );
    }, [
      learners,
      assessments,
    ]);

  const stats =
    useMemo(() => {
      const gradeReady =
        dashboardRows.filter(
          (item) =>
            item.profile ===
            "Reading at Grade Level"
        ).length;

      const intervention =
        dashboardRows.filter(
          (item) =>
            item.profile !==
              "Not Assessed" &&
            item.profile !==
              "Reading at Grade Level"
        ).length;

      return {
        total:
          learners.length,
        bosy:
          dashboardRows.filter(
            (item) =>
              item.hasBosy
          ).length,
        mosy:
          dashboardRows.filter(
            (item) =>
              item.hasMosy
          ).length,
        eosy:
          dashboardRows.filter(
            (item) =>
              item.hasEosy
          ).length,
        gradeReady,
        intervention,
      };
    }, [
      dashboardRows,
      learners.length,
    ]);

  const filteredLearners =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase();

      let rows =
        learners.filter(
          (learner) => {
            const name =
              `${learner.last_name} ${learner.first_name} ${learner.middle_name || ""}`.toLowerCase();

            const matchesSearch =
              !term ||
              name.includes(
                term
              ) ||
              String(
                learner.lrn
              )
                .toLowerCase()
                .includes(term);

            const matchesSex =
              !sexFilter ||
              learner.sex ===
                sexFilter;

            const status =
              statusForLearner(
                learner.id,
                assessments
              );

            const matchesStatus =
              !statusFilter ||
              status.key ===
                statusFilter;

            return (
              matchesSearch &&
              matchesSex &&
              matchesStatus
            );
          }
        );

      rows.sort(
        (a, b) => {
          if (
            sortMode ===
            "lrn"
          ) {
            return String(
              a.lrn
            ).localeCompare(
              String(
                b.lrn
              )
            );
          }

          const nameA =
            `${a.last_name}, ${a.first_name}`.toLowerCase();

          const nameB =
            `${b.last_name}, ${b.first_name}`.toLowerCase();

          return sortMode ===
            "name_desc"
            ? nameB.localeCompare(
                nameA
              )
            : nameA.localeCompare(
                nameB
              );
        }
      );

      return rows;
    }, [
      learners,
      assessments,
      search,
      sexFilter,
      statusFilter,
      sortMode,
    ]);

  const currentRecords =
    useMemo(() => {
      const period =
        currentPeriod;

      return assessments
        .filter(
          (item) =>
            item.assessment_period ===
            period
        )
        .map(
          (assessment) => {
            const learner =
              learners.find(
                (item) =>
                  Number(
                    item.id
                  ) ===
                  Number(
                    assessment.learner_id
                  )
              );

            return {
              assessment,
              learner,
            };
          }
        )
        .filter(
          (item) =>
            item.learner
        );
    }, [
      currentPeriod,
      assessments,
      learners,
    ]);

  const analyticsRecords =
    useMemo(() => {
      return assessments.filter(
        (assessment) => {
          if (
            analyticsPeriod ===
            "All"
          ) {
            return true;
          }

          return (
            assessment.assessment_period ===
            analyticsPeriod
          );
        }
      );
    }, [
      assessments,
      analyticsPeriod,
    ]);

  const exportAssessmentRecord =
    useCallback(
      async (
        period = currentPeriod
      ) => {
        if (exportingExcel) {
          return;
        }

        setExportingExcel(true);

        showToast(
          `Preparing ${period} Excel assessment record...`
        );

        try {
          const response =
            await fetch(
              `/api/reports/excel?period=${encodeURIComponent(
                period
              )}&mode=${encodeURIComponent(
                recordsView
              )}`,
              {
                method:
                  "GET",
                credentials:
                  "include",
                cache:
                  "no-store",
                headers: {
                  Accept:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                },
              }
            );

          if (
            !response.ok
          ) {
            let message =
              "Unable to generate the Excel assessment record.";

            try {
              const data =
                await response.json();

              message =
                data?.error ||
                message;
            } catch {
              // Keep fallback.
            }

            throw new Error(
              message
            );
          }

          const blob =
            await response.blob();

          const url =
            window.URL.createObjectURL(
              blob
            );

          const link =
            document.createElement(
              "a"
            );

          link.href = url;

          link.download =
            `CRLA3_Grade3_${period}_Assessment_Records.xlsx`;

          document.body.appendChild(
            link
          );

          link.click();

          link.remove();

          window.setTimeout(
            () =>
              window.URL.revokeObjectURL(
                url
              ),
            1000
          );

          showToast(
            `${period} Excel assessment record generated successfully.`
          );
        } catch (error) {
          console.error(
            "Excel export failed:",
            error
          );

          showToast(
            error?.message ||
              "Unable to generate the Excel assessment record.",
            "error"
          );
        } finally {
          setExportingExcel(
            false
          );
        }
      },
      [
        currentPeriod,
        exportingExcel,
        recordsView,
        showToast,
      ]
    );

  const startAssessment =
    async (
      learnerId,
      period
    ) => {
      const learnerAssessments =
        assessments.filter(
          (item) =>
            Number(
              item.learner_id
            ) ===
            Number(
              learnerId
            )
        );

      const normalizedPeriod =
        period;

      if (
        learnerAssessments.some(
          (item) =>
            item
              .assessment_period ===
              normalizedPeriod &&
            item.is_completed
        )
      ) {
        showToast(
          `${normalizedPeriod} is already completed for this learner.`,
          "error"
        );
        return;
      }

      if (
        normalizedPeriod ===
          "MoSY" &&
        !learnerAssessments.some(
          (item) =>
            item
              .assessment_period ===
              "BoSY" &&
            item.is_completed
        )
      ) {
        showToast(
          "Please complete BoSY before starting MoSY.",
          "error"
        );
        return;
      }

      if (
        normalizedPeriod ===
          "EoSY" &&
        !learnerAssessments.some(
          (item) =>
            item
              .assessment_period ===
              "BoSY" &&
            item.is_completed
        ) &&
        !learnerAssessments.some(
          (item) =>
            item
              .assessment_period ===
              "MoSY" &&
            item.is_completed
        )
      ) {
        showToast(
          "Please complete BoSY or MoSY before starting EoSY.",
          "error"
        );
        return;
      }

      const startKey =
        `${learnerId}-${normalizedPeriod}`;

      setStartingAssessment(
        startKey
      );

      try {
        const result =
          await api(
            "host_start",
            {
              method:
                "POST",
              body: {
                learner_id:
                  learnerId,
                period:
                  normalizedPeriod,
              },
            }
          );

        localStorage.setItem(
          "crla_host_session",
          JSON.stringify({
            learnerId:
              Number(
                learnerId
              ),
            period:
              normalizedPeriod,
            code:
              result.code,
          })
        );

        setActiveHostSession({
          learnerId:
            Number(
              learnerId
            ),
          period:
            normalizedPeriod,
          code:
            result.code,
        });

        router.push(
          `/teacher/assessment?code=${encodeURIComponent(
            result.code
          )}&learner_id=${encodeURIComponent(
            learnerId
          )}&period=${encodeURIComponent(
            normalizedPeriod
          )}`
        );
      } catch (error) {
        showToast(
          error.message ||
            "Unable to start assessment.",
          "error"
        );
      } finally {
        setStartingAssessment(
          ""
        );
      }
    };

  const blankLearnerRow = (id) => ({
    id,
    lrn: "",
    lastName: "",
    firstName: "",
    middleName: "",
    sex: "Male",
  });

  const updateLearnerRow = (rowId, field, value) => {
    setLearnerRows((current) =>
      current.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row
      )
    );
  };

  const addLearnerRow = () => {
    setLearnerRows((current) => [
      ...current,
      blankLearnerRow(
        current.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
      ),
    ]);
  };

  const removeLearnerRow = (rowId) => {
    setLearnerRows((current) => {
      if (current.length <= 1) return current;
      return current.filter((row) => row.id !== rowId);
    });
  };

  const resetLearnerRows = () => {
    setLearnerRows([blankLearnerRow(1)]);
  };

  const addLearners = async () => {
    const normalizedRows = learnerRows.map((row) => ({
      ...row,
      lrn: String(row.lrn ?? "").replace(/\D/g, "").trim(),
      lastName: String(row.lastName ?? "").trim(),
      firstName: String(row.firstName ?? "").trim(),
      middleName: String(row.middleName ?? "").trim(),
      sex: String(row.sex ?? "").trim(),
    }));

    const meaningfulRows = normalizedRows.filter((row) =>
      [row.lrn, row.lastName, row.firstName].some(Boolean)
    );

    if (!meaningfulRows.length) {
      showToast("Add at least one learner before saving.", "error");
      return;
    }

    const invalidRow = meaningfulRows.find((row) =>
      !row.lrn ||
      !row.lastName ||
      !row.firstName ||
      !row.sex ||
      !/^\d{12}$/.test(row.lrn)
    );

    if (invalidRow) {
      showToast(
        `Check learner ${meaningfulRows.indexOf(invalidRow) + 1}: LRN must contain exactly 12 digits and required name/sex fields must be complete.`,
        "error"
      );
      return;
    }

    const seen = new Set();
    for (const row of meaningfulRows) {
      if (seen.has(row.lrn)) {
        showToast(`Duplicate LRN ${row.lrn} appears in the list.`, "error");
        return;
      }
      seen.add(row.lrn);
    }

    setSavingLearner(true);
    const imported = [];
    let lastError = null;

    try {
      const worker = async (row) => {
        try {
          const result = await api("add_learner", {
            method: "POST",
            body: {
              lrn: row.lrn,
              last_name: row.lastName,
              first_name: row.firstName,
              middle_name: row.middleName || "N/A",
              sex: row.sex,
              section: String(user?.section ?? "").trim(),
              grade_level: 3,
            },
          });
          if (!result?.learner?.id) {
            throw new Error("The server did not return the created learner.");
          }
          return result.learner;
        } catch (error) {
          lastError = error;
          return null;
        }
      };

      const queue = [...meaningfulRows];
      const concurrency = Math.min(5, queue.length);
      let completed = 0;
      const runners = Array.from({ length: concurrency }, async () => {
        while (queue.length) {
          const row = queue.shift();
          if (!row) return;
          const created = await worker(row);
          completed += 1;
          if (created) imported.push(created);
        }
      });
      await Promise.all(runners);

      if (imported.length) {
        setLearners((current) => [...current, ...imported]);
      }

      setLearnerRows([blankLearnerRow(1)]);
      setLearnerForm({
        lrn: "",
        lastName: "",
        firstName: "",
        middleName: "N/A",
        sex: "Male",
      });
      setAddLearnerOpen(false);

      if (lastError) {
        showToast(`${imported.length} learner(s) added; some rows could not be saved.`, "error");
      } else {
        showToast(`${imported.length} learner(s) added successfully.`);
      }
    } catch (error) {
      showToast(error?.message || "Unable to add learners.", "error");
    } finally {
      setSavingLearner(false);
    }
  };

  const deleteLearner =
    async () => {
      if (
        !deleteTarget
      ) {
        return;
      }

      const nestedLearner =
        deleteTarget.learner &&
        typeof deleteTarget.learner ===
          "object"
          ? deleteTarget.learner
          : {};

      /*
       * Resolve each value independently from both possible object shapes.
       * Some legacy rows contain a nested learner object while the actual
       * identity fields remain on deleteTarget itself.
       */
      const learnerId =
        Number(
          nestedLearner.id ??
            nestedLearner.learner_id ??
            nestedLearner.learnerId ??
            deleteTarget.id ??
            deleteTarget.learner_id ??
            deleteTarget.learnerId ??
            0
        );

      const learnerLrn =
        String(
          nestedLearner.lrn ??
            nestedLearner.LRN ??
            deleteTarget.lrn ??
            deleteTarget.LRN ??
            ""
        ).trim();

      const learnerName = {
        last_name:
          String(
            nestedLearner.last_name ??
              nestedLearner.lastName ??
              deleteTarget.last_name ??
              deleteTarget.lastName ??
              ""
          ).trim(),
        first_name:
          String(
            nestedLearner.first_name ??
              nestedLearner.firstName ??
              deleteTarget.first_name ??
              deleteTarget.firstName ??
              ""
          ).trim(),
        middle_name:
          String(
            nestedLearner.middle_name ??
              nestedLearner.middleName ??
              deleteTarget.middle_name ??
              deleteTarget.middleName ??
              ""
          ).trim(),
      };

      const payload = {
        learner_id:
          Number.isInteger(
            learnerId
          ) &&
          learnerId > 0
            ? learnerId
            : null,
        learnerId:
          Number.isInteger(
            learnerId
          ) &&
          learnerId > 0
            ? learnerId
            : null,
        id:
          Number.isInteger(
            learnerId
          ) &&
          learnerId > 0
            ? learnerId
            : null,
        lrn:
          learnerLrn ||
          null,
        LRN:
          learnerLrn ||
          null,
        first_name:
          learnerName.first_name ||
          null,
        last_name:
          learnerName.last_name ||
          null,
        middle_name:
          learnerName.middle_name ||
          null,
        learner: {
          ...nestedLearner,
          id:
            Number.isInteger(
              learnerId
            ) &&
            learnerId > 0
              ? learnerId
              : null,
          learner_id:
            Number.isInteger(
              learnerId
            ) &&
            learnerId > 0
              ? learnerId
              : null,
          learnerId:
            Number.isInteger(
              learnerId
            ) &&
            learnerId > 0
              ? learnerId
              : null,
          lrn:
            learnerLrn ||
            null,
          LRN:
            learnerLrn ||
            null,
          first_name:
            learnerName.first_name ||
            null,
          last_name:
            learnerName.last_name ||
            null,
          middle_name:
            learnerName.middle_name ||
            null,
        },
      };

      if (
        process.env.NODE_ENV !==
        "production"
      ) {
        console.debug(
          "[CRL-App] delete_learner payload",
          {
            ...payload,
            deleteTarget,
          }
        );
      }

      try {
        const result =
          await api(
            "delete_learner",
            {
              method:
                "POST",
              body:
                payload,
            }
          );

        const deletedId =
          Number(
            result.deleted_learner_id ??
              learnerId ??
              0
          );

        const deletedLrn =
          String(
            result.deleted_lrn ??
              learnerLrn
          ).trim();

        setLearners(
          (current) =>
            current.filter(
              (item) => {
                const itemId =
                  Number(
                    item.id ??
                      item.learner_id ??
                      item.learnerId ??
                      0
                  );

                const itemLrn =
                  String(
                    item.lrn ??
                      item.LRN ??
                      ""
                  ).trim();

                return !(
                  (
                    deletedId > 0 &&
                    itemId ===
                      deletedId
                  ) ||
                  (
                    deletedLrn &&
                    itemLrn ===
                      deletedLrn
                  )
                );
              }
            )
        );

        setAssessments(
          (current) =>
            current.filter(
              (item) =>
                Number(
                  item.learner_id ??
                    item.learnerId ??
                    0
                ) !==
                deletedId
            )
        );

        setDeleteTarget(
          null
        );

        showToast(
          "Learner deleted successfully."
        );
      } catch (error) {
        showToast(
          error?.message ||
            "Unable to delete learner.",
          "error"
        );
      }
    };

  const toggleLearnerSelection = (learnerId) => {
    const id = Number(learnerId);
    if (!Number.isInteger(id) || id <= 0) return;

    setSelectedLearnerIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const selectAllFilteredLearners = () => {
    const ids = filteredLearners
      .map((learner) => Number(learner.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    setSelectedLearnerIds(ids);
  };

  const clearLearnerSelection = () => {
    setSelectedLearnerIds([]);
  };

  const bulkDeleteLearners = async (skipConfirm = false) => {
    const ids = selectedLearnerIds
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);

    if (!ids.length) {
      showToast("Select at least one learner to delete.", "error");
      return;
    }

    if (!skipConfirm) {
      setBulkDeleteConfirm(true);
      return;
    }

    setDeletingProgress({ total: ids.length, completed: 0, failed: 0 });

    try {
      const result = await api("delete_learners", {
        method: "POST",
        body: { learner_ids: ids },
      });

      const deletedIds = Array.isArray(result?.deleted_learner_ids)
        ? result.deleted_learner_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
        : [];
      const deletedCount = Number(result?.deleted_count ?? deletedIds.length);

      setDeletingProgress((current) =>
        current
          ? {
              ...current,
              completed: Math.min(ids.length, deletedCount),
              failed: Math.max(0, ids.length - deletedCount),
            }
          : current
      );

      if (deletedIds.length) {
        setLearners((current) => current.filter((item) => !deletedIds.includes(Number(item.id))));
        setAssessments((current) => current.filter((item) => !deletedIds.includes(Number(item.learner_id))));
        setSelectedLearnerIds((current) => current.filter((id) => !deletedIds.includes(Number(id))));
      }

      const failed = ids.length - deletedIds.length;
      setDeletingProgress(null);

      if (failed) {
        showToast(`${deletedIds.length} deleted. ${failed} learner${failed === 1 ? "" : "s"} could not be deleted.`, "error");
      } else {
        setSelectedLearnerIds([]);
        showToast(`${deletedIds.length} learner${deletedIds.length === 1 ? "" : "s"} deleted successfully.`);
      }
    } catch (error) {
      setDeletingProgress(null);
      showToast(error?.message || "Unable to delete the selected learners.", "error");
    }
  };

  const selectTab =
    (tabId) => {
      if (
        tabId ===
        activeTab
      ) {
        return;
      }

      setTransitioning(
        true
      );

      window.setTimeout(
        () => {
          setActiveTab(
            tabId
          );
          setTransitioning(
            false
          );
        },
        120
      );
    };

  const logout =
    async () => {
      if (
        loggingOut
      ) {
        return;
      }

      setLoggingOut(
        true
      );

      try {
        await fetch(
          "/api/auth?action=logout",
          {
            method: "GET",
            credentials:
              "include",
            cache:
              "no-store",
          }
        );
      } catch {
        /* Redirect even if the request itself fails. */
      } finally {
        try {
          localStorage.removeItem(
            "crla_host_session"
          );

          localStorage.removeItem(
            "crla_user"
          );

          sessionStorage.removeItem(
            "crla_host_session"
          );

          sessionStorage.removeItem(
            "crla_user"
          );
        } catch {
          /* Storage may be unavailable. */
        }

        window.location.replace(
          "/login"
        );
      }
    };

  const saveProfile =
    async () => {
      try {
        const result =
          await fetch(
            "/api/auth?action=update_user",
            {
              method:
                "POST",
              credentials:
                "include",
              cache:
                "no-store",
              headers: {
                "Content-Type":
                  "application/json",
                Accept:
                  "application/json",
              },
              body: JSON.stringify({
                full_name:
                  profileForm.fullName.trim(),
                section:
                  profileForm.section.trim(),
              }),
            }
          );

        const data =
          await result.json();

        if (!result.ok) {
          throw new Error(
            data.error ||
              "Unable to update your profile."
          );
        }

        setUser(
          data.user
        );

        setProfileEditOpen(
          false
        );

        showToast(
          "Profile updated successfully."
        );
      } catch (error) {
        showToast(
          error.message ||
            "Unable to update your profile.",
          "error"
        );
      }
    };

  const editActivity =
    (
      category,
      index = -1
    ) => {
      if (
        index < 0 &&
        (category === "letters" ||
          category === "words") &&
        activities[activityPeriod][category].length >= 10
      ) {
        showToast(
          "Maximum items is 10. Unable to add more.",
          "error"
        );
        return;
      }

      const current =
        activities[
          activityPeriod
        ][category][
          index
        ];

      if (
        category ===
        "stories"
      ) {
        setActivityEditor({
          category,
          index,
          title:
            current?.title ||
            "",
          text:
            current?.text ||
            "",
        });
        return;
      }

      setActivityEditor({
        category,
        index,
        value:
          current || "",
      });
    };

  const saveActivity =
    async () => {
      if (
        !activityEditor
      ) {
        return;
      }

      const category =
        activityEditor.category;

      const index =
        activityEditor.index;

      const next = {
        ...activities,
        [activityPeriod]: {
          ...activities[
            activityPeriod
          ],
          [category]: [
            ...activities[
              activityPeriod
            ][category],
          ],
        },
      };

      if (
        category ===
        "stories"
      ) {
        const story = {
          id:
            index >= 0
              ? next[
                  activityPeriod
                ][category][
                  index
                ].id
              : Date.now(),
          title:
            activityEditor.title.trim(),
          text:
            activityEditor.text.trim(),
        };

        if (
          !story.title ||
          !story.text
        ) {
          showToast(
            "Story title and content are required.",
            "error"
          );
          return;
        }

        if (
          index >= 0
        ) {
          next[
            activityPeriod
          ][category][
            index
          ] = story;
        } else {
          next[
            activityPeriod
          ][category].push(
            story
          );
        }
      } else {
        const value =
          activityEditor.value.trim();

        if (!value) {
          showToast(
            "Content is required.",
            "error"
          );
          return;
        }

        if (
          index >= 0
        ) {
          next[
            activityPeriod
          ][category][
            index
          ] = value;
        } else {
          next[
            activityPeriod
          ][category].push(
            value
          );
        }
      }

      const saved = await saveActivities(
        next
      );

      if (!saved) return;

      setActivityEditor(
        null
      );

      showToast(
        "Activity saved."
      );
    };

  const removeActivity =
    async (
      category,
      index
    ) => {
      const next = {
        ...activities,
        [activityPeriod]: {
          ...activities[
            activityPeriod
          ],
          [category]: [
            ...activities[
              activityPeriod
            ][category],
          ],
        },
      };

      next[
        activityPeriod
      ][category].splice(
        index,
        1
      );

      const saved = await saveActivities(
        next
      );

      if (!saved) return;

      showToast(
        "Activity removed."
      );
    };

  if (loading) {
    return (
      <>
        <style jsx global>{`
          html,
          body {
            margin: 0;
            min-height: 100%;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
            background: #f2f6fb;
          }

          .loadingShell {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #1559a6;
            font-weight: 700;
          }
        `}</style>

        <div className="loadingShell">
          Loading CRL-App...
        </div>
      </>
    );
  }

  return (
    <>
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          min-height: 100%;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          background:
            linear-gradient(
              180deg,
              #f8fbff 0%,
              #edf4fb 100%
            );
          color: #18283d;
        }

        button,
        input,
        select,
        textarea {
          font: inherit;
        }

        button {
          -webkit-tap-highlight-color: transparent;
        }

        .teacherShell {
          min-height: 100vh;
          display: flex;
          position: relative;
          background:
            radial-gradient(
              circle at 95% 5%,
              rgba(
                20,
                85,
                160,
                0.08
              ) 0,
              rgba(
                20,
                85,
                160,
                0.08
              ) 150px,
              transparent 151px
            ),
            radial-gradient(
              circle at 4% 94%,
              rgba(
                201,
                35,
                53,
                0.05
              ) 0,
              rgba(
                201,
                35,
                53,
                0.05
              ) 100px,
              transparent 101px
            ),
            #f4f8fc;
        }

        .sidebar {
          width: 218px;
          min-height: 100vh;
          position: sticky;
          top: 0;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-right: 1px solid #dce5ef;
          z-index: 10;
        }

        .brandBlock {
          height: 76px;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 0 18px;
          border-bottom: 1px solid #e6edf4;
        }

        .brandLogo {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          background: #1559a6;
          color: #ffffff;
          font-weight: 900;
          font-size: 15px;
          box-shadow:
            0 6px 18px
              rgba(
                21,
                89,
                166,
                0.14
              );
        }

        .brandTitle {
          color: #14243a;
          font-size: 17px;
          font-weight: 900;
        }

        .brandSubtitle {
          margin-top: 2px;
          color: #78899d;
          font-size: 9px;
        }

        .sidebarLabel {
          padding: 22px 20px 8px;
          color: #8a99aa;
          font-size: 9px;
          text-transform: uppercase;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .nav {
          padding-right: 18px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 0 10px;
        }

        .navButton {
          width: 100%;
          min-height: 44px;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 0 13px;
          background: transparent;
          border: 0;
          border-left: 3px solid transparent;
          color: #536980;
          border-radius: 9px;
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition:
            background 0.18s ease,
            color 0.18s ease,
            border-color 0.18s ease,
            transform 0.18s ease;
        }

        .navButton:hover {
          background: #f3f7fc;
          color: #1559a6;
          transform: translateX(1px);
        }

        .navButton.active {
          color: #1559a6;
          background: #eaf2fc;
          border-left-color: #1559a6;
        }

        .iconGlyph {
          width: 18px;
          text-align: center;
          font-size: 13px;
          font-weight: 900;
        }

        .sidebarSpacer {
          flex: 1;
        }

        .sidebarLogout {
          margin: 12px 12px 18px;
          min-height: 42px;
          border-radius: 9px;
          border: 1px solid #f3d3d7;
          background: #fff7f8;
          color: #c92335;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition:
            background 0.18s ease,
            border-color 0.18s ease,
            transform 0.18s ease;
        }

        .sidebarLogout:hover {
          background: #fff0f2;
          border-color: #eeb5bc;
          transform: translateY(-1px);
        }

        .main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .topbar {
          min-height: 76px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 30px;
          background: #ffffff;
          border-bottom: 1px solid #dfe7f0;
        }

        .topTitle {
          color: #15263c;
          font-size: 21px;
          font-weight: 900;
          letter-spacing: -0.3px;
        }

        .topAccent {
          width: 72px;
          height: 3px;
          margin-top: 7px;
          display: flex;
          border-radius: 99px;
          overflow: hidden;
        }

        .topAccentBlue {
          flex: 1;
          background: #1559a6;
        }

        .topAccentRed {
          width: 30px;
          background: #c92335;
        }

        .content {
          flex: 1;
          min-height: 0;
          padding: 24px 30px 30px;
          overflow-y: auto;
        }

        .contentStage {
          max-width: 1450px;
          margin: 0 auto;
          opacity: 1;
          transform: translateY(0);
          transition:
            opacity 0.18s ease,
            transform 0.18s ease;
        }

        .contentStage.transitioning {
          opacity: 0;
          transform: translateY(6px);
        }

        .pageIntro {
          margin-bottom: 18px;
        }

        .pageTitle {
          margin: 0;
          color: #16283f;
          font-size: 25px;
          font-weight: 900;
          letter-spacing: -0.5px;
        }

        .pageSub {
          margin: 5px 0 0;
          color: #718298;
          font-size: 11px;
        }

        .welcomeCard {
          padding: 22px 24px;
          margin-bottom: 18px;
          background: #ffffff;
          border: 1px solid #dce6f0;
          border-radius: 13px;
          box-shadow:
            0 7px 25px
              rgba(
                31,
                60,
                90,
                0.05
              );
        }

        .welcomeCard h2 {
          margin: 0;
          color: #15263c;
          font-size: 20px;
          font-weight: 900;
        }

        .welcomeCard p {
          margin: 6px 0 0;
          color: #70839a;
          font-size: 11px;
          line-height: 1.7;
        }

        .statsGrid {
          display: grid;
          grid-template-columns:
            repeat(
              6,
              minmax(0, 1fr)
            );
          gap: 12px;
          margin-bottom: 18px;
        }

        .statCard {
          background: #ffffff;
          border: 1px solid #dce6f0;
          border-radius: 12px;
          padding: 17px 18px;
          transition:
            transform 0.18s ease,
            box-shadow 0.18s ease,
            border-color 0.18s ease;
        }

        .statCard:hover {
          transform: translateY(-2px);
          border-color: #c3d5e8;
          box-shadow:
            0 8px 22px
              rgba(
                29,
                61,
                95,
                0.06
              );
        }

        .statNumber {
          font-size: 25px;
          font-weight: 900;
          line-height: 1;
        }

        .statLabel {
          margin-top: 7px;
          color: #7a8b9e;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          font-weight: 800;
        }

        .blue {
          color: #1559a6;
        }

        .red {
          color: #c92335;
        }

        .green {
          color: #18834e;
        }

        .orange {
          color: #c77b17;
        }

        .actionGrid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .actionCard {
          background: #ffffff;
          border: 1px solid #dce6f0;
          border-radius: 13px;
          padding: 19px;
          min-height: 158px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow:
            0 7px 25px
              rgba(
                31,
                60,
                90,
                0.04
              );
        }

        .actionCard h3 {
          margin: 0;
          color: #172b43;
          font-size: 15px;
          font-weight: 900;
        }

        .actionCard p {
          margin: 6px 0 0;
          color: #73859b;
          font-size: 10px;
          line-height: 1.6;
        }

        .actionButton {
          align-self: flex-start;
          min-height: 39px;
          padding: 0 16px;
          border: 0;
          border-radius: 8px;
          background: #1559a6;
          color: #ffffff;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
          box-shadow:
            0 5px 12px
              rgba(
                21,
                89,
                166,
                0.16
              );
          transition:
            transform 0.16s ease,
            background 0.16s ease,
            box-shadow 0.16s ease;
        }

        .actionButton:hover {
          background: #124b8e;
          transform: translateY(-1px);
          box-shadow:
            0 7px 16px
              rgba(
                21,
                89,
                166,
                0.2
              );
        }

        .actionButton.redButton {
          background: #c92335;
          box-shadow:
            0 5px 12px
              rgba(
                201,
                35,
                53,
                0.14
              );
        }

        .actionButton.redButton:hover {
          background: #b21f2f;
        }

        .panel {
          background: #ffffff;
          border: 1px solid #dce6f0;
          border-radius: 13px;
          overflow: hidden;
          box-shadow:
            0 7px 25px
              rgba(
                31,
                60,
                90,
                0.04
              );
        }

        .panelHeader {
          min-height: 64px;
          padding: 15px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid #e7eef5;
        }

        .panelHeaderTitle {
          color: #182b43;
          font-size: 14px;
          font-weight: 900;
        }

        .panelHeaderSub {
          margin-top: 4px;
          color: #8291a3;
          font-size: 9px;
        }

        .toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 9px;
          padding: 13px 16px;
          border-bottom: 1px solid #e7eef5;
          background: #fbfdff;
        }

        .searchInput,
        .selectInput {
          height: 38px;
          border: 1px solid #cad8e6;
          border-radius: 8px;
          background: #ffffff;
          color: #293d55;
          outline: none;
          font-size: 10px;
          transition:
            border-color 0.18s ease,
            box-shadow 0.18s ease;
        }

        .searchInput {
          flex: 1;
          min-width: 220px;
          padding: 0 11px;
        }

        .selectInput {
          min-width: 155px;
          padding: 0 9px;
        }

        .searchInput,
        .selectInput {
          transition:
            border-color 0.18s ease,
            box-shadow 0.18s ease,
            background 0.18s ease;
        }

        .searchInput:focus,
        .selectInput:focus {
          border-color: #1559a6;
          box-shadow:
            0 0 0 3px
              rgba(
                21,
                89,
                166,
                0.08
              );
        }

        .toolbarButton {
          min-height: 38px;
          padding: 0 13px;
          border-radius: 8px;
          background: #1559a6;
          color: #ffffff;
          border: 1px solid #1559a6;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
          transition:
            background 0.16s ease,
            transform 0.16s ease,
            box-shadow 0.16s ease;
        }

        .toolbarButton:hover {
          background: #124b8e;
          transform: translateY(-1px);
          box-shadow:
            0 5px 12px
              rgba(
                21,
                89,
                166,
                0.16
              );
        }

        .tableWrap {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 12px 13px;
          text-align: left;
          border-bottom: 1px solid #edf2f6;
          font-size: 11px;
          white-space: nowrap;
        }

        th {
          background: #f8fbfe;
          color: #728399;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-size: 9px;
          font-weight: 900;
        }

        td {
          color: #364b63;
        }

        tbody tr {
          transition:
            background 0.16s ease;
        }

        tbody tr:hover td {
          background: #f9fbfd;
        }

        .nameStrong {
          color: #22374f;
          font-weight: 800;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          min-height: 22px;
          padding: 0 8px;
          border-radius: 999px;
          font-size: 8px;
          font-weight: 900;
        }

        .badge.neutral {
          background: #f1f4f7;
          color: #687b8f;
        }

        .badge.grade {
          background: #eaf8f0;
          color: #18834e;
        }

        .badge.danger {
          background: #fff0f2;
          color: #c92335;
        }

        .badge.warning {
          background: #fff7e9;
          color: #b66c0d;
        }

        .badge.info {
          background: #eaf2fc;
          color: #1559a6;
        }

        .inlineActions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .smallButton {
          min-height: 29px;
          padding: 0 9px;
          border-radius: 6px;
          border: 1px solid #cad8e6;
          background: #ffffff;
          color: #1559a6;
          font-size: 8px;
          font-weight: 800;
          cursor: pointer;
          transition:
            background 0.16s ease,
            border-color 0.16s ease,
            color 0.16s ease;
        }

        .smallButton:hover {
          border-color: #1559a6;
          background: #eef5fd;
        }

        .smallButton.primary {
          background: #1559a6;
          color: #ffffff;
          border-color: #1559a6;
        }

        .smallButton.primary:hover {
          background: #124b8e;
        }

        .smallButton.redSmall {
          background: #fff3f4;
          color: #c92335;
          border-color: #efccd1;
        }

        .smallButton.redSmall:hover {
          background: #ffeaed;
          border-color: #dfafb6;
        }

        .smallButton:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .emptyState {
          padding: 54px 20px;
          text-align: center;
        }

        .emptyIcon {
          width: 48px;
          height: 48px;
          margin: 0 auto 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #edf4fc;
          color: #1559a6;
          font-weight: 900;
          font-size: 19px;
        }

        .emptyState h3 {
          margin: 0;
          color: #23384f;
          font-size: 13px;
        }

        .emptyState p {
          margin: 5px auto 14px;
          max-width: 380px;
          color: #8292a5;
          font-size: 10px;
          line-height: 1.6;
        }

        .periodTabs {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          border: 1px solid #d8e3ed;
          border-radius: 8px;
          background: #f4f8fc;
        }

        .periodTab {
          min-height: 31px;
          padding: 0 11px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #728399;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .periodTab.active {
          background: #1559a6;
          color: #ffffff;
          box-shadow:
            0 4px 9px
              rgba(
                21,
                89,
                166,
                0.13
              );
        }

        .profileBox {
          padding: 20px;
        }

        .profileGrid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 12px;
        }

        .profileItem {
          padding: 14px;
          border: 1px solid #e0e8f0;
          border-radius: 9px;
          background: #fbfdff;
        }

        .profileLabel {
          color: #8b99aa;
          font-size: 8px;
          text-transform: uppercase;
          font-weight: 900;
          letter-spacing: 0.6px;
        }

        .profileValue {
          margin-top: 6px;
          color: #22384f;
          font-size: 12px;
          font-weight: 800;
        }

        .analyticsGrid {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 12px;
          padding: 16px;
        }

        .analyticsCard {
          padding: 17px;
          border: 1px solid #dfe8f0;
          border-radius: 10px;
          background: #fbfdff;
        }

        .analyticsCard h3 {
          margin: 0;
          color: #33485f;
          font-size: 10px;
          font-weight: 900;
        }

        .analyticsValue {
          margin-top: 8px;
          color: #1559a6;
          font-size: 23px;
          font-weight: 900;
        }

        .analyticsMuted {
          margin-top: 4px;
          color: #8695a6;
          font-size: 8px;
        }

        .barList {
          padding: 0 16px 18px;
        }

        .barRow {
          margin-top: 11px;
        }

        .barTop {
          display: flex;
          justify-content: space-between;
          color: #667b92;
          font-size: 9px;
          font-weight: 800;
        }

        .barTrack {
          height: 7px;
          margin-top: 5px;
          background: #edf3f8;
          border-radius: 999px;
          overflow: hidden;
        }

        .barFill {
          height: 100%;
          background: #1559a6;
          border-radius: 999px;
          transition:
            width 0.35s ease;
        }

        .recordsHeaderActions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 8px;
        }

        .recordViewTabs {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          border: 1px solid #d8e3ed;
          border-radius: 8px;
          background: #f4f8fc;
        }

        .recordViewTab {
          min-height: 31px;
          padding: 0 11px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #728399;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          transition:
            background 0.18s ease,
            color 0.18s ease,
            transform 0.15s ease;
        }

        .recordViewTab:hover {
          color: #1559a6;
          transform: translateY(-1px);
        }

        .recordViewTab.active {
          background: #1559a6;
          color: #ffffff;
        }

        .exportButton {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
        }

        .buttonSpinner,
        .busySpinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: currentColor;
          border-radius: 50%;
          animation: teacherSpin 0.72s linear infinite;
        }

        .busySpinner {
          width: 24px;
          height: 24px;
          flex: 0 0 auto;
          border-color: #dbe7f2;
          border-top-color: #1559a6;
        }

        .busyCard {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 275px;
        }

        .busyCard strong {
          display: block;
          color: #203650;
          font-size: 12px;
          font-weight: 900;
        }

        .busySubtext {
          margin-top: 4px;
          color: #7d8ea1;
          font-size: 9px;
        }

        .optionalLabel {
          color: #8b99aa;
          font-size: 9px;
          font-weight: 700;
        }

        .recordSummary {
          padding: 16px;
        }

        .summaryTableWrap {
          overflow-x: auto;
          border: 1px solid #e0e8f0;
          border-radius: 9px;
        }

        .summaryTable {
          min-width: 1150px;
        }

        .recordCharts {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        .chartCardSimple {
          border: 1px solid #dfe7ef;
          border-radius: 10px;
          background: #ffffff;
          overflow: hidden;
        }

        .chartTitleSimple {
          padding: 13px 14px;
          border-bottom: 1px solid #e7eef5;
          color: #2a3e57;
          font-size: 10px;
          font-weight: 900;
          line-height: 1.45;
        }

        .miniChart {
          padding: 4px 14px 14px;
        }

        @keyframes teacherSpin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }

        .activityTabs {
          display: flex;
          gap: 5px;
          padding: 13px 16px;
          border-bottom: 1px solid #e7eef5;
          background: #fbfdff;
        }

        .activityTab {
          min-height: 31px;
          padding: 0 12px;
          border: 1px solid #d8e3ed;
          border-radius: 7px;
          background: #ffffff;
          color: #728399;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .activityTab.active {
          border-color: #1559a6;
          background: #eaf2fc;
          color: #1559a6;
        }

        .modalOverlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background:
            rgba(
              24,
              42,
              63,
              0.32
            );
          backdrop-filter:
            blur(4px);
          animation:
            overlayIn
            0.16s ease;
        }

        .modal {
          width: min(
            100%,
            520px
          );
          max-height: 90vh;
          overflow-y: auto;
          background: #ffffff;
          border: 1px solid #dbe5ee;
          border-radius: 13px;
          box-shadow:
            0 25px 70px
              rgba(
                30,
                54,
                80,
                0.18
              );
          animation:
            modalIn
            0.18s ease;
        }

        .modalHeader {
          min-height: 58px;
          padding: 0 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e7eef5;
        }

        .modalHeader h2 {
          margin: 0;
          color: #25384f;
          font-size: 14px;
        }

        .closeButton {
          width: 31px;
          height: 31px;
          border: 0;
          border-radius: 7px;
          background: #f3f6f9;
          color: #6b7c90;
          cursor: pointer;
          font-size: 16px;
        }

        .closeButton:hover {
          background: #eaf0f5;
        }

        .modalBody {
          padding: 18px;
        }

        .formGrid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 12px;
        }

        .formGroup {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .formGroup.full {
          grid-column: 1 / -1;
        }

        .formLabel {
          color: #4c6076;
          font-size: 9px;
          font-weight: 900;
        }

        .formLabel span {
          color: #c92335;
        }

        .formInput,
        .formSelect,
        .formTextarea {
          width: 100%;
          min-height: 38px;
          border: 1px solid #cad8e6;
          border-radius: 8px;
          padding: 0 10px;
          background: #ffffff;
          color: #273b53;
          outline: none;
          font-size: 10px;
        }

        .formTextarea {
          min-height: 100px;
          padding: 10px;
          resize: vertical;
        }

        .formInput:focus,
        .formSelect:focus,
        .formTextarea:focus {
          border-color: #1559a6;
          box-shadow:
            0 0 0 3px
              rgba(
                21,
                89,
                166,
                0.08
              );
        }

        .modalFooter {
          padding: 13px 18px;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          border-top: 1px solid #e7eef5;
          background: #fbfdff;
        }

        .secondaryButton {
          min-height: 36px;
          padding: 0 13px;
          border-radius: 8px;
          border: 1px solid #ced9e4;
          background: #ffffff;
          color: #60738a;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .secondaryButton:hover {
          background: #f4f8fb;
        }

        .dangerButton {
          min-height: 36px;
          padding: 0 13px;
          border-radius: 8px;
          border: 0;
          background: #c92335;
          color: #ffffff;
          font-size: 9px;
          font-weight: 800;
          cursor: pointer;
        }

        .dangerButton:hover {
          background: #b21f2f;
        }

        .toast {
          position: fixed;
          right: 22px;
          bottom: 22px;
          z-index: 300;
          max-width: 360px;
          padding: 12px 15px;
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid #dce6f0;
          box-shadow:
            0 14px 35px
              rgba(
                27,
                50,
                75,
                0.15
              );
          color: #30455d;
          font-size: 10px;
          animation:
            toastIn
            0.18s ease;
        }

        .toast.error {
          border-color: #efcbd0;
          color: #a92030;
        }

        .toast.success {
          border-color: #cfe8d9;
          color: #257044;
        }

        .busyOverlay {
          position: fixed;
          inset: 0;
          z-index: 350;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            rgba(
              255,
              255,
              255,
              0.55
            );
          backdrop-filter:
            blur(2px);
        }

        .busyCard {
          padding: 17px 20px;
          background: #ffffff;
          border: 1px solid #dce6f0;
          border-radius: 10px;
          box-shadow:
            0 15px 40px
              rgba(
                30,
                54,
                80,
                0.12
              );
          color: #1559a6;
          font-size: 10px;
          font-weight: 900;
        }

        @keyframes overlayIn {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        @keyframes modalIn {
          from {
            opacity: 0;
            transform: translateY(
              8px
            ) scale(0.99);
          }

          to {
            opacity: 1;
            transform: translateY(
              0
            ) scale(1);
          }
        }

        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateY(
              7px
            );
          }

          to {
            opacity: 1;
            transform: translateY(
              0
            );
          }
        }

        /* Soft neumorphism dashboard skin */
        .teacherShell {
          background: #e9f1f9;
        }

        .sidebar {
          width: 332px;
          background: #e9f1f9;
          border-right: 0;
          box-shadow: 12px 0 28px rgba(161,180,201,.30), -8px 0 22px rgba(255,255,255,.76);
          transition: width .34s cubic-bezier(.22,1,.36,1), box-shadow .28s ease;
          overflow: visible;
        }

        .sidebar.collapsed { width: 86px; }

        .brandBlock {
          min-height: 82px;
          background: #e9f1f9;
          border-bottom: 0;
          position: relative;
        }

        .brandThemeSwitch { z-index: 2; }

        .brandLogo {
          background: #e9f1f9;
          color: #1559a6;
          border: 0;
          box-shadow: 8px 8px 18px rgba(161,180,201,.52), -7px -7px 16px rgba(255,255,255,.95);
        }

        .brandTitle { font-size: 19px; }
        .brandSubtitle { font-size: 11px; }

        .sidebarToggle {
          position: absolute;
          top: 15px;
          right: -16px;
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 50%;
          background: #e9f1f9;
          color: #1559a6;
          box-shadow: 8px 8px 18px rgba(161,180,201,.48), -7px -7px 15px rgba(255,255,255,.96);
          cursor: pointer;
          z-index: 30;
          transition: transform .20s ease, box-shadow .20s ease;
        }

        .sidebarToggle:hover { transform: translateY(-1px); }
        .sidebarToggle:active {
          transform: translateY(1px) scale(.96);
          box-shadow: inset 4px 4px 10px rgba(161,180,201,.42), inset -4px -4px 10px rgba(255,255,255,.92);
        }
        .sidebarToggleGlyph { font-size: 22px; font-weight: 900; line-height: 1; }

        .sidebar.collapsed .brandBlock { justify-content: center; padding: 0; }
        .sidebar.collapsed .brandText,
        .sidebar.collapsed .sidebarLabel,
        .sidebar.collapsed .navLabel {
          opacity: 0;
          width: 0;
          max-width: 0;
          overflow: hidden;
          white-space: nowrap;
          margin: 0;
          pointer-events: none;
          transition: opacity .16s ease, width .28s ease;
        }
        .sidebar:not(.collapsed) .brandText,
        .sidebar:not(.collapsed) .navLabel {
          transition: opacity .25s ease .08s, width .28s ease;
        }
        .sidebar.collapsed .nav { padding: 0 12px; }
        .sidebar.collapsed .navButton { justify-content: center; padding-left: 0; padding-right: 0; }

        .nav { gap: 9px; padding: 0 14px; }
        .navButton {
          min-height: 52px;
          gap: 12px;
          padding: 0 15px;
          border: 0;
          border-left: 0;
          border-radius: 16px;
          background: #e9f1f9;
          color: #4b647e;
          box-shadow: 7px 7px 16px rgba(161,180,201,.45), -7px -7px 16px rgba(255,255,255,.92);
          font-size: 14px;
          transition: transform .18s ease, color .18s ease, box-shadow .20s ease, background .20s ease;
        }
        .navButton:hover {
          background: #edf4fb;
          color: #1559a6;
          transform: translateY(-1px);
          box-shadow: 10px 10px 21px rgba(161,180,201,.46), -8px -8px 18px rgba(255,255,255,.96);
        }
        .navButton:active {
          transform: translateY(1px) scale(.995);
          box-shadow: inset 5px 5px 12px rgba(161,180,201,.38), inset -5px -5px 12px rgba(255,255,255,.92);
        }
        .navButton.active {
          background: #e4eef9;
          color: #1559a6;
          box-shadow: inset 5px 5px 12px rgba(161,180,201,.34), inset -5px -5px 12px rgba(255,255,255,.95);
        }
        .iconGlyph { flex: 0 0 22px; width: 22px; font-size: 15px; }

        .sidebarLogout {
          min-height: 48px;
          margin: 14px 14px 18px;
          border: 0;
          border-radius: 15px;
          background: #e9f1f9;
          color: #c92335;
          box-shadow: 7px 7px 16px rgba(161,180,201,.43), -7px -7px 16px rgba(255,255,255,.92);
          font-size: 13px;
          transition: transform .18s ease, box-shadow .20s ease;
        }
        .sidebarLogout:hover {
          transform: translateY(-1px);
          box-shadow: 9px 9px 20px rgba(161,180,201,.46), -8px -8px 17px rgba(255,255,255,.96);
        }
        .sidebarLogout:active {
          transform: translateY(1px);
          box-shadow: inset 5px 5px 12px rgba(161,180,201,.38), inset -5px -5px 12px rgba(255,255,255,.92);
        }
        .sidebar.collapsed .sidebarLogout { font-size: 0; padding: 0; }
        .sidebar.collapsed .sidebarLogout::before { content: "↪"; font-size: 17px; }

        .main { background: #e9f1f9; }
        .topbar {
          min-height: 24px;
          height: 24px;
          padding: 0 30px;
          background: transparent;
          border-bottom: 0;
        }
        .topTitle, .topAccent { display: none; }
        .content { padding: 16px 30px 32px; }
        .pageTitle { font-size: 30px; letter-spacing: -.6px; }
        .pageSub { font-size: 14px; line-height: 1.55; }

        .welcomeCard, .actionCard, .statCard, .panel {
          border: 0;
          background: #e9f1f9;
          box-shadow: 10px 10px 24px rgba(161,180,201,.38), -10px -10px 24px rgba(255,255,255,.93);
        }
        .welcomeCard, .actionCard, .panel { border-radius: 20px; }
        .statCard { border-radius: 18px; }
        .welcomeCard h2 { font-size: 22px; }
        .welcomeCard p, .actionCard p, .panelHeaderSub { font-size: 13px; line-height: 1.65; }
        .statNumber { font-size: 28px; }
        .statLabel { font-size: 11px; }
        .panelHeaderTitle { font-size: 17px; }

        /* The dashboard shortcut cards remain accessible through Home navigation;
           the screenshot-requested cards are intentionally removed from the Home view. */
        .actionGrid { display: none; }

        .searchInput, .selectInput {
          min-height: 50px;
          border: 0;
          border-radius: 15px;
          background: #e9f1f9;
          box-shadow: inset 5px 5px 12px rgba(161,180,201,.34), inset -5px -5px 12px rgba(255,255,255,.92);
          font-size: 14px;
        }
        .searchInput:focus, .selectInput:focus {
          outline: none;
          box-shadow: inset 5px 5px 12px rgba(161,180,201,.28), inset -5px -5px 12px rgba(255,255,255,.92), 0 0 0 3px rgba(21,89,166,.10);
        }

        .toolbarButton, .smallButton, .recordViewTab, .periodTab, .secondaryButton, .dangerButton {
          border: 0;
          border-radius: 14px;
          background: #e9f1f9;
          color: #1559a6;
          box-shadow: 7px 7px 16px rgba(161,180,201,.43), -7px -7px 16px rgba(255,255,255,.92);
          font-size: 14px;
          transition: transform .17s ease, box-shadow .20s ease, background .17s ease;
        }
        .toolbarButton:hover, .smallButton:hover, .recordViewTab:hover, .periodTab:hover, .secondaryButton:hover, .dangerButton:hover {
          transform: translateY(-1px);
          box-shadow: 9px 9px 20px rgba(161,180,201,.47), -8px -8px 18px rgba(255,255,255,.95);
        }
        .toolbarButton:active, .smallButton:active, .recordViewTab:active, .periodTab:active, .secondaryButton:active, .dangerButton:active {
          transform: translateY(1px) scale(.99);
          box-shadow: inset 5px 5px 12px rgba(161,180,201,.39), inset -5px -5px 12px rgba(255,255,255,.93);
        }
        .toolbarButton:disabled, .smallButton:disabled, .secondaryButton:disabled, .dangerButton:disabled { opacity: .48; transform: none; cursor: not-allowed; }
        .dangerButton, .redSmall { color: #c92335; }
        .softButton { color: #1559a6; }

        .tableWrap, .summaryTableWrap {
          background: #e9f1f9;
          border: 0;
          border-radius: 18px;
          box-shadow: inset 3px 3px 9px rgba(161,180,201,.18), inset -3px -3px 9px rgba(255,255,255,.62);
        }
        table { font-size: 14px; }
        th { font-size: 12px; }
        td { font-size: 14px; }
        .selectionCell, .selectionHeader { width: 48px; text-align: center; }
        .learnerCheckbox { width: 21px; height: 21px; accent-color: #1559a6; cursor: pointer; }
        .selectedRow td { background: rgba(21,89,166,.055); }
        .srOnly { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

        @media (max-width: 1180px) {
          .statsGrid {
            grid-template-columns:
              repeat(
                3,
                minmax(0, 1fr)
              );
          }

          .analyticsGrid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }
        }

        @media (max-width: 880px) {
          .sidebar {
            width: 70px;
          }

          .brandBlock {
            justify-content: center;
            padding: 0;
          }

          .brandText {
            display: none;
          }

          .sidebarLabel {
            display: none;
          }

          .nav {
            padding: 10px;
          }

          .navButton {
            justify-content: center;
            padding: 0;
          }

          .navButton span:last-child {
            display: none;
          }

          .sidebarLogout {
            margin: 10px;
            font-size: 0;
          }

          .sidebarLogout::before {
            content: "↪";
            font-size: 14px;
          }

          .actionGrid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 700px) {
          .topbar {
            min-height: 64px;
            padding: 0 16px;
          }

          .content {
            padding: 16px;
          }

          .statsGrid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .profileGrid,
          .formGrid,
          .analyticsGrid {
            grid-template-columns: 1fr;
          }

          .formGroup.full {
            grid-column: auto;
          }

          .toolbar {
            align-items: stretch;
          }

          .searchInput,
          .selectInput,
          .toolbarButton {
            width: 100%;
          }

          .pageTitle {
            font-size: 21px;
          }
        }

        @media (max-width: 480px) {
          .sidebar {
            width: 58px;
          }

          .nav {
            padding: 8px 6px;
          }

          .navButton {
            min-height: 41px;
          }

          .statsGrid {
            grid-template-columns: 1fr;
          }

          .brandLogo {
            width: 38px;
            height: 38px;
          }
        }
        @media (max-width: 880px) {
          .sidebar {
            width: 86px;
          }
          .sidebar.open {
            width: 332px;
          }
          .brandText, .sidebarLabel, .navLabel {
            transition: opacity .18s ease, width .28s ease;
          }
        }

        @media (max-width: 760px) {
          .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            height: 100vh;
            z-index: 50;
          }
          .sidebar.open { width: 332px; }
          .sidebar.collapsed { width: 86px; }
          .content { padding: 16px 18px 28px; }
          .topbar { min-height: 16px; height: 16px; }
          .pageTitle { font-size: 27px; }
          .pageSub { font-size: 13px; }
          .statsGrid { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .toolbar { align-items: stretch; }
          .searchInput, .selectInput, .toolbarButton { width: 100%; }
        }

        @media (max-width: 480px) {
          .statsGrid { grid-template-columns: 1fr; }
          .pageTitle { font-size: 25px; }
        }


        .templateSummaryTable {
          min-width: 1700px;
        }
        .templateSummaryTable th,
        .templateSummaryTable td {
          border: 1px solid rgba(104,125,145,.34);
          padding: 7px 6px;
          text-align: center;
          vertical-align: middle;
          font-size: 10px;
        }
        .templateSummaryTable th {
          background: #dce7f1;
          color: #314a63;
          font-weight: 900;
        }
        .templateSummaryTable thead tr:first-child th {
          background: #c8d8e6;
        }
        .templateSummaryTable tbody td {
          background: #eef4f8;
          color: #425a70;
        }
        html[data-crl-theme="dark"] .templateSummaryTable th {
          background: #2c3c4b;
          color: #c5d4e1;
          border-color: #3a4a58;
        }
        html[data-crl-theme="dark"] .templateSummaryTable tbody td {
          background: #1b2530;
          color: #bdccd8;
          border-color: #2c3d4d;
        }

        .recordTemplateView {
          padding: 0 14px 16px;
        }
        .recordTemplateMeta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 16px 6px 14px;
          border-bottom: 1px solid rgba(127,148,168,.24);
        }
        .recordTemplateMeta > div:first-child {
          display: grid;
          gap: 4px;
        }
        .recordTemplateMeta strong {
          color: #243f5b;
          font-size: 16px;
          font-weight: 900;
        }
        .recordTemplateMeta span {
          color: #74879c;
          font-size: 11px;
        }
        .recordTemplateTeacher {
          display: grid;
          grid-template-columns: auto auto;
          gap: 4px 10px;
          min-width: 210px;
          text-align: right;
        }
        .recordTemplateTeacher strong {
          font-size: 12px;
        }
        .recordTemplateScroller {
          overflow: auto;
          border-radius: 16px;
          background: #e9f1f9;
          box-shadow: inset 3px 3px 9px rgba(161,180,201,.18), inset -3px -3px 9px rgba(255,255,255,.62);
        }
        .recordTemplateTable {
          min-width: 1500px;
          width: 100%;
          border-collapse: collapse;
        }
        .recordTemplateTable th,
        .recordTemplateTable td {
          border: 1px solid rgba(104,125,145,.34);
          padding: 8px 7px;
          text-align: center;
          vertical-align: middle;
          font-size: 11px;
        }
        .recordTemplateTable th {
          background: #dce7f1;
          color: #314a63;
          font-weight: 900;
        }
        .recordTemplateTable thead tr:first-child th {
          background: #c8d8e6;
        }
        .recordTemplateTable tbody td {
          background: #eef4f8;
          color: #425a70;
        }
        .recordTemplateTable tbody tr:nth-child(even) td {
          background: #e8f0f6;
        }
        .classRecordTable th:nth-child(n+11) {
          background: #e1efda;
        }
        .classRecordTable th:nth-child(5),
        .classRecordTable th:nth-child(6),
        .classRecordTable th:nth-child(7),
        .classRecordTable th:nth-child(8),
        .classRecordTable th:nth-child(9),
        .classRecordTable th:nth-child(10) {
          background: #dce9f5;
        }
        .templateSpacerCell {
          min-width: 34px;
        }
        html[data-crl-theme="dark"] .recordTemplateMeta strong {
          color: #e8f1f8;
        }
        html[data-crl-theme="dark"] .recordTemplateMeta span {
          color: #91a6ba;
        }
        html[data-crl-theme="dark"] .recordTemplateScroller {
          background: #1b2530;
          box-shadow: inset 3px 3px 9px rgba(4,8,14,.36), inset -3px -3px 9px rgba(43,59,75,.30);
        }
        html[data-crl-theme="dark"] .recordTemplateTable th {
          background: #263340;
          color: #c5d4e1;
          border-color: #3a4a58;
        }
        html[data-crl-theme="dark"] .recordTemplateTable thead tr:first-child th {
          background: #2c3c4b;
        }
        html[data-crl-theme="dark"] .recordTemplateTable tbody td,
        html[data-crl-theme="dark"] .recordTemplateTable tbody tr:nth-child(even) td {
          background: #1b2530;
          color: #bdccd8;
          border-color: #2c3d4d;
        }

        .manageAssessmentPanel,
        .analyticsMainPanel,
        .profileMainPanel {
          margin-top: clamp(30px, 10vh, 120px);
          margin-bottom: clamp(26px, 8vh, 96px);
        }

        .manageAssessmentPanel {
          min-height: min(650px, calc(100vh - 170px));
        }

        .analyticsMainPanel .panelHeaderTitle {
          font-size: 20px !important;
          line-height: 1.2;
          font-weight: 900;
          letter-spacing: -0.2px;
        }

        .analyticsMainPanel .analyticsCard h3 {
          font-size: 15px !important;
          font-weight: 900;
        }

        .analyticsMainPanel .analyticsValue {
          font-size: 30px !important;
          font-weight: 900;
        }

        .analyticsMainPanel .analyticsMuted,
        .analyticsMainPanel .barTop,
        .analyticsMainPanel .barRow {
          font-size: 12px;
        }

        .analyticsMainPanel .barTop {
          font-weight: 800;
        }

        .analyticsMainPanel {
          min-height: min(520px, calc(100vh - 170px));
        }

        .profileMainPanel {
          width: min(980px, calc(100% - 24px));
          margin-left: auto;
          margin-right: auto;
          min-height: min(420px, calc(100vh - 180px));
        }

        .profileMainPanel .profileLabel {
          font-size: 12px;
        }

        .profileMainPanel .profileValue {
          font-size: 16px;
        }

        .profileMainPanel .profileItem {
          min-height: 92px;
          padding: 20px;
        }

        html[data-crl-theme="dark"] .manageAssessmentPanel .panelHeaderSub,
        html[data-crl-theme="dark"] .analyticsMainPanel .panelHeaderSub {
          color: #9eb2c5;
        }

        /* Final sidebar and layout refinement */
        :root {
          --crl-sidebar-open-width: 332px;
          --crl-sidebar-collapsed-width: 0px;
        }

        .sidebar {
          width: var(--crl-sidebar-open-width) !important;
          transition:
            width .46s cubic-bezier(.22,1,.36,1),
            background-color .46s cubic-bezier(.22,1,.36,1),
            box-shadow .46s cubic-bezier(.22,1,.36,1);
        }

        .sidebar.open {
          width: var(--crl-sidebar-open-width) !important;
        }

        .sidebar.collapsed {
          width: var(--crl-sidebar-collapsed-width) !important;
          min-width: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          border: 0 !important;
        }

        .sidebar.collapsed > *:not(.sidebarToggle) {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          user-select: none !important;
        }

        .main {
          margin-left: 344px !important;
          transition:
            margin-left .46s cubic-bezier(.22,1,.36,1),
            background-color .46s cubic-bezier(.22,1,.36,1);
        }

        .sidebar.collapsed + .main {
          margin-left: 0 !important;
        }

        .sidebarToggle {
          position: fixed !important;
          top: 50% !important;
          left: 312px !important;
          right: auto !important;
          width: 44px !important;
          height: 44px !important;
          padding: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 1px solid rgba(255,255,255,.38) !important;
          border-radius: 50% !important;
          background: rgba(224,235,244,.72) !important;
          -webkit-backdrop-filter: blur(7px);
          backdrop-filter: blur(7px);
          color: #1559a6 !important;
          box-shadow:
            7px 7px 15px rgba(120,143,164,.34),
            -6px -6px 14px rgba(255,255,255,.78) !important;
          transform: translateY(-50%) !important;
          z-index: 120 !important;
          transition:
            left .46s cubic-bezier(.22,1,.36,1),
            width .34s cubic-bezier(.22,1,.36,1),
            height .34s cubic-bezier(.22,1,.36,1),
            background-color .34s ease,
            color .34s ease,
            box-shadow .34s ease,
            opacity .28s ease !important;
        }

        .sidebarToggle:hover {
          transform: translateY(calc(-50% - 2px)) !important;
        }

        .sidebarToggle:active {
          transform: translateY(calc(-50% + 1px)) scale(.95) !important;
        }

        .sidebar.collapsed .sidebarToggle {
          left: 10px !important;
          width: 52px !important;
          height: 52px !important;
          background: rgba(35,77,111,.82) !important;
          color: #e6f4ff !important;
          border-color: rgba(150,201,240,.34) !important;
          box-shadow:
            8px 8px 17px rgba(4,8,14,.44),
            -6px -6px 14px rgba(71,97,120,.28) !important;
        }

        .sidebarToggleGlyph {
          font-size: 28px !important;
          font-weight: 900 !important;
          line-height: 1 !important;
        }

        .brandThemeSwitch {
          top: 6px !important;
          right: 18px !important;
        }

        .brandThemeSwitch .themeSwitchTrack {
          transition:
            background-color .55s cubic-bezier(.22,1,.36,1),
            box-shadow .55s cubic-bezier(.22,1,.36,1) !important;
        }

        .brandThemeSwitch .themeSwitchThumb {
          transition:
            transform .58s cubic-bezier(.22,1,.36,1),
            background-color .42s ease,
            color .34s ease,
            box-shadow .42s ease !important;
        }

        .brandThemeSwitch.isLight .themeSwitchThumb {
          transform: translateX(0) !important;
        }

        .brandThemeSwitch.isDark .themeSwitchThumb {
          transform: translateX(28px) !important;
        }

        html[data-crl-theme="dark"] .sidebarToggle {
          background: rgba(31,52,70,.82) !important;
          color: #9bcfff !important;
          border-color: rgba(112,157,194,.36) !important;
          box-shadow:
            8px 8px 18px rgba(4,8,14,.48),
            -6px -6px 14px rgba(55,78,99,.34) !important;
        }

        html[data-crl-theme="dark"] .sidebar.collapsed .sidebarToggle {
          background: rgba(35,77,111,.90) !important;
          color: #e5f4ff !important;
          box-shadow:
            9px 9px 19px rgba(4,8,14,.52),
            -6px -6px 14px rgba(56,82,105,.32) !important;
        }

        .manageAssessmentPanel,
        .analyticsMainPanel,
        .profileMainPanel {
          margin-top: clamp(34px, 10vh, 118px) !important;
          margin-bottom: clamp(30px, 8vh, 92px) !important;
        }

        .profileMainPanel {
          width: min(980px, calc(100% - 32px)) !important;
        }

        .profileMainPanel .profileItem {
          min-height: 96px !important;
        }

        .profileMainPanel .profileLabel {
          font-size: 12px !important;
        }

        .profileMainPanel .profileValue {
          font-size: 17px !important;
        }

        html[data-crl-theme="dark"] .templateSummaryTable thead th {
          color: #f7fbff !important;
          background: #40596f !important;
          border-color: #587188 !important;
          text-shadow: 0 1px 2px rgba(0,0,0,.28);
        }

        html[data-crl-theme="dark"] .templateSummaryTable thead tr:first-child th {
          color: #ffffff !important;
          background: #49657d !important;
        }

        @media (max-width: 880px) {
          .sidebar.open {
            width: min(332px, 88vw) !important;
          }

          .main {
            margin-left: min(344px, calc(88vw + 12px)) !important;
          }

          .sidebar.open .sidebarToggle {
            left: min(calc(88vw - 20px), 312px) !important;
          }
        }

        @media (max-width: 760px) {
          .sidebar.open {
            width: min(332px, 86vw) !important;
          }

          .main,
          .sidebar.collapsed + .main {
            margin-left: 0 !important;
          }

          .sidebar.open + .main {
            margin-left: min(344px, calc(86vw + 12px)) !important;
          }

          .sidebar.open .sidebarToggle {
            left: min(calc(86vw - 20px), 312px) !important;
          }
        }

        /* Final sidebar geometry and motion override */
        :root {
          --crl-sidebar-width: 390px;
        }

        .sidebar {
          width: var(--crl-sidebar-width) !important;
          min-width: 0 !important;
          overflow: visible !important;
          transition:
            width .52s cubic-bezier(.22,1,.36,1),
            background-color .42s ease,
            box-shadow .42s ease !important;
        }

        .sidebar.open {
          width: var(--crl-sidebar-width) !important;
        }

        .sidebar.collapsed {
          width: 0 !important;
          min-width: 0 !important;
          overflow: visible !important;
          background: transparent !important;
          border-right: 0 !important;
          box-shadow: none !important;
        }

        .sidebar.collapsed > *:not(.sidebarToggle) {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          width: 0 !important;
        }

        .main {
          margin-left: calc(var(--crl-sidebar-width) + 12px) !important;
          transition:
            margin-left .52s cubic-bezier(.22,1,.36,1),
            background-color .42s ease !important;
        }

        .sidebar.collapsed + .main {
          margin-left: 0 !important;
        }

        .sidebarToggle {
          position: fixed !important;
          top: 50% !important;
          left: calc(var(--crl-sidebar-width) - 22px) !important;
          width: 44px !important;
          height: 44px !important;
          min-width: 44px !important;
          min-height: 44px !important;
          margin: 0 !important;
          padding: 0 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border-radius: 50% !important;
          background: rgba(213,227,239,.68) !important;
          border: 1px solid rgba(255,255,255,.58) !important;
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          box-shadow:
            7px 7px 15px rgba(116,141,163,.34),
            -6px -6px 14px rgba(255,255,255,.80) !important;
          transform: translateY(-50%) !important;
          z-index: 999 !important;
          transition:
            left .52s cubic-bezier(.22,1,.36,1),
            width .34s cubic-bezier(.22,1,.36,1),
            height .34s cubic-bezier(.22,1,.36,1),
            background-color .34s ease,
            color .34s ease,
            box-shadow .34s ease,
            opacity .26s ease !important;
        }

        .sidebarToggle:hover {
          transform: translateY(calc(-50% - 2px)) !important;
        }

        .sidebarToggle:active {
          transform: translateY(calc(-50% + 1px)) scale(.95) !important;
        }

        .sidebar.collapsed .sidebarToggle {
          left: 12px !important;
          width: 56px !important;
          height: 56px !important;
          min-width: 56px !important;
          min-height: 56px !important;
          background: rgba(35,77,111,.86) !important;
          color: #e7f5ff !important;
          border-color: rgba(150,201,240,.38) !important;
          box-shadow:
            9px 9px 19px rgba(4,8,14,.46),
            -6px -6px 14px rgba(71,97,120,.28) !important;
        }

        .sidebarToggleGlyph {
          font-size: 30px !important;
          line-height: 1 !important;
          font-weight: 900 !important;
        }

        .sidebar.open .sidebarToggle {
          left: calc(var(--crl-sidebar-width) - 22px) !important;
        }

        .brandBlock {
          width: 100% !important;
          box-sizing: border-box !important;
        }

        .nav {
          width: 100% !important;
          box-sizing: border-box !important;
          padding-right: 24px !important;
        }

        .navButton {
          width: 100% !important;
        }

        @media (max-width: 880px) {
          :root {
            --crl-sidebar-width: min(360px, 88vw);
          }

          .main {
            margin-left: calc(var(--crl-sidebar-width) + 10px) !important;
          }

          .sidebar.collapsed + .main {
            margin-left: 0 !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sidebar,
          .main,
          .sidebarToggle {
            transition-duration: .01ms !important;
          }
        }

        .recordsMainPanel {
          margin-top: clamp(22px, 10vh, 120px);
          margin-bottom: clamp(24px, 8vh, 96px);
        }

        .recordsMainPanel .summaryTableWrap {
          border-radius: 14px;
        }

        html[data-crl-theme="dark"] .templateSummaryTable thead th {
          background: #31475a !important;
          color: #f2f7fb !important;
          border-color: #4c6274 !important;
          text-shadow: 0 1px 1px rgba(0,0,0,.24);
        }

        html[data-crl-theme="dark"] .templateSummaryTable thead tr:first-child th {
          background: #3b5368 !important;
          color: #ffffff !important;
        }

        html[data-crl-theme="dark"] .templateSummaryTable tbody td {
          color: #d9e6ef !important;
        }

        .brandThemeSwitch {
          position: absolute;
          top: 10px;
          right: 18px;
          margin: 0;
          width: 62px;
          height: 32px;
        }

        .brandThemeSwitch .themeSwitchTrack {
          width: 56px;
          height: 28px;
          padding: 2px;
        }

        .brandThemeSwitch .themeSwitchThumb {
          top: 2px;
          left: 2px;
          width: 24px;
          height: 24px;
          font-size: 14px;
        }

        .brandThemeSwitch .themeSwitchTrack {
          transition:
            background-color .55s cubic-bezier(.22,1,.36,1),
            box-shadow .55s cubic-bezier(.22,1,.36,1);
        }

        .brandThemeSwitch .themeSwitchThumb {
          transition:
            transform .52s cubic-bezier(.22,1,.36,1),
            background-color .45s ease,
            color .35s ease,
            box-shadow .45s ease;
        }


        .brandThemeSwitch.isLight .themeSwitchThumb {
          transform: translateX(0);
        }

        .brandThemeSwitch.isDark .themeSwitchThumb {
          transform: translateX(28px);
        }

        .brandThemeSwitch.isLight:hover .themeSwitchThumb {
          transform: translateY(-1px);
        }

        .brandThemeSwitch.isDark:hover .themeSwitchThumb {
          transform: translate(28px, -1px);
        }

        .brandThemeSwitch.isLight:active .themeSwitchThumb {
          transform: translateY(1px) scale(.95);
        }

        .brandThemeSwitch.isDark:active .themeSwitchThumb {
          transform: translate(28px, 1px) scale(.95);
        }

        .brandThemeSwitch.isLight .themeSwitchTrack {
          background: #e0eaf3;
          box-shadow: inset 3px 3px 8px rgba(161,180,201,.34), inset -3px -3px 8px rgba(255,255,255,.94);
        }

        .brandThemeSwitch.isLight .themeSwitchThumb {
          background: #ffffff;
          color: #dfa91d;
          box-shadow: 3px 3px 8px rgba(122,143,163,.26), -3px -3px 8px rgba(255,255,255,.94);
        }

        .brandThemeSwitch.isDark .themeSwitchTrack {
          background: #263b50;
          border: 1px solid #35506a;
          box-shadow: inset 3px 3px 8px rgba(4,8,14,.52), inset -3px -3px 8px rgba(66,91,114,.34);
        }

        .brandThemeSwitch.isDark .themeSwitchThumb {
          background: #2d5f8f;
          color: #d7ecff;
          box-shadow: 3px 3px 8px rgba(4,8,14,.46), -3px -3px 8px rgba(68,95,120,.34);
        }

        .brandThemeSwitch:focus-visible {
          outline: 2px solid rgba(111,173,231,.55);
          outline-offset: 3px;
          border-radius: 999px;
        }

        .sidebarToggle {
          position: fixed;
          top: 50%;
          right: auto;
          left: 315px;
          width: 38px;
          height: 38px;
          transform: translateY(-50%);
          z-index: 95;
        }

        .sidebar.collapsed .sidebarToggle {
          left: 55px;
        }

        .sidebarToggle:hover {
          transform: translateY(calc(-50% - 2px));
        }

        .sidebarToggle:active {
          transform: translateY(calc(-50% + 1px)) scale(.96);
        }

        html[data-crl-theme="dark"] .brandThemeSwitch .themeSwitchTrack {
          background: #263b50;
          box-shadow: inset 3px 3px 8px rgba(4,8,14,.52), inset -3px -3px 8px rgba(66,91,114,.34);
        }

        html[data-crl-theme="dark"] .brandThemeSwitch .themeSwitchThumb {
          background: #2f6799;
          color: #d7ecff;
          box-shadow: 3px 3px 8px rgba(4,8,14,.46), -3px -3px 8px rgba(68,95,120,.34);
        }

        html[data-crl-theme="light"] .brandThemeSwitch .themeSwitchTrack {
          background: #dfeaf3;
          box-shadow: inset 3px 3px 8px rgba(161,180,201,.34), inset -3px -3px 8px rgba(255,255,255,.92);
        }

        html[data-crl-theme="light"] .brandThemeSwitch .themeSwitchThumb {
          background: #ffffff;
          color: #dfa91d;
          box-shadow: 3px 3px 8px rgba(122,143,163,.26), -3px -3px 8px rgba(255,255,255,.94);
        }

        html[data-crl-theme="dark"] .sidebarToggle {
          background: #1b2530;
          color: #86b9e9;
          box-shadow: 8px 8px 18px rgba(4,8,14,.50), -7px -7px 15px rgba(41,56,72,.40);
        }

        /* Final interaction polish: fixed navigation, tactile buttons, and spacious multi-entry modal. */
        .bulkDeleteConfirmModal {
          width: min(520px, 92vw);
        }

        .bulkDeleteConfirmBody {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          min-height: 150px;
        }

        .bulkDeleteIcon {
          width: 46px;
          height: 46px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: #e9f1f9;
          color: #c92335;
          font-size: 24px;
          font-weight: 900;
          box-shadow: inset 4px 4px 9px rgba(161,180,201,.28), inset -4px -4px 9px rgba(255,255,255,.88);
        }

        .bulkDeleteConfirmBody h3 {
          margin: 2px 0 7px;
          color: #22384f;
          font-size: 15px;
        }

        .bulkDeleteConfirmBody p {
          margin: 0;
          color: #71849a;
          font-size: 11px;
          line-height: 1.7;
        }

        .bulkDeleteConfirmButton {
          background: #c92335 !important;
          color: #ffffff !important;
        }

        .conductLearnerPanelEmpty {
          min-height: min(590px, calc(100vh - 150px));
          margin-top: clamp(12px, 6vh, 64px);
          margin-bottom: clamp(12px, 6vh, 64px);
          display: flex;
          flex-direction: column;
        }

        .conductLearnerPanelEmpty .learnerEmptyState {
          min-height: 0;
          flex: 1;
        }

        .learnerEmptyState {
          min-height: 360px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 20px;
        }

        .learnerEmptyState .emptyIcon {
          margin-bottom: 14px;
        }

                .themeSwitchButton {
          width: 72px;
          height: 36px;
          margin: 20px auto 10px;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          display: grid;
          place-items: center;
        }
        .themeSwitchTrack {
          position: relative;
          width: 64px;
          height: 32px;
          padding: 3px;
          border-radius: 999px;
          background: #dbe7f1;
          box-shadow: inset 3px 3px 7px rgba(161,180,201,.36), inset -3px -3px 7px rgba(255,255,255,.88);
          transition: background .35s ease, box-shadow .35s ease;
        }
        .themeSwitchThumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 26px;
          height: 26px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #ffffff;
          color: #e3a51c;
          font-size: 15px;
          font-weight: 900;
          box-shadow: 3px 3px 7px rgba(122,143,163,.30), -3px -3px 7px rgba(255,255,255,.92);
          transition: transform .38s cubic-bezier(.22,1,.36,1), color .25s ease, background .35s ease;
        }
        .themeSwitchButton.isDark .themeSwitchTrack {
          background: #263746;
          box-shadow: inset 3px 3px 7px rgba(4,8,14,.48), inset -3px -3px 7px rgba(57,76,94,.36);
        }
        .themeSwitchButton.isDark .themeSwitchThumb {
          transform: translateX(32px);
          background: #1f2b37;
          color: #8fc7ff;
          box-shadow: 3px 3px 7px rgba(4,8,14,.45), -3px -3px 7px rgba(61,78,95,.32);
        }
        .themeSwitchButton:hover .themeSwitchThumb { transform: translateY(-1px); }
        .themeSwitchButton.isDark:hover .themeSwitchThumb { transform: translate(32px,-1px); }
        .themeSwitchButton:active .themeSwitchThumb { transform: translateY(1px) scale(.95); }
        .themeSwitchButton.isDark:active .themeSwitchThumb { transform: translate(32px,1px) scale(.95); }

        .sidebar.collapsed .themeSwitchButton {
          margin-top: 20px;
          margin-bottom: 10px;
        }

        .exportGreenButton {
          background: #2f8a68 !important;
          color: #ffffff !important;
          box-shadow: 8px 8px 18px rgba(119,161,143,.42), -7px -7px 16px rgba(255,255,255,.92);
        }
        .exportGreenButton:hover {
          background: #2f8a68 !important;
          color: #ffffff !important;
          box-shadow: 11px 11px 23px rgba(119,161,143,.44), -9px -9px 20px rgba(255,255,255,.96);
        }

        .recordViewTab,
        .periodTab,
        .activityTab {
          transition: transform .18s ease, box-shadow .22s ease, background .32s ease, color .32s ease;
        }

        .manageAssessmentPanel .periodTab {
          min-height: 40px;
          min-width: 70px;
          padding: 0 16px;
          background: #dceafb;
          color: #1559a6;
          font-weight: 900;
          box-shadow: 5px 5px 10px rgba(161,180,201,.30), -4px -4px 10px rgba(255,255,255,.86);
        }

        html[data-crl-theme="dark"] .manageAssessmentPanel .periodTab {
          background: #294c69;
          color: #d3e9ff;
          box-shadow: 5px 5px 11px rgba(4,8,14,.42), -4px -4px 10px rgba(49,70,89,.34);
        }

        html[data-crl-theme="dark"] .manageAssessmentPanel .periodTab.active {
          background: #2f73c9;
          color: #ffffff;
        }

        .activityTabs .activityTab {
          min-height: 46px;
          min-width: 78px;
          padding: 0 18px;
          font-size: 13px;
          font-weight: 900;
        }

        .recordsHeaderActions .recordViewTab,
        .recordsHeaderActions .periodTab {
          min-height: 40px;
          padding-left: 16px;
          padding-right: 16px;
          font-size: 13px;
          font-weight: 900;
        }

        html[data-crl-theme="dark"] .exportGreenButton {
          background: #2f8a68 !important;
          color: #ffffff !important;
        }
        html[data-crl-theme="dark"] .exportGreenButton:hover {
          background: #369673 !important;
          color: #ffffff !important;
        }
        html[data-crl-theme="dark"] .recordViewTabs,
        html[data-crl-theme="dark"] .periodTabs,
        html[data-crl-theme="dark"] .activityTabs {
          background: #1b2530;
          border-color: #334758;
        }
        html[data-crl-theme="dark"] .recordViewTab,
        html[data-crl-theme="dark"] .periodTab,
        html[data-crl-theme="dark"] .activityTab {
          background: #263645;
          color: #bad5ec;
          box-shadow: 5px 5px 10px rgba(4,8,14,.42), -4px -4px 10px rgba(46,63,80,.34);
        }
        html[data-crl-theme="dark"] .recordViewTab:hover,
        html[data-crl-theme="dark"] .periodTab:hover,
        html[data-crl-theme="dark"] .activityTab:hover {
          background: #2b3d4e;
          color: #d7e8f6;
        }
        html[data-crl-theme="dark"] .recordViewTab.active,
        html[data-crl-theme="dark"] .periodTab.active,
        html[data-crl-theme="dark"] .activityTab.active {
          background: #2f73c9;
          color: #ffffff;
          box-shadow: inset 5px 5px 10px rgba(9,37,64,.42), inset -4px -4px 9px rgba(83,123,162,.30);
        }

        html,
        body,
        .teacherShell,
        .sidebar,
        .main,
        .brandBlock,
        .brandLogo,
        .brandText,
        .nav,
        .navButton,
        .panel,
        .toolbar,
        .tableWrap,
        .summaryTableWrap,
        .recordViewTabs,
        .periodTabs,
        .activityTabs,
        .statCard,
        .actionCard,
        .welcomeCard,
        .profileItem,
        .analyticsCard,
        .modal,
        .modalFooter,
        .formInput,
        .formSelect,
        .formTextarea,
        .searchInput,
        .selectInput,
        .sidebarLogout,
        .themeSwitchTrack,
        .themeSwitchThumb {
          transition:
            background-color .48s cubic-bezier(.22,1,.36,1),
            color .48s cubic-bezier(.22,1,.36,1),
            border-color .48s cubic-bezier(.22,1,.36,1),
            box-shadow .48s cubic-bezier(.22,1,.36,1),
            opacity .48s ease;
        }

        .teacherShell *,
        .teacherShell *::before,
        .teacherShell *::after {
          transition-timing-function: cubic-bezier(.22,1,.36,1);
        }

        html[data-crl-theme="dark"],
        html[data-crl-theme="dark"] body {
          background: #151c25 !important;
          color-scheme: dark;
        }

        html[data-crl-theme="dark"] .teacherShell,
        html[data-crl-theme="dark"] .main {
          background: #151c25;
        }

        html[data-crl-theme="dark"] .sidebar,
        html[data-crl-theme="dark"] .brandBlock,
        html[data-crl-theme="dark"] .navButton,
        html[data-crl-theme="dark"] .sidebarLogout,
        html[data-crl-theme="dark"] .themeToggle,
        html[data-crl-theme="dark"] .welcomeCard,
        html[data-crl-theme="dark"] .actionCard,
        html[data-crl-theme="dark"] .statCard,
        html[data-crl-theme="dark"] .panel,
        html[data-crl-theme="dark"] .toolbar,
        html[data-crl-theme="dark"] .modal,
        html[data-crl-theme="dark"] .modalFooter,
        html[data-crl-theme="dark"] .profileItem,
        html[data-crl-theme="dark"] .analyticsCard,
        html[data-crl-theme="dark"] .recordViewTabs,
        html[data-crl-theme="dark"] .periodTabs,
        html[data-crl-theme="dark"] .activityTabs,
        html[data-crl-theme="dark"] .tableWrap,
        html[data-crl-theme="dark"] .summaryTableWrap,
        html[data-crl-theme="dark"] .learnerEntryRow,
        html[data-crl-theme="dark"] .deletingToast,
        html[data-crl-theme="dark"] .busyCard {
          background: #1b2530;
          color: #dbe7f3;
          box-shadow: 8px 8px 18px rgba(4,8,14,.46), -7px -7px 17px rgba(40,54,69,.42);
        }

        html[data-crl-theme="dark"] .brandTitle,
        html[data-crl-theme="dark"] .pageTitle,
        html[data-crl-theme="dark"] .welcomeCard h2,
        html[data-crl-theme="dark"] .actionCard h3,
        html[data-crl-theme="dark"] .panelHeaderTitle,
        html[data-crl-theme="dark"] .modalHeader h2,
        html[data-crl-theme="dark"] .profileValue,
        html[data-crl-theme="dark"] .bulkDeleteConfirmBody h3,
        html[data-crl-theme="dark"] .busyCard strong,
        html[data-crl-theme="dark"] .importSuccessState strong {
          color: #eef5fb;
        }

        html[data-crl-theme="dark"] .brandSubtitle,
        html[data-crl-theme="dark"] .pageSub,
        html[data-crl-theme="dark"] .welcomeCard p,
        html[data-crl-theme="dark"] .actionCard p,
        html[data-crl-theme="dark"] .panelHeaderSub,
        html[data-crl-theme="dark"] .modalHeaderHint,
        html[data-crl-theme="dark"] .formLabel,
        html[data-crl-theme="dark"] .bulkDeleteConfirmBody p,
        html[data-crl-theme="dark"] .deletingToastCopy span,
        html[data-crl-theme="dark"] .busySubtext,
        html[data-crl-theme="dark"] .importSuccessState span {
          color: #9db0c4;
        }

        html[data-crl-theme="dark"] .searchInput,
        html[data-crl-theme="dark"] .selectInput,
        html[data-crl-theme="dark"] .formInput,
        html[data-crl-theme="dark"] .formSelect,
        html[data-crl-theme="dark"] .formTextarea {
          background: #18212b;
          color: #e6eef6;
          box-shadow: inset 5px 5px 11px rgba(5,9,14,.44), inset -5px -5px 11px rgba(41,56,72,.40);
        }

        html[data-crl-theme="dark"] th {
          background: #202b37;
          color: #a9bbcc;
        }

        html[data-crl-theme="dark"] td {
          color: #c7d5e2;
          border-color: #2a3948;
        }

        html[data-crl-theme="dark"] tbody tr:hover td {
          background: #222e3b;
        }

        html[data-crl-theme="dark"] .modalOverlay {
          background: rgba(0, 0, 0, .60);
        }

        html[data-crl-theme="dark"] .busyOverlay {
          background: rgba(7, 11, 16, .62);
        }

        html[data-crl-theme="dark"] .classRecordDropZone,
        html[data-crl-theme="dark"] .importSuccessIcon,
        html[data-crl-theme="dark"] .bulkDeleteIcon,
        html[data-crl-theme="dark"] .learnerEntryNumber {
          background: #1b2530;
        }

        /* Import modal is portaled to document.body so fixed positioning always uses the viewport. */
        .importPortalRoot {
          position: static;
        }
        .importPortalRoot .modalOverlay {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          z-index: 1000;
        }


        .teacherShell { display: block; min-height: 100vh; }
        .sidebar {
          position: fixed;
          inset: 0 auto 0 0;
          height: 100vh;
          min-height: 100vh;
          max-height: 100vh;
          overflow: visible;
          z-index: 80;
          flex: none;
        }
        .main {
          margin-left: 344px;
          min-height: 100vh;
          transition: margin-left .42s cubic-bezier(.22,1,.36,1);
        }
        .sidebar.collapsed + .main { margin-left: 90px; }
        .sidebar.open {
          width: 300px;
        }
        .sidebar.collapsed {
          width: 72px;
        }

        .toolbarButton, .smallButton, .recordViewTab, .periodTab, .secondaryButton, .dangerButton, .closeButton, .addRowButton, .iconDangerButton, .sidebarLogout, .navButton {
          position: relative;
          overflow: hidden;
          will-change: transform, box-shadow;
        }
        .toolbarButton::after, .smallButton::after, .recordViewTab::after, .periodTab::after, .secondaryButton::after, .dangerButton::after, .closeButton::after, .addRowButton::after, .iconDangerButton::after, .sidebarLogout::after, .navButton::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(115deg, transparent 0 36%, rgba(255,255,255,.18) 46%, transparent 58% 100%);
          transform: translateX(-120%);
          transition: transform .46s ease;
        }
        .toolbarButton:hover::after, .smallButton:hover::after, .recordViewTab:hover::after, .periodTab:hover::after, .secondaryButton:hover::after, .dangerButton:hover::after, .closeButton:hover::after, .addRowButton:hover::after, .iconDangerButton:hover::after, .sidebarLogout:hover::after, .navButton:hover::after {
          transform: translateX(120%);
        }
        .toolbarButton:hover, .smallButton:hover, .recordViewTab:hover, .periodTab:hover, .secondaryButton:hover, .dangerButton:hover, .closeButton:hover, .addRowButton:hover, .iconDangerButton:hover, .sidebarLogout:hover, .navButton:hover {
          background: inherit;
          color: inherit;
        }

        .toolbarButton.primaryBlueButton {
          background: #2f73c9;
          color: #ffffff;
          box-shadow: 8px 8px 18px rgba(132,160,191,.45), -7px -7px 16px rgba(255,255,255,.92);
        }
        .toolbarButton.primaryBlueButton:hover {
          box-shadow: 11px 11px 23px rgba(132,160,191,.46), -9px -9px 20px rgba(255,255,255,.96);
          transform: translateY(-2px);
        }
        .toolbarButton.primaryBlueButton:active {
          transform: translateY(1px) scale(.99);
          box-shadow: inset 5px 5px 12px rgba(25,74,126,.28), inset -5px -5px 12px rgba(255,255,255,.28);
        }
        .toolbarButton.importGreenButton {
          background: #2f8a68;
          color: #ffffff;
          box-shadow: 8px 8px 18px rgba(119,161,143,.42), -7px -7px 16px rgba(255,255,255,.92);
        }
        .toolbarButton.importGreenButton:hover {
          box-shadow: 11px 11px 23px rgba(119,161,143,.44), -9px -9px 20px rgba(255,255,255,.96);
          transform: translateY(-2px);
        }
        .toolbarButton.importGreenButton:active {
          transform: translateY(1px) scale(.99);
          box-shadow: inset 5px 5px 12px rgba(30,97,72,.26), inset -5px -5px 12px rgba(255,255,255,.28);
        }

        .multiLearnerModal { width: min(1120px, 96vw); }
        .multiLearnerBody { padding-top: 14px; }
        .modalHeaderHint { margin-top: 4px; color: #71869c; font-size: 12px; }
        .bulkFormHeader { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; color: #637890; font-size: 12px; }
        .bulkFormHeader strong { color: #1559a6; }
        .learnerRowsScroller { max-height: 54vh; overflow: auto; display: grid; gap: 10px; padding: 5px 8px 8px 3px; }
        .learnerEntryRow {
          display: grid;
          grid-template-columns: 34px 1.05fr 1fr 1fr 1fr .8fr 38px;
          gap: 10px;
          align-items: end;
          padding: 12px;
          border-radius: 18px;
          background: #e9f1f9;
          box-shadow: inset 4px 4px 10px rgba(161,180,201,.22), inset -4px -4px 10px rgba(255,255,255,.75);
        }
        .learnerEntryNumber { align-self: center; width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: #e9f1f9; color: #1559a6; font-size: 12px; font-weight: 900; box-shadow: 4px 4px 8px rgba(161,180,201,.35), -4px -4px 8px rgba(255,255,255,.88); }
        .learnerEntryRow .formInput, .learnerEntryRow .formSelect { min-height: 44px; font-size: 13px; }
        .iconDangerButton { width: 36px; height: 36px; border: 0; border-radius: 12px; background: #e9f1f9; color: #c92335; cursor: pointer; box-shadow: 5px 5px 10px rgba(161,180,201,.40), -5px -5px 10px rgba(255,255,255,.92); transition: transform .18s ease, box-shadow .2s ease; }
        .iconDangerButton:hover { transform: translateY(-2px); box-shadow: 8px 8px 14px rgba(161,180,201,.42), -7px -7px 13px rgba(255,255,255,.96); }
        .iconDangerButton:active { transform: translateY(1px) scale(.97); box-shadow: inset 4px 4px 9px rgba(161,180,201,.36), inset -4px -4px 9px rgba(255,255,255,.92); }
        .iconDangerButton:disabled { opacity: .42; cursor: not-allowed; transform: none; }
        .addRowButton { min-height: 42px; margin-top: 4px; padding: 0 16px; border: 0; border-radius: 14px; background: #e9f1f9; color: #1559a6; font-size: 13px; font-weight: 900; cursor: pointer; box-shadow: 7px 7px 15px rgba(161,180,201,.40), -7px -7px 15px rgba(255,255,255,.92); transition: transform .18s ease, box-shadow .2s ease; }
        .addRowButton:hover { transform: translateY(-2px); box-shadow: 10px 10px 18px rgba(161,180,201,.43), -8px -8px 18px rgba(255,255,255,.96); }
        .addRowButton:active { transform: translateY(1px); box-shadow: inset 5px 5px 11px rgba(161,180,201,.36), inset -5px -5px 11px rgba(255,255,255,.92); }

        .deletingToast {
          position: fixed;
          right: 24px;
          bottom: 24px;
          z-index: 400;
          min-width: 310px;
          max-width: min(380px, calc(100vw - 32px));
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 14px 16px;
          border-radius: 18px;
          background: #e9f1f9;
          color: #29445f;
          box-shadow: 10px 10px 24px rgba(161,180,201,.45), -9px -9px 22px rgba(255,255,255,.95);
          animation: toastIn .22s ease;
        }
        .deletingToastIcon { width: 32px; height: 32px; flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center; background: #e9f1f9; box-shadow: inset 3px 3px 7px rgba(161,180,201,.28), inset -3px -3px 7px rgba(255,255,255,.88); }
        .deletingToastIcon span { width: 13px; height: 13px; border: 2px solid rgba(47,115,201,.25); border-top-color: #2f73c9; border-radius: 50%; animation: spin .8s linear infinite; }
        .deletingToastCopy { min-width: 0; display: grid; gap: 5px; }
        .deletingToastCopy strong { font-size: 13px; color: #173a61; }
        .deletingToastCopy span { font-size: 11px; color: #6f8399; }
        .deletingProgressTrack { height: 6px; overflow: hidden; border-radius: 999px; background: rgba(161,180,201,.28); box-shadow: inset 2px 2px 4px rgba(161,180,201,.22), inset -2px -2px 4px rgba(255,255,255,.72); }
        .deletingProgressFill { height: 100%; border-radius: inherit; background: #2f73c9; transition: width .18s ease; }

        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 980px) {
          .learnerEntryRow { grid-template-columns: 28px 1fr 1fr 1fr; }
          .learnerEntryRow .formGroup:nth-of-type(4), .learnerEntryRow .formGroup:nth-of-type(5), .learnerEntryRow .iconDangerButton { grid-column: span 1; }
        }
        @media (max-width: 760px) {
          .main, .sidebar.collapsed + .main { margin-left: 0; }
          .sidebar { position: fixed; }
          .sidebar.collapsed { width: 86px; }
          .sidebar.open { width: 286px; }
          .multiLearnerModal { width: min(96vw, 680px); }
          .learnerEntryRow { grid-template-columns: 28px 1fr 1fr; }
          .learnerEntryRow .formGroup { grid-column: span 1; }
          .learnerEntryRow .iconDangerButton { grid-column: 3; justify-self: end; }
        }
        @media (max-width: 560px) {
          .learnerEntryRow { grid-template-columns: 28px 1fr; }
          .learnerEntryRow .formGroup, .learnerEntryRow .iconDangerButton { grid-column: 2; }
          .learnerEntryRow .iconDangerButton { justify-self: start; }
          .deletingToast { right: 12px; bottom: 12px; min-width: 0; }
        }

        .classRecordDropZone {
          min-height: 260px;
          padding: 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 9px;
          text-align: center;
          border-radius: 22px;
          border: 2px dashed rgba(47,138,104,.38);
          background: #e9f1f9;
          color: #2b455f;
          box-shadow: inset 5px 5px 12px rgba(161,180,201,.25), inset -5px -5px 12px rgba(255,255,255,.85);
          cursor: pointer;
          transition: transform .18s ease, box-shadow .22s ease, border-color .22s ease;
        }
        .classRecordDropZone:hover {
          transform: translateY(-1px);
          border-color: rgba(47,138,104,.58);
          box-shadow: inset 4px 4px 10px rgba(161,180,201,.20), inset -4px -4px 10px rgba(255,255,255,.80), 8px 8px 18px rgba(161,180,201,.20), -7px -7px 17px rgba(255,255,255,.84);
        }
        .classRecordDropZone.dragActive {
          transform: scale(1.005);
          border-color: #2f8a68;
          box-shadow: inset 6px 6px 14px rgba(161,180,201,.22), inset -6px -6px 14px rgba(255,255,255,.88), 0 0 0 4px rgba(47,138,104,.08);
        }
        .classRecordDropZone strong { font-size: 16px; color: #173b5f; }
        .classRecordDropZone span { font-size: 13px; color: #71869c; }
        .classRecordDropZone small { font-size: 11px; color: #91a0b1; }
        .classRecordDropIcon { width: 56px; height: 56px; display: grid; place-items: center; border-radius: 18px; background: #e9f1f9; color: #2f8a68; font-size: 28px; font-weight: 900; box-shadow: 8px 8px 15px rgba(161,180,201,.35), -8px -8px 15px rgba(255,255,255,.90); margin-bottom: 2px; }

        .busyOverlay + .deletingToast { z-index: 500; }
        .activityTab:hover { background: inherit; color: inherit; transform: translateY(-1px); box-shadow: 9px 9px 18px rgba(161,180,201,.43), -8px -8px 17px rgba(255,255,255,.94); }
        .activityTab:active { transform: translateY(1px) scale(.99); box-shadow: inset 5px 5px 11px rgba(161,180,201,.37), inset -5px -5px 11px rgba(255,255,255,.92); }

        @media (max-width: 720px) {
          .classRecordDropZone { min-height: 220px; padding: 22px 16px; }
        }

        /* Home tab interaction refinement */
        .homeStatsGrid .statCard:hover {
          transform: none;
          border-color: transparent;
          box-shadow: 10px 10px 24px rgba(161,180,201,.38), -10px -10px 24px rgba(255,255,255,.93);
        }

        .homeStatsGrid .statCard:active {
          transform: none;
          box-shadow: 10px 10px 24px rgba(161,180,201,.38), -10px -10px 24px rgba(255,255,255,.93);
        }

        .latestLearnerOverview tbody tr:hover td {
          background: inherit;
        }

        .latestLearnerOverviewTable {
          border-radius: 0;
          box-shadow: none;
        }

        .latestLearnerOverviewTable table {
          border-radius: 0;
        }

        .latestLearnerOverviewTable thead th {
          border-radius: 0;
        }

        /* Final dark-mode control/interaction corrections */
        html[data-crl-theme="dark"] .navButton {
          background: #1b2530;
          color: #aebfd0;
          box-shadow: 7px 7px 15px rgba(4,8,14,.45), -6px -6px 14px rgba(39,53,68,.38);
        }

        html[data-crl-theme="dark"] .navButton:hover {
          background: #1e2a36;
          color: #c6ddf2;
          transform: translateY(-1px);
          box-shadow: 9px 9px 18px rgba(4,8,14,.48), -7px -7px 16px rgba(39,53,68,.40);
        }

        html[data-crl-theme="dark"] .navButton:active,
        html[data-crl-theme="dark"] .navButton.active,
        html[data-crl-theme="dark"] .navButton.active:hover,
        html[data-crl-theme="dark"] .navButton.active:active {
          background: #202f3d;
          color: #7db7ee;
          transform: none;
          box-shadow: inset 5px 5px 11px rgba(4,8,14,.48), inset -5px -5px 11px rgba(42,58,74,.42);
        }

        html[data-crl-theme="dark"] .navButton.active {
          border-left: 0;
          position: relative;
        }

        html[data-crl-theme="dark"] .navButton.active::before {
          content: "";
          width: 4px;
          height: 22px;
          margin-right: 2px;
          border-radius: 999px;
          background: #4d92d3;
          box-shadow: 0 0 8px rgba(77,146,211,.28);
        }

        html[data-crl-theme="dark"] .sidebarToggle {
          background: #1b2530;
          color: #86b9e9;
          box-shadow: 8px 8px 18px rgba(4,8,14,.50), -7px -7px 15px rgba(41,56,72,.40);
        }

        html[data-crl-theme="dark"] .sidebarToggle:hover {
          background: #1e2a36;
          box-shadow: 10px 10px 21px rgba(4,8,14,.52), -8px -8px 17px rgba(41,56,72,.42);
        }

        html[data-crl-theme="dark"] .sidebarToggle:active {
          background: #18222c;
          box-shadow: inset 5px 5px 12px rgba(4,8,14,.50), inset -5px -5px 12px rgba(42,58,74,.40);
        }

        html[data-crl-theme="dark"] .sidebarLogout {
          background: #301d24;
          color: #ff6575;
          border: 1px solid #5a2b35;
          box-shadow: 7px 7px 15px rgba(4,8,14,.45), -6px -6px 14px rgba(63,43,50,.28);
        }

        html[data-crl-theme="dark"] .sidebarLogout:hover {
          background: #3a2028;
          color: #ff7b88;
          box-shadow: 9px 9px 18px rgba(4,8,14,.48), -7px -7px 16px rgba(72,47,55,.30);
        }

        html[data-crl-theme="dark"] .themeToggle {
          margin-top: 24px;
          background: #202b36;
          color: #a9c9e7;
          box-shadow: 7px 7px 15px rgba(4,8,14,.45), -6px -6px 14px rgba(40,54,69,.38);
        }

        html[data-crl-theme="dark"] .themeToggle:hover {
          background: #24313d;
          color: #c3dcf2;
          box-shadow: 9px 9px 18px rgba(4,8,14,.48), -7px -7px 16px rgba(40,54,69,.40);
        }

        html[data-crl-theme="dark"] .toolbarButton.primaryBlueButton {
          background: #2f73c9;
          color: #ffffff;
          box-shadow: 8px 8px 18px rgba(4,8,14,.52), -6px -6px 14px rgba(56,78,101,.34);
        }

        html[data-crl-theme="dark"] .toolbarButton.primaryBlueButton:hover {
          background: #347bd5;
          box-shadow: 10px 10px 21px rgba(4,8,14,.55), -7px -7px 16px rgba(56,78,101,.36);
        }

        html[data-crl-theme="dark"] .toolbarButton.importGreenButton {
          background: #2f8a68;
          color: #ffffff;
          box-shadow: 8px 8px 18px rgba(4,8,14,.52), -6px -6px 14px rgba(54,83,73,.32);
        }

        html[data-crl-theme="dark"] .toolbarButton.importGreenButton:hover {
          background: #369673;
          box-shadow: 10px 10px 21px rgba(4,8,14,.55), -7px -7px 16px rgba(54,83,73,.35);
        }

        html[data-crl-theme="dark"] .toolbarButton,
        html[data-crl-theme="dark"] .smallButton,
        html[data-crl-theme="dark"] .recordViewTab,
        html[data-crl-theme="dark"] .periodTab,
        html[data-crl-theme="dark"] .secondaryButton,
        html[data-crl-theme="dark"] .closeButton,
        html[data-crl-theme="dark"] .addRowButton,
        html[data-crl-theme="dark"] .iconDangerButton,
        html[data-crl-theme="dark"] .activityTab {
          background: #1b2530;
          color: #bcd7f3;
          box-shadow: 7px 7px 15px rgba(4,8,14,.45), -6px -6px 14px rgba(39,53,68,.38);
        }

        html[data-crl-theme="dark"] .toolbarButton:hover,
        html[data-crl-theme="dark"] .smallButton:hover,
        html[data-crl-theme="dark"] .recordViewTab:hover,
        html[data-crl-theme="dark"] .periodTab:hover,
        html[data-crl-theme="dark"] .secondaryButton:hover,
        html[data-crl-theme="dark"] .closeButton:hover,
        html[data-crl-theme="dark"] .addRowButton:hover,
        html[data-crl-theme="dark"] .iconDangerButton:hover,
        html[data-crl-theme="dark"] .activityTab:hover {
          background: #202c38;
          color: #d1e4f5;
          box-shadow: 9px 9px 18px rgba(4,8,14,.48), -7px -7px 16px rgba(39,53,68,.40);
        }

        html[data-crl-theme="dark"] .dangerButton,
        html[data-crl-theme="dark"] .redSmall,
        html[data-crl-theme="dark"] .iconDangerButton {
          color: #ff6878;
        }

        html[data-crl-theme="dark"] .dangerButton {
          background: #352028;
        }

        html[data-crl-theme="dark"] .bulkDeleteConfirmButton {
          background: #b92d3e !important;
          color: #ffffff !important;
          box-shadow: 8px 8px 18px rgba(4,8,14,.52), -6px -6px 14px rgba(95,49,58,.30);
        }

        html[data-crl-theme="dark"] .profileItem,
        html[data-crl-theme="dark"] .analyticsCard,
        html[data-crl-theme="dark"] .welcomeCard,
        html[data-crl-theme="dark"] .actionCard,
        html[data-crl-theme="dark"] .statCard,
        html[data-crl-theme="dark"] .panel,
        html[data-crl-theme="dark"] .tableWrap,
        html[data-crl-theme="dark"] .summaryTableWrap,
        html[data-crl-theme="dark"] .learnerEntryRow {
          border-color: #2b3a49;
        }

        html[data-crl-theme="dark"] .toolbar {
          background: #1b2530;
          border-color: #2b3a49;
          box-shadow: 8px 8px 18px rgba(4,8,14,.40), -7px -7px 16px rgba(39,53,68,.34);
        }

        html[data-crl-theme="dark"] .searchInput::placeholder,
        html[data-crl-theme="dark"] .formInput::placeholder,
        html[data-crl-theme="dark"] .formTextarea::placeholder {
          color: #72869b;
        }

        html[data-crl-theme="dark"] .emptyState h3 {
          color: #dce8f2;
        }

        html[data-crl-theme="dark"] .emptyState p {
          color: #879cb0;
        }

        html[data-crl-theme="dark"] .themeToggle:focus-visible,
        html[data-crl-theme="dark"] .navButton:focus-visible,
        html[data-crl-theme="dark"] .sidebarToggle:focus-visible {
          outline: 2px solid rgba(111,173,231,.55);
          outline-offset: 3px;
        }

        .themeToggle {
          margin-top: 24px;
        }

        /* Consistent dashboard title hierarchy */
        .pageIntro .pageTitle,
        .pageTitle {
          font-size: 32px !important;
          line-height: 1.18 !important;
          font-weight: 900 !important;
          letter-spacing: -0.7px !important;
        }

        .panelHeaderTitle {
          font-size: 21px !important;
          line-height: 1.25 !important;
          font-weight: 900 !important;
        }

        .welcomeCard h2 {
          font-size: 22px !important;
          line-height: 1.25 !important;
        }

        .analyticsMainPanel .panelHeaderTitle,
        .manageAssessmentPanel .panelHeaderTitle,
        .profileMainPanel .panelHeaderTitle,
        .recordsMainPanel .panelHeaderTitle {
          font-size: 21px !important;
        }

        .analyticsMainPanel .analyticsCard h3 {
          font-size: 15px !important;
        }

        .analyticsMainPanel .analyticsValue {
          font-size: 30px !important;
        }

        .recordTemplateMeta strong {
          font-size: 17px !important;
        }

        .profileMainPanel .profileValue {
          font-size: 17px !important;
        }
      `}</style>

      <main className="teacherShell">
        <aside className={`sidebar ${sidebarOpen ? "open" : "collapsed"}`}>
          <div className="brandBlock">
            <div className="brandLogo">
              CRL
            </div>

            <div className="brandText">
              <div className="brandTitle">
                CRL-App
              </div>

              <div className="brandSubtitle">
                Literacy Assessment
              </div>
            </div>

            <button
              type="button"
              className={
                "themeSwitchButton brandThemeSwitch " +
                (darkMode ? "isDark" : "isLight")
              }
              onClick={toggleDarkMode}
              aria-pressed={darkMode}
              aria-label={
                darkMode
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              title={
                darkMode
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              <span className="themeSwitchTrack">
                <span className="themeSwitchThumb">
                  {darkMode ? "☾" : "☀"}
                </span>
              </span>
            </button>
          </div>

          <button
            type="button"
            className="sidebarToggle"
            aria-label={
              sidebarOpen
                ? "Collapse navigation"
                : "Expand navigation"
            }
            title={
              sidebarOpen
                ? "Collapse menu"
                : "Expand menu"
            }
            onClick={() =>
              setSidebarOpen((open) => !open)
            }
          >
            <span className="sidebarToggleGlyph">
              {sidebarOpen ? "‹" : "›"}
            </span>
          </button>

          <div className="sidebarLabel">
            Main Menu
          </div>

          <nav className="nav">
            {TABS.map(
              (tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`navButton ${
                    activeTab ===
                    tab.id
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    selectTab(
                      tab.id
                    )
                  }
                >
                  <Icon>
                    {tab.icon}
                  </Icon>

                  <span className="navLabel">
                    {tab.label}
                  </span>
                </button>
              )
            )}
          </nav>

          <div className="sidebarSpacer" />

          <button
            type="button"
            className="sidebarLogout"
            onClick={() =>
              setLogoutOpen(
                true
              )
            }
          >
            Logout
          </button>
        </aside>

        <section className="main">
          <header className="topbar">
            <div>
              <div className="topTitle">
                CRL-App
              </div>

              <div className="topAccent">
                <div className="topAccentBlue" />
                <div className="topAccentRed" />
              </div>
            </div>
          </header>

          <div className="content">
            <div
              className={`contentStage ${
                transitioning
                  ? "transitioning"
                  : ""
              }`}
            >
              {activeTab ===
                "dashboard" && (
                <>
                  <div className="welcomeCard">
                    <h2>
                      Welcome to CRL-App
                    </h2>

                    <p>
                      Use this dashboard to
                      conduct Comprehensive
                      Rapid Literacy
                      Assessments, manage your
                      learners, and review
                      assessment results.
                    </p>
                  </div>

                  <div className="statsGrid homeStatsGrid">
                    <div className="statCard">
                      <div className="statNumber blue">
                        {stats.total}
                      </div>
                      <div className="statLabel">
                        Total Learners
                      </div>
                    </div>

                    <div className="statCard">
                      <div className="statNumber green">
                        {stats.bosy}
                      </div>
                      <div className="statLabel">
                        BoSY Completed
                      </div>
                    </div>

                    <div className="statCard">
                      <div className="statNumber orange">
                        {stats.mosy}
                      </div>
                      <div className="statLabel">
                        MoSY Completed
                      </div>
                    </div>

                    <div className="statCard">
                      <div className="statNumber blue">
                        {stats.eosy}
                      </div>
                      <div className="statLabel">
                        EoSY Completed
                      </div>
                    </div>

                    <div className="statCard">
                      <div className="statNumber green">
                        {stats.gradeReady}
                      </div>
                      <div className="statLabel">
                        Grade Ready
                      </div>
                    </div>

                    <div className="statCard">
                      <div className="statNumber red">
                        {stats.intervention}
                      </div>
                      <div className="statLabel">
                        Needs Intervention
                      </div>
                    </div>
                  </div>

                  <div className="actionGrid">
                    <div className="actionCard">
                      <div>
                        <h3>
                          Conduct Assessment
                        </h3>

                        <p>
                          Select a learner in
                          the Conduct Assessment
                          tab and begin a
                          teacher-led CRLA
                          assessment.
                        </p>
                      </div>

                      <button
                        type="button"
                        className="actionButton"
                        onClick={() =>
                          selectTab(
                            "conduct"
                          )
                        }
                      >
                        Open Learners
                      </button>
                    </div>

                    <div className="actionCard">
                      <div>
                        <h3>
                          Learner Interface
                        </h3>

                        <p>
                          Open the learner-facing
                          interface on another
                          tablet or device.
                        </p>
                      </div>

                      <button
                        type="button"
                        className="actionButton redButton"
                        onClick={() =>
                          window.open(
                            "/learner",
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                      >
                        Open Learner Page
                      </button>
                    </div>
                  </div>

                  <div className="panel latestLearnerOverview">
                    <div className="panelHeader">
                      <div>
                        <div className="panelHeaderTitle">
                          Latest Learner Overview
                        </div>

                        <div className="panelHeaderSub">
                          Current learner status
                          based on completed
                          assessment records
                        </div>
                      </div>

                      {loadingData && (
                        <span className="panelHeaderSub">
                          Refreshing...
                        </span>
                      )}
                    </div>

                    <div className="tableWrap latestLearnerOverviewTable">
                      <table>
                        <thead>
                          <tr>
                            <th>
                              LRN
                            </th>
                            <th>
                              Name
                            </th>
                            <th>
                              Sex
                            </th>
                            <th>
                              BoSY
                            </th>
                            <th>
                              MoSY
                            </th>
                            <th>
                              EoSY
                            </th>
                            <th>
                              Latest Profile
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {dashboardRows.length ===
                          0 ? (
                            <tr>
                              <td
                                colSpan={
                                  7
                                }
                              >
                                <div className="emptyState">
                                  <div className="emptyIcon">
                                    +
                                  </div>

                                  <h3>
                                    No learners
                                    registered
                                  </h3>

                                  <p>
                                    Add a learner
                                    from the Conduct
                                    Assessment tab
                                    to begin your
                                    class roster.
                                  </p>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            dashboardRows.map(
                              ({
                                learner,
                                hasBosy,
                                hasMosy,
                                hasEosy,
                                profile,
                              }) => (
                                <tr
                                  key={
                                    learner.id
                                  }
                                >
                                  <td>
                                    {
                                      learner.lrn
                                    }
                                  </td>

                                  <td className="nameStrong">
                                    {formatName(
                                      learner
                                    )}
                                  </td>

                                  <td>
                                    {
                                      learner.sex
                                    }
                                  </td>

                                  <td>
                                    {hasBosy
                                      ? "✓"
                                      : "—"}
                                  </td>

                                  <td>
                                    {hasMosy
                                      ? "✓"
                                      : "—"}
                                  </td>

                                  <td>
                                    {hasEosy
                                      ? "✓"
                                      : "—"}
                                  </td>

                                  <td>
                                    <span
                                      className={`badge ${profileClass(
                                        profile
                                      )}`}
                                    >
                                      {
                                        profile
                                      }
                                    </span>
                                  </td>
                                </tr>
                              )
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {activeTab ===
                "conduct" && (
                <>
                  <div
                    className={
                      "panel conductLearnerPanel" +
                      (filteredLearners.length === 0
                        ? " conductLearnerPanelEmpty"
                        : "")
                    }
                  >
                    <div className="panelHeader">
                      <div>
                        <div className="panelHeaderTitle">
                          Enrolled Learners
                        </div>

                        <div className="panelHeaderSub">
                          Search, filter, manage,
                          and assess registered
                          learners.
                        </div>
                      </div>
                    </div>

                    <div className="toolbar">
                      <input
                        className="searchInput"
                        value={search}
                        onChange={(
                          event
                        ) =>
                          setSearch(
                            event
                              .target
                              .value
                          )
                        }
                        placeholder="Search learner name or LRN..."
                      />

                      <select
                        className="selectInput"
                        value={
                          sexFilter
                        }
                        onChange={(
                          event
                        ) =>
                          setSexFilter(
                            event
                              .target
                              .value
                          )
                        }
                      >
                        <option value="">
                          All Sex
                        </option>
                        <option value="Male">
                          Male
                        </option>
                        <option value="Female">
                          Female
                        </option>
                      </select>

                      <select
                        className="selectInput"
                        value={
                          statusFilter
                        }
                        onChange={(
                          event
                        ) =>
                          setStatusFilter(
                            event
                              .target
                              .value
                          )
                        }
                      >
                        <option value="">
                          All Status
                        </option>
                        <option value="none">
                          No Assessment
                        </option>
                        <option value="bosy">
                          BoSY Done
                        </option>
                        <option value="mosy">
                          MoSY Done
                        </option>
                        <option value="both">
                          BoSY &amp; MoSY
                        </option>
                        <option value="eosy">
                          EoSY Done
                        </option>
                      </select>

                      <select
                        className="selectInput"
                        value={
                          sortMode
                        }
                        onChange={(
                          event
                        ) =>
                          setSortMode(
                            event
                              .target
                              .value
                          )
                        }
                      >
                        <option value="name_asc">
                          Name (A-Z)
                        </option>
                        <option value="name_desc">
                          Name (Z-A)
                        </option>
                        <option value="lrn">
                          LRN
                        </option>
                      </select>

                      <ClassRecordImport
                        onImported={async () => {
                          await loadData(true);
                          showToast(
                            "Class record import completed."
                          );
                        }}
                      />

                      <button
                        type="button"
                        className="toolbarButton primaryBlueButton"
                        onClick={() => {
                          resetLearnerRows();
                          setAddLearnerOpen(true);
                        }}
                      >
                        + Add Learner
                      </button>

                      <button
                        type="button"
                        className="toolbarButton softButton"
                        onClick={selectAllFilteredLearners}
                        disabled={!filteredLearners.length}
                      >
                        Select All
                      </button>

                      <button
                        type="button"
                        className="toolbarButton softButton"
                        onClick={clearLearnerSelection}
                        disabled={!selectedLearnerIds.length}
                      >
                        Deselect All
                      </button>

                      {selectedLearnerIds.length > 0 && (
                        <button
                          type="button"
                          className="toolbarButton dangerButton"
                          onClick={bulkDeleteLearners}
                        >
                          Delete Selected ({selectedLearnerIds.length})
                        </button>
                      )}
                    </div>

                    {filteredLearners.length ===
                    0 ? (
                      <div className="emptyState learnerEmptyState">
                        <div className="emptyIcon">
                          +
                        </div>

                        <h3>
                          No learners found
                        </h3>

                        <p>
                          Add a learner to
                          begin your class
                          roster.
                        </p>

                        <button
                          type="button"
                          className="toolbarButton"
                          onClick={() =>
                            setAddLearnerOpen(
                              true
                            )
                          }
                        >
                          Add New Learner
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding:
                            16,
                        }}
                      >
                        <div className="tableWrap">
                          <table>
                            <thead>
                              <tr>
                                <th className="selectionHeader">
                                  <span className="srOnly">Select</span>
                                </th>
                                <th>
                                  LRN
                                </th>

                                <th>
                                  Name
                                </th>

                                <th>
                                  Sex
                                </th>

                                <th>
                                  Status
                                </th>

                                <th>
                                  Assessment
                                </th>

                                <th>
                                  Actions
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {filteredLearners.map(
                                (
                                  learner
                                ) => {
                                  const status =
                                    statusForLearner(
                                      learner.id,
                                      assessments
                                    );

                                  const rows =
                                    assessments.filter(
                                      (
                                        item
                                      ) =>
                                        Number(
                                          item.learner_id
                                        ) ===
                                        Number(
                                          learner.id
                                        )
                                    );

                                  const bosyDone =
                                    rows.some(
                                      (
                                        item
                                      ) =>
                                        item
                                          .assessment_period ===
                                          "BoSY" &&
                                        item.is_completed
                                    );

                                  const mosyDone =
                                    rows.some(
                                      (
                                        item
                                      ) =>
                                        item
                                          .assessment_period ===
                                          "MoSY" &&
                                        item.is_completed
                                    );

                                  const eosyDone =
                                    rows.some(
                                      (
                                        item
                                      ) =>
                                        item
                                          .assessment_period ===
                                          "EoSY" &&
                                        item.is_completed
                                    );

                                  return (
                                    <tr
                                      key={
                                        learner.id
                                      }
                                      className={
                                        selectedLearnerIds.includes(Number(learner.id))
                                          ? "selectedRow"
                                          : ""
                                      }
                                    >
                                      <td className="selectionCell">
                                        <input
                                          type="checkbox"
                                          className="learnerCheckbox"
                                          checked={selectedLearnerIds.includes(
                                            Number(learner.id)
                                          )}
                                          onChange={() =>
                                            toggleLearnerSelection(learner.id)
                                          }
                                          aria-label={`Select ${formatName(learner)}`}
                                        />
                                      </td>
                                      <td>
                                        {
                                          learner.lrn
                                        }
                                      </td>

                                      <td className="nameStrong">
                                        {formatName(
                                          learner
                                        )}
                                      </td>

                                      <td>
                                        {
                                          learner.sex
                                        }
                                      </td>

                                      <td>
                                        <span
                                          className={`badge ${profileClass(
                                            status.label
                                          )}`}
                                        >
                                          {
                                            status.label
                                          }
                                        </span>
                                      </td>

                                      <td>
                                        <div className="inlineActions">
                                          <button
                                            type="button"
                                            className="smallButton primary"
                                            disabled={
                                              bosyDone
                                            }
                                            onClick={() =>
                                              startAssessment(
                                                learner.id,
                                                "BoSY"
                                              )
                                            }
                                          >
                                            BoSY
                                          </button>

                                          <button
                                            type="button"
                                            className="smallButton"
                                            disabled={
                                              !bosyDone ||
                                              mosyDone
                                            }
                                            onClick={() =>
                                              startAssessment(
                                                learner.id,
                                                "MoSY"
                                              )
                                            }
                                          >
                                            MoSY
                                          </button>

                                          <button
                                            type="button"
                                            className="smallButton"
                                            disabled={
                                              !(
                                                bosyDone ||
                                                mosyDone
                                              ) ||
                                              eosyDone
                                            }
                                            onClick={() =>
                                              startAssessment(
                                                learner.id,
                                                "EoSY"
                                              )
                                            }
                                          >
                                            EoSY
                                          </button>
                                        </div>
                                      </td>

                                      <td>
                                        <div className="inlineActions">
                                          <button
                                            type="button"
                                            className="smallButton"
                                            onClick={() =>
                                              setDetailsTarget(
                                                learner
                                              )
                                            }
                                          >
                                            View
                                          </button>

                                          <button
                                            type="button"
                                            className="smallButton redSmall"
                                            onClick={() =>
                                              setDeleteTarget({
                                                ...learner,
                                                id:
                                                  learner.id ??
                                                  learner.learner_id ??
                                                  learner.learnerId ??
                                                  null,
                                                lrn:
                                                  learner.lrn ??
                                                  learner.LRN ??
                                                  "",
                                              })
                                            }
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                }
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab ===
                "records" && (
                <>
                  <div className="panel recordsMainPanel">
                    <div className="panelHeader">
                      <div>
                        <div className="panelHeaderTitle">
                          Assessment Records
                        </div>

                        <div className="panelHeaderSub">
                          Detailed learner scores,
                          reading levels, and class summary.
                        </div>
                      </div>

                      <div className="recordsHeaderActions">
                        <div className="recordViewTabs">
                          <button
                            type="button"
                            className={`recordViewTab ${
                              recordsView ===
                              "scoresheet"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setRecordsView(
                                "scoresheet"
                              )
                            }
                          >
                            Scoresheet
                          </button>

                          <button
                            type="button"
                            className={`recordViewTab ${
                              recordsView ===
                              "summary"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setRecordsView(
                                "summary"
                              )
                            }
                          >
                            Class Summary
                          </button>

                          <button
                            type="button"
                            className={`recordViewTab ${
                              recordsView ===
                              "class-record"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setRecordsView(
                                "class-record"
                              )
                            }
                          >
                            Class Record
                          </button>
                        </div>

                        <div className="periodTabs">
                          {PERIODS.map(
                            (
                              period
                            ) => (
                              <button
                                key={
                                  period
                                }
                                type="button"
                                className={`periodTab ${
                                  currentPeriod ===
                                  period
                                    ? "active"
                                    : ""
                                }`}
                                onClick={() =>
                                  setCurrentPeriod(
                                    period
                                  )
                                }
                              >
                                {
                                  period
                                }
                              </button>
                            )
                          )}
                        </div>

                        <button
                          type="button"
                          className="toolbarButton exportButton exportGreenButton"
                          disabled={
                            exportingExcel
                          }
                          onClick={() =>
                            exportAssessmentRecord(
                              currentPeriod
                            )
                          }
                        >
                          {exportingExcel ? (
                            <>
                              <span className="buttonSpinner" />
                              Generating...
                            </>
                          ) : (
                            "Export Excel"
                          )}
                        </button>
                      </div>
                    </div>

                    {recordsView ===
                    "summary" ? (
                      <div className="recordSummary">
                        <div className="summaryTableWrap">
                          <table className="summaryTable templateSummaryTable">
                            <thead>
                              <tr>
                                <th rowSpan={2}>Grade</th>
                                <th rowSpan={2}>Section</th>
                                <th rowSpan={2}>Teacher</th>
                                <th rowSpan={2}>Language</th>
                                <th rowSpan={2}>Sex</th>
                                <th rowSpan={2}>Number of Learners Enrolled</th>
                                <th rowSpan={2}>Number of Learners Assessed</th>
                                <th colSpan={4}>Assessment Part 1 Reading Level</th>
                                <th colSpan={3}>Average Score</th>
                                <th colSpan={5}>READING PROFILE</th>
                              </tr>
                              <tr>
                                <th>Full Refresher</th>
                                <th>Moderate Refresher</th>
                                <th>Light Refresher</th>
                                <th>Grade Ready</th>
                                <th>Reading Fluency</th>
                                <th>Reading Comprehension</th>
                                <th>Average Word Per Minute</th>
                                <th>Low Emerging Reader</th>
                                <th>High Emerging Reader</th>
                                <th>Developing Reader</th>
                                <th>Transitioning Reader</th>
                                <th>Reading At Grade Level</th>
                              </tr>
                            </thead>
                            <tbody>
                              {["Male", "Female", "Total"].map((group) => {
                                const groupRows = recordSummaryFor(currentRecords, group);
                                const totalEnrolled =
                                  group === "Total"
                                    ? learners.length
                                    : learners.filter(
                                        (item) =>
                                          String(item.sex || "").toLowerCase() ===
                                          group.toLowerCase()
                                      ).length;
                                const assessed = groupRows.length;
                                const part1 = [
                                  "Full Refresher",
                                  "Moderate Refresher",
                                  "Light Refresher",
                                  "Grade Ready",
                                ].map((label) => {
                                  const count = countPart1(groupRows, label);
                                  return assessed
                                    ? Math.round((count / assessed) * 100) + "%"
                                    : "0%";
                                });
                                const avgFluency = assessed
                                  ? (
                                      groupRows.reduce(
                                        (sum, row) =>
                                          sum +
                                          (Number(
                                            row.assessment.miscue_accuracy
                                          ) || 0),
                                        0
                                      ) / assessed
                                    ).toFixed(2) + "%"
                                  : "0%";
                                const avgComp = assessed
                                  ? (
                                      groupRows.reduce(
                                        (sum, row) =>
                                          sum +
                                          (Number(
                                            row.assessment.comprehension_score
                                          ) || 0),
                                        0
                                      ) / assessed
                                    ).toFixed(2)
                                  : "0";
                                const avgWpm = assessed
                                  ? (
                                      groupRows.reduce((sum, row) => {
                                        const seconds = Number(
                                          row.assessment.timer_seconds || 0
                                        );
                                        const words = Math.max(
                                          0,
                                          100 -
                                            Number(
                                              row.assessment.total_miscues || 0
                                            )
                                        );
                                        const wpm =
                                          row.assessment.wpm ??
                                          (seconds > 0 ? (words / seconds) * 60 : 0);
                                        return sum + (Number(wpm) || 0);
                                      }, 0) / assessed
                                    ).toFixed(2)
                                  : "0";
                                const profileLabels = [
                                  "Low Emerging Reader",
                                  "High Emerging Reader",
                                  "Developing Reader",
                                  "Transitioning Reader",
                                  "Reading at Grade Level",
                                ];
                                const profiles = profileLabels.map((label) => {
                                  const count = groupRows.filter(
                                    (row) => row.profile === label
                                  ).length;
                                  return assessed
                                    ? Math.round((count / assessed) * 100) + "%"
                                    : "0%";
                                });

                                return (
                                  <tr key={group}>
                                    <td>Grade 3</td>
                                    <td>{user?.section || "—"}</td>
                                    <td>{user?.full_name || "—"}</td>
                                    <td>English</td>
                                    <td>{group}</td>
                                    <td>{totalEnrolled}</td>
                                    <td>{assessed}</td>
                                    {part1.map((value) => <td key={value + group}>{value}</td>)}
                                    <td>{avgFluency}</td>
                                    <td>{avgComp}</td>
                                    <td>{avgWpm}</td>
                                    {profiles.map((value, index) => (
                                      <td key={profileLabels[index] + group}>{value}</td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="recordCharts">
                          <div className="chartCardSimple">
                            <div className="chartTitleSimple">
                              % of Learners Assessed
                            </div>

                            <div className="miniChart">
                              {[
                                [
                                  "Male",
                                  recordSummaryFor(
                                    currentRecords,
                                    "Male"
                                  ).length,
                                ],
                                [
                                  "Female",
                                  recordSummaryFor(
                                    currentRecords,
                                    "Female"
                                  ).length,
                                ],
                              ].map(
                                (item) => {
                                  const total =
                                    recordSummaryFor(
                                      currentRecords,
                                      "Total"
                                    ).length;

                                  const percentage =
                                    total
                                      ? Math.round(
                                          (item[1] /
                                            total) *
                                            100
                                        )
                                      : 0;

                                  return (
                                    <div
                                      className="barRow"
                                      key={
                                        item[0]
                                      }
                                    >
                                      <div className="barTop">
                                        <span>
                                          {
                                            item[0]
                                          }
                                        </span>
                                        <span>
                                          {
                                            percentage
                                          }%
                                        </span>
                                      </div>

                                      <div className="barTrack">
                                        <div
                                          className="barFill"
                                          style={{
                                            width: `${percentage}%`,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          </div>

                          {[
                            {
                              title:
                                "% of G3 Learners Assessed in English by Assessment Part 1 Reading Level",
                              values: [
                                "Full Refresher",
                                "Moderate Refresher",
                                "Light Refresher",
                                "Grade Ready",
                              ],
                              getCount:
                                (
                                  rows,
                                  label
                                ) =>
                                  countPart1(
                                    rows,
                                    label
                                  ),
                            },
                            {
                              title:
                                "% of G3 Learners Assessed in English by Assessment Part 2 Reading Level",
                              values: [
                                "Low Emerging Reader",
                                "High Emerging Reader",
                                "Developing Reader",
                                "Transitioning Reader",
                                "Reading at Grade Level",
                              ],
                              getCount:
                                (
                                  rows,
                                  label
                                ) =>
                                  rows.filter(
                                    (row) =>
                                      row.profile ===
                                      label
                                  ).length,
                            },
                          ].map(
                            (chart) => (
                              <div
                                className="chartCardSimple"
                                key={
                                  chart.title
                                }
                              >
                                <div className="chartTitleSimple">
                                  {
                                    chart.title
                                  }
                                </div>

                                <div className="miniChart">
                                  {chart.values.map(
                                    (
                                      label
                                    ) => {
                                      const rows =
                                        recordSummaryFor(
                                          currentRecords,
                                          "Total"
                                        );

                                      const count =
                                        chart.getCount(
                                          rows,
                                          label
                                        );

                                      const percentage =
                                        rows.length
                                          ? Math.round(
                                              (count /
                                                rows.length) *
                                                100
                                            )
                                          : 0;

                                      return (
                                        <div
                                          className="barRow"
                                          key={
                                            label
                                          }
                                        >
                                          <div className="barTop">
                                            <span>
                                              {
                                                label
                                              }
                                            </span>
                                            <span>
                                              {
                                                percentage
                                              }%
                                            </span>
                                          </div>

                                          <div className="barTrack">
                                            <div
                                              className="barFill"
                                              style={{
                                                width: `${percentage}%`,
                                              }}
                                            />
                                          </div>
                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    ) : recordsView ===
                    "class-record" ? (
                      <div className="recordTemplateView">
                        <div className="recordTemplateMeta">
                          <div>
                            <strong>GRADE 3 Reading Assessment CLASS RECORD</strong>
                            <span>English assessment results for the current period</span>
                          </div>
                          <div className="recordTemplateTeacher">
                            <span>Teacher</span>
                            <strong>{user?.full_name || "—"}</strong>
                            <span>Section</span>
                            <strong>{user?.section || "—"}</strong>
                          </div>
                        </div>
                        <div className="recordTemplateScroller">
                          <table className="recordTemplateTable classRecordTable">
                            <thead>
                              <tr>
                                <th rowSpan={2}>S/N</th>
                                <th rowSpan={2}>LRN</th>
                                <th rowSpan={2}>Name of Learner</th>
                                <th rowSpan={2}>Sex</th>
                                <th colSpan={6}>FILIPINO</th>
                                <th colSpan={6}>ENGLISH</th>
                                <th rowSpan={2}>Remarks</th>
                                <th rowSpan={2}> </th>
                              </tr>
                              <tr>
                                <th>Assessment Part 1 Reading Level</th>
                                <th>% of Total Score</th>
                                <th>Reading Fluency</th>
                                <th>Reading Comprehension</th>
                                <th>Average Word Per Minute</th>
                                <th>Reading Profile</th>
                                <th>Assessment Part 1 Reading Level</th>
                                <th>% of Total Score</th>
                                <th>Reading Fluency</th>
                                <th>Reading Comprehension</th>
                                <th>Average Word Per Minute</th>
                                <th>Reading Profile</th>
                              </tr>
                            </thead>
                            <tbody>
                              {currentRecords.length === 0 ? (
                                <tr>
                                  <td colSpan={18}>
                                    <div className="emptyState">
                                      <div className="emptyIcon">▤</div>
                                      <h3>No records for {currentPeriod}</h3>
                                      <p>Completed assessments will appear here after they are saved to the database.</p>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                currentRecords.map(({ assessment, learner }, index) => {
                                  const total =
                                    Number(assessment.task1_score || 0) +
                                    Number(assessment.task2_score || 0);
                                  const profile =
                                    assessment.overall_classification ||
                                    assessment.classification_label ||
                                    calculateFallbackProfile(
                                      assessment.miscue_accuracy,
                                      assessment.comprehension_score
                                    );
                                  const readingPct =
                                    assessment.miscue_accuracy === null ||
                                    assessment.miscue_accuracy === undefined
                                      ? "—"
                                      : assessment.miscue_accuracy + "%";
                                  const wordsRead =
                                    assessment.words_read ??
                                    Math.max(
                                      0,
                                      100 - Number(assessment.total_miscues || 0)
                                    );
                                  const seconds = Number(assessment.timer_seconds ?? 0);
                                  const wpm =
                                    assessment.wpm ??
                                    (seconds > 0
                                      ? ((Number(wordsRead) / seconds) * 60).toFixed(2)
                                      : "—");

                                  return (
                                    <tr key={assessment.id}>
                                      <td>{index + 1}</td>
                                      <td>{learner.lrn}</td>
                                      <td className="nameStrong">{formatName(learner)}</td>
                                      <td>{learner.sex}</td>
                                      <td>—</td>
                                      <td>—</td>
                                      <td>—</td>
                                      <td>—</td>
                                      <td>—</td>
                                      <td>—</td>
                                      <td>{total <= 0 ? "Full Refresher" : total <= 10 ? "Moderate Refresher" : total <= 16 ? "Light Refresher" : "Grade Ready"}</td>
                                      <td>{total ? ((total / 20) * 100).toFixed(2) + "%" : "0%"}</td>
                                      <td>{readingPct}</td>
                                      <td>{assessment.comprehension_score ?? 0}</td>
                                      <td>{wpm}</td>
                                      <td>
                                        <span className={"badge " + profileClass(profile)}>
                                          {profile}
                                        </span>
                                      </td>
                                      <td>{assessment.remarks || profile}</td>
                                      <td> </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="tableWrap">
                        <table>
                          <thead>
                            <tr>
                              <th>
                                S/N
                              </th>
                              <th>
                                LRN
                              </th>
                              <th>
                                Name of Learner
                              </th>
                              <th>
                                Sex
                              </th>
                              <th>
                                Date
                              </th>
                              <th>
                                Task 1
                              </th>
                              <th>
                                Task 2
                              </th>
                              <th>
                                Total Score
                              </th>
                              <th>
                                Part 1 Reading Level
                              </th>
                              <th>
                                Story #
                              </th>
                              <th>
                                Miscues
                              </th>
                              <th>
                                Words Read
                              </th>
                              <th>
                                Time
                              </th>
                              <th>
                                WPM
                              </th>
                              <th>
                                Read %
                              </th>
                              <th>
                                Comprehension
                              </th>
                              <th>
                                Experience
                              </th>
                              <th>
                                Observation Level
                              </th>
                              <th>
                                Reading Profile
                              </th>
                              <th>
                                Remarks
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {currentRecords.length ===
                            0 ? (
                              <tr>
                                <td
                                  colSpan={
                                    21
                                  }
                                >
                                  <div className="emptyState">
                                    <div className="emptyIcon">
                                      ▤
                                    </div>

                                    <h3>
                                      No records for{" "}
                                      {
                                        currentPeriod
                                      }
                                    </h3>

                                    <p>
                                      Completed
                                      assessments
                                      will appear
                                      here after
                                      they are saved
                                      to the database.
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              currentRecords.map(
                                ({
                                  assessment,
                                  learner,
                                }) => {
                                  const total =
                                    Number(
                                      assessment.task1_score ||
                                        0
                                    ) +
                                    Number(
                                      assessment.task2_score ||
                                        0
                                    );

                                  const profile =
                                    assessment.overall_classification ||
                                    assessment.classification_label ||
                                    calculateFallbackProfile(
                                      assessment.miscue_accuracy,
                                      assessment.comprehension_score
                                    );

                                  const miscues =
                                    Number(
                                      assessment.total_miscues ??
                                        0
                                    );

                                  const wordsRead =
                                    Number(
                                      assessment.words_read ??
                                        0
                                    );

                                  const seconds =
                                    Number(
                                      assessment.timer_seconds ??
                                        0
                                    );

                                  const time =
                                    seconds
                                      ? `${Math.floor(
                                          seconds / 60
                                        )}m ${String(
                                          seconds % 60
                                        ).padStart(
                                          2,
                                          "0"
                                        )}s`
                                      : "—";

                                  return (
                                    <tr
                                      key={
                                        assessment.id
                                      }
                                    >
                                      <td>
                                        {currentRecords.findIndex(
                                          (item) =>
                                            item.assessment.id ===
                                            assessment.id
                                        ) + 1}
                                      </td>


                                      <td>
                                        {
                                          learner.lrn
                                        }
                                      </td>

                                      <td className="nameStrong">
                                        {formatName(
                                          learner
                                        )}
                                      </td>

                                      <td>
                                        {
                                          learner.sex
                                        }
                                      </td>

                                      <td>
                                        {assessment.date_administered
                                          ? new Date(
                                              assessment.date_administered
                                            ).toLocaleDateString()
                                          : "—"}
                                      </td>

                                      <td>
                                        {
                                          assessment.task1_score
                                        }
                                      </td>

                                      <td>
                                        {
                                          assessment.task2_score
                                        }
                                      </td>

                                      <td>
                                        {
                                          total
                                        }
                                      </td>

                                      <td>
                                        <span
                                          className={`badge ${profileClass(
                                            profile
                                          )}`}
                                        >
                                          {total <=
                                          0
                                            ? "Full Refresher"
                                            : total <=
                                              10
                                            ? "Moderate Refresher"
                                            : total <=
                                              16
                                            ? "Light Refresher"
                                            : "Grade Ready"}
                                        </span>
                                      </td>

                                      <td>
                                        {
                                          assessment.story_number ??
                                          "—"
                                        }
                                      </td>

                                      <td>
                                        {
                                          miscues
                                        }
                                      </td>

                                      <td>
                                        {
                                          wordsRead ||
                                          "—"
                                        }
                                      </td>

                                      <td>
                                        {
                                          time
                                        }
                                      </td>

                                      <td className="templateSpacerCell">—</td>

                                      <td>
                                        {assessment.wpm ??
                                          "—"}
                                      </td>

                                      <td>
                                        {assessment.miscue_accuracy ===
                                        null ||
                                        assessment.miscue_accuracy ===
                                          undefined
                                          ? "—"
                                          : `${assessment.miscue_accuracy}%`}
                                      </td>

                                      <td>
                                        {
                                          assessment.comprehension_score
                                        }
                                      </td>

                                      <td>
                                        {
                                          assessment.experience ||
                                          "—"
                                        }
                                      </td>

                                      <td>
                                        {
                                          assessment.observation_level ||
                                          "—"
                                        }
                                      </td>

                                      <td>
                                        <span
                                          className={`badge ${profileClass(
                                            profile
                                          )}`}
                                        >
                                          {
                                            profile
                                          }
                                        </span>
                                      </td>

                                      <td>
                                        {
                                          assessment.remarks ||
                                          profile
                                        }
                                      </td>
                                    </tr>
                                  );
                                }
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activeTab ===
                "activities" && (
                <>
                  <div className="panel manageAssessmentPanel">
                    <div className="panelHeader">
                      <div>
                        <div className="panelHeaderTitle">
                          Assessment Content
                        </div>

                        <div className="panelHeaderSub">
                          Assessment content is stored securely in the class database.
                        </div>
                      </div>

                      <div className="periodTabs">
                        {PERIODS.map(
                          (
                            period
                          ) => (
                            <button
                              key={
                                period
                              }
                              type="button"
                              className={`periodTab ${
                                activityPeriod ===
                                period
                                  ? "active"
                                  : ""
                              }`}
                              onClick={() =>
                                setActivityPeriod(
                                  period
                                )
                              }
                            >
                              {
                                period
                              }
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    <div className="activityTabs">
                      {[
                        [
                          "letters",
                          "Letters",
                        ],
                        [
                          "words",
                          "Words",
                        ],
                        [
                          "stories",
                          "Stories",
                        ],
                      ].map(
                        ([
                          id,
                          label,
                        ]) => (
                          <button
                            key={
                              id
                            }
                            type="button"
                            className={`activityTab ${
                              activityTab ===
                              id
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setActivityTab(
                                id
                              )
                            }
                          >
                            {
                              label
                            }
                          </button>
                        )
                      )}
                    </div>

                    <div
                      style={{
                        padding:
                          16,
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "center",
                          marginBottom:
                            11,
                          gap: 10,
                        }}
                      >
                        <strong
                          style={{
                            fontSize:
                              11,
                            color:
                              "#29415b",
                          }}
                        >
                          {activityTab ===
                          "letters"
                            ? "Letter Items"
                            : activityTab ===
                              "words"
                            ? "Word Items"
                            : "Stories"}
                        </strong>

                        <button
                          type="button"
                          className="toolbarButton"
                          onClick={() =>
                            editActivity(
                              activityTab,
                              -1
                            )
                          }
                        >
                          + Add Item
                        </button>
                      </div>

                      {activities[
                        activityPeriod
                      ][
                        activityTab
                      ].length === 0 ? (
                        <div className="emptyState">
                          <div className="emptyIcon">
                            +
                          </div>

                          <h3>
                            No content items
                          </h3>

                          <p>
                            Add your first
                            activity item.
                          </p>
                        </div>
                      ) : (
                        <div className="tableWrap">
                          <table>
                            <thead>
                              <tr>
                                <th>
                                  #
                                </th>

                                <th>
                                  Content
                                </th>

                                <th>
                                  Actions
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {activities[
                                activityPeriod
                              ][
                                activityTab
                              ].map(
                                (
                                  item,
                                  index
                                ) => (
                                  <tr
                                    key={
                                      activityTab ===
                                      "stories"
                                        ? item.id
                                        : `${activityTab}-${index}`
                                    }
                                  >
                                    <td>
                                      {index +
                                        1}
                                    </td>

                                    <td className="nameStrong">
                                      {activityTab ===
                                      "stories"
                                        ? item.title
                                        : item}
                                    </td>

                                    <td>
                                      <div className="inlineActions">
                                        <button
                                          type="button"
                                          className="smallButton"
                                          onClick={() =>
                                            editActivity(
                                              activityTab,
                                              index
                                            )
                                          }
                                        >
                                          Edit
                                        </button>

                                        <button
                                          type="button"
                                          className="smallButton redSmall"
                                          onClick={() =>
                                            removeActivity(
                                              activityTab,
                                              index
                                            )
                                          }
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {activeTab ===
                "analytics" && (
                <>
                  <div className="panel analyticsMainPanel">
                    <div className="panelHeader">
                      <div>
                        <div className="panelHeaderTitle">
                          Class Analytics
                        </div>

                      </div>

                      <select
                        className="selectInput"
                        value={
                          analyticsPeriod
                        }
                        onChange={(
                          event
                        ) =>
                          setAnalyticsPeriod(
                            event
                              .target
                              .value
                          )
                        }
                      >
                        <option value="All">
                          All Periods
                        </option>
                        {PERIODS.map(
                          (
                            period
                          ) => (
                            <option
                              key={
                                period
                              }
                              value={
                                period
                              }
                            >
                              {
                                period
                              }
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div className="analyticsGrid">
                      <div className="analyticsCard">
                        <h3>
                          Records
                        </h3>

                        <div className="analyticsValue">
                          {
                            analyticsRecords.length
                          }
                        </div>

                        <div className="analyticsMuted">
                          Assessment records in
                          selected period
                        </div>
                      </div>

                      <div className="analyticsCard">
                        <h3>
                          Completed
                        </h3>

                        <div className="analyticsValue green">
                          {
                            analyticsRecords.filter(
                              (item) =>
                                item.is_completed
                            ).length
                          }
                        </div>

                        <div className="analyticsMuted">
                          Completed assessments
                        </div>
                      </div>

                      <div className="analyticsCard">
                        <h3>
                          Grade Ready
                        </h3>

                        <div className="analyticsValue">
                          {
                            analyticsRecords.filter(
                              (
                                item
                              ) =>
                                (
                                  item.overall_classification ||
                                  item.classification_label
                                ) ===
                                "Reading at Grade Level"
                            ).length
                          }
                        </div>

                        <div className="analyticsMuted">
                          Reading at grade level
                        </div>
                      </div>
                    </div>

                    <div className="barList">
                      {[
                        [
                          "Reading at Grade Level",
                          "green",
                        ],
                        [
                          "Transitioning Reader",
                          "blue",
                        ],
                        [
                          "Developing Reader",
                          "orange",
                        ],
                        [
                          "High Emerging Reader",
                          "red",
                        ],
                      ].map(
                        ([
                          label,
                          colorClass,
                        ]) => {
                          const count =
                            analyticsRecords.filter(
                              (
                                item
                              ) => {
                                const profile =
                                  item.overall_classification ||
                                  item.classification_label ||
                                  calculateFallbackProfile(
                                    item.miscue_accuracy,
                                    item.comprehension_score
                                  );

                                return (
                                  profile ===
                                  label
                                );
                              }
                            ).length;

                          const denominator =
                            Math.max(
                              1,
                              analyticsRecords.length
                            );

                          const percentage =
                            Math.round(
                              (count /
                                denominator) *
                                100
                            );

                          return (
                            <div
                              className="barRow"
                              key={
                                label
                              }
                            >
                              <div className="barTop">
                                <span>
                                  {
                                    label
                                  }
                                </span>
                                <span>
                                  {count}{" "}
                                  (
                                  {
                                    percentage
                                  }
                                  %)
                                </span>
                              </div>

                              <div className="barTrack">
                                <div
                                  className="barFill"
                                  style={{
                                    width: `${percentage}%`,
                                    background:
                                      colorClass ===
                                      "red"
                                        ? "#c92335"
                                        : colorClass ===
                                          "orange"
                                        ? "#c77b17"
                                        : colorClass ===
                                          "green"
                                        ? "#18834e"
                                        : "#1559a6",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                </>
              )}

              {activeTab ===
                "profile" && (
                <>
                  <div className="panel profileMainPanel">
                    <div className="panelHeader">
                      <div>
                        <div className="panelHeaderTitle">
                          Account Information
                        </div>

                      </div>

                      <button
                        type="button"
                        className="toolbarButton importGreenButton"
                        onClick={() => {
                          setProfileForm({
                            fullName:
                              user?.full_name ||
                              "",
                            section:
                              user?.section ||
                              "",
                          });

                          setProfileEditOpen(
                            true
                          );
                        }}
                      >
                        Edit Profile
                      </button>
                    </div>

                    <div className="profileBox">
                      <div className="profileGrid">
                        <div className="profileItem">
                          <div className="profileLabel">
                            Full Name
                          </div>
                          <div className="profileValue">
                            {
                              user?.full_name
                            }
                          </div>
                        </div>

                        <div className="profileItem">
                          <div className="profileLabel">
                            Username
                          </div>
                          <div className="profileValue">
                            {
                              user?.username
                            }
                          </div>
                        </div>

                        <div className="profileItem">
                          <div className="profileLabel">
                            Role
                          </div>
                          <div className="profileValue">
                            Teacher
                          </div>
                        </div>

                        <div className="profileItem">
                          <div className="profileLabel">
                            Section
                          </div>
                          <div className="profileValue">
                            {
                              user?.section ||
                              "Not set"
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {addLearnerOpen && (
          <div
            className="modalOverlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !savingLearner) {
                setAddLearnerOpen(false);
              }
            }}
          >
            <div className="modal multiLearnerModal">
              <div className="modalHeader">
                <div>
                  <h2>Add New Learners</h2>
                  <div className="modalHeaderHint">
                    Add one or several learners, then save them together.
                  </div>
                </div>
                <button
                  type="button"
                  className="closeButton"
                  onClick={() => !savingLearner && setAddLearnerOpen(false)}
                  disabled={savingLearner}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="modalBody multiLearnerBody">
                <div className="bulkFormHeader">
                  <span>Section: <strong>{user?.section || "Not set"}</strong></span>
                  <span>{learnerRows.length} row{learnerRows.length === 1 ? "" : "s"}</span>
                </div>

                <div className="learnerRowsScroller">
                  {learnerRows.map((row, index) => (
                    <div className="learnerEntryRow" key={row.id}>
                      <div className="learnerEntryNumber">{index + 1}</div>
                      <div className="formGroup">
                        <label className="formLabel">LRN <span>*</span></label>
                        <input
                          className="formInput"
                          value={row.lrn}
                          onChange={(event) => updateLearnerRow(row.id, "lrn", event.target.value.replace(/\D/g, ""))}
                          inputMode="numeric"
                          maxLength={12}
                          placeholder="12 digits"
                        />
                      </div>
                      <div className="formGroup">
                        <label className="formLabel">Last Name <span>*</span></label>
                        <input className="formInput" value={row.lastName} onChange={(event) => updateLearnerRow(row.id, "lastName", event.target.value)} placeholder="Last name" />
                      </div>
                      <div className="formGroup">
                        <label className="formLabel">First Name <span>*</span></label>
                        <input className="formInput" value={row.firstName} onChange={(event) => updateLearnerRow(row.id, "firstName", event.target.value)} placeholder="First name" />
                      </div>
                      <div className="formGroup">
                        <label className="formLabel">Middle Name</label>
                        <input className="formInput" value={row.middleName} onChange={(event) => updateLearnerRow(row.id, "middleName", event.target.value)} placeholder="N/A" />
                      </div>
                      <div className="formGroup">
                        <label className="formLabel">Sex <span>*</span></label>
                        <select className="formSelect" value={row.sex} onChange={(event) => updateLearnerRow(row.id, "sex", event.target.value)}>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        className="iconDangerButton"
                        onClick={() => removeLearnerRow(row.id)}
                        disabled={learnerRows.length <= 1 || savingLearner}
                        aria-label={`Remove learner row ${index + 1}`}
                        title="Remove row"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="addRowButton"
                  onClick={addLearnerRow}
                  disabled={savingLearner}
                >
                  + Add another learner
                </button>
              </div>

              <div className="modalFooter">
                <button type="button" className="secondaryButton" onClick={() => setAddLearnerOpen(false)} disabled={savingLearner}>
                  Cancel
                </button>
                <button type="button" className="toolbarButton primaryBlueButton" onClick={addLearners} disabled={savingLearner}>
                  {savingLearner ? "Saving learners..." : `Save ${learnerRows.length} Learner${learnerRows.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {bulkDeleteConfirm && (
          <div
            className="modalOverlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setBulkDeleteConfirm(false);
              }
            }}
          >
            <div className="modal bulkDeleteConfirmModal">
              <div className="modalHeader">
                <div>
                  <h2>Delete Selected Learners</h2>
                  <div className="modalHeaderHint">
                    This action cannot be undone.
                  </div>
                </div>
                <button
                  type="button"
                  className="closeButton"
                  onClick={() => setBulkDeleteConfirm(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="modalBody bulkDeleteConfirmBody">
                <div className="bulkDeleteIcon" aria-hidden="true">!</div>
                <div>
                  <h3>
                    Delete {selectedLearnerIds.length} selected learner{selectedLearnerIds.length === 1 ? "" : "s"}?
                  </h3>
                  <p>
                    The selected learner records and their associated assessment data will be removed from the system. This cannot be undone.
                  </p>
                </div>
              </div>

              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => setBulkDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="dangerButton bulkDeleteConfirmButton"
                  onClick={() => {
                    setBulkDeleteConfirm(false);
                    bulkDeleteLearners(true);
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div
            className="modalOverlay"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setDeleteTarget(
                  null
                );
              }
            }}
          >
            <div className="modal">
              <div className="modalHeader">
                <h2>
                  Delete Learner
                </h2>

                <button
                  type="button"
                  className="closeButton"
                  onClick={() =>
                    setDeleteTarget(
                      null
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                <p
                  style={{
                    margin:
                      0,
                    color:
                      "#586d83",
                    fontSize:
                      10,
                    lineHeight:
                      1.7,
                  }}
                >
                  Are you sure you want
                  to delete{" "}
                  <strong>
                    {formatName(
                      deleteTarget
                    )}
                  </strong>
                  ? All assessment sessions
                  associated with this learner
                  will also be removed by the
                  database relationship.
                </p>
              </div>

              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() =>
                    setDeleteTarget(
                      null
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="dangerButton"
                  onClick={
                    deleteLearner
                  }
                >
                  Delete Learner
                </button>
              </div>
            </div>
          </div>
        )}

        {detailsTarget && (
          <div
            className="modalOverlay"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setDetailsTarget(
                  null
                );
              }
            }}
          >
            <div className="modal">
              <div className="modalHeader">
                <h2>
                  Learner Details
                </h2>

                <button
                  type="button"
                  className="closeButton"
                  onClick={() =>
                    setDetailsTarget(
                      null
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                <div className="profileGrid">
                  <div className="profileItem">
                    <div className="profileLabel">
                      LRN
                    </div>
                    <div className="profileValue">
                      {
                        detailsTarget.lrn
                      }
                    </div>
                  </div>

                  <div className="profileItem">
                    <div className="profileLabel">
                      Full Name
                    </div>
                    <div className="profileValue">
                      {formatName(
                        detailsTarget
                      )}
                    </div>
                  </div>

                  <div className="profileItem">
                    <div className="profileLabel">
                      Sex
                    </div>
                    <div className="profileValue">
                      {
                        detailsTarget.sex
                      }
                    </div>
                  </div>

                  <div className="profileItem">
                    <div className="profileLabel">
                      Grade
                    </div>
                    <div className="profileValue">
                      Grade{" "}
                      {
                        detailsTarget.grade_level
                      }
                    </div>
                  </div>

                  <div className="profileItem">
                    <div className="profileLabel">
                      Section
                    </div>
                    <div className="profileValue">
                      {
                        detailsTarget.section ||
                        user?.section ||
                        "Not set"
                      }
                    </div>
                  </div>

                  <div className="profileItem">
                    <div className="profileLabel">
                      Middle Initial
                    </div>
                    <div className="profileValue">
                      {detailsTarget.middle_initial ||
                        "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {logoutOpen && (
          <div
            className="modalOverlay"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget &&
                !loggingOut
              ) {
                setLogoutOpen(
                  false
                );
              }
            }}
          >
            <div className="modal">
              <div className="modalHeader">
                <h2>
                  Log out of CRL-App?
                </h2>

                <button
                  type="button"
                  className="closeButton"
                  disabled={
                    loggingOut
                  }
                  onClick={() =>
                    setLogoutOpen(
                      false
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                <p
                  style={{
                    margin:
                      0,
                    color:
                      "#586d83",
                    fontSize:
                      10,
                    lineHeight:
                      1.7,
                  }}
                >
                  Are you sure you want
                  to log out? Your current
                  teacher session will be
                  ended and you will be
                  returned to the login page.
                </p>
              </div>

              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={
                    loggingOut
                  }
                  onClick={() =>
                    setLogoutOpen(
                      false
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="dangerButton"
                  disabled={
                    loggingOut
                  }
                  onClick={logout}
                >
                  {loggingOut
                    ? "Logging Out..."
                    : "Yes, Log Out"}
                </button>
              </div>
            </div>
          </div>
        )}

        {profileEditOpen && (
          <div
            className="modalOverlay"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setProfileEditOpen(
                  false
                );
              }
            }}
          >
            <div className="modal">
              <div className="modalHeader">
                <h2>
                  Edit Profile
                </h2>

                <button
                  type="button"
                  className="closeButton"
                  onClick={() =>
                    setProfileEditOpen(
                      false
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                <div className="formGrid">
                  <div className="formGroup full">
                    <label className="formLabel">
                      Full Name
                    </label>

                    <input
                      className="formInput"
                      value={
                        profileForm.fullName
                      }
                      onChange={(
                        event
                      ) =>
                        setProfileForm(
                          (
                            current
                          ) => ({
                            ...current,
                            fullName:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                    />
                  </div>

                  <div className="formGroup full">
                    <label className="formLabel">
                      Section
                    </label>

                    <input
                      className="formInput"
                      value={
                        profileForm.section
                      }
                      onChange={(
                        event
                      ) =>
                        setProfileForm(
                          (
                            current
                          ) => ({
                            ...current,
                            section:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() =>
                    setProfileEditOpen(
                      false
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="toolbarButton"
                  onClick={
                    saveProfile
                  }
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {activityEditor && (
          <div
            className="modalOverlay"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setActivityEditor(
                  null
                );
              }
            }}
          >
            <div className="modal">
              <div className="modalHeader">
                <h2>
                  {activityEditor.index >=
                  0
                    ? "Edit Activity"
                    : "Add Activity"}
                </h2>

                <button
                  type="button"
                  className="closeButton"
                  onClick={() =>
                    setActivityEditor(
                      null
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                {activityEditor.category ===
                "stories" ? (
                  <div
                    className="formGrid"
                  >
                    <div className="formGroup full">
                      <label className="formLabel">
                        Story Title
                      </label>

                      <input
                        className="formInput"
                        value={
                          activityEditor.title
                        }
                        onChange={(
                          event
                        ) =>
                          setActivityEditor(
                            (
                              current
                            ) => ({
                              ...current,
                              title:
                                event
                                  .target
                                  .value,
                            })
                          )
                        }
                      />
                    </div>

                    <div className="formGroup full">
                      <label className="formLabel">
                        Story Content
                      </label>

                      <textarea
                        className="formTextarea"
                        value={
                          activityEditor.text
                        }
                        onChange={(
                          event
                        ) =>
                          setActivityEditor(
                            (
                              current
                            ) => ({
                              ...current,
                              text:
                                event
                                  .target
                                  .value,
                            })
                          )
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="formGroup">
                    <label className="formLabel">
                      Content
                    </label>

                    <input
                      className="formInput"
                      value={
                        activityEditor.value
                      }
                      onChange={(
                        event
                      ) =>
                        setActivityEditor(
                          (
                            current
                          ) => ({
                            ...current,
                            value:
                              event
                                .target
                                .value,
                          })
                        )
                      }
                      placeholder={
                        activityEditor.category ===
                        "letters"
                          ? "Enter letter"
                          : "Enter word"
                      }
                    />
                  </div>
                )}
              </div>

              <div className="modalFooter">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() =>
                    setActivityEditor(
                      null
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="toolbarButton"
                  onClick={
                    saveActivity
                  }
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {deletingProgress && (
          <div className="deletingToast" role="status" aria-live="polite">
            <div className="deletingToastIcon"><span /></div>
            <div className="deletingToastCopy">
              <strong>Deleting learners...</strong>
              <span>{deletingProgress.completed} of {deletingProgress.total} processed</span>
              <div className="deletingProgressTrack">
                <div
                  className="deletingProgressFill"
                  style={{ width: `${deletingProgress.total ? Math.round((deletingProgress.completed / deletingProgress.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div
            className={`toast ${toast.type}`}
          >
            {
              toast.message
            }
          </div>
        )}

        {startingAssessment && (
          <div className="busyOverlay">
            <div className="busyCard">
              <span className="busySpinner" />
              <div>
                <strong>
                  Starting Assessment
                </strong>
                <div className="busySubtext">
                  Preparing the selected assessment period...
                </div>
              </div>
            </div>
          </div>
        )}

        {savingLearner && (
          <div className="busyOverlay">
            <div className="busyCard">
              <span className="busySpinner" />
              <div>
                <strong>
                  Saving learner
                </strong>
                <div className="busySubtext">
                  Saving the learner record...
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}