"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

const BO_SY_LETTERS = [
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

const BO_SY_WORDS = [
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

const BO_SY_STORIES = [
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
];

export default function TeacherDashboard() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] =
    useState("dashboard");

  const [learners, setLearners] =
    useState([]);

  const [learnerSearch, setLearnerSearch] =
    useState("");

  const [selectedSex, setSelectedSex] =
    useState("");

  const [learnerSort, setLearnerSort] =
    useState("name_asc");

  const [recordPeriod, setRecordPeriod] =
    useState("BoSY");

  const [recordSearch, setRecordSearch] =
    useState("");

  const [activityPeriod, setActivityPeriod] =
    useState("BoSY");

  const [activityTab, setActivityTab] =
    useState("letters");

  const [activities, setActivities] =
    useState({
      BoSY: {
        letters: [...BO_SY_LETTERS],
        words: [...BO_SY_WORDS],
        stories: [...BO_SY_STORIES],
      },
      MoSY: {
        letters: [],
        words: [],
        stories: [],
      },
    });

  const [showActivityModal, setShowActivityModal] =
    useState(false);

  const [editingActivityIndex, setEditingActivityIndex] =
    useState(-1);

  const [activityValue, setActivityValue] =
    useState("");

  const [storyTitle, setStoryTitle] =
    useState("");

  const [storyText, setStoryText] =
    useState("");

  const [showAddLearner, setShowAddLearner] =
    useState(false);

  const [newLearner, setNewLearner] =
    useState({
      lrn: "",
      lastName: "",
      firstName: "",
      sex: "Male",
    });

  const [profileForm, setProfileForm] =
    useState({
      full_name: "",
      section: "",
      new_password: "",
    });

  const [profileMessage, setProfileMessage] =
    useState("");

  const [profileSaving, setProfileSaving] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTeacher() {
      try {
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

        if (cancelled) {
          return;
        }

        if (
          !response.ok ||
          !data.valid
        ) {
          router.replace("/login");
          return;
        }

        setUser(data.user);

        setProfileForm({
          full_name:
            data.user?.full_name || "",
          section:
            data.user?.section || "",
          new_password: "",
        });

        if (
          typeof window !== "undefined"
        ) {
          localStorage.setItem(
            "crla_user",
            JSON.stringify({
              username:
                data.user?.username || "",
              role:
                data.user?.role || "teacher",
              full_name:
                data.user?.full_name || "",
              section:
                data.user?.section || "",
            })
          );
        }
      } catch (err) {
        console.error(
          "Teacher authentication error:",
          err
        );

        if (!cancelled) {
          setError(
            "Unable to verify your account."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTeacher();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const displayName =
    user?.full_name ||
    user?.username ||
    "Teacher";

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part.charAt(0).toUpperCase()
    )
    .join("");

  const filteredLearners = useMemo(() => {
    const query =
      learnerSearch.trim().toLowerCase();

    const filtered = learners.filter(
      (learner) => {
        const fullName =
          `${learner.lastName}, ${learner.firstName}`.toLowerCase();

        const matchesSearch =
          !query ||
          fullName.includes(query) ||
          learner.lrn
            .toLowerCase()
            .includes(query);

        const matchesSex =
          !selectedSex ||
          learner.sex === selectedSex;

        return (
          matchesSearch &&
          matchesSex
        );
      }
    );

    filtered.sort(
      (a, b) => {
        const aName =
          `${a.lastName}, ${a.firstName}`.toLowerCase();

        const bName =
          `${b.lastName}, ${b.firstName}`.toLowerCase();

        return learnerSort ===
          "name_desc"
          ? bName.localeCompare(
              aName
            )
          : aName.localeCompare(
              bName
            );
      }
    );

    return filtered;
  }, [
    learners,
    learnerSearch,
    selectedSex,
    learnerSort,
  ]);

  const currentActivities =
    activities[activityPeriod][
      activityTab
    ];

  const activeRecords =
    recordPeriod === "BoSY"
      ? []
      : [];

  const filteredRecords =
    useMemo(() => {
      const query =
        recordSearch.trim().toLowerCase();

      return activeRecords.filter(
        (record) =>
          !query ||
          record.name
            .toLowerCase()
            .includes(query) ||
          record.lrn
            .toLowerCase()
            .includes(query)
      );
    }, [
      activeRecords,
      recordSearch,
    ]);

  function navigateTab(tab) {
    setActiveTab(tab);
  }

  function startAssessment() {
    router.push(
      "/teacher/assessment"
    );
  }

  function openLearnerPage() {
    router.push("/learner");
  }

  function logout() {
    fetch(
      "/api/auth?action=logout",
      {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }
    ).catch((err) =>
      console.error(
        "Logout failed:",
        err
      )
    );

    if (
      typeof window !== "undefined"
    ) {
      localStorage.removeItem(
        "crla_token"
      );

      localStorage.removeItem(
        "crla_user"
      );
    }

    router.replace("/login");
  }

  function addLearner() {
    const lrn =
      newLearner.lrn.trim();

    const lastName =
      newLearner.lastName.trim();

    const firstName =
      newLearner.firstName.trim();

    if (
      !lrn ||
      !lastName ||
      !firstName
    ) {
      window.alert(
        "Please fill in all required learner fields."
      );
      return;
    }

    const exists =
      learners.some(
        (learner) =>
          learner.lrn === lrn
      );

    if (exists) {
      window.alert(
        "A learner with this LRN already exists."
      );
      return;
    }

    setLearners(
      (current) => [
        {
          id: Date.now(),
          lrn,
          lastName,
          firstName,
          sex:
            newLearner.sex,
          gradeLevel: 3,
          section:
            user?.section || "",
          status:
            "No Assessment",
        },
        ...current,
      ]
    );

    setNewLearner({
      lrn: "",
      lastName: "",
      firstName: "",
      sex: "Male",
    });

    setShowAddLearner(false);
  }

  function openNewActivity() {
    setEditingActivityIndex(-1);
    setActivityValue("");
    setStoryTitle("");
    setStoryText("");
    setShowActivityModal(true);
  }

  function openEditActivity(index) {
    const item =
      activities[
        activityPeriod
      ][activityTab][index];

    setEditingActivityIndex(
      index
    );

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

      setActivityValue("");
    } else {
      setActivityValue(
        String(item)
      );

      setStoryTitle("");
      setStoryText("");
    }

    setShowActivityModal(true);
  }

  function saveActivity() {
    const nextActivities = {
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
      nextActivities[
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
        window.alert(
          "Please enter both a story title and story text."
        );
        return;
      }

      const story = {
        id:
          editingActivityIndex ===
          -1
            ? Date.now()
            : list[
                editingActivityIndex
              ].id,
        title:
          storyTitle.trim(),
        text:
          storyText.trim(),
      };

      if (
        editingActivityIndex ===
        -1
      ) {
        list.push(story);
      } else {
        list[
          editingActivityIndex
        ] = story;
      }
    } else {
      if (!activityValue.trim()) {
        window.alert(
          activityTab ===
          "letters"
            ? "Please enter a letter."
            : "Please enter a word."
        );
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
        editingActivityIndex ===
        -1
      ) {
        list.push(value);
      } else {
        list[
          editingActivityIndex
        ] = value;
      }
    }

    setActivities(
      nextActivities
    );

    setShowActivityModal(
      false
    );
  }

  function deleteActivity(index) {
    const confirmed =
      window.confirm(
        "Are you sure you want to delete this item?"
      );

    if (!confirmed) {
      return;
    }

    const nextActivities = {
      ...activities,
      [activityPeriod]: {
        ...activities[
          activityPeriod
        ],
        [activityTab]:
          activities[
            activityPeriod
          ][activityTab].filter(
            (_, itemIndex) =>
              itemIndex !== index
          ),
      },
    };

    setActivities(
      nextActivities
    );
  }

  async function saveProfile() {
    setProfileMessage("");
    setProfileSaving(true);

    try {
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
                profileForm.full_name,
              section:
                profileForm.section,
              new_password:
                profileForm.new_password,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        setProfileMessage(
          data?.error ||
            "Unable to update your profile."
        );
        return;
      }

      setProfileMessage(
        "Profile updated successfully."
      );

      setUser(
        (current) => ({
          ...current,
          full_name:
            profileForm.full_name,
          section:
            profileForm.section,
        })
      );

      setProfileForm(
        (current) => ({
          ...current,
          new_password: "",
        })
      );
    } catch (err) {
      console.error(
        "Profile update failed:",
        err
      );

      setProfileMessage(
        "A network error occurred while updating your profile."
      );
    } finally {
      setProfileSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <style jsx global>{`
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            background: #f5f8fc;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
          }

          .crla-loading {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background:
              linear-gradient(
                180deg,
                #f8fbff 0%,
                #eef4fb 100%
              );
          }

          .crla-loading-box {
            text-align: center;
          }

          .crla-loading-spinner {
            width: 42px;
            height: 42px;
            margin: 0 auto 15px;
            border-radius: 50%;
            border: 3px solid
              #dbe5f0;
            border-top-color:
              #1455a0;
            animation:
              crla-spin 0.8s
                linear infinite;
          }

          .crla-loading-text {
            color: #56677d;
            font-size: 14px;
          }

          @keyframes crla-spin {
            to {
              transform: rotate(
                360deg
              );
            }
          }
        `}</style>

        <main className="crla-loading">
          <div className="crla-loading-box">
            <div className="crla-loading-spinner" />
            <div className="crla-loading-text">
              Loading CRL-App...
            </div>
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <style jsx global>{`
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            background: #f5f8fc;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
          }

          .crla-error-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background:
              linear-gradient(
                180deg,
                #f8fbff 0%,
                #eef4fb 100%
              );
          }

          .crla-error-card {
            width: 100%;
            max-width: 440px;
            padding: 35px;
            text-align: center;
            background: #fff;
            border: 1px solid
              #e2e8f0;
            border-radius: 18px;
            box-shadow:
              0 15px 40px
                rgba(
                  20,
                  52,
                  90,
                  0.1
                );
          }

          .crla-error-card h1 {
            margin: 0 0 10px;
            font-size: 24px;
            color: #172337;
          }

          .crla-error-card p {
            margin: 0 0 22px;
            color: #66758a;
            line-height: 1.6;
          }

          .crla-error-button {
            border: none;
            border-radius: 8px;
            padding: 12px 20px;
            background: #1455a0;
            color: #fff;
            font-weight: 700;
            cursor: pointer;
          }
        `}</style>

        <main className="crla-error-page">
          <section className="crla-error-card">
            <h1>
              Unable to load dashboard
            </h1>

            <p>{error}</p>

            <button
              type="button"
              className="crla-error-button"
              onClick={() =>
                router.replace(
                  "/login"
                )
              }
            >
              Return to Login
            </button>
          </section>
        </main>
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
          min-height: 100%;
          margin: 0;
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
          color: #172337;
        }

        button,
        input,
        select,
        textarea {
          font: inherit;
        }

        button {
          -webkit-tap-highlight-color:
            transparent;
        }

        .crla-dashboard {
          min-height: 100vh;
          display: flex;
        }

        /* ============================================================
           SIDEBAR
           ============================================================ */

        .crla-sidebar {
          width: 240px;
          min-height: 100vh;
          position: fixed;
          top: 0;
          left: 0;
          z-index: 20;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-right: 1px solid
            #e4eaf1;
        }

        .crla-brand {
          min-height: 84px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid
            #edf1f6;
        }

        .crla-brand-mark {
          width: 42px;
          height: 42px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background:
            linear-gradient(
              135deg,
              #1455a0 0%,
              #174f8d 100%
            );
          color: #ffffff;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -0.4px;
        }

        .crla-brand-name {
          font-size: 17px;
          font-weight: 800;
          color: #172337;
          line-height: 1.2;
        }

        .crla-brand-subtitle {
          margin-top: 3px;
          font-size: 11px;
          color: #8390a3;
        }

        .crla-nav {
          flex: 1;
          padding: 18px 12px;
        }

        .crla-nav-label {
          padding: 7px 12px 10px;
          color: #98a4b5;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.9px;
          text-transform: uppercase;
        }

        .crla-nav-button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 44px;
          margin-bottom: 4px;
          padding: 0 13px;
          border: none;
          border-radius: 9px;
          background: transparent;
          color: #5f6e82;
          font-size: 13px;
          font-weight: 600;
          text-align: left;
          cursor: pointer;
          transition:
            background 0.2s ease,
            color 0.2s ease;
        }

        .crla-nav-button:hover {
          background: #f4f7fb;
          color: #1455a0;
        }

        .crla-nav-button.active {
          background: #edf4fd;
          color: #1455a0;
          box-shadow:
            inset 3px 0 0 #1455a0;
        }

        .crla-nav-icon {
          width: 20px;
          text-align: center;
          font-size: 14px;
        }

        .crla-sidebar-bottom {
          padding: 14px 12px 16px;
          border-top: 1px solid
            #edf1f6;
        }

        .crla-sidebar-user {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 9px;
          margin-bottom: 8px;
        }

        .crla-avatar {
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background:
            linear-gradient(
              135deg,
              #1455a0,
              #2474c6
            );
          color: #ffffff;
          font-size: 13px;
          font-weight: 800;
        }

        .crla-user-details {
          min-width: 0;
        }

        .crla-user-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #24334a;
          font-size: 12px;
          font-weight: 700;
        }

        .crla-user-role {
          margin-top: 2px;
          color: #8a97a8;
          font-size: 10px;
          text-transform: capitalize;
        }

        .crla-logout {
          color: #c92335 !important;
        }

        .crla-logout:hover {
          background: #fff3f4 !important;
          color: #c92335 !important;
        }

        /* ============================================================
           MAIN
           ============================================================ */

        .crla-main {
          flex: 1;
          min-width: 0;
          margin-left: 240px;
        }

        .crla-topbar {
          min-height: 76px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 0 30px;
          background: #ffffff;
          border-bottom: 1px solid
            #e4eaf1;
        }

        .crla-topbar-left {
          min-width: 0;
        }

        .crla-topbar-title {
          color: #172337;
          font-size: 22px;
          font-weight: 800;
          line-height: 1.2;
        }

        .crla-topbar-user {
          max-width: 40%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #627187;
          font-size: 13px;
          font-weight: 600;
        }

        .crla-content {
          padding: 28px 30px 40px;
        }

        .crla-page-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 20px;
        }

        .crla-page-heading h1 {
          margin: 0;
          color: #172337;
          font-size: 24px;
          font-weight: 800;
        }

        .crla-page-heading p {
          margin: 5px 0 0;
          color: #78869a;
          font-size: 13px;
          line-height: 1.5;
        }

        .crla-actions {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
        }

        .crla-btn {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 15px;
          border-radius: 8px;
          border: 1px solid transparent;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition:
            transform 0.18s ease,
            box-shadow 0.18s ease,
            background 0.18s ease;
        }

        .crla-btn:hover {
          transform: translateY(
            -1px
          );
        }

        .crla-btn-primary {
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

        .crla-btn-primary:hover {
          background: #104888;
        }

        .crla-btn-red {
          background: #c92335;
          color: #ffffff;
          box-shadow:
            0 5px 14px
              rgba(
                201,
                35,
                53,
                0.14
              );
        }

        .crla-btn-red:hover {
          background: #b31e2e;
        }

        .crla-btn-outline {
          background: #ffffff;
          color: #1455a0;
          border-color:
            #d4ddea;
        }

        .crla-btn-outline:hover {
          background: #f6f9fd;
        }

        .crla-btn-danger-outline {
          background: #ffffff;
          color: #c92335;
          border-color:
            #f0c8cd;
        }

        .crla-btn-danger-outline:hover {
          background: #fff5f6;
        }

        /* ============================================================
           HOME
           ============================================================ */

        .crla-home-card {
          background: #ffffff;
          border: 1px solid
            #e2e8f0;
          border-radius: 14px;
          padding: 22px;
          box-shadow:
            0 8px 24px
              rgba(
                30,
                53,
                83,
                0.05
              );
        }

        .crla-home-card h2 {
          margin: 0 0 6px;
          color: #172337;
          font-size: 17px;
          font-weight: 800;
        }

        .crla-home-card p {
          margin: 0;
          color: #748196;
          font-size: 13px;
          line-height: 1.6;
        }

        .crla-quick-actions {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 16px;
          margin-top: 16px;
        }

        .crla-quick-card {
          padding: 20px;
          background: #ffffff;
          border: 1px solid
            #e2e8f0;
          border-radius: 14px;
          box-shadow:
            0 8px 24px
              rgba(
                30,
                53,
                83,
                0.045
              );
        }

        .crla-quick-icon {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 800;
        }

        .crla-quick-icon.blue {
          background: #edf4fd;
          color: #1455a0;
        }

        .crla-quick-icon.red {
          background: #fff0f2;
          color: #c92335;
        }

        .crla-quick-card h3 {
          margin: 0 0 6px;
          color: #172337;
          font-size: 15px;
          font-weight: 800;
        }

        .crla-quick-card p {
          margin: 0;
          color: #768499;
          font-size: 12px;
          line-height: 1.6;
        }

        .crla-quick-card .crla-btn {
          margin-top: 16px;
        }

        .crla-empty-card {
          margin-top: 16px;
          padding: 42px 25px;
          text-align: center;
          background: #ffffff;
          border: 1px solid
            #e2e8f0;
          border-radius: 14px;
        }

        .crla-empty-icon {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px;
          border-radius: 50%;
          background: #edf4fd;
          color: #1455a0;
          font-size: 16px;
          font-weight: 800;
        }

        .crla-empty-card h3 {
          margin: 0 0 6px;
          color: #26364d;
          font-size: 15px;
        }

        .crla-empty-card p {
          margin: 0 auto;
          max-width: 500px;
          color: #8190a4;
          font-size: 12px;
          line-height: 1.6;
        }

        /* ============================================================
           COMMON CARD
           ============================================================ */

        .crla-card {
          background: #ffffff;
          border: 1px solid
            #e2e8f0;
          border-radius: 14px;
          box-shadow:
            0 8px 24px
              rgba(
                30,
                53,
                83,
                0.045
              );
        }

        .crla-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 17px 20px;
          border-bottom: 1px solid
            #edf1f6;
        }

        .crla-card-header h2 {
          margin: 0;
          color: #25364d;
          font-size: 15px;
          font-weight: 800;
        }

        .crla-card-body {
          padding: 20px;
        }

        /* ============================================================
           ASSESS LEARNERS
           ============================================================ */

        .crla-filter-row {
          display: grid;
          grid-template-columns:
            1.6fr
            0.8fr
            0.8fr;
          gap: 10px;
          margin-bottom: 16px;
        }

        .crla-input,
        .crla-select,
        .crla-textarea {
          width: 100%;
          min-height: 40px;
          padding: 0 12px;
          border: 1px solid
            #d6dfe9;
          border-radius: 8px;
          background: #ffffff;
          color: #25364d;
          outline: none;
          font-size: 12px;
        }

        .crla-textarea {
          min-height: 130px;
          padding: 11px 12px;
          resize: vertical;
        }

        .crla-input:focus,
        .crla-select:focus,
        .crla-textarea:focus {
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

        .crla-learners-list {
          display: grid;
          gap: 10px;
        }

        .crla-learner-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 15px;
          border: 1px solid
            #e5eaf1;
          border-radius: 11px;
          background: #ffffff;
        }

        .crla-learner-main {
          min-width: 0;
        }

        .crla-learner-name {
          color: #26364d;
          font-size: 13px;
          font-weight: 800;
        }

        .crla-learner-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 9px;
          margin-top: 5px;
          color: #7b899b;
          font-size: 11px;
        }

        .crla-status {
          display: inline-flex;
          align-items: center;
          margin-top: 8px;
          padding: 4px 8px;
          border-radius: 999px;
          background: #f1f5f9;
          color: #627187;
          font-size: 10px;
          font-weight: 700;
        }

        .crla-learner-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          flex-shrink: 0;
        }

        /* ============================================================
           RECORDS
           ============================================================ */

        .crla-tabs {
          display: flex;
          gap: 6px;
          padding: 5px;
          background: #f5f8fc;
          border: 1px solid
            #e1e7ef;
          border-radius: 10px;
        }

        .crla-tab {
          min-height: 36px;
          padding: 0 13px;
          border: none;
          border-radius: 7px;
          background: transparent;
          color: #68788d;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
        }

        .crla-tab.active {
          background: #ffffff;
          color: #1455a0;
          box-shadow:
            0 2px 6px
              rgba(
                30,
                53,
                83,
                0.06
              );
        }

        .crla-record-tools {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 15px;
        }

        .crla-record-table-wrap {
          overflow-x: auto;
          border: 1px solid
            #e3e8ef;
          border-radius: 10px;
        }

        .crla-record-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 900px;
        }

        .crla-record-table th {
          padding: 11px 12px;
          text-align: left;
          background: #f6f8fb;
          color: #6b7a8d;
          border-bottom: 1px solid
            #e3e8ef;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.35px;
        }

        .crla-record-table td {
          padding: 11px 12px;
          color: #415269;
          border-bottom: 1px solid
            #edf1f6;
          font-size: 11px;
        }

        .crla-record-table tbody
          tr:last-child
          td {
          border-bottom: none;
        }

        /* ============================================================
           CONTENT MANAGEMENT
           ============================================================ */

        .crla-content-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 15px;
        }

        .crla-activity-table-wrap {
          overflow-x: auto;
          border: 1px solid
            #e3e8ef;
          border-radius: 10px;
        }

        .crla-activity-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 620px;
        }

        .crla-activity-table th {
          padding: 11px 13px;
          text-align: left;
          background: #f6f8fb;
          color: #6a798d;
          border-bottom: 1px solid
            #e2e8ef;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.35px;
        }

        .crla-activity-table td {
          padding: 12px 13px;
          border-bottom: 1px solid
            #edf1f6;
          color: #42536a;
          font-size: 11px;
          vertical-align: top;
        }

        .crla-activity-table tr:last-child
          td {
          border-bottom: none;
        }

        .crla-activity-actions {
          display: flex;
          gap: 6px;
        }

        .crla-small-btn {
          min-height: 32px;
          padding: 0 10px;
          border-radius: 7px;
          border: 1px solid
            #d7e0ea;
          background: #ffffff;
          color: #1455a0;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .crla-small-btn.delete {
          color: #c92335;
          border-color:
            #efc7cd;
        }

        /* ============================================================
           ANALYTICS
           ============================================================ */

        .crla-analytics-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 16px;
        }

        .crla-analytics-card {
          padding: 20px;
        }

        .crla-analytics-card h3 {
          margin: 0 0 8px;
          color: #26364d;
          font-size: 14px;
          font-weight: 800;
        }

        .crla-analytics-card p {
          margin: 0;
          color: #7a889a;
          font-size: 11px;
          line-height: 1.6;
        }

        .crla-progress-box {
          margin-top: 17px;
        }

        .crla-progress-label {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          color: #5e6f84;
          font-size: 10px;
          font-weight: 700;
        }

        .crla-progress {
          height: 8px;
          overflow: hidden;
          border-radius: 99px;
          background: #edf1f5;
        }

        .crla-progress-fill {
          height: 100%;
          border-radius: inherit;
        }

        .crla-progress-fill.blue {
          width: 0%;
          background: #1455a0;
        }

        .crla-progress-fill.red {
          width: 0%;
          background: #c92335;
        }

        /* ============================================================
           PROFILE
           ============================================================ */

        .crla-profile-grid {
          display: grid;
          grid-template-columns:
            0.9fr
            1.1fr;
          gap: 16px;
        }

        .crla-profile-summary {
          text-align: center;
          padding: 30px 20px;
        }

        .crla-profile-avatar {
          width: 72px;
          height: 72px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 13px;
          border-radius: 50%;
          background:
            linear-gradient(
              135deg,
              #1455a0,
              #2b78c7
            );
          color: #ffffff;
          font-size: 21px;
          font-weight: 800;
        }

        .crla-profile-name {
          color: #26364d;
          font-size: 17px;
          font-weight: 800;
        }

        .crla-profile-role {
          margin-top: 5px;
          color: #8794a6;
          font-size: 11px;
          text-transform: capitalize;
        }

        .crla-profile-badge {
          display: inline-flex;
          margin-top: 15px;
          padding: 6px 10px;
          border-radius: 999px;
          background: #edf4fd;
          color: #1455a0;
          font-size: 10px;
          font-weight: 800;
        }

        .crla-profile-form {
          display: grid;
          gap: 14px;
        }

        .crla-field {
          display: grid;
          gap: 7px;
        }

        .crla-field label {
          color: #596a80;
          font-size: 11px;
          font-weight: 800;
        }

        .crla-profile-message {
          padding: 10px 12px;
          border-radius: 8px;
          background: #eef7f0;
          color: #2a7041;
          font-size: 11px;
          line-height: 1.5;
        }

        .crla-profile-message.error {
          background: #fff1f2;
          color: #a62030;
        }

        /* ============================================================
           MODALS
           ============================================================ */

        .crla-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(
            18,
            29,
            46,
            0.42
          );
          backdrop-filter: blur(
            3px
          );
        }

        .crla-modal {
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
          background: #ffffff;
          border-radius: 15px;
          border: 1px solid
            #e1e7ef;
          box-shadow:
            0 22px 60px
              rgba(
                20,
                38,
                63,
                0.2
              );
        }

        .crla-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 17px 20px;
          border-bottom: 1px solid
            #edf1f5;
        }

        .crla-modal-header h2 {
          margin: 0;
          color: #26364d;
          font-size: 15px;
          font-weight: 800;
        }

        .crla-close {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 7px;
          background: #f5f7fa;
          color: #69798c;
          cursor: pointer;
        }

        .crla-modal-body {
          padding: 20px;
        }

        .crla-form-grid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 13px;
        }

        .crla-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 20px;
          padding-top: 15px;
          border-top: 1px solid
            #edf1f5;
        }

        /* ============================================================
           MOBILE
           ============================================================ */

        @media (max-width: 1000px) {
          .crla-sidebar {
            width: 74px;
          }

          .crla-brand {
            justify-content: center;
            padding-left: 10px;
            padding-right: 10px;
          }

          .crla-brand-name,
          .crla-brand-subtitle,
          .crla-nav-label,
          .crla-nav-text,
          .crla-user-details {
            display: none;
          }

          .crla-nav-button {
            justify-content: center;
            padding-left: 0;
            padding-right: 0;
          }

          .crla-sidebar-user {
            justify-content: center;
          }

          .crla-main {
            margin-left: 74px;
          }

          .crla-topbar {
            padding-left: 22px;
            padding-right: 22px;
          }

          .crla-content {
            padding-left: 22px;
            padding-right: 22px;
          }

          .crla-profile-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .crla-topbar {
            min-height: 64px;
          }

          .crla-topbar-title {
            font-size: 18px;
          }

          .crla-topbar-user {
            display: none;
          }

          .crla-content {
            padding: 20px 16px 30px;
          }

          .crla-page-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .crla-page-heading h1 {
            font-size: 21px;
          }

          .crla-quick-actions,
          .crla-analytics-grid,
          .crla-form-grid {
            grid-template-columns: 1fr;
          }

          .crla-filter-row {
            grid-template-columns: 1fr;
          }

          .crla-learner-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .crla-learner-actions {
            width: 100%;
          }

          .crla-learner-actions .crla-btn {
            flex: 1;
          }
        }
      `}</style>

      <main className="crla-dashboard">
        {/* ==========================================================
            SIDEBAR
            ========================================================== */}

        <aside className="crla-sidebar">
          <div className="crla-brand">
            <div className="crla-brand-mark">
              CRL
            </div>

            <div>
              <div className="crla-brand-name">
                CRL-App
              </div>

              <div className="crla-brand-subtitle">
                Literacy Assessment
              </div>
            </div>
          </div>

          <nav className="crla-nav">
            <div className="crla-nav-label">
              Main Menu
            </div>

            <button
              type="button"
              className={`crla-nav-button ${
                activeTab ===
                "dashboard"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                navigateTab(
                  "dashboard"
                )
              }
            >
              <span className="crla-nav-icon">
                ⌂
              </span>

              <span className="crla-nav-text">
                Dashboard
              </span>
            </button>

            <button
              type="button"
              className={`crla-nav-button ${
                activeTab ===
                "assess"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                navigateTab(
                  "assess"
                )
              }
            >
              <span className="crla-nav-icon">
                ▶
              </span>

              <span className="crla-nav-text">
                Conduct Assessment
              </span>
            </button>

            <button
              type="button"
              className={`crla-nav-button ${
                activeTab ===
                "records"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                navigateTab(
                  "records"
                )
              }
            >
              <span className="crla-nav-icon">
                ▤
              </span>

              <span className="crla-nav-text">
                Assessment Records
              </span>
            </button>

            <button
              type="button"
              className={`crla-nav-button ${
                activeTab ===
                "content"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                navigateTab(
                  "content"
                )
              }
            >
              <span className="crla-nav-icon">
                ◫
              </span>

              <span className="crla-nav-text">
                Manage Activities
              </span>
            </button>

            <button
              type="button"
              className={`crla-nav-button ${
                activeTab ===
                "analytics"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                navigateTab(
                  "analytics"
                )
              }
            >
              <span className="crla-nav-icon">
                %
              </span>

              <span className="crla-nav-text">
                Analytics
              </span>
            </button>

            <button
              type="button"
              className={`crla-nav-button ${
                activeTab ===
                "profile"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                navigateTab(
                  "profile"
                )
              }
            >
              <span className="crla-nav-icon">
                ●
              </span>

              <span className="crla-nav-text">
                Profile
              </span>
            </button>
          </nav>

          <div className="crla-sidebar-bottom">
            <div className="crla-sidebar-user">
              <div className="crla-avatar">
                {initials ||
                  "T"}
              </div>

              <div className="crla-user-details">
                <div className="crla-user-name">
                  {displayName}
                </div>

                <div className="crla-user-role">
                  {user?.role ||
                    "teacher"}
                </div>
              </div>
            </div>

            <button
              type="button"
              className="crla-nav-button crla-logout"
              onClick={logout}
            >
              <span className="crla-nav-icon">
                ↪
              </span>

              <span className="crla-nav-text">
                Logout
              </span>
            </button>
          </div>
        </aside>

        {/* ==========================================================
            MAIN
            ========================================================== */}

        <section className="crla-main">
          <header className="crla-topbar">
            <div className="crla-topbar-left">
              <div className="crla-topbar-title">
                CRL-App
              </div>
            </div>

            <div className="crla-topbar-user">
              {displayName}
            </div>
          </header>

          <div className="crla-content">
            {/* ======================================================
                HOME / DASHBOARD
                ====================================================== */}

            {activeTab ===
              "dashboard" && (
              <>
                <div className="crla-page-heading">
                  <div>
                    <h1>
                      Dashboard
                    </h1>

                    <p>
                      Overview and quick access to your CRLA assessment tools.
                    </p>
                  </div>
                </div>

                <section className="crla-home-card">
                  <h2>
                    Welcome to CRL-App
                  </h2>

                  <p>
                    Manage Comprehensive Rapid Literacy Assessment activities,
                    conduct learner assessments, and review assessment records
                    from one place.
                  </p>
                </section>

                <section className="crla-quick-actions">
                  <div className="crla-quick-card">
                    <div className="crla-quick-icon blue">
                      ▶
                    </div>

                    <h3>
                      Conduct Assessment
                    </h3>

                    <p>
                      Select a learner and open the teacher-controlled assessment
                      interface.
                    </p>

                    <button
                      type="button"
                      className="crla-btn crla-btn-primary"
                      onClick={
                        startAssessment
                      }
                    >
                      Start Assessment
                    </button>
                  </div>

                  <div className="crla-quick-card">
                    <div className="crla-quick-icon red">
                      ▣
                    </div>

                    <h3>
                      Learner Interface
                    </h3>

                    <p>
                      Open the learner-facing page on another device and connect
                      using the assessment code.
                    </p>

                    <button
                      type="button"
                      className="crla-btn crla-btn-red"
                      onClick={
                        openLearnerPage
                      }
                    >
                      Open Learner Page
                    </button>
                  </div>
                </section>

                <section className="crla-empty-card">
                  <div className="crla-empty-icon">
                    ✓
                  </div>

                  <h3>
                    Recent Assessments
                  </h3>

                  <p>
                    Completed assessment records will appear here once learners
                    have completed their CRLA assessments.
                  </p>
                </section>
              </>
            )}

            {/* ======================================================
                ASSESS
                ====================================================== */}

            {activeTab ===
              "assess" && (
              <>
                <div className="crla-page-heading">
                  <div>
                    <h1>
                      Conduct Assessment
                    </h1>

                    <p>
                      Select a learner before starting a teacher-led assessment.
                    </p>
                  </div>

                  <div className="crla-actions">
                    <button
                      type="button"
                      className="crla-btn crla-btn-primary"
                      onClick={
                        startAssessment
                      }
                    >
                      Open Assessment Controller
                    </button>

                    <button
                      type="button"
                      className="crla-btn crla-btn-outline"
                      onClick={() =>
                        setShowAddLearner(
                          true
                        )
                      }
                    >
                      + Add Learner
                    </button>
                  </div>
                </div>

                <section className="crla-card">
                  <div className="crla-card-header">
                    <h2>
                      Enrolled Learners
                    </h2>
                  </div>

                  <div className="crla-card-body">
                    <div className="crla-filter-row">
                      <input
                        className="crla-input"
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
                        className="crla-select"
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
                        className="crla-select"
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
                    </div>

                    {filteredLearners.length ===
                    0 ? (
                      <div className="crla-empty-card">
                        <div className="crla-empty-icon">
                          +
                        </div>

                        <h3>
                          No learners registered
                        </h3>

                        <p>
                          Add a learner to begin building your class roster.
                        </p>

                        <button
                          type="button"
                          className="crla-btn crla-btn-primary"
                          style={{
                            marginTop:
                              14,
                          }}
                          onClick={() =>
                            setShowAddLearner(
                              true
                            )
                          }
                        >
                          Add New Learner
                        </button>
                      </div>
                    ) : (
                      <div className="crla-learners-list">
                        {filteredLearners.map(
                          (
                            learner
                          ) => (
                            <div
                              className="crla-learner-row"
                              key={
                                learner.id
                              }
                            >
                              <div className="crla-learner-main">
                                <div className="crla-learner-name">
                                  {
                                    learner.lastName
                                  }
                                  ,{" "}
                                  {
                                    learner.firstName
                                  }
                                </div>

                                <div className="crla-learner-meta">
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

                                <span className="crla-status">
                                  {
                                    learner.status
                                  }
                                </span>
                              </div>

                              <div className="crla-learner-actions">
                                <button
                                  type="button"
                                  className="crla-btn crla-btn-primary"
                                  onClick={
                                    startAssessment
                                  }
                                >
                                  BoSY
                                </button>

                                <button
                                  type="button"
                                  className="crla-btn crla-btn-outline"
                                  onClick={
                                    startAssessment
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

            {/* ======================================================
                RECORDS
                ====================================================== */}

            {activeTab ===
              "records" && (
              <>
                <div className="crla-page-heading">
                  <div>
                    <h1>
                      Assessment Records
                    </h1>

                    <p>
                      Review learner assessment results by assessment period.
                    </p>
                  </div>

                  <div className="crla-tabs">
                    <button
                      type="button"
                      className={`crla-tab ${
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
                      className={`crla-tab ${
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

                <section className="crla-card">
                  <div className="crla-card-header">
                    <h2>
                      {recordPeriod} Records
                    </h2>
                  </div>

                  <div className="crla-card-body">
                    <div className="crla-record-tools">
                      <input
                        className="crla-input"
                        style={{
                          maxWidth:
                            340,
                        }}
                        type="text"
                        placeholder="Search by learner name or LRN..."
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
                    </div>

                    {filteredRecords.length ===
                    0 ? (
                      <div className="crla-empty-card">
                        <div className="crla-empty-icon">
                          ▤
                        </div>

                        <h3>
                          No assessment records yet
                        </h3>

                        <p>
                          Once a CRLA assessment is completed, the learner's
                          scores and reading profile will be displayed here.
                        </p>
                      </div>
                    ) : (
                      <div className="crla-record-table-wrap">
                        <table className="crla-record-table">
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
                                record
                              ) => (
                                <tr
                                  key={
                                    record.id
                                  }
                                >
                                  <td>
                                    {
                                      record.lrn
                                    }
                                  </td>

                                  <td>
                                    {
                                      record.name
                                    }
                                  </td>

                                  <td>
                                    {
                                      record.task1
                                    }
                                  </td>

                                  <td>
                                    {
                                      record.task2
                                    }
                                  </td>

                                  <td>
                                    {
                                      record.total
                                    }
                                  </td>

                                  <td>
                                    {
                                      record.readingLevel
                                    }
                                  </td>

                                  <td>
                                    {
                                      record.readingProfile
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

            {/* ======================================================
                CONTENT
                ====================================================== */}

            {activeTab ===
              "content" && (
              <>
                <div className="crla-page-heading">
                  <div>
                    <h1>
                      Manage Activities
                    </h1>

                    <p>
                      Manage the letters, words, and reading passages used by the
                      assessment.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="crla-btn crla-btn-primary"
                    onClick={
                      openNewActivity
                    }
                  >
                    + Add New Item
                  </button>
                </div>

                <section className="crla-card">
                  <div className="crla-card-body">
                    <div className="crla-content-controls">
                      <div className="crla-tabs">
                        <button
                          type="button"
                          className={`crla-tab ${
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
                          className={`crla-tab ${
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

                      <div className="crla-tabs">
                        <button
                          type="button"
                          className={`crla-tab ${
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
                          className={`crla-tab ${
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
                          className={`crla-tab ${
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
                      <div className="crla-empty-card">
                        <div className="crla-empty-icon">
                          +
                        </div>

                        <h3>
                          No activities available
                        </h3>

                        <p>
                          Add an item to this assessment period.
                        </p>
                      </div>
                    ) : (
                      <div className="crla-activity-table-wrap">
                        <table className="crla-activity-table">
                          <thead>
                            <tr>
                              <th
                                style={{
                                  width:
                                    70,
                                }}
                              >
                                #
                              </th>

                              <th>
                                Content
                              </th>

                              <th
                                style={{
                                  width:
                                    170,
                                }}
                              >
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
                                    {index +
                                      1}
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
                                    <div className="crla-activity-actions">
                                      <button
                                        type="button"
                                        className="crla-small-btn"
                                        onClick={() =>
                                          openEditActivity(
                                            index
                                          )
                                        }
                                      >
                                        Edit
                                      </button>

                                      <button
                                        type="button"
                                        className="crla-small-btn delete"
                                        onClick={() =>
                                          deleteActivity(
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

            {/* ======================================================
                ANALYTICS
                ====================================================== */}

            {activeTab ===
              "analytics" && (
              <>
                <div className="crla-page-heading">
                  <div>
                    <h1>
                      Analytics
                    </h1>

                    <p>
                      Monitor assessment progress and reading-profile trends.
                    </p>
                  </div>
                </div>

                <div className="crla-analytics-grid">
                  <section className="crla-card crla-analytics-card">
                    <h3>
                      BoSY vs MoSY
                    </h3>

                    <p>
                      Comparative analytics will populate here as assessment
                      results are recorded.
                    </p>

                    <div className="crla-progress-box">
                      <div className="crla-progress-label">
                        <span>
                          BoSY completion
                        </span>

                        <span>
                          0%
                        </span>
                      </div>

                      <div className="crla-progress">
                        <div className="crla-progress-fill blue" />
                      </div>
                    </div>

                    <div className="crla-progress-box">
                      <div className="crla-progress-label">
                        <span>
                          MoSY completion
                        </span>

                        <span>
                          0%
                        </span>
                      </div>

                      <div className="crla-progress">
                        <div className="crla-progress-fill red" />
                      </div>
                    </div>
                  </section>

                  <section className="crla-card crla-analytics-card">
                    <h3>
                      Reading Profile Distribution
                    </h3>

                    <p>
                      Low Emerging, High Emerging, Developing, Transitioning, and
                      Grade Level results will be summarized here.
                    </p>

                    <div
                      style={{
                        marginTop:
                          18,
                        display:
                          "grid",
                        gap: 9,
                      }}
                    >
                      {[
                        [
                          "Low Emerging",
                          "#c92335",
                        ],
                        [
                          "High Emerging",
                          "#d9534f",
                        ],
                        [
                          "Developing",
                          "#8795a7",
                        ],
                        [
                          "Transitioning",
                          "#5d7898",
                        ],
                        [
                          "Grade Level",
                          "#1455a0",
                        ],
                      ].map(
                        (item) => (
                          <div
                            key={
                              item[0]
                            }
                            style={{
                              display:
                                "flex",
                              alignItems:
                                "center",
                              justifyContent:
                                "space-between",
                              padding:
                                "10px 11px",
                              border:
                                "1px solid #edf1f5",
                              borderRadius:
                                8,
                              background:
                                "#ffffff",
                            }}
                          >
                            <div
                              style={{
                                display:
                                  "flex",
                                alignItems:
                                  "center",
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  width:
                                    8,
                                  height:
                                    8,
                                  display:
                                    "block",
                                  borderRadius:
                                    "50%",
                                  background:
                                    item[1],
                                }}
                              />

                              <span
                                style={{
                                  color:
                                    "#5e6f84",
                                  fontSize:
                                    11,
                                }}
                              >
                                {
                                  item[0]
                                }
                              </span>
                            </div>

                            <span
                              style={{
                                color:
                                  "#26364d",
                                fontSize:
                                  11,
                                fontWeight:
                                  800,
                              }}
                            >
                              0
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}

            {/* ======================================================
                PROFILE
                ====================================================== */}

            {activeTab ===
              "profile" && (
              <>
                <div className="crla-page-heading">
                  <div>
                    <h1>
                      My Profile
                    </h1>

                    <p>
                      View and manage your teacher account information.
                    </p>
                  </div>
                </div>

                <div className="crla-profile-grid">
                  <section className="crla-card crla-profile-summary">
                    <div className="crla-profile-avatar">
                      {initials ||
                        "T"}
                    </div>

                    <div className="crla-profile-name">
                      {displayName}
                    </div>

                    <div className="crla-profile-role">
                      {user?.role ||
                        "teacher"}
                    </div>

                    <div className="crla-profile-badge">
                      Grade 3
                    </div>
                  </section>

                  <section className="crla-card">
                    <div className="crla-card-header">
                      <h2>
                        Account Information
                      </h2>
                    </div>

                    <div className="crla-card-body">
                      <div className="crla-profile-form">
                        <div className="crla-field">
                          <label>
                            Username
                          </label>

                          <input
                            className="crla-input"
                            value={
                              user?.username ||
                              ""
                            }
                            disabled
                          />
                        </div>

                        <div className="crla-field">
                          <label>
                            Full Name
                          </label>

                          <input
                            className="crla-input"
                            value={
                              profileForm.full_name
                            }
                            onChange={(
                              event
                            ) =>
                              setProfileForm(
                                (
                                  current
                                ) => ({
                                  ...current,
                                  full_name:
                                    event
                                      .target
                                      .value,
                                })
                              )
                            }
                          />
                        </div>

                        <div className="crla-field">
                          <label>
                            Section
                          </label>

                          <input
                            className="crla-input"
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

                        <div className="crla-field">
                          <label>
                            New Password
                          </label>

                          <input
                            className="crla-input"
                            type="password"
                            placeholder="Leave blank to keep current password"
                            value={
                              profileForm.new_password
                            }
                            onChange={(
                              event
                            ) =>
                              setProfileForm(
                                (
                                  current
                                ) => ({
                                  ...current,
                                  new_password:
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
                            className={`crla-profile-message ${
                              profileMessage
                                .toLowerCase()
                                .includes(
                                  "unable"
                                ) ||
                              profileMessage
                                .toLowerCase()
                                .includes(
                                  "error"
                                )
                                ? "error"
                                : ""
                            }`}
                          >
                            {
                              profileMessage
                            }
                          </div>
                        ) : null}

                        <div
                          className="crla-actions"
                          style={{
                            justifyContent:
                              "flex-end",
                          }}
                        >
                          <button
                            type="button"
                            className="crla-btn crla-btn-primary"
                            disabled={
                              profileSaving
                            }
                            onClick={
                              saveProfile
                            }
                          >
                            {profileSaving
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
        </section>
      </main>

      {/* ============================================================
          ADD LEARNER MODAL
          ============================================================ */}

      {showAddLearner ? (
        <div
          className="crla-modal-overlay"
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
          <section className="crla-modal">
            <div className="crla-modal-header">
              <h2>
                Add New Learner
              </h2>

              <button
                type="button"
                className="crla-close"
                onClick={() =>
                  setShowAddLearner(
                    false
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="crla-modal-body">
              <div className="crla-form-grid">
                <div className="crla-field">
                  <label>
                    LRN *
                  </label>

                  <input
                    className="crla-input"
                    type="text"
                    maxLength={12}
                    placeholder="12-digit LRN"
                    value={
                      newLearner.lrn
                    }
                    onChange={(
                      event
                    ) =>
                      setNewLearner(
                        (current) => ({
                          ...current,
                          lrn:
                            event
                              .target
                              .value,
                        })
                      )
                    }
                  />
                </div>

                <div className="crla-field">
                  <label>
                    Last Name *
                  </label>

                  <input
                    className="crla-input"
                    type="text"
                    placeholder="Enter last name"
                    value={
                      newLearner.lastName
                    }
                    onChange={(
                      event
                    ) =>
                      setNewLearner(
                        (current) => ({
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

                <div className="crla-field">
                  <label>
                    First Name *
                  </label>

                  <input
                    className="crla-input"
                    type="text"
                    placeholder="Enter first name"
                    value={
                      newLearner.firstName
                    }
                    onChange={(
                      event
                    ) =>
                      setNewLearner(
                        (current) => ({
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

                <div className="crla-field">
                  <label>
                    Sex *
                  </label>

                  <select
                    className="crla-select"
                    value={
                      newLearner.sex
                    }
                    onChange={(
                      event
                    ) =>
                      setNewLearner(
                        (current) => ({
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

              <div className="crla-modal-actions">
                <button
                  type="button"
                  className="crla-btn crla-btn-outline"
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
                  className="crla-btn crla-btn-primary"
                  onClick={
                    addLearner
                  }
                >
                  Save Learner
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
          className="crla-modal-overlay"
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
          <section className="crla-modal">
            <div className="crla-modal-header">
              <h2>
                {editingActivityIndex ===
                -1
                  ? "Add New Item"
                  : "Edit Item"}
              </h2>

              <button
                type="button"
                className="crla-close"
                onClick={() =>
                  setShowActivityModal(
                    false
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="crla-modal-body">
              {activityTab ===
              "stories" ? (
                <div
                  style={{
                    display:
                      "grid",
                    gap: 13,
                  }}
                >
                  <div className="crla-field">
                    <label>
                      Story Title
                    </label>

                    <input
                      className="crla-input"
                      type="text"
                      placeholder="Enter story title"
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

                  <div className="crla-field">
                    <label>
                      Story Content
                    </label>

                    <textarea
                      className="crla-textarea"
                      placeholder="Enter story text"
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
                <div className="crla-field">
                  <label>
                    {activityTab ===
                    "letters"
                      ? "Letter"
                      : "Word"}
                  </label>

                  <input
                    className="crla-input"
                    type="text"
                    maxLength={
                      activityTab ===
                      "letters"
                        ? 1
                        : undefined
                    }
                    placeholder={
                      activityTab ===
                      "letters"
                        ? "Enter a letter"
                        : "Enter a word"
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

              <div className="crla-modal-actions">
                <button
                  type="button"
                  className="crla-btn crla-btn-outline"
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
                  className="crla-btn crla-btn-primary"
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
