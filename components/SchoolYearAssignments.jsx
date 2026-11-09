'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ClassDialog from './ClassDialog';
import NoticeDialog from './NoticeDialog';
import Select from './Select';
import WorkspaceLoading from './WorkspaceLoading';
import styles from './Coordinator.module.css';

export default function SchoolYearAssignments({ api, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState('desc');
  const [form, setForm] = useState(null);
  const [newYear, setNewYear] = useState('');
  const [password, setPassword] = useState('');
  const [deleteYear, setDeleteYear] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [notice, setNotice] = useState('');
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertSectionIds, setInsertSectionIds] = useState([]);
  const [insertError, setInsertError] = useState('');
  const [openSectionMenu, setOpenSectionMenu] = useState('');
  const generation = useRef(0);
  const pending = useRef(false);

  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true);
    try {
      const result = await api('school_setup');
      if (token === generation.current) setData(result);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load().catch((reason) => setError(reason.message));
    return () => {
      generation.current++;
    };
  }, [load, refreshKey]);

  useEffect(() => {
    if (!openSectionMenu) return;
    const close = (event) => {
      if (!event.target?.closest?.('[data-section-actions]')) {
        setOpenSectionMenu('');
      }
    };
    const escape = (event) => {
      if (event.key === 'Escape') setOpenSectionMenu('');
    };
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', escape);
    };
  }, [openSectionMenu]);

  const assignmentFor = (section, startYear = Number(year)) =>
    section.classes?.find(
      (assignment) =>
        assignment.schoolYear?.startYear === startYear &&
        !assignment.schoolYear?.deletedAt
    );

  const insertedFor = (section, startYear = Number(year)) => {
    if (Array.isArray(section.yearInsertions)) {
      return section.yearInsertions.some((row) => row.startYear === startYear);
    }
    const assignment = assignmentFor(section, startYear);
    return Boolean(assignment && !assignment.unassignedAt);
  };

  const assignedCount = (schoolYear) =>
    (data?.sections || []).filter((section) =>
      insertedFor(section, schoolYear.startYear)
    ).length;

  const years = useMemo(
    () =>
      [...(data?.years || [])]
        .filter((schoolYear) =>
          schoolYear.label.toLowerCase().includes(search.trim().toLowerCase())
        )
        .sort(
          (a, b) =>
            (a.startYear - b.startYear) * (order === 'desc' ? -1 : 1)
        ),
    [data, search, order]
  );

  const selected = data?.years.find(
    (schoolYear) => String(schoolYear.startYear) === year
  );
  const sections = data?.sections || [];
  const insertedSections = sections.filter((section) =>
    insertedFor(section)
  );
  const availableSections = sections.filter(
    (section) => !insertedFor(section)
  );
  const deleteTarget = data?.years.find(
    (schoolYear) => schoolYear.startYear === deleteYear
  );
  const deleteCount = sections.reduce(
    (count, section) =>
      count + (insertedFor(section, deleteYear) ? 1 : 0),
    0
  );

  const open = (kind, target) => {
    setDeleteYear(target?.startYear ?? null);
    setForm(kind);
    setNewYear('');
    setPassword('');
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (form === 'add') {
        await api('add_school_year', {
          body: { start_year: Number(newYear) },
        });
        setYear(newYear);
      } else {
        await api('delete_school_year', {
          body: {
            id: crypto.randomUUID(),
            start_year: deleteYear,
            expected_sections: deleteCount,
            empty_confirmation: deleteCount === 0,
            confirmation_password: password,
          },
        });
        if (Number(year) === deleteYear) setYear('');
      }
      setForm(null);
      void load().catch((reason) =>
        setError(`Saved, but the school-year list could not refresh. ${reason.message}`)
      );
    } catch (reason) {
      setError(reason.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const chooseTeacher = (section, value) => {
    const assignment = assignmentFor(section);
    const currentTeacher = assignment?.unassignedAt
      ? ''
      : String(assignment?.teacherId || '');
    if (
      busy ||
      loading ||
      pending.current ||
      currentTeacher === value
    ) {
      return;
    }
    const teacher = data.teachers.find(
      (candidate) => String(candidate.id) === value
    );
    if (teacher) {
      setError('');
      setConfirmation({
        section: { id: section.id, name: section.name },
        teacher: { id: teacher.id, fullName: teacher.fullName },
        startYear: Number(year),
      });
    }
  };

  const assign = async (section, value, startYear = Number(year)) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api('assign_section', {
        body: {
          start_year: startYear,
          section_id: section.id,
          teacher_id: value ? Number(value) : null,
        },
      });
      setConfirmation(null);
      setNotice(
        result?.reusedLearnerCount
          ? `Section assigned. ${result.reusedLearnerCount} learner${
              result.reusedLearnerCount === 1 ? '' : 's'
            } copied from S.Y. ${result.sourceStartYear}-${
              Number(result.sourceStartYear) + 1
            } with no assessment results.`
          : 'Teacher assignment saved.'
      );
      void load().catch((reason) =>
        setNotice(`Assignment saved, but the section list could not refresh. ${reason.message}`)
      );
    } catch (reason) {
      setConfirmation(null);
      setNotice(reason.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const removeFromYear = async (section) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setOpenSectionMenu('');
    try {
      await api('remove_section', {
        body: {
          start_year: Number(year),
          section_id: section.id,
        },
      });
      setNotice(
        'Section removed from this school year. Learner records and assessment results were retained.'
      );
      void load().catch((reason) =>
        setNotice(
          `Section removed, but the list could not refresh. ${reason.message}`
        )
      );
    } catch (reason) {
      setNotice(reason.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const insertSection = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    if (!insertSectionIds.length) {
      setInsertError('Choose at least one section.');
      return;
    }
    pending.current = true;
    setBusy(true);
    setInsertError('');
    try {
      await api('insert_sections', {
        body: {
          start_year: Number(year),
          section_ids: insertSectionIds,
        },
      });
      setInsertOpen(false);
      setInsertSectionIds([]);
      setNotice(
        `${insertSectionIds.length} section${
          insertSectionIds.length === 1 ? '' : 's'
        } inserted into this school year.`
      );
      void load().catch((reason) =>
        setNotice(
          `Section inserted, but the list could not refresh. ${reason.message}`
        )
      );
    } catch (reason) {
      setInsertError(reason.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <div className={styles.yearWorkspace}>
        <section
          className={`${styles.panel} ${styles.yearDirectory}`}
          aria-label="School year list"
        >
          <div className={styles.yearControls}>
            <input
              type="search"
              aria-label="Search school years"
              placeholder="Search school years"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              aria-label="Sort school years"
              value={order}
              onChange={(event) => setOrder(event.target.value)}
            >
              <option value="desc">Newest year first</option>
              <option value="asc">Oldest year first</option>
            </Select>
            <button
              className={styles.primary}
              disabled={busy || loading}
              onClick={() => open('add')}
            >
              Create school year
            </button>
          </div>
          {loading ? (
            <WorkspaceLoading label="Loading school years…" variant="years" />
          ) : (
            <div className={styles.yearList}>
              {years.map((schoolYear) => (
                <article
                  className={styles.yearListItem}
                  data-selected={String(schoolYear.startYear) === year}
                  key={schoolYear.startYear}
                >
                  <button
                    className={styles.assignmentYear}
                    aria-current={
                      String(schoolYear.startYear) === year
                        ? 'true'
                        : undefined
                    }
                    onClick={() => setYear(String(schoolYear.startYear))}
                  >
                    <strong>{schoolYear.label}</strong>
                    <small>
                      {assignedCount(schoolYear)}{' '}
                      {assignedCount(schoolYear) === 0 ||
                      assignedCount(schoolYear) === 1
                        ? 'section'
                        : 'sections'}
                    </small>
                  </button>
                  <button
                    className={styles.yearTrash}
                    aria-label={`Delete school year ${schoolYear.label}`}
                    title={`Delete ${schoolYear.label}`}
                    disabled={busy}
                    onClick={() => open('delete', schoolYear)}
                  >
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
                    </svg>
                  </button>
                </article>
              ))}
              {!years.length && (
                <p className={styles.empty}>
                  {data?.years.length
                    ? 'No matching school years.'
                    : 'No school years yet.'}
                </p>
              )}
            </div>
          )}
        </section>

        <section
          className={`${styles.panel} ${styles.yearDetail}`}
          aria-label="School year assignments"
          aria-busy={loading}
        >
          {error && !form && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {!loading && (
            <div
              className={`${styles.contentHeading} ${styles.yearHeading}`}
            >
              <h2>{selected ? selected.label : 'Assign sections'}</h2>
              <button
                type="button"
                className={styles.primary}
                disabled={busy || !selected || !availableSections.length}
                onClick={() => {
                  setInsertOpen(true);
                  setInsertSectionIds([]);
                  setInsertError('');
                  setError('');
                }}
              >
                Insert section
              </button>
            </div>
          )}
          {loading ? (
            <WorkspaceLoading
              label="Loading section assignments…"
              variant="years"
            />
          ) : selected ? (
            <>
              <div className={styles.yearList}>
                {insertedSections.map((section) => {
                  const assignment = assignmentFor(section);
                  return (
                    <article key={section.id} className={styles.assignmentRow}>
                      <div className={styles.sectionNameLine}>
                        <strong>{section.name}</strong>
                        <div
                          className={styles.sectionNameActions}
                          data-section-actions
                        >
                          <button
                            type="button"
                            className={styles.sectionMenuButton}
                            aria-label={`Section options for ${section.name}`}
                            aria-expanded={openSectionMenu === section.id}
                            disabled={busy}
                            onClick={() =>
                              setOpenSectionMenu((current) =>
                                current === section.id ? '' : section.id
                              )
                            }
                          >
                            ⋯
                          </button>
                          {openSectionMenu === section.id && (
                            <div
                              className={styles.sectionMenuPopout}
                              role="menu"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                disabled={busy}
                                onClick={() => void removeFromYear(section)}
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={styles.teacherAssignment}>
                        <label>
                          <span>Assigned Teacher</span>
                          <Select
                            aria-label={`Assigned teacher for ${section.name}`}
                            value={String(
                              assignment?.unassignedAt
                                ? ''
                                : assignment?.teacherId || ''
                            )}
                            disabled={busy}
                            onChange={(event) =>
                              chooseTeacher(section, event.target.value)
                            }
                          >
                            <option hidden value="">
                              No assigned teacher
                            </option>
                            {data.teachers.map((teacher) => (
                              <option key={teacher.id} value={teacher.id}>
                                {teacher.fullName}
                              </option>
                            ))}
                          </Select>
                        </label>
                      </div>
                    </article>
                  );
                })}
                {!insertedSections.length && (
                  <p className={styles.empty}>
                    No sections are inserted in this school year. Use Insert
                    section to add one.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className={styles.empty}>
              Select a school year to view its sections and assigned teachers.
            </p>
          )}
        </section>
      </div>

      {insertOpen && (
        <ClassDialog
          title="Insert Sections"
          showClose
          busy={busy}
          onClose={() => {
            if (!busy) setInsertOpen(false);
          }}
        >
          <form className={styles.editorFields} onSubmit={insertSection}>
            <p className={styles.muted}>
              Choose one or more created sections to insert into{' '}
              {selected?.label || 'this school year'}. A teacher can be assigned
              later.
            </p>
            <div className={styles.sectionInsertList}>
              {availableSections.map((section) => (
                <label
                  className={styles.sectionInsertChoice}
                  key={section.id}
                >
                  <span>{section.name}</span>
                  <input
                    type="checkbox"
                    checked={insertSectionIds.includes(section.id)}
                    disabled={busy}
                    onChange={(event) => {
                      setInsertSectionIds((current) =>
                        event.target.checked
                          ? [...current, section.id]
                          : current.filter((id) => id !== section.id)
                      );
                      setInsertError('');
                    }}
                  />
                </label>
              ))}
            </div>
            {!availableSections.length && (
              <p className={styles.hint}>
                Every created section is already inserted in this school year.
              </p>
            )}
            {insertError && (
              <p role="alert" className={styles.error}>
                {insertError}
              </p>
            )}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => setInsertOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primary}
                disabled={
                  busy || !availableSections.length || !insertSectionIds.length
                }
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </ClassDialog>
      )}

      {confirmation && (
        <ClassDialog
          title="Assign teacher?"
          busy={busy}
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
        >
          <form
            className={styles.editorFields}
            onSubmit={(event) => {
              event.preventDefault();
              void assign(
                confirmation.section,
                confirmation.teacher.id,
                confirmation.startYear
              );
            }}
          >
            <p className={styles.assignmentQuestion}>
              Assign <strong>{confirmation.teacher.fullName}</strong> to section{' '}
              <strong>{confirmation.section.name}</strong>?
            </p>
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? 'Assigning…' : 'Confirm'}
              </button>
            </div>
          </form>
        </ClassDialog>
      )}

      {notice && (
        <NoticeDialog message={notice} onClose={() => setNotice('')} />
      )}

      {form && (
        <ClassDialog
          title={
            form === 'add'
              ? 'Create school year'
              : `Delete school year ${deleteTarget?.label || ''}?`
          }
          showClose
          busy={busy}
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <form className={styles.editorFields} onSubmit={submit}>
            {form === 'add' ? (
              <label>
                School-year start
                <input
                  required
                  type="number"
                  min={2000}
                  max={2100}
                  placeholder="2027"
                  value={newYear}
                  onChange={(event) => setNewYear(event.target.value)}
                />
              </label>
            ) : (
              <>
                <p>
                  {deleteCount
                    ? 'Its section assignments and learner records will move to Recovery for 30 days.'
                    : 'Remove this empty school year?'}
                </p>
                {deleteCount > 0 && (
                  <label>
                    Your administrator password
                    <input
                      required
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                )}
              </>
            )}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
              <button
                className={form === 'delete' ? styles.danger : styles.primary}
                disabled={busy}
              >
                {busy
                  ? 'Saving…'
                  : form === 'delete'
                    ? 'Delete'
                    : 'Create school year'}
              </button>
            </div>
          </form>
        </ClassDialog>
      )}
    </>
  );
}
