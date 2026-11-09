'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import AssessmentLibrary from './AssessmentLibrary';
import ClassScopeSidebar from './ClassScopeSidebar';
import CoordinatorRecords from './CoordinatorRecords';
import SchoolAssessmentActivation from './SchoolAssessmentActivation';
import Select from './Select';
import TeacherAvatar from './TeacherAvatar';
import UnsavedChangesDialog from './UnsavedChangesDialog';
import WorkspaceLoading from './WorkspaceLoading';
import styles from './Coordinator.module.css';

const EMPTY = { schoolYears: [], sections: [] };
const PANELS = ['Assessment', 'Records', 'Assessment Contents'];

const CoordinatorConsole = forwardRef(function CoordinatorConsole(
  { api, onDirtyChange, onOpenLive },
  ref
) {
  const [panel, setPanel] = useState('Assessment');
  const [refresh, setRefresh] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [next, setNext] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('asc');
  const [teacher, setTeacher] = useState(null);
  const [catalog, setCatalog] = useState(EMPTY);
  const [year, setYear] = useState('');
  const [section, setSection] = useState('');
  const [report, setReport] = useState(null);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [error, setError] = useState('');
  const library = useRef(null);

  const dirtyChange = useCallback(
    (value) => {
      setDirty(value);
      onDirtyChange?.(value);
    },
    [onDirtyChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      save: () => library.current?.save(),
      discard: () => library.current?.discard(),
      warnIfInvalid: () => library.current?.warnIfInvalid(),
      notifySaveError: (reason) => library.current?.notifySaveError(reason),
      refresh: () => {
        if (dirty) return;
        setRefresh((value) => value + 1);
        library.current?.reload();
      },
    }),
    [dirty]
  );

  useEffect(() => {
    if (panel !== 'Records') return;
    let cancelled = false;
    setLoaded(false);
    api('coordinator_teachers', {
      query: `&q=${encodeURIComponent(search)}&sort=${sort}`,
    })
      .then((result) => {
        if (!cancelled) {
          setTeachers(result.teachers);
          setLoaded(true);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason.message);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, panel, search, sort, refresh]);

  useEffect(() => {
    if (!teacher) return;
    let cancelled = false;
    setClassesLoaded(false);
    setCatalog(EMPTY);
    api('coordinator_classes', { query: `&teacher_id=${teacher.id}` })
      .then((result) => {
        if (!cancelled) {
          setCatalog(result);
          setClassesLoaded(true);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason.message);
          setClassesLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, teacher, refresh, panel]);

  useEffect(() => {
    if (
      classesLoaded &&
      year &&
      !catalog.schoolYears.some(
        (item) =>
          item.id === year && !item.deletedAt && !item.definition?.deletedAt
      )
    ) {
      setYear('');
      setSection('');
      setReport(null);
    }
  }, [catalog, classesLoaded, year]);

  useEffect(() => {
    setReport(null);
    if (!teacher || !section) return;
    let cancelled = false;
    api('coordinator_report', {
      query: `&teacher_id=${teacher.id}&class_section_id=${encodeURIComponent(
        section
      )}`,
    })
      .then((result) => {
        if (!cancelled) setReport(result);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api, teacher, section, refresh]);

  const change = (destination) => {
    if (destination === panel) return;
    if (dirty) {
      library.current?.warnIfInvalid();
      setNext(destination);
      return;
    }
    setPanel(destination);
    setError('');
  };

  const finish = () => {
    setPanel(next);
    setNext(null);
    setError('');
  };

  return (
    <div className={styles.root}>
      <nav className={styles.toolbar} aria-label="Reading coordination">
        {PANELS.map((item) => (
          <button
            key={item}
            aria-current={panel === item ? 'page' : undefined}
            onClick={() => change(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {panel === 'Assessment' && (
        <SchoolAssessmentActivation api={api} refreshKey={refresh} />
      )}

      {panel === 'Records' &&
        (!teacher ? (
          <section className={styles.panel}>
            <h2>Teacher records</h2>
            <div className={styles.teacherSearch}>
              <input
                type="search"
                aria-label="Search teacher records"
                placeholder="Search teachers by name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select
                aria-label="Sort teacher records"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="asc">Name (A–Z)</option>
                <option value="desc">Name (Z–A)</option>
              </Select>
            </div>
            {!loaded ? (
              <WorkspaceLoading
                label="Loading teachers…"
                variant="teachers"
              />
            ) : (
              <div className={styles.teacherList}>
                {teachers.map((item) => (
                  <button
                    key={item.id}
                    className={`${styles.teacherCard} ${styles.recordTeacherCard}`}
                    onClick={() => {
                      setTeacher(item);
                      setYear('');
                      setSection('');
                      setError('');
                    }}
                  >
                    <TeacherAvatar name={item.fullName} photo={item.profilePhoto} />
                    <span className={styles.teacherIdentity}>
                      <strong>{item.fullName}</strong>
                      <span className={styles.sectionBadge}>
                        {item._count?.classSections || 0} section
                        {(item._count?.classSections || 0) > 1 ? 's' : ''}
                      </span>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
                {!teachers.length && (
                  <p className={styles.empty}>No matching teachers.</p>
                )}
              </div>
            )}
          </section>
        ) : (
          <>
            <div className={styles.toolbar}>
              <button
                aria-label="Back to teacher records"
                onClick={() => {
                  setTeacher(null);
                  setYear('');
                  setSection('');
                }}
              >
                ←
              </button>
              <TeacherAvatar name={teacher.fullName} photo={teacher.profilePhoto} />
              <h2>{teacher.fullName}</h2>
            </div>
            <ClassScopeSidebar
              title="Teacher’s records"
              loaded={classesLoaded}
              catalog={catalog}
              yearId={year}
              sectionId={section}
              onYearChange={(id) => {
                setYear(id);
                setSection('');
              }}
              onSectionChange={setSection}
            />
            {section ? (
              report ? (
                <CoordinatorRecords
                  report={report}
                  teacherId={teacher.id}
                  sectionId={section}
                />
              ) : (
                <WorkspaceLoading
                  label="Loading assessment records…"
                  variant="records"
                />
              )
            ) : (
              classesLoaded && (
                <section className={styles.panel}>
                  <p className={styles.empty}>
                    Choose a school year and section to view assessment records.
                  </p>
                </section>
              )
            )}
          </>
        ))}

      {panel === 'Assessment Contents' && (
        <AssessmentLibrary
          ref={library}
          api={api}
          editable
          onOpenLive={onOpenLive}
          onDirtyChange={dirtyChange}
          onBack={() => change('Assessment')}
        />
      )}

      {next && (
        <UnsavedChangesDialog
          onSaveError={(reason) => library.current?.notifySaveError(reason)}
          onSave={async () => {
            await library.current.save();
            finish();
          }}
          onKeepEditing={() => setNext(null)}
          onDiscard={() => {
            library.current?.discard();
            finish();
          }}
        />
      )}
    </div>
  );
});

export default CoordinatorConsole;
