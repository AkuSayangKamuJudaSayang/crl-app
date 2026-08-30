"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  const cleaned = middleName.trim();

  if (!cleaned) {
    return "";
  }

  return `${cleaned.charAt(0).toUpperCase()}.`;
}

function formatLearnerName(learner) {
  const middleInitial =
    learner.middleInitial ||
    getMiddleInitial(learner.middleName);

  return [
    learner.lastName,
    learner.firstName,
    middleInitial,
  ]
    .filter(Boolean)
    .join(", ")
    .replace(", ,", ",");
}

function normalizeLearner(learner) {
  return {
    id:
      learner.id ??
      learner.learnerId ??
      learner.lrn,

    lrn: String(learner.lrn ?? ""),

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

    sex: learner.sex ?? "",

    gradeLevel:
      learner.gradeLevel ??
      learner.grade_level ??
      3,

    section:
      learner.section ??
      "",

    status:
      learner.status ??
      "No Assessment",
  };
}

export default function TeacherDashboard() {
  const router = useRouter();

  const [activeTab, setActiveTab] =
    useState("dashboard");

  const [user, setUser] =
    useState(null);

  const [learners, setLearners] =
    useState([]);

  const [records, setRecords] =
    useState([]);

  const [loadingUser, setLoadingUser] =
    useState(true);

  const [loadingLearners, setLoadingLearners] =
    useState(false);

  const [loadingRecords, setLoadingRecords] =
    useState(false);

  const [pageLoading, setPageLoading] =
    useState(true);

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

  const [activities, setActivities] =
    useState(DEFAULT_ACTIVITIES);

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

  const [savingProfile, setSavingProfile] =
    useState(false);

  const [profileMessage, setProfileMessage] =
    useState("");

  useEffect(() => {
    loadAuthenticatedUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadLearners();
      loadRecords(recordPeriod);
    }
  }, [user, recordPeriod]);

  async function loadAuthenticatedUser() {
    try {
      setLoadingUser(true);

      const response = await fetch(
        "/api/auth?action=verify",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.valid
      ) {
        router.replace("/login");
        return;
      }

      setUser(data.user);

      setProfileForm({
        fullName:
          data.user?.full_name ||
          data.user?.fullName ||
          "",
        section:
          data.user?.section ||
          "",
        newPassword: "",
      });
    } catch (error) {
      console.error(
        "Authentication verification failed:",
        error
      );

      setErrorMessage(
        "Unable to verify your account."
      );
    } finally {
      setLoadingUser(false);
      setPageLoading(false);
    }
  }

  async function loadLearners() {
    try {
      setLoadingLearners(true);
      setErrorMessage("");

      /*
       * This endpoint should return the learners
       * belonging to the currently authenticated
       * teacher.
       *
       * Example response:
       * {
       *   learners: [...]
       * }
       */
      const response = await fetch(
        "/api/learners",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load learners."
        );
      }

      const databaseLearners =
        Array.isArray(data)
          ? data
          : data.learners || [];

      setLearners(
        databaseLearners.map(
          normalizeLearner
        )
      );
    } catch (error) {
      console.error(
        "Learner loading failed:",
        error
      );

      setLearners([]);
      setErrorMessage(
        error.message ||
          "Unable to load learners."
      );
    } finally {
      setLoadingLearners(false);
    }
  }

  async function loadRecords(period) {
    try {
      setLoadingRecords(true);

      const response = await fetch(
        `/api/assessment?period=${encodeURIComponent(
          period
        )}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load assessment records."
        );
      }

      const databaseRecords =
        Array.isArray(data)
          ? data
          : data.records || [];

      setRecords(
        databaseRecords
      );
    } catch (error) {
      console.error(
        "Assessment records loading failed:",
        error
      );

      setRecords([]);
    } finally {
      setLoadingRecords(false);
    }
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
      !middleName
    ) {
      setLearnerError(
        "Please complete all required learner fields."
      );

      return;
    }

    if (!/^\d{12}$/.test(lrn)) {
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
            },
            body: JSON.stringify({
              lrn,
              lastName,
              firstName,
              middleName,
              sex: newLearner.sex,
              gradeLevel: 3,
              section:
                user?.section || "",
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to save learner."
        );
      }

      const savedLearner =
        data.learner ||
        data;

      setLearners(
        (current) => [
          normalizeLearner(
            savedLearner
          ),
          ...current,
        ]
      );

      setNewLearner({
        lrn: "",
        lastName: "",
        firstName: "",
        middleName: "",
        sex: "Male",
      });

      setShowAddLearner(false);
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

  function switchTab(tab) {
    if (
      tab === activeTab
    ) {
      return;
    }

    setActiveTab(tab);
  }

  function openAssessment() {
    router.push(
      "/teacher/assessment"
    );
  }

  function openLearnerInterface() {
    router.push("/learner");
  }

  async function logout() {
    try {
      await fetch(
        "/api/auth?action=logout",
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );
    } catch (error) {
      console.error(
        "Logout failed:",
        error
      );
    } finally {
      router.replace("/login");
    }
  }

  const filteredLearners =
    useMemo(() => {
      const search =
        learnerSearch
          .trim()
          .toLowerCase();

      const result =
        learners.filter(
          (learner) => {
            const fullName =
              `${learner.lastName}, ${learner.firstName} ${learner.middleName}`.toLowerCase();

            const searchMatch =
              !search ||
              fullName.includes(
                search
              ) ||
              learner.lrn
                .toLowerCase()
                .includes(search);

            const sexMatch =
              !selectedSex ||
              learner.sex ===
                selectedSex;

            return (
              searchMatch &&
              sexMatch
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
      const search =
        recordSearch
          .trim()
          .toLowerCase();

      return records.filter(
        (record) => {
          const name =
            record.name ||
            `${record.lastName || ""}, ${
              record.firstName || ""
            } ${record.middleInitial || ""}`;

          return (
            !search ||
            String(name)
              .toLowerCase()
              .includes(search) ||
            String(
              record.lrn || ""
            )
              .toLowerCase()
              .includes(search)
          );
        }
      );
    }, [
      records,
      recordSearch,
    ]);

  const currentActivities =
    activities[
      activityPeriod
    ][activityTab];

  const dashboardStats =
    useMemo(() => {
      const total =
        records.length;

      const gradeReady =
        records.filter(
          (record) =>
            String(
              record.part1_level ||
                record.readingLevel ||
                ""
            )
              .toLowerCase()
              .includes(
                "grade"
              )
        ).length;

      const intervention =
        records.filter(
          (record) =>
            String(
              record.part1_level ||
                record.readingLevel ||
                ""
            )
              .toLowerCase()
              .includes(
                "refresher"
              )
        ).length;

      return {
        total,
        gradeReady,
        intervention,
      };
    }, [records]);

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
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Unable to update your profile."
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
          "Unable to update your profile."
      );
    } finally {
      setSavingProfile(false);
    }
  }

  function openAddActivity() {
    setActivityIndex(-1);
    setActivityValue("");
    setStoryTitle("");
    setStoryText("");
    setShowActivityModal(true);
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

    setShowActivityModal(true);
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
    setShowActivityModal(false);
  }

  function removeActivity(index) {
    const confirmed =
      window.confirm(
        "Remove this activity?"
      );

    if (!confirmed) {
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

  if (
    pageLoading ||
    loadingUser
  ) {
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
                #eef4fb 100%
              );
          }

          .loading {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #1455a0;
          }

          .loading-box {
            text-align: center;
          }

          .spinner {
            width: 42px;
            height: 42px;
            margin: 0 auto 12px;
            border: 3px solid #dce7f3;
            border-top-color: #1455a0;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }

          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>

        <main className="loading">
          <div className="loading-box">
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
      .map((word) =>
        word[0]
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
              #eef4fb 100%
            );
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

        .app {
          min-height: 100vh;
          display: flex;
        }

        /* ==========================================================
           SIDEBAR
           ========================================================== */

        .sidebar {
          width: 248px;
          position: fixed;
          inset: 0 auto 0 0;
          z-index: 20;
          display: flex;
          flex-direction: column;
          background: #fff;
          border-right: 1px solid #dfe7f0;
        }

        .brand {
          min-height: 82px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 15px 20px;
          border-bottom: 1px solid #edf2f7;
        }

        .brand-mark {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: #1455a0;
          color: #fff;
          font-weight: 800;
          font-size: 13px;
        }

        .brand-title {
          font-size: 16px;
          font-weight: 800;
          color: #172337;
        }

        .brand-subtitle {
          margin-top: 3px;
          font-size: 10px;
          color: #7b8ba0;
        }

        .nav {
          flex: 1;
          padding: 20px 12px;
        }

        .nav-label {
          padding: 0 11px 10px;
          color: #97a4b5;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.9px;
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
          color: #607086;
          font-size: 12px;
          font-weight: 700;
          text-align: left;
          cursor: pointer;
          transition:
            background 0.22s ease,
            color 0.22s ease,
            transform 0.15s ease;
        }

        .nav-button:hover {
          background: #f3f7fc;
          color: #1455a0;
        }

        .nav-button:active {
          transform: scale(0.985);
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

        .sidebar-bottom {
          padding: 12px;
          border-top: 1px solid #edf2f7;
        }

        .sidebar-user {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 8px 13px;
        }

        .avatar {
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #1455a0;
          color: #fff;
          font-size: 12px;
          font-weight: 800;
        }

        .sidebar-user-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #2c3e55;
          font-size: 11px;
          font-weight: 800;
        }

        .sidebar-user-role {
          margin-top: 3px;
          color: #8a97a8;
          font-size: 10px;
        }

        .logout {
          color: #c92335 !important;
        }

        .logout:hover {
          background: #fff2f4 !important;
          color: #c92335 !important;
        }

        /* ==========================================================
           MAIN
           ========================================================== */

        .main {
          flex: 1;
          min-width: 0;
          margin-left: 248px;
        }

        .topbar {
          height: 70px;
          display: flex;
          align-items: center;
          padding: 0 32px;
          background: #fff;
          border-bottom: 1px solid #dfe7f0;
        }

        .topbar-title {
          color: #172337;
          font-size: 21px;
          font-weight: 800;
        }

        .content {
          padding: 28px 32px 42px;
        }

        .page {
          animation:
            pageEnter
            0.24s
            ease;
        }

        @keyframes pageEnter {
          from {
            opacity: 0;
            transform: translateY(
              5px
            );
          }

          to {
            opacity: 1;
            transform: translateY(
              0
            );
          }
        }

        .page-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 20px;
        }

        .page-heading h1 {
          margin: 0;
          font-size: 25px;
          font-weight: 800;
          color: #172337;
        }

        .page-heading p {
          margin: 6px 0 0;
          color: #7b899b;
          font-size: 12px;
        }

        .actions {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
        }

        .button {
          min-height: 40px;
          padding: 0 15px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border-radius: 8px;
          border: 1px solid transparent;
          cursor: pointer;
          font-size: 12px;
          font-weight: 800;
          transition:
            background 0.2s ease,
            color 0.2s ease,
            box-shadow 0.2s ease,
            transform 0.14s ease;
        }

        .button:hover {
          transform: translateY(
            -1px
          );
        }

        .button:active {
          transform: scale(0.985);
        }

        .button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .button-blue {
          background: #1455a0;
          color: #fff;
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
          background: #0f4788;
          box-shadow:
            0 7px 17px
              rgba(
                20,
                85,
                160,
                0.22
              );
        }

        .button-red {
          background: #c92335;
          color: #fff;
        }

        .button-red:hover {
          background: #ae1e2d;
        }

        .button-outline {
          background: #fff;
          color: #1455a0;
          border-color: #ced9e5;
        }

        .button-outline:hover {
          background: #f2f7fd;
          border-color: #a9bdd4;
        }

        .card {
          background: #fff;
          border: 1px solid #dfe7f0;
          border-radius: 14px;
          box-shadow:
            0 8px 24px
              rgba(
                25,
                51,
                82,
                0.055
              );
        }

        .card-header {
          min-height: 58px;
          padding: 0 19px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          border-bottom: 1px solid #edf2f7;
        }

        .card-header h2 {
          margin: 0;
          color: #24364e;
          font-size: 15px;
          font-weight: 800;
        }

        .card-body {
          padding: 19px;
        }

        /* ==========================================================
           DASHBOARD
           ========================================================== */

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
          max-width: 760px;
          color: #718197;
          font-size: 12px;
          line-height: 1.65;
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
          padding: 21px;
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
          background: #fff1f3;
          color: #c92335;
        }

        .dashboard-action h3 {
          margin: 0 0 6px;
          color: #27384e;
          font-size: 14px;
          font-weight: 800;
        }

        .dashboard-action p {
          margin: 0;
          color: #77859a;
          font-size: 11px;
          line-height: 1.6;
        }

        .dashboard-action .button {
          margin-top: 16px;
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
          padding: 16px;
          background: #fff;
          border: 1px solid #dfe7f0;
          border-radius: 12px;
        }

        .mini-stat-value {
          color: #1455a0;
          font-size: 22px;
          font-weight: 800;
        }

        .mini-stat-label {
          margin-top: 4px;
          color: #8090a3;
          font-size: 10px;
          font-weight: 700;
        }

        /* ==========================================================
           ENROLLED LEARNERS
           ========================================================== */

        .learner-toolbar {
          display: grid;
          grid-template-columns:
            minmax(220px, 1.6fr)
            0.75fr
            0.8fr
            auto;
          gap: 9px;
          align-items: center;
        }

        .input,
        .select,
        .textarea {
          width: 100%;
          min-height: 40px;
          padding: 0 11px;
          border: 1px solid #ced9e5;
          border-radius: 8px;
          background: #fff;
          color: #26384e;
          outline: none;
          font-size: 11px;
          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .textarea {
          padding: 10px 11px;
          min-height: 125px;
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

        .add-learner-button {
          white-space: nowrap;
          min-width: 124px;
        }

        .learner-list {
          margin-top: 15px;
          display: grid;
          gap: 9px;
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
          border-color: #cddbea;
          transform: translateY(
            -1px
          );
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
          color: #7a899c;
          font-size: 10px;
        }

        .status {
          display: inline-flex;
          margin-top: 7px;
          padding: 4px 8px;
          border-radius: 999px;
          background: #f2f5f8;
          color: #66778a;
          font-size: 9px;
          font-weight: 800;
        }

        .learner-actions {
          flex-shrink: 0;
          display: flex;
          gap: 7px;
        }

        .empty {
          padding: 40px 22px;
          text-align: center;
          border: 1px dashed #d7e1eb;
          border-radius: 10px;
          background: #fbfdff;
        }

        .empty-icon {
          width: 42px;
          height: 42px;
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
          color: #2d3e54;
          font-size: 13px;
        }

        .empty p {
          margin: 0;
          color: #8391a4;
          font-size: 11px;
          line-height: 1.6;
        }

        /* ==========================================================
           RECORDS
           ========================================================== */

        .record-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 15px;
          flex-wrap: wrap;
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
            color 0.2s ease,
            box-shadow 0.2s ease;
        }

        .tab:hover {
          color: #1455a0;
        }

        .tab.active {
          background: #fff;
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

        .table {
          width: 100%;
          border-collapse: collapse;
          min-width: 850px;
        }

        .table th {
          padding: 11px 12px;
          background: #f6f8fb;
          color: #68788b;
          border-bottom: 1px solid #e1e8f0;
          text-align: left;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .table td {
          padding: 11px 12px;
          color: #475a72;
          border-bottom: 1px solid #edf2f6;
          font-size: 10px;
        }

        .table tbody tr:last-child td {
          border-bottom: 0;
        }

        /* ==========================================================
           CONTENT
           ========================================================== */

        .content-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 15px;
        }

        /* ==========================================================
           ANALYTICS
           ========================================================== */

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
          color: #7d8ba0;
          font-size: 11px;
          line-height: 1.6;
        }

        .stat-bars {
          display: grid;
          gap: 12px;
          margin-top: 18px;
        }

        .bar-label {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
          color: #607086;
          font-size: 10px;
          font-weight: 700;
        }

        .bar {
          height: 8px;
          overflow: hidden;
          border-radius: 999px;
          background: #edf2f7;
        }

        .bar-fill-blue {
          height: 100%;
          width: 0%;
          border-radius: inherit;
          background: #1455a0;
        }

        .bar-fill-red {
          height: 100%;
          width: 0%;
          border-radius: inherit;
          background: #c92335;
        }

        /* ==========================================================
           PROFILE
           ========================================================== */

        .profile-grid {
          display: grid;
          grid-template-columns:
            0.7fr
            1.3fr;
          gap: 15px;
        }

        .profile-summary {
          padding: 27px 20px;
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
          color: #fff;
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
          color: #8693a5;
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

        .success {
          padding: 10px 12px;
          border-radius: 8px;
          background: #edf8f0;
          color: #287241;
          font-size: 10px;
        }

        .error-box {
          margin-bottom: 14px;
          padding: 10px 12px;
          border-radius: 8px;
          background: #fff1f3;
          color: #a92131;
          font-size: 10px;
          line-height: 1.5;
        }

        /* ==========================================================
           MODAL
           ========================================================== */

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(
            18,
            31,
            48,
            0.4
          );
          backdrop-filter: blur(3px);
          animation: fade 0.18s ease;
        }

        @keyframes fade {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        .modal {
          width: 100%;
          max-width: 550px;
          max-height: 90vh;
          overflow-y: auto;
          background: #fff;
          border-radius: 14px;
          border: 1px solid #dfe7ef;
          box-shadow:
            0 24px 65px
              rgba(
                20,
                38,
                63,
                0.2
              );
          animation: modalIn
            0.2s ease;
        }

        @keyframes modalIn {
          from {
            opacity: 0;
            transform: translateY(
              8px
            ) scale(0.985);
          }

          to {
            opacity: 1;
            transform: translateY(
              0
            ) scale(1);
          }
        }

        .modal-header {
          min-height: 58px;
          padding: 0 19px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid #edf2f6;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 15px;
          font-weight: 800;
          color: #293a50;
        }

        .close {
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 7px;
          background: #f4f7fa;
          color: #6e7e90;
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
          border-top: 1px solid #edf2f6;
        }

        /* ==========================================================
           RESPONSIVE
           ========================================================== */

        @media (max-width: 1050px) {
          .sidebar {
            width: 78px;
          }

          .brand {
            justify-content: center;
            padding-left: 10px;
            padding-right: 10px;
          }

          .brand-text,
          .nav-label,
          .nav-text,
          .sidebar-user > div:not(.avatar) {
            display: none;
          }

          .nav-button {
            justify-content: center;
            padding-left: 0;
            padding-right: 0;
          }

          .sidebar-user {
            justify-content: center;
          }

          .main {
            margin-left: 78px;
          }

          .profile-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 820px) {
          .content {
            padding: 21px 19px 30px;
          }

          .topbar {
            padding: 0 19px;
          }

          .dashboard-grid,
          .analytics-grid {
            grid-template-columns: 1fr;
          }

          .learner-toolbar {
            grid-template-columns:
              1fr
              1fr;
          }

          .add-learner-button {
            width: 100%;
          }

          .mini-stats {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 560px) {
          .page-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .learner-toolbar {
            grid-template-columns: 1fr;
          }

          .modal-grid {
            grid-template-columns: 1fr;
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
                    switchTab(
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

          <div className="sidebar-bottom">
            <div className="sidebar-user">
              <div className="avatar">
                {initials}
              </div>

              <div>
                <div className="sidebar-user-name">
                  {displayName}
                </div>

                <div className="sidebar-user-role">
                  {user?.role ||
                    "teacher"}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="nav-button logout"
              onClick={
                logout
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
            {errorMessage ? (
              <div className="error-box">
                {errorMessage}
              </div>
            ) : null}

            <div
              key={activeTab}
              className="page"
            >
              {/* =====================================================
                  DASHBOARD
                  ===================================================== */}

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
                          dashboardStats.total
                        }
                      </div>

                      <div className="mini-stat-label">
                        Assessment Records
                      </div>
                    </div>

                    <div className="mini-stat">
                      <div className="mini-stat-value">
                        {
                          dashboardStats.gradeReady
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
                          dashboardStats.intervention
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
                        Begin a CRLA assessment and assess a learner using the
                        teacher assessment interface.
                      </p>

                      <button
                        type="button"
                        className="button button-blue"
                        onClick={
                          openAssessment
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
                          openLearnerInterface
                        }
                      >
                        Open Learner Page
                      </button>
                    </section>
                  </div>
                </>
              )}

              {/* =====================================================
                  ASSESS
                  ===================================================== */}

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
                          type="text"
                          className="input"
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
                        <div
                          className="empty"
                          style={{
                            marginTop:
                              15,
                          }}
                        >
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
                        <div
                          className="empty"
                          style={{
                            marginTop:
                              15,
                          }}
                        >
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
                                    {formatLearnerName(
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
                                    onClick={
                                      openAssessment
                                    }
                                  >
                                    BoSY
                                  </button>

                                  <button
                                    type="button"
                                    className="button button-outline"
                                    onClick={
                                      openAssessment
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

              {/* =====================================================
                  RECORDS
                  ===================================================== */}

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
                      <div className="record-toolbar">
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
                          <table className="table">
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
                                        formatLearnerName(
                                          record
                                        )}
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

              {/* =====================================================
                  CONTENT
                  ===================================================== */}

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
                      <div className="content-toolbar">
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
                          <table className="table">
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
                                      <div className="actions">
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
                                          className="button button-outline"
                                          style={{
                                            color:
                                              "#c92335",
                                            borderColor:
                                              "#efc9ce",
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

              {/* =====================================================
                  ANALYTICS
                  ===================================================== */}

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
                        Assessment completion will be calculated directly from the
                        stored records.
                      </p>

                      <div className="stat-bars">
                        <div>
                          <div className="bar-label">
                            <span>
                              BoSY
                            </span>

                            <span>
                              {
                                recordPeriod ===
                                "BoSY"
                                  ? records.length
                                  : 0
                              }
                            </span>
                          </div>

                          <div className="bar">
                            <div
                              className="bar-fill-blue"
                              style={{
                                width:
                                  records.length
                                    ? "100%"
                                    : "0%",
                              }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="bar-label">
                            <span>
                              MoSY
                            </span>

                            <span>
                              {
                                recordPeriod ===
                                "MoSY"
                                  ? records.length
                                  : 0
                              }
                            </span>
                          </div>

                          <div className="bar">
                            <div
                              className="bar-fill-red"
                              style={{
                                width:
                                  recordPeriod ===
                                  "MoSY" &&
                                  records.length
                                    ? "100%"
                                    : "0%",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="card analytics-card">
                      <h2>
                        Reading Profiles
                      </h2>

                      <p>
                        These values update from actual assessment records.
                      </p>

                      <div
                        style={{
                          marginTop:
                            18,
                          display:
                            "grid",
                          gap: 8,
                        }}
                      >
                        {[
                          "Low Emerging Reader",
                          "High Emerging Reader",
                          "Developing Reader",
                          "Transitioning Reader",
                          "Reading at Grade Level",
                        ].map(
                          (
                            profile
                          ) => {
                            const count =
                              records.filter(
                                (
                                  record
                                ) =>
                                  (
                                    record.readingProfile ||
                                    record.reading_profile ||
                                    ""
                                  ) ===
                                  profile
                              ).length;

                            return (
                              <div
                                key={
                                  profile
                                }
                                style={{
                                  display:
                                    "flex",
                                  justifyContent:
                                    "space-between",
                                  alignItems:
                                    "center",
                                  padding:
                                    "10px 11px",
                                  border:
                                    "1px solid #edf2f6",
                                  borderRadius:
                                    "8px",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize:
                                      10,
                                    color:
                                      "#637389",
                                  }}
                                >
                                  {
                                    profile
                                  }
                                </span>

                                <span
                                  style={{
                                    fontSize:
                                      11,
                                    color:
                                      "#26384e",
                                    fontWeight:
                                      800,
                                  }}
                                >
                                  {
                                    count
                                  }
                                </span>
                              </div>
                            );
                          }
                        )}
                      </div>
                    </section>
                  </div>
                </>
              )}

              {/* =====================================================
                  PROFILE
                  ===================================================== */}

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
                              type="password"
                              className="input"
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
                                  ? "success"
                                  : "error-box"
                              }
                            >
                              {
                                profileMessage
                              }
                            </div>
                          ) : null}

                          <div
                            className="actions"
                            style={{
                              justifyContent:
                                "flex-end",
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
                <div className="error-box">
                  {learnerError}
                </div>
              ) : null}

              <div className="modal-grid">
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
                          lrn: event
                            .target
                            .value.replace(
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
                    type="text"
                    placeholder="Last name"
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
                    type="text"
                    placeholder="First name"
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
                    type="text"
                    placeholder="Middle name"
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
                          sex: event
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
                    maxLength={
                      activityTab ===
                      "letters"
                        ? 1
                        : undefined
                    }
                    value={
                      activityValue
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
    </>
  );
}
