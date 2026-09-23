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
            <Link href="#about" className={styles.headerLink}>About</Link>
          </header>

          <div className={styles.heroBody}>
            <p className={styles.sectionLabel}>01 / CRL-APP</p>
            <h1 id="landing-title">Reading progress,<br /><em>made clear.</em></h1>
            <div className={styles.heroIntro}>
              <p>
                A digital reading assessment that keeps teachers and learners focused on what matters.
              </p>
              <Link className={styles.textLink} href="#access">Choose your view</Link>
            </div>
          </div>

          <div className={styles.heroRail} aria-label="CRL-App highlights">
            <span>Teacher guided</span>
            <span>DepEd aligned</span>
            <span>Offline capable</span>
          </div>
        </section>

        <section className={styles.access} id="access" aria-labelledby="access-title">
          <div className={styles.sectionIntro}>
            <p className={styles.sectionLabel}>02 / ACCESS</p>
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
            <p className={styles.sectionLabel}>03 / PROGRESS</p>
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
            <p className={styles.sectionLabel}>04 / ABOUT</p>
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
