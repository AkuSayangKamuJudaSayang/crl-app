import Link from "next/link";
import TeacherDownloadButton from "./components/TeacherDownloadButton";
import styles from "./landing.module.css";

export const metadata = {
  title: "CRL-App | Reading assessment for Grade 3",
  description:
    "A teacher-guided digital reading assessment for Grade 3 learners of Tuyan Integrated School.",
};

export default function HomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="CRL-App home">
            CRL<span className={styles.brandDot}>.</span>App
          </Link>
          <span className={styles.headerNote}>GRADE 3 <span aria-hidden="true">/</span> READING ASSESSMENT</span>
        </header>

        <div className={styles.grid}>
          <section className={`${styles.tile} ${styles.intro}`} aria-labelledby="landing-title">
            <p className={styles.eyebrow}>TUYAN INTEGRATED SCHOOL</p>
            <h1 id="landing-title">A clearer view of<br /><em>every reader.</em></h1>
            <p className={styles.introCopy}>
              CRL-App brings the Comprehensive Rapid Literacy Assessment into a focused space for teachers and learners.
            </p>
          </section>

          <section className={`${styles.tile} ${styles.method}`} aria-label="The assessment">
            <span className={styles.sectionIndex}>THE ASSESSMENT <span>01 — 03</span></span>
            <div className={styles.methodRows}>
              <div><span>01</span> Letter sounds</div>
              <div><span>02</span> Word recognition</div>
              <div><span>03</span> Passage &amp; comprehension</div>
            </div>
          </section>

          <section className={`${styles.tile} ${styles.teacher}`} aria-labelledby="teacher-title">
            <div className={styles.tileHeading}>
              <span className={styles.sectionIndex}>FOR TEACHERS</span>
              <span className={styles.tileNumber}>01</span>
            </div>
            <div className={styles.tileContent}>
              <h2 id="teacher-title">Lead the assessment.</h2>
              <p>Record responses and review each learner&apos;s reading profile.</p>
              <div className={styles.teacherActions}>
                <Link className={styles.primaryAction} href="/login">Teacher login <span aria-hidden="true">↗</span></Link>
                <TeacherDownloadButton className={styles.secondaryAction} />
              </div>
            </div>
          </section>

          <section className={`${styles.tile} ${styles.learner}`} aria-labelledby="learner-title">
            <div className={styles.tileHeading}>
              <span className={styles.sectionIndex}>FOR LEARNERS</span>
              <span className={styles.tileNumber}>02</span>
            </div>
            <div className={styles.tileContent}>
              <h2 id="learner-title">Stay with the story.</h2>
              <p>A clear screen for each task, guided by the teacher.</p>
              <Link className={styles.learnerAction} href="/learner">Open learner app <span aria-hidden="true">↗</span></Link>
            </div>
          </section>

          <div className={`${styles.tile} ${styles.note}`}>
            <span className={styles.sectionIndex}>A CONSISTENT VIEW</span>
            <p>Follow reading progress from the beginning to the end of the school year.</p>
          </div>
          <div className={`${styles.tile} ${styles.periods}`} aria-label="Assessment periods">
            <span>BoSY</span><span>MoSY</span><span>EoSY</span>
          </div>
        </div>

        <footer className={styles.footer}>
          <span>CRL-App</span>
          <span>Tuyan Integrated School · Grade 3</span>
        </footer>
      </div>
    </main>
  );
}
