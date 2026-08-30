"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/*
 * Keep your existing NAV_ITEMS, DEFAULT_ACTIVITIES,
 * normalizeLearner(), learnerDisplayName(), and the
 * rest of your dashboard implementation.
 */

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "⌂",
  },
  {
    id: "assess",
    label: "Conduct Assessment",
    icon: "▶",
  },
  {
    id: "records",
    label: "Assessment Records",
    icon: "▤",
  },
  {
    id: "content",
    label: "Manage Activities",
    icon: "◫",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: "%",
  },
  {
    id: "profile",
    label: "Profile",
    icon: "●",
  },
];

const DEFAULT_ACTIVITIES = {
  BoSY: {
    letters: [
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
    ],
    words: [
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
    ],
    stories: [
      {
        id: 1,
        title: "Para The Parrot",
        text:
          "Para flies away from the houses and into the market. She must look for some fruits and food she can eat. She is having fun, but wants to go home. It is getting dark. There are many cars on the road because it is the end of the work day. Then, she sees something! Para stops flying and lands on top of a parked car. She sees a police officer and he is directing traffic. He is also dancing! Para has never seen a police officer dance. The police officer is smiling. Para wants to learn more about this man.",
      },
      {
        id: 2,
        title: "A Day in the Fields",
        text:
          "Dulnuwan is a farmer. He works in the fields everyday. His wife Bugan helps him. Ali and Dina help too when they are not in school. Today, Dulnuwan drains the water from the field and prepares the seedbed. Bugan, Ali, and Dina pull the weeds. They work all morning. They rest under the shade of a tree and eat lunch. They eat boiled rice and beans. They are proud of their work. Dulnuwan looks at the clear blue sky. There is not a cloud in sight. He looks at the terraces below. He bends to pick a handful of soil.",
      },
    ],
  },
  MoSY: {
    letters: [],
    words: [],
    stories: [],
  },
};

function getMiddleInitial(middleName = "") {
  const value = middleName.trim();

  if (!value) {
    return "";
  }

  return `${value.charAt(0).toUpperCase()}.`;
}

function normalizeLearner(learner) {
  return {
    id:
      learner.id ??
      learner.learnerId ??
      learner.lrn,

    lrn: String(
      learner.lrn ?? ""
    ),

    lastName:
      learner.lastName ??
      learner.last_name ??
      "",

    firstName:
      learner.firstName ??
      learner.first_name ??
      "",

    middleName:
      learner.middleName ??
      learner.middle_name ??
      "",

    middleInitial:
      learner.middleInitial ??
      learner.middle_initial ??
      getMiddleInitial(
        learner.middleName ??
          learner.middle_name ??
          ""
      ),

    sex:
      learner.sex ?? "",

    gradeLevel:
      learner.gradeLevel ??
      learner.grade_level ??
      3,

    section:
      learner.section ?? "",

    status:
      learner.status ??
      "No Assessment",
  };
}

function learnerDisplayName(learner) {
  const middleInitial =
    learner.middleInitial ||
    getMiddleInitial(
      learner.middleName
    );

  const name = [
    learner.lastName,
    ", ",
    learner.firstName,
    middleInitial
      ? ` ${middleInitial}`
      : "",
  ].join("");

  return name.replace(
    /\s+/g,
    " "
  );
}

async function readApiResponse(response) {
  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    return response.json();
  }

  const text =
    await response.text();

  return {
    error:
      text ||
      `Request failed with status ${response.status}.`,
  };
}

export default function TeacherDashboard() {
  const router = useRouter();

  const [activeTab, setActiveTab] =
    useState("dashboard");

  const [user, setUser] =
    useState(null);

  const [pageLoading, setPageLoading] =
    useState(true);

  const [learners, setLearners] =
    useState([]);

  const [records, setRecords] =
    useState([]);

  const [loadingLearners, setLoadingLearners] =
    useState(false);

  const [loadingRecords, setLoadingRecords] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [learnerSearch, setLearnerSearch] =
    useState("");

  const [selectedSex, setSelectedSex] =
    useState("");

  const [learnerSort, setLearnerSort] =
    useState("name_asc");

  const [recordSearch, setRecordSearch] =
    useState("");

  const [recordPeriod, setRecordPeriod] =
    useState("BoSY");

  const [showAddLearner, setShowAddLearner] =
    useState(false);

  const [savingLearner, setSavingLearner] =
    useState(false);

  const [learnerError, setLearnerError] =
    useState("");

  const [newLearner, setNewLearner] =
    useState({
      lrn: "",
      lastName: "",
      firstName: "",
      middleName: "",
      sex: "Male",
    });

  const [showLogoutModal, setShowLogoutModal] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const [activities, setActivities] =
    useState(
      DEFAULT_ACTIVITIES
    );

  const [activityPeriod, setActivityPeriod] =
    useState("BoSY");

  const [activityTab, setActivityTab] =
    useState("letters");

  const [showActivityModal, setShowActivityModal] =
    useState(false);

  const [activityIndex, setActivityIndex] =
    useState(-1);

  const [activityValue, setActivityValue] =
    useState("");

  const [storyTitle, setStoryTitle] =
    useState("");

  const [storyText, setStoryText] =
    useState("");

  const [profileForm, setProfileForm] =
    useState({
      fullName: "",
      section: "",
      newPassword: "",
    });

  const [profileMessage, setProfileMessage] =
    useState("");

  const [savingProfile, setSavingProfile] =
    useState(false);

  /*
   * ------------------------------------------------------------
   * AUTHENTICATION
   * ------------------------------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    async function authenticate() {
      try {
        const response =
          await fetch(
            "/api/auth?action=verify",
            {
              method: "GET",
              credentials: "include",
              cache: "no-store",
              headers: {
                Accept:
                  "application/json",
              },
            }
          );

        const data =
          await readApiResponse(
            response
          );

        if (cancelled) {
          return;
        }

        if (
          !response.ok ||
          !data.valid ||
          !data.user
        ) {
          window.location.replace(
            "/login"
          );
          return;
        }

        setUser(
          data.user
        );

        setProfileForm({
          fullName:
            data.user.full_name ||
            data.user.fullName ||
            "",
          section:
            data.user.section ||
            "",
          newPassword: "",
        });
      } catch (error) {
        console.error(
          "Authentication verification failed:",
          error
        );

        if (!cancelled) {
          window.location.replace(
            "/login"
          );
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    }

    authenticate();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * ------------------------------------------------------------
   * LOAD LEARNERS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if (!user) {
      return;
    }

    loadLearners();
    loadRecords(
      recordPeriod
    );
  }, [
    user,
    recordPeriod,
  ]);

  async function loadLearners() {
    try {
      setLoadingLearners(true);

      const response =
        await fetch(
          "/api/learners",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: {
              Accept:
                "application/json",
            },
          }
        );

      const data =
        await readApiResponse(
          response
        );

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        window.location.replace(
          "/login"
        );
        return;
      }

      if (!response.ok) {
        console.warn(
          "Learner API error:",
          data
        );

        setLearners([]);
        return;
      }

      const list =
        Array.isArray(data)
          ? data
          : Array.isArray(
                data.learners
              )
            ? data.learners
            : [];

      setLearners(
        list.map(
          normalizeLearner
        )
      );
    } catch (error) {
      console.error(
        "Loading learners failed:",
        error
      );

      setLearners([]);
    } finally {
      setLoadingLearners(false);
    }
  }

  /*
   * ------------------------------------------------------------
   * LOAD RECORDS
   * ------------------------------------------------------------
   */

  async function loadRecords(
    period
  ) {
    try {
      setLoadingRecords(true);

      const response =
        await fetch(
          `/api/assessment?period=${encodeURIComponent(
            period
          )}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: {
              Accept:
                "application/json",
            },
          }
        );

      const data =
        await readApiResponse(
          response
        );

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        window.location.replace(
          "/login"
        );
        return;
      }

      if (!response.ok) {
        console.warn(
          "Assessment API error:",
          data
        );

        setRecords([]);
        return;
      }

      const list =
        Array.isArray(data)
          ? data
          : Array.isArray(
                data.records
              )
            ? data.records
            : [];

      setRecords(list);
    } catch (error) {
      console.error(
        "Loading records failed:",
        error
      );

      setRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }

  /*
   * ------------------------------------------------------------
   * LOGOUT
   * ------------------------------------------------------------
   */

  function openLogoutModal() {
    if (loggingOut) {
      return;
    }

    setShowLogoutModal(
      true
    );
  }

  function cancelLogout() {
    if (loggingOut) {
      return;
    }

    setShowLogoutModal(
      false
    );
  }

  async function performLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      /*
       * Ask the server to invalidate/clear
       * the authentication cookie.
       */
      const response =
        await fetch(
          "/api/auth?action=logout",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: {
              Accept:
                "application/json",
            },
          }
        );

      if (!response.ok) {
        console.warn(
          "Logout API returned:",
          response.status
        );
      }
    } catch (error) {
      /*
       * We still continue with local cleanup.
       * This prevents the user from getting
       * trapped on the dashboard if the network
       * is unavailable.
       */
      console.error(
        "Logout request failed:",
        error
      );
    } finally {
      /*
       * Remove any legacy/local auth data.
       */
      if (
        typeof window !==
        "undefined"
      ) {
        localStorage.removeItem(
          "crla_token"
        );

        localStorage.removeItem(
          "crla_user"
        );

        sessionStorage.removeItem(
          "crla_token"
        );

        sessionStorage.removeItem(
          "crla_user"
        );

        /*
         * Hard navigation guarantees that
         * the teacher page is unloaded.
         *
         * DO NOT use router.push("/login")
         * here.
         */
        window.location.replace(
          "/login"
        );
      }
    }
  }

  /*
   * ------------------------------------------------------------
   * LEARNER
   * ------------------------------------------------------------
   */

  function resetLearnerForm() {
    setNewLearner({
      lrn: "",
      lastName: "",
      firstName: "",
      middleName: "",
      sex: "Male",
    });

    setLearnerError("");
  }

  async function saveLearner() {
    setLearnerError("");

    const lrn =
      newLearner.lrn.trim();

    const lastName =
      newLearner.lastName.trim();

    const firstName =
      newLearner.firstName.trim();

    const middleName =
      newLearner.middleName.trim();

    if (
      !lrn ||
      !lastName ||
      !firstName ||
      !middleName ||
      !newLearner.sex
    ) {
      setLearnerError(
        "Please complete all learner fields."
      );
      return;
    }

    if (
      !/^\d{12}$/.test(lrn)
    ) {
      setLearnerError(
        "LRN must contain exactly 12 digits."
      );
      return;
    }

    try {
      setSavingLearner(true);

      const response =
        await fetch(
          "/api/learners",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },
            body: JSON.stringify({
              lrn,
              lastName,
              firstName,
              middleName,
              sex:
                newLearner.sex,
              gradeLevel: 3,
              section:
                user?.section || "",
            }),
          }
        );

      const data =
        await readApiResponse(
          response
        );

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        window.location.replace(
          "/login"
        );
        return;
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to save learner."
        );
      }

      const savedLearner =
        data?.learner ||
        data;

      setLearners(
        (current) => [
          normalizeLearner(
            savedLearner
          ),
          ...current,
        ]
      );

      resetLearnerForm();
      setShowAddLearner(
        false
      );
    } catch (error) {
      console.error(
        "Saving learner failed:",
        error
      );

      setLearnerError(
        error.message ||
          "Unable to save learner."
      );
    } finally {
      setSavingLearner(false);
    }
  }

  /*
   * ------------------------------------------------------------
   * FILTERS
   * ------------------------------------------------------------
   */

  const filteredLearners =
    useMemo(() => {
      const query =
        learnerSearch
          .trim()
          .toLowerCase();

      const result =
        learners.filter(
          (learner) => {
            const searchable =
              `${learner.lastName} ${learner.firstName} ${learner.middleName}`
                .toLowerCase();

            const nameMatches =
              !query ||
              searchable.includes(
                query
              ) ||
              learner.lrn
                .toLowerCase()
                .includes(query);

            const sexMatches =
              !selectedSex ||
              learner.sex ===
                selectedSex;

            return (
              nameMatches &&
              sexMatches
            );
          }
        );

      result.sort(
        (a, b) => {
          const nameA =
            `${a.lastName}, ${a.firstName}`.toLowerCase();

          const nameB =
            `${b.lastName}, ${b.firstName}`.toLowerCase();

          return learnerSort ===
            "name_desc"
            ? nameB.localeCompare(
                nameA
              )
            : nameA.localeCompare(
                nameB
              );
        }
      );

      return result;
    }, [
      learners,
      learnerSearch,
      selectedSex,
      learnerSort,
    ]);

  const filteredRecords =
    useMemo(() => {
      const query =
        recordSearch
          .trim()
          .toLowerCase();

      return records.filter(
        (record) => {
          const name =
            record.name ||
            `${record.lastName || ""} ${
              record.firstName || ""
            } ${
              record.middleInitial ||
              ""
            }`;

          return (
            !query ||
            String(name)
              .toLowerCase()
              .includes(query) ||
            String(
              record.lrn || ""
            )
              .toLowerCase()
              .includes(query)
          );
        }
      );
    }, [
      records,
      recordSearch,
    ]);

  /*
   * ------------------------------------------------------------
   * PROFILE
   * ------------------------------------------------------------
   */

  async function saveProfile() {
    setProfileMessage("");

    try {
      setSavingProfile(true);

      const response =
        await fetch(
          "/api/auth?action=update_user",
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type":
                "application/json",
              Accept:
                "application/json",
            },
            body: JSON.stringify({
              full_name:
                profileForm.fullName,
              section:
                profileForm.section,
              new_password:
                profileForm.newPassword,
            }),
          }
        );

      const data =
        await readApiResponse(
          response
        );

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        window.location.replace(
          "/login"
        );
        return;
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to update profile."
        );
      }

      setUser(
        (current) => ({
          ...current,
          full_name:
            profileForm.fullName,
          section:
            profileForm.section,
        })
      );

      setProfileForm(
        (current) => ({
          ...current,
          newPassword: "",
        })
      );

      setProfileMessage(
        "Profile updated successfully."
      );
    } catch (error) {
      console.error(
        "Profile update failed:",
        error
      );

      setProfileMessage(
        error.message ||
          "Unable to update profile."
      );
    } finally {
      setSavingProfile(false);
    }
  }

  /*
   * ------------------------------------------------------------
   * ACTIVITY HELPERS
   * ------------------------------------------------------------
   */

  const currentActivities =
    activities[
      activityPeriod
    ][activityTab];

  function openAddActivity() {
    setActivityIndex(-1);
    setActivityValue("");
    setStoryTitle("");
    setStoryText("");
    setShowActivityModal(
      true
    );
  }

  function editActivity(index) {
    const item =
      currentActivities[index];

    setActivityIndex(index);

    if (
      activityTab ===
      "stories"
    ) {
      setStoryTitle(
        item.title
      );

      setStoryText(
        item.text
      );
    } else {
      setActivityValue(
        String(item)
      );
    }

    setShowActivityModal(
      true
    );
  }

  function saveActivity() {
    const next = {
      ...activities,
      [activityPeriod]: {
        ...activities[
          activityPeriod
        ],
        [activityTab]: [
          ...activities[
            activityPeriod
          ][activityTab],
        ],
      },
    };

    const list =
      next[
        activityPeriod
      ][activityTab];

    if (
      activityTab ===
      "stories"
    ) {
      if (
        !storyTitle.trim() ||
        !storyText.trim()
      ) {
        return;
      }

      const story = {
        id:
          activityIndex ===
          -1
            ? Date.now()
            : list[
                activityIndex
              ].id,
        title:
          storyTitle.trim(),
        text:
          storyText.trim(),
      };

      if (
        activityIndex ===
        -1
      ) {
        list.push(story);
      } else {
        list[
          activityIndex
        ] = story;
      }
    } else {
      if (
        !activityValue.trim()
      ) {
        return;
      }

      const value =
        activityTab ===
        "letters"
          ? activityValue
              .trim()
              .charAt(0)
              .toUpperCase()
          : activityValue
              .trim();

      if (
        activityIndex ===
        -1
      ) {
        list.push(value);
      } else {
        list[
          activityIndex
        ] = value;
      }
    }

    setActivities(next);

    setShowActivityModal(
      false
    );
  }

  function removeActivity(index) {
    if (
      !window.confirm(
        "Remove this activity?"
      )
    ) {
      return;
    }

    setActivities(
      (current) => ({
        ...current,
        [activityPeriod]: {
          ...current[
            activityPeriod
          ],
          [activityTab]:
            current[
              activityPeriod
            ][activityTab].filter(
              (_, itemIndex) =>
                itemIndex !== index
            ),
        },
      })
    );
  }

  if (pageLoading) {
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
          }

          body {
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
          }

          .loading-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #1455a0;
          }

          .spinner {
            width: 42px;
            height: 42px;
            margin: 0 auto 12px;
            border: 3px solid #dbe5ef;
            border-top-color: #1455a0;
            border-radius: 50%;
            animation:
              spin 0.8s linear
              infinite;
          }

          @keyframes spin {
            to {
              transform: rotate(
                360deg
              );
            }
          }
        `}</style>

        <main className="loading-page">
          <div>
            <div className="spinner" />
            <div>
              Loading CRL-App...
            </div>
          </div>
        </main>
      </>
    );
  }

  const displayName =
    user?.full_name ||
    user?.fullName ||
    user?.username ||
    "Teacher";

  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (word) =>
          word
            .charAt(0)
            .toUpperCase()
      )
      .join("") || "T";

  return (
    <>
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }

        html,
        body {
          min-height: 100%;
          margin: 0;
        }

        body {
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          color: #172337;
          background:
            linear-gradient(
              180deg,
              #f8fbff 0%,
              #edf4fb 100%
            );
        }

        button,
        input,
        select,
        textarea {
          font: inherit;
        }

        .app {
          min-height: 100vh;
          display: flex;
        }

        .sidebar {
          width: 242px;
          position: fixed;
          inset: 0 auto 0 0;
          z-index: 20;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-right: 1px solid #dfe7f0;
        }

        .brand {
          min-height: 82px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 15px 19px;
          border-bottom: 1px solid #edf2f7;
        }

        .brand-mark {
          width: 41px;
          height: 41px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: #1455a0;
          color: #ffffff;
          font-size: 13px;
          font-weight: 800;
        }

        .brand-title {
          color: #172337;
          font-size: 16px;
          font-weight: 800;
        }

        .brand-subtitle {
          margin-top: 3px;
          color: #8491a3;
          font-size: 10px;
        }

        .nav {
          flex: 1;
          padding: 20px 11px;
        }

        .nav-label {
          padding: 0 11px 10px;
          color: #98a4b4;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .nav-button {
          width: 100%;
          min-height: 45px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 13px;
          margin-bottom: 5px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: #617085;
          font-size: 12px;
          font-weight: 700;
          text-align: left;
          cursor: pointer;
          transition:
            background 0.2s ease,
            color 0.2s ease,
            transform 0.14s ease;
        }

        .nav-button:hover {
          background: #f1f6fc;
          color: #1455a0;
        }

        .nav-button:active {
          transform: scale(
            0.985
          );
        }

        .nav-button.active {
          color: #1455a0;
          background: #eaf2fc;
          box-shadow:
            inset 3px 0 0 #1455a0;
        }

        .nav-icon {
          width: 20px;
          text-align: center;
          font-size: 14px;
        }

        .main {
          flex: 1;
          min-width: 0;
          margin-left: 242px;
        }

        .topbar {
          height: 70px;
          display: flex;
          align-items: center;
          padding: 0 31px;
          background: #ffffff;
          border-bottom: 1px solid #dfe7f0;
        }

        .topbar-title {
          color: #172337;
          font-size: 22px;
          font-weight: 800;
        }

        .content {
          padding: 29px 31px 44px;
        }

        .page {
          animation:
            pageIn 0.24s ease;
        }

        @keyframes pageIn {
          from {
            opacity: 0;
            transform:
              translateY(6px);
          }

          to {
            opacity: 1;
            transform:
              translateY(0);
          }
        }

        .page-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 19px;
        }

        .page-heading h1 {
          margin: 0;
          color: #172337;
          font-size: 25px;
          font-weight: 800;
        }

        .page-heading p {
          margin: 6px 0 0;
          color: #78879b;
          font-size: 12px;
        }

        .button {
          min-height: 41px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 0 16px;
          border-radius: 8px;
          border: 1px solid transparent;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition:
            background 0.2s ease,
            color 0.2s ease,
            border-color 0.2s ease,
            box-shadow 0.2s ease,
            transform 0.14s ease;
        }

        .button:hover {
          transform:
            translateY(-1px);
        }

        .button:active {
          transform: scale(
            0.985
          );
        }

        .button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .button-blue {
          background: #1455a0;
          color: #ffffff;
          box-shadow:
            0 5px 14px
              rgba(
                20,
                85,
                160,
                0.16
              );
        }

        .button-blue:hover {
          background: #104888;
        }

        .button-red {
          background: #c92335;
          color: #ffffff;
        }

        .button-red:hover {
          background: #ad1e2d;
        }

        .button-outline {
          background: #ffffff;
          color: #1455a0;
          border-color: #cfdbe8;
        }

        .button-outline:hover {
          background: #f2f7fd;
          border-color: #aec2d8;
        }

        .card {
          background: #ffffff;
          border: 1px solid #dfe7f0;
          border-radius: 14px;
          box-shadow:
            0 8px 24px
              rgba(
                30,
                54,
                84,
                0.055
              );
        }

        .card-header {
          min-height: 58px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 0 19px;
          border-bottom: 1px solid #edf2f6;
        }

        .card-header h2 {
          margin: 0;
          color: #25374e;
          font-size: 15px;
          font-weight: 800;
        }

        .card-body {
          padding: 19px;
        }

        .welcome-card {
          padding: 24px;
        }

        .welcome-card h2 {
          margin: 0;
          color: #172337;
          font-size: 19px;
          font-weight: 800;
        }

        .welcome-card p {
          margin: 7px 0 0;
          max-width: 780px;
          color: #718097;
          font-size: 12px;
          line-height: 1.65;
        }

        .mini-stats {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 12px;
          margin-top: 16px;
        }

        .mini-stat {
          padding: 17px;
          background: #ffffff;
          border: 1px solid #dfe7f0;
          border-radius: 12px;
        }

        .mini-stat-value {
          color: #1455a0;
          font-size: 23px;
          font-weight: 800;
        }

        .mini-stat-label {
          margin-top: 4px;
          color: #8390a1;
          font-size: 10px;
          font-weight: 700;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 16px;
          margin-top: 16px;
        }

        .dashboard-action {
          padding: 22px;
        }

        .dashboard-action-icon {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 13px;
          border-radius: 10px;
          font-weight: 800;
        }

        .dashboard-action-icon.blue {
          background: #edf4fd;
          color: #1455a0;
        }

        .dashboard-action-icon.red {
          background: #fff0f2;
          color: #c92335;
        }

        .dashboard-action h3 {
          margin: 0 0 6px;
          color: #27384f;
          font-size: 14px;
        }

        .dashboard-action p {
          margin: 0;
          color: #77869a;
          font-size: 11px;
          line-height: 1.65;
        }

        .dashboard-action .button {
          margin-top: 16px;
        }

        .input,
        .select,
        .textarea {
          width: 100%;
          min-height: 41px;
          padding: 0 12px;
          border: 1px solid #cfdae6;
          border-radius: 8px;
          outline: none;
          background: #fff;
          color: #26384e;
          font-size: 11px;
          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .textarea {
          min-height: 125px;
          padding: 10px 12px;
          resize: vertical;
        }

        .input:focus,
        .select:focus,
        .textarea:focus {
          border-color: #1455a0;
          box-shadow:
            0 0 0 3px
              rgba(
                20,
                85,
                160,
                0.08
              );
        }

        .learner-toolbar {
          display: grid;
          grid-template-columns:
            minmax(220px, 1.55fr)
            0.7fr
            0.8fr
            auto;
          gap: 9px;
          align-items: center;
        }

        .add-learner-button {
          white-space: nowrap;
        }

        .learner-list {
          display: grid;
          gap: 9px;
          margin-top: 15px;
        }

        .learner-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 14px;
          border: 1px solid #e0e8f0;
          border-radius: 10px;
          transition:
            background 0.2s ease,
            border-color 0.2s ease,
            transform 0.15s ease;
        }

        .learner-row:hover {
          background: #fbfdff;
          border-color: #cbd9e7;
          transform:
            translateY(-1px);
        }

        .learner-primary {
          min-width: 0;
        }

        .learner-name {
          color: #26374d;
          font-size: 12px;
          font-weight: 800;
        }

        .learner-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          margin-top: 5px;
          color: #7b899b;
          font-size: 10px;
        }

        .status {
          display: inline-flex;
          margin-top: 7px;
          padding: 4px 8px;
          border-radius: 999px;
          background: #f1f5f8;
          color: #66778a;
          font-size: 9px;
          font-weight: 800;
        }

        .learner-actions {
          display: flex;
          flex-shrink: 0;
          gap: 7px;
        }

        .empty {
          padding: 40px 20px;
          margin-top: 15px;
          text-align: center;
          border: 1px dashed #d5e0ea;
          border-radius: 10px;
          background: #fbfdff;
        }

        .empty-icon {
          width: 43px;
          height: 43px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 11px;
          border-radius: 50%;
          background: #edf4fd;
          color: #1455a0;
          font-size: 17px;
          font-weight: 800;
        }

        .empty h3 {
          margin: 0 0 5px;
          color: #2d3e53;
          font-size: 13px;
        }

        .empty p {
          margin: 0;
          color: #8391a4;
          font-size: 11px;
          line-height: 1.6;
        }

        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 15px;
        }

        .tabs {
          display: flex;
          gap: 5px;
          padding: 4px;
          border: 1px solid #e0e7ef;
          border-radius: 8px;
          background: #f5f8fb;
        }

        .tab {
          min-height: 34px;
          padding: 0 12px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #69798c;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
          transition:
            background 0.2s ease,
            color 0.2s ease;
        }

        .tab.active {
          background: #ffffff;
          color: #1455a0;
          box-shadow:
            0 2px 7px
              rgba(
                30,
                53,
                83,
                0.07
              );
        }

        .table-wrap {
          overflow-x: auto;
          border: 1px solid #e1e8f0;
          border-radius: 10px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 820px;
        }

        th {
          padding: 11px 12px;
          text-align: left;
          background: #f6f8fb;
          color: #68788b;
          border-bottom: 1px solid #e1e8f0;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
        }

        td {
          padding: 11px 12px;
          color: #475a72;
          border-bottom: 1px solid #edf2f6;
          font-size: 10px;
        }

        tbody tr:last-child td {
          border-bottom: none;
        }

        .analytics-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 15px;
        }

        .analytics-card {
          padding: 20px;
        }

        .analytics-card h2 {
          margin: 0 0 7px;
          color: #27384f;
          font-size: 14px;
          font-weight: 800;
        }

        .analytics-card p {
          margin: 0;
          color: #7c899d;
          font-size: 11px;
          line-height: 1.6;
        }

        .profile-grid {
          display: grid;
          grid-template-columns:
            0.65fr
            1.35fr;
          gap: 15px;
        }

        .profile-summary {
          padding: 28px 20px;
          text-align: center;
        }

        .profile-avatar {
          width: 70px;
          height: 70px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 13px;
          border-radius: 50%;
          background: #1455a0;
          color: #ffffff;
          font-size: 20px;
          font-weight: 800;
        }

        .profile-name {
          color: #293a50;
          font-size: 16px;
          font-weight: 800;
        }

        .profile-role {
          margin-top: 4px;
          color: #8694a6;
          font-size: 10px;
          text-transform: capitalize;
        }

        .profile-badge {
          display: inline-flex;
          margin-top: 14px;
          padding: 5px 9px;
          border-radius: 999px;
          background: #edf4fd;
          color: #1455a0;
          font-size: 9px;
          font-weight: 800;
        }

        .form {
          display: grid;
          gap: 13px;
        }

        .field {
          display: grid;
          gap: 6px;
        }

        .field label {
          color: #596a80;
          font-size: 10px;
          font-weight: 800;
        }

        .message-success {
          padding: 10px 12px;
          border-radius: 8px;
          background: #edf8f0;
          color: #287241;
          font-size: 10px;
        }

        .message-error {
          padding: 10px 12px;
          border-radius: 8px;
          background: #fff1f3;
          color: #a92131;
          font-size: 10px;
          line-height: 1.5;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(
            17,
            30,
            47,
            0.43
          );
          backdrop-filter: blur(
            3px
          );
          animation:
            overlayIn
            0.18s ease;
        }

        @keyframes overlayIn {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        .modal {
          width: 100%;
          max-width: 520px;
          max-height: 90vh;
          overflow-y: auto;
          background: #ffffff;
          border: 1px solid #dfe7ef;
          border-radius: 14px;
          box-shadow:
            0 25px 65px
              rgba(
                20,
                38,
                63,
                0.22
              );
          animation:
            modalIn
            0.2s ease;
        }

        @keyframes modalIn {
          from {
            opacity: 0;
            transform:
              translateY(8px)
              scale(0.985);
          }

          to {
            opacity: 1;
            transform:
              translateY(0)
              scale(1);
          }
        }

        .modal-header {
          min-height: 58px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 19px;
          border-bottom: 1px solid
            #edf2f6;
        }

        .modal-header h2 {
          margin: 0;
          color: #293a50;
          font-size: 15px;
          font-weight: 800;
        }

        .close {
          width: 31px;
          height: 31px;
          border: 0;
          border-radius: 7px;
          background: #f4f7fa;
          color: #6d7c8e;
          font-size: 18px;
          cursor: pointer;
        }

        .modal-body {
          padding: 19px;
        }

        .modal-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 12px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 19px;
          padding-top: 15px;
          border-top: 1px solid
            #edf2f6;
        }

        .logout-icon {
          width: 54px;
          height: 54px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 14px;
          border-radius: 50%;
          background: #fff1f3;
          color: #c92335;
          font-size: 21px;
          font-weight: 800;
        }

        .logout-title {
          margin: 0;
          text-align: center;
          color: #26384e;
          font-size: 18px;
          font-weight: 800;
        }

        .logout-text {
          max-width: 350px;
          margin: 8px auto 0;
          color: #76869a;
          font-size: 11px;
          line-height: 1.65;
          text-align: center;
        }

        .logout-warning {
          margin-top: 16px;
          padding: 11px 12px;
          border-radius: 8px;
          background: #fff7f7;
          border: 1px solid #f1d3d7;
          color: #a22130;
          font-size: 10px;
          line-height: 1.5;
        }

        @media (max-width: 1080px) {
          .sidebar {
            width: 76px;
          }

          .brand {
            justify-content: center;
            padding-left: 10px;
            padding-right: 10px;
          }

          .brand-text,
          .nav-label,
          .nav-text {
            display: none;
          }

          .nav-button {
            justify-content: center;
            padding-left: 0;
            padding-right: 0;
          }

          .main {
            margin-left: 76px;
          }
        }

        @media (max-width: 900px) {
          .learner-toolbar {
            grid-template-columns:
              minmax(180px, 1fr)
              0.7fr
              0.8fr;
          }

          .add-learner-button {
            grid-column: 1 / -1;
            width: fit-content;
          }

          .profile-grid,
          .analytics-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .content {
            padding: 21px 17px 30px;
          }

          .topbar {
            padding: 0 18px;
          }

          .dashboard-grid,
          .mini-stats {
            grid-template-columns: 1fr;
          }

          .learner-toolbar {
            grid-template-columns: 1fr;
          }

          .add-learner-button {
            grid-column: auto;
            width: 100%;
          }

          .page-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .learner-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .learner-actions {
            width: 100%;
          }

          .learner-actions .button {
            flex: 1;
          }

          .modal-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <main className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">
              CRL
            </div>

            <div className="brand-text">
              <div className="brand-title">
                CRL-App
              </div>

              <div className="brand-subtitle">
                Literacy Assessment
              </div>
            </div>
          </div>

          <nav className="nav">
            <div className="nav-label">
              Main Menu
            </div>

            {NAV_ITEMS.map(
              (item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-button ${
                    activeTab ===
                    item.id
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setActiveTab(
                      item.id
                    )
                  }
                >
                  <span className="nav-icon">
                    {item.icon}
                  </span>

                  <span className="nav-text">
                    {item.label}
                  </span>
                </button>
              )
            )}
          </nav>

          <div
            style={{
              padding:
                "12px",
              borderTop:
                "1px solid #edf2f7",
            }}
          >
            <button
              type="button"
              className="nav-button"
              style={{
                color:
                  "#c92335",
              }}
              onClick={
                openLogoutModal
              }
            >
              <span className="nav-icon">
                ↪
              </span>

              <span className="nav-text">
                Logout
              </span>
            </button>
          </div>
        </aside>

        <section className="main">
          <header className="topbar">
            <div className="topbar-title">
              CRL-App
            </div>
          </header>

          <div className="content">
            <div
              key={activeTab}
              className="page"
            >
              {activeTab ===
                "dashboard" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>
                        Dashboard
                      </h1>

                      <p>
                        Manage your CRLA assessment activities and learner records.
                      </p>
                    </div>
                  </div>

                  <section className="card welcome-card">
                    <h2>
                      Welcome to CRL-App
                    </h2>

                    <p>
                      Use this dashboard to conduct Comprehensive Rapid Literacy
                      Assessments, manage your learners, and review assessment
                      results.
                    </p>
                  </section>

                  <div className="mini-stats">
                    <div className="mini-stat">
                      <div className="mini-stat-value">
                        {
                          records.length
                        }
                      </div>

                      <div className="mini-stat-label">
                        Assessment Records
                      </div>
                    </div>

                    <div className="mini-stat">
                      <div className="mini-stat-value">
                        {
                          records.filter(
                            (record) =>
                              String(
                                record.readingLevel ||
                                  ""
                              )
                                .toLowerCase()
                                .includes(
                                  "grade"
                                )
                          ).length
                        }
                      </div>

                      <div className="mini-stat-label">
                        Grade Ready
                      </div>
                    </div>

                    <div className="mini-stat">
                      <div
                        className="mini-stat-value"
                        style={{
                          color:
                            "#c92335",
                        }}
                      >
                        {
                          records.filter(
                            (record) =>
                              String(
                                record.readingProfile ||
                                  record.reading_profile ||
                                  ""
                              )
                                .toLowerCase()
                                .includes(
                                  "emerging"
                                )
                          ).length
                        }
                      </div>

                      <div className="mini-stat-label">
                        Intervention
                      </div>
                    </div>
                  </div>

                  <div className="dashboard-grid">
                    <section className="card dashboard-action">
                      <div className="dashboard-action-icon blue">
                        ▶
                      </div>

                      <h3>
                        Conduct Assessment
                      </h3>

                      <p>
                        Begin a CRLA assessment using the teacher-controlled
                        assessment interface.
                      </p>

                      <button
                        type="button"
                        className="button button-blue"
                        onClick={() =>
                          router.push(
                            "/teacher/assessment"
                          )
                        }
                      >
                        Start Assessment
                      </button>
                    </section>

                    <section className="card dashboard-action">
                      <div className="dashboard-action-icon red">
                        ▣
                      </div>

                      <h3>
                        Learner Interface
                      </h3>

                      <p>
                        Open the learner-facing interface on another device.
                      </p>

                      <button
                        type="button"
                        className="button button-red"
                        onClick={
                          openLearnerPage
                        }
                      >
                        Open Learner Page
                      </button>
                    </section>
                  </div>
                </>
              )}

              {activeTab ===
                "assess" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>
                        Conduct Assessment
                      </h1>

                      <p>
                        Select a learner from your enrolled class.
                      </p>
                    </div>
                  </div>

                  <section className="card">
                    <div className="card-header">
                      <h2>
                        Enrolled Learners
                      </h2>
                    </div>

                    <div className="card-body">
                      <div className="learner-toolbar">
                        <input
                          className="input"
                          type="text"
                          placeholder="Search by learner name or LRN..."
                          value={
                            learnerSearch
                          }
                          onChange={(
                            event
                          ) =>
                            setLearnerSearch(
                              event
                                .target
                                .value
                            )
                          }
                        />

                        <select
                          className="select"
                          value={
                            selectedSex
                          }
                          onChange={(
                            event
                          ) =>
                            setSelectedSex(
                              event
                                .target
                                .value
                            )
                          }
                        >
                          <option value="">
                            All Genders
                          </option>

                          <option value="Male">
                            Male
                          </option>

                          <option value="Female">
                            Female
                          </option>
                        </select>

                        <select
                          className="select"
                          value={
                            learnerSort
                          }
                          onChange={(
                            event
                          ) =>
                            setLearnerSort(
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
                        </select>

                        <button
                          type="button"
                          className="button button-blue add-learner-button"
                          onClick={() => {
                            resetLearnerForm();
                            setShowAddLearner(
                              true
                            );
                          }}
                        >
                          + Add Learner
                        </button>
                      </div>

                      {loadingLearners ? (
                        <div className="empty">
                          <div className="empty-icon">
                            …
                          </div>

                          <h3>
                            Loading learners...
                          </h3>

                          <p>
                            Retrieving your class roster.
                          </p>
                        </div>
                      ) : filteredLearners.length ===
                        0 ? (
                        <div className="empty">
                          <div className="empty-icon">
                            +
                          </div>

                          <h3>
                            No learners registered
                          </h3>

                          <p>
                            Add a learner to begin building your class roster.
                          </p>
                        </div>
                      ) : (
                        <div className="learner-list">
                          {filteredLearners.map(
                            (
                              learner
                            ) => (
                              <div
                                key={
                                  learner.id
                                }
                                className="learner-row"
                              >
                                <div className="learner-primary">
                                  <div className="learner-name">
                                    {learnerDisplayName(
                                      learner
                                    )}
                                  </div>

                                  <div className="learner-meta">
                                    <span>
                                      LRN:{" "}
                                      {
                                        learner.lrn
                                      }
                                    </span>

                                    <span>
                                      Sex:{" "}
                                      {
                                        learner.sex
                                      }
                                    </span>

                                    <span>
                                      Grade{" "}
                                      {
                                        learner.gradeLevel
                                      }
                                    </span>

                                    <span>
                                      Section:{" "}
                                      {
                                        learner.section ||
                                        user?.section ||
                                        "Not set"
                                      }
                                    </span>
                                  </div>

                                  <span className="status">
                                    {
                                      learner.status
                                    }
                                  </span>
                                </div>

                                <div className="learner-actions">
                                  <button
                                    type="button"
                                    className="button button-blue"
                                    onClick={() =>
                                      router.push(
                                        "/teacher/assessment"
                                      )
                                    }
                                  >
                                    BoSY
                                  </button>

                                  <button
                                    type="button"
                                    className="button button-outline"
                                    onClick={() =>
                                      router.push(
                                        "/teacher/assessment"
                                      )
                                    }
                                  >
                                    MoSY
                                  </button>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}

              {activeTab ===
                "records" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>
                        Assessment Records
                      </h1>

                      <p>
                        Review assessment results recorded in the database.
                      </p>
                    </div>
                  </div>

                  <section className="card">
                    <div className="card-body">
                      <div className="toolbar">
                        <input
                          className="input"
                          style={{
                            maxWidth:
                              340,
                          }}
                          type="text"
                          placeholder="Search learner or LRN..."
                          value={
                            recordSearch
                          }
                          onChange={(
                            event
                          ) =>
                            setRecordSearch(
                              event
                                .target
                                .value
                            )
                          }
                        />

                        <div className="tabs">
                          <button
                            type="button"
                            className={`tab ${
                              recordPeriod ===
                              "BoSY"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setRecordPeriod(
                                "BoSY"
                              )
                            }
                          >
                            BoSY
                          </button>

                          <button
                            type="button"
                            className={`tab ${
                              recordPeriod ===
                              "MoSY"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setRecordPeriod(
                                "MoSY"
                              )
                            }
                          >
                            MoSY
                          </button>
                        </div>
                      </div>

                      {loadingRecords ? (
                        <div className="empty">
                          <div className="empty-icon">
                            …
                          </div>

                          <h3>
                            Loading records...
                          </h3>

                          <p>
                            Retrieving assessment results.
                          </p>
                        </div>
                      ) : filteredRecords.length ===
                        0 ? (
                        <div className="empty">
                          <div className="empty-icon">
                            ▤
                          </div>

                          <h3>
                            No assessment records
                          </h3>

                          <p>
                            Completed CRLA assessments will appear here.
                          </p>
                        </div>
                      ) : (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>
                                  LRN
                                </th>

                                <th>
                                  Learner
                                </th>

                                <th>
                                  Task 1
                                </th>

                                <th>
                                  Task 2
                                </th>

                                <th>
                                  Total
                                </th>

                                <th>
                                  Reading Level
                                </th>

                                <th>
                                  Reading Profile
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {filteredRecords.map(
                                (
                                  record,
                                  index
                                ) => (
                                  <tr
                                    key={
                                      record.id ??
                                      index
                                    }
                                  >
                                    <td>
                                      {
                                        record.lrn
                                      }
                                    </td>

                                    <td>
                                      {record.name ||
                                        `${record.lastName || ""}, ${
                                          record.firstName ||
                                          ""
                                        } ${
                                          record.middleInitial ||
                                          ""
                                        }`}
                                    </td>

                                    <td>
                                      {
                                        record.task1 ??
                                        record.letters_score ??
                                        "-"
                                      }
                                    </td>

                                    <td>
                                      {
                                        record.task2 ??
                                        record.words_score ??
                                        "-"
                                      }
                                    </td>

                                    <td>
                                      {
                                        record.total ??
                                        record.total_score ??
                                        "-"
                                      }
                                    </td>

                                    <td>
                                      {
                                        record.readingLevel ||
                                        record.part1_level ||
                                        "-"
                                      }
                                    </td>

                                    <td>
                                      {
                                        record.readingProfile ||
                                        record.reading_profile ||
                                        "-"
                                      }
                                    </td>
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}

              {activeTab ===
                "content" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>
                        Manage Activities
                      </h1>

                      <p>
                        Manage letters, words, and reading passages.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="button button-blue"
                      onClick={
                        openAddActivity
                      }
                    >
                      + Add Item
                    </button>
                  </div>

                  <section className="card">
                    <div className="card-body">
                      <div className="toolbar">
                        <div className="tabs">
                          <button
                            type="button"
                            className={`tab ${
                              activityPeriod ===
                              "BoSY"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setActivityPeriod(
                                "BoSY"
                              )
                            }
                          >
                            BoSY
                          </button>

                          <button
                            type="button"
                            className={`tab ${
                              activityPeriod ===
                              "MoSY"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setActivityPeriod(
                                "MoSY"
                              )
                            }
                          >
                            MoSY
                          </button>
                        </div>

                        <div className="tabs">
                          <button
                            type="button"
                            className={`tab ${
                              activityTab ===
                              "letters"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setActivityTab(
                                "letters"
                              )
                            }
                          >
                            Letters
                          </button>

                          <button
                            type="button"
                            className={`tab ${
                              activityTab ===
                              "words"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setActivityTab(
                                "words"
                              )
                            }
                          >
                            Words
                          </button>

                          <button
                            type="button"
                            className={`tab ${
                              activityTab ===
                              "stories"
                                ? "active"
                                : ""
                            }`}
                            onClick={() =>
                              setActivityTab(
                                "stories"
                              )
                            }
                          >
                            Stories
                          </button>
                        </div>
                      </div>

                      {currentActivities.length ===
                      0 ? (
                        <div className="empty">
                          <div className="empty-icon">
                            +
                          </div>

                          <h3>
                            No activities available
                          </h3>

                          <p>
                            Add an assessment item for this period.
                          </p>
                        </div>
                      ) : (
                        <div className="table-wrap">
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
                              {currentActivities.map(
                                (
                                  item,
                                  index
                                ) => (
                                  <tr
                                    key={
                                      item.id ??
                                      `${activityPeriod}-${activityTab}-${index}`
                                    }
                                  >
                                    <td>
                                      {
                                        index +
                                        1
                                      }
                                    </td>

                                    <td>
                                      {activityTab ===
                                      "stories"
                                        ? item.title
                                        : String(
                                            item
                                          )}
                                    </td>

                                    <td>
                                      <div
                                        style={{
                                          display:
                                            "flex",
                                          gap: 7,
                                        }}
                                      >
                                        <button
                                          type="button"
                                          className="button button-outline"
                                          onClick={() =>
                                            editActivity(
                                              index
                                            )
                                          }
                                        >
                                          Edit
                                        </button>

                                        <button
                                          type="button"
                                          className="button"
                                          style={{
                                            color:
                                              "#c92335",
                                            background:
                                              "#fff",
                                            border:
                                              "1px solid #ecc9cf",
                                          }}
                                          onClick={() =>
                                            removeActivity(
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
                  </section>
                </>
              )}

              {activeTab ===
                "analytics" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>
                        Analytics
                      </h1>

                      <p>
                        Overview of learner assessment progress.
                      </p>
                    </div>
                  </div>

                  <div className="analytics-grid">
                    <section className="card analytics-card">
                      <h2>
                        Assessment Progress
                      </h2>

                      <p>
                        Assessment completion is calculated using stored records.
                      </p>

                      <div
                        style={{
                          marginTop:
                            18,
                          color:
                            "#1455a0",
                          fontSize:
                            28,
                          fontWeight:
                            800,
                        }}
                      >
                        {
                          records.length
                        }
                      </div>
                    </section>

                    <section className="card analytics-card">
                      <h2>
                        Reading Profiles
                      </h2>

                      <p>
                        Profile counts are taken from completed assessments.
                      </p>
                    </section>
                  </div>
                </>
              )}

              {activeTab ===
                "profile" && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>
                        My Profile
                      </h1>

                      <p>
                        Manage your teacher account information.
                      </p>
                    </div>
                  </div>

                  <div className="profile-grid">
                    <section className="card profile-summary">
                      <div className="profile-avatar">
                        {initials}
                      </div>

                      <div className="profile-name">
                        {displayName}
                      </div>

                      <div className="profile-role">
                        {user?.role ||
                          "teacher"}
                      </div>

                      <div className="profile-badge">
                        Grade 3
                      </div>
                    </section>

                    <section className="card">
                      <div className="card-header">
                        <h2>
                          Account Information
                        </h2>
                      </div>

                      <div className="card-body">
                        <div className="form">
                          <div className="field">
                            <label>
                              Username
                            </label>

                            <input
                              className="input"
                              value={
                                user?.username ||
                                ""
                              }
                              disabled
                            />
                          </div>

                          <div className="field">
                            <label>
                              Full Name
                            </label>

                            <input
                              className="input"
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

                          <div className="field">
                            <label>
                              Section
                            </label>

                            <input
                              className="input"
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

                          <div className="field">
                            <label>
                              New Password
                            </label>

                            <input
                              className="input"
                              type="password"
                              placeholder="Leave blank to keep current password"
                              value={
                                profileForm.newPassword
                              }
                              onChange={(
                                event
                              ) =>
                                setProfileForm(
                                  (
                                    current
                                  ) => ({
                                    ...current,
                                    newPassword:
                                      event
                                        .target
                                        .value,
                                  })
                                )
                              }
                            />
                          </div>

                          {profileMessage ? (
                            <div
                              className={
                                profileMessage
                                  .toLowerCase()
                                  .includes(
                                    "success"
                                  )
                                  ? "message-success"
                                  : "message-error"
                              }
                            >
                              {
                                profileMessage
                              }
                            </div>
                          ) : null}

                          <div
                            className="toolbar"
                            style={{
                              justifyContent:
                                "flex-end",
                              marginBottom:
                                0,
                            }}
                          >
                            <button
                              type="button"
                              className="button button-blue"
                              disabled={
                                savingProfile
                              }
                              onClick={
                                saveProfile
                              }
                            >
                              {savingProfile
                                ? "Saving..."
                                : "Save Changes"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ============================================================
          ADD LEARNER MODAL
          ============================================================ */}

      {showAddLearner ? (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowAddLearner(
                false
              );
            }
          }}
        >
          <section className="modal">
            <div className="modal-header">
              <h2>
                Add New Learner
              </h2>

              <button
                type="button"
                className="close"
                onClick={() =>
                  setShowAddLearner(
                    false
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {learnerError ? (
                <div className="message-error">
                  {learnerError}
                </div>
              ) : null}

              <div
                className="modal-grid"
                style={{
                  marginTop:
                    learnerError
                      ? 12
                      : 0,
                }}
              >
                <div className="field">
                  <label>
                    LRN *
                  </label>

                  <input
                    className="input"
                    type="text"
                    inputMode="numeric"
                    maxLength={12}
                    placeholder="12-digit LRN"
                    value={
                      newLearner.lrn
                    }
                    onChange={(
                      event
                    ) =>
                      setNewLearner(
                        (
                          current
                        ) => ({
                          ...current,
                          lrn:
                            event.target.value.replace(
                              /\D/g,
                              ""
                            ),
                        })
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>
                    Last Name *
                  </label>

                  <input
                    className="input"
                    value={
                      newLearner.lastName
                    }
                    onChange={(
                      event
                    ) =>
                      setNewLearner(
                        (
                          current
                        ) => ({
                          ...current,
                          lastName:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>
                    First Name *
                  </label>

                  <input
                    className="input"
                    value={
                      newLearner.firstName
                    }
                    onChange={(
                      event
                    ) =>
                      setNewLearner(
                        (
                          current
                        ) => ({
                          ...current,
                          firstName:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>
                    Middle Name *
                  </label>

                  <input
                    className="input"
                    value={
                      newLearner.middleName
                    }
                    onChange={(
                      event
                    ) =>
                      setNewLearner(
                        (
                          current
                        ) => ({
                          ...current,
                          middleName:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </div>

                <div className="field">
                  <label>
                    Sex *
                  </label>

                  <select
                    className="select"
                    value={
                      newLearner.sex
                    }
                    onChange={(
                      event
                    ) =>
                      setNewLearner(
                        (
                          current
                        ) => ({
                          ...current,
                          sex:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                  >
                    <option value="Male">
                      Male
                    </option>

                    <option value="Female">
                      Female
                    </option>
                  </select>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() =>
                    setShowAddLearner(
                      false
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="button button-blue"
                  disabled={
                    savingLearner
                  }
                  onClick={
                    saveLearner
                  }
                >
                  {savingLearner
                    ? "Saving..."
                    : "Save Learner"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {/* ============================================================
          ACTIVITY MODAL
          ============================================================ */}

      {showActivityModal ? (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowActivityModal(
                false
              );
            }
          }}
        >
          <section className="modal">
            <div className="modal-header">
              <h2>
                {activityIndex ===
                -1
                  ? "Add Activity"
                  : "Edit Activity"}
              </h2>

              <button
                type="button"
                className="close"
                onClick={() =>
                  setShowActivityModal(
                    false
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              {activityTab ===
              "stories" ? (
                <div className="form">
                  <div className="field">
                    <label>
                      Story Title
                    </label>

                    <input
                      className="input"
                      value={
                        storyTitle
                      }
                      onChange={(
                        event
                      ) =>
                        setStoryTitle(
                          event
                            .target
                            .value
                        )
                      }
                    />
                  </div>

                  <div className="field">
                    <label>
                      Story Content
                    </label>

                    <textarea
                      className="textarea"
                      value={
                        storyText
                      }
                      onChange={(
                        event
                      ) =>
                        setStoryText(
                          event
                            .target
                            .value
                        )
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="field">
                  <label>
                    {activityTab ===
                    "letters"
                      ? "Letter"
                      : "Word"}
                  </label>

                  <input
                    className="input"
                    value={
                      activityValue
                    }
                    maxLength={
                      activityTab ===
                      "letters"
                        ? 1
                        : undefined
                    }
                    onChange={(
                      event
                    ) =>
                      setActivityValue(
                        event
                          .target
                          .value
                      )
                    }
                  />
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() =>
                    setShowActivityModal(
                      false
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="button button-blue"
                  onClick={
                    saveActivity
                  }
                >
                  Save Changes
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {/* ============================================================
          ONLY ONE LOGOUT CONFIRMATION MODAL
          ============================================================ */}

      {showLogoutModal ? (
        <div
          className="modal-overlay"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              cancelLogout();
            }
          }}
        >
          <section className="modal">
            <div className="modal-body">
              <div className="logout-icon">
                ↪
              </div>

              <h2 className="logout-title">
                Log out of CRL-App?
              </h2>

              <p className="logout-text">
                Are you sure you want to log out of your teacher account?
              </p>

              <div className="logout-warning">
                Your current session will be ended and you will be returned to the login page.
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-outline"
                  disabled={
                    loggingOut
                  }
                  onClick={
                    cancelLogout
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="button button-red"
                  disabled={
                    loggingOut
                  }
                  onClick={
                    performLogout
                  }
                >
                  {loggingOut
                    ? "Logging Out..."
                    : "Yes, Log Out"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
