import Image from "next/image";
import Link from "next/link";
import PrivacyNotice from "./components/PrivacyNotice";
import TeacherDownloadButton from "./components/TeacherDownloadButton";
import styles from "./landing.module.css";

export const metadata = {
  title: "CRL-App | Digital reading assessment",
  description:
    "A teacher-guided digital reading assessment and progress-monitoring tool for Grade 3 learners.",
};

export default function HomePage() {
  return (
    <main className={styles.page}>
      <PrivacyNotice />

      <div data-landing-content>
        <section className={styles.hero} aria-labelledby="landing-title">
          <header className={styles.header}>
            <Link href="/" className={styles.brand} aria-label="CRL-App home">
              <Image
                src="/crl-app-logo.png"
                alt="CRL-App"
                width={1883}
                height={755}
                priority
              />
            </Link>
          </header>

          <div className={styles.heroBody}>
            <div className={styles.heroStatement}>
              <h1 id="landing-title">Reading progress,<br /><em>made clear.</em></h1>
              <div className={styles.heroIntro}>
                <p>
                  A digital reading assessment that keeps teachers and learners focused on what matters.
                </p>
              </div>
            </div>

            <ul className={styles.heroFeatures} aria-label="CRL-App highlights">
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="m8.2 12.2 2.4 2.4 5.4-5.5" />
                </svg>
                <span>Aligned with DepEd</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4.5 8.2A12.8 12.8 0 0 1 12 5.8c2.8 0 5.4.9 7.5 2.4M7.4 11.4A8 8 0 0 1 12 10c1.2 0 2.4.3 3.4.8M10.4 14.7c.5-.2 1-.3 1.6-.3" />
                  <path d="m4 4 16 16" />
                </svg>
                <span>Offline capable</span>
              </li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="8" cy="7" r="2.7" />
                  <path d="M3.8 17.8v-2.1A4.2 4.2 0 0 1 8 11.5c1.3 0 2.4.5 3.2 1.4M14 6.5h6M14 10h4.5M14 13.5h5" />
                </svg>
                <span>Teacher guided</span>
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.access} id="access" aria-labelledby="access-title">
          <div className={styles.sectionIntro}>
            <h2 id="access-title">One system.<br />Two focused views.</h2>
          </div>

          <div className={styles.accessPanels}>
            <article className={`${styles.accessPanel} ${styles.teacherPanel}`}>
              <p className={styles.panelLabel}>TEACHER</p>
              <div>
                <h3>Guide and record.</h3>
                <p>Manage assessments, scores, and learner progress.</p>
                <div className={styles.teacherActions}>
                  <Link className={styles.teacherPrimary} href="/login">Teacher login</Link>
                  <TeacherDownloadButton className={styles.teacherSecondary} />
                </div>
              </div>
            </article>

            <article className={`${styles.accessPanel} ${styles.learnerPanel}`}>
              <p className={styles.panelLabel}>LEARNER</p>
              <div>
                <h3>Read with focus.</h3>
                <p>Enter a teacher-provided code to begin.</p>
                <Link className={styles.learnerAction} href="/learner">Open learner app</Link>
              </div>
            </article>
          </div>
        </section>

        <section className={styles.progress} aria-labelledby="progress-title">
          <div className={styles.sectionIntro}>
            <h2 id="progress-title">A consistent view<br />through the school year.</h2>
          </div>
          <ol className={styles.timeline} aria-label="Assessment periods">
            <li><span>01</span><strong>BoSY</strong><small>Beginning</small></li>
            <li><span>02</span><strong>MoSY</strong><small>Middle</small></li>
            <li><span>03</span><strong>EoSY</strong><small>End</small></li>
          </ol>
        </section>

        <section className={styles.about} id="about" aria-labelledby="about-title">
          <div className={styles.aboutHeading}>
            <h2 id="about-title">Built for clearer reading decisions.</h2>
          </div>
          <p className={styles.aboutCopy}>
            CRL-App digitalizes the Comprehensive Rapid Literacy Assessment for Grade 3. It supports teacher-led assessment, automated scoring, reading-profile classification, and progress monitoring—even when connectivity is limited.
          </p>
        </section>

        <footer className={styles.footer}>
          <span>© 2025 CRL-App</span>
          <span>Aligned with DepEd CRLA Standards</span>
        </footer>
      </div>
    </main>
  );
}
