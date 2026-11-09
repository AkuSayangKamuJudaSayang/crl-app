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
  const [sectionFormOpen, setSectionFormOpen] = useState(false);
  const [sectionNames, setSectionNames] = useState('');
  const [sectionError, setSectionError] = useState('');
  const [sectionDialog, setSectionDialog] = useState(null);
  const [sectionEditName, setSectionEditName] = useState('');
  const [sectionPassword, setSectionPassword] = useState('');
  const [sectionDialogError, setSectionDialogError] = useState('');
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

  const assignmentFor = (section, startYear = Number(year)) =>
    section.classes?.find(
      (assignment) =>
        assignment.schoolYear?.startYear === startYear &&
        !assignment.schoolYear?.deletedAt
    );

  const assignedCount = (schoolYear) =>
    (data?.sections || []).filter((section) =>
      assignmentFor(section, schoolYear.startYear)
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
  const deleteTarget = data?.years.find(
    (schoolYear) => schoolYear.startYear === deleteYear
  );
  const deleteCount = sections.reduce(
    (count, section) =>
      count + (assignmentFor(section, deleteYear) ? 1 : 0),
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
    if (
      busy ||
      loading ||
      pending.current ||
      String(assignment?.teacherId || '') === value
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

  const addCreatedSections = async (event) => {
    event.preventDefault();
    if (pending.current) return;
    const names = sectionNames
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (!names.length) {
      setSectionError('Enter at least one section name.');
      return;
    }
    if (names.length > 50) {
      setSectionError('Create no more than 50 sections at once.');
      return;
    }
    if (names.some((name) => name.length > 50)) {
      setSectionError('Each section name must be 50 characters or fewer.');
      return;
    }
    const keys = names.map((name) => name.toLowerCase());
    if (new Set(keys).size !== keys.length) {
      setSectionError('Each section name must be different.');
      return;
    }
    pending.current = true;
    setBusy(true);
    setSectionError('');
    try {
      const result = await api('create_sections', { body: { names } });
      setSectionFormOpen(false);
      setSectionNames('');
      setNotice(
        `${result?.createdCount || names.length} section${
          (result?.createdCount || names.length) === 1 ? '' : 's'
        } created. Assign them to any school year from this page.`
      );
      void load().catch((reason) =>
        setNotice(
          `Sections created, but the list could not refresh. ${reason.message}`
        )
      );
    } catch (reason) {
      setSectionError(reason.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const openSectionDialog = (kind, target) => {
    setSectionDialog({ kind, target });
    setSectionEditName(kind === 'rename' ? target.name : '');
    setSectionPassword('');
    setSectionDialogError('');
  };

  const changeSection = async (event) => {
    event.preventDefault();
    if (pending.current || !sectionDialog) return;
    pending.current = true;
    setBusy(true);
    setSectionDialogError('');
    try {
      await api('section_action', {
        body: {
          section_action: sectionDialog.kind,
          id: sectionDialog.target.id,
          name: sectionEditName,
          confirmation_password: sectionPassword,
        },
      });
      setSectionDialog(null);
      setNotice(
        sectionDialog.kind === 'rename'
          ? 'Section renamed for every school year.'
          : 'Section moved to Deleted Sections.'
      );
      void load().catch((reason) =>
        setError(
          `Section updated, but the list could not refresh. ${reason.message}`
        )
      );
    } catch (reason) {
      setSectionDialogError(reason.message);
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
                      {assignedCount(schoolYear)} section
                      {assignedCount(schoolYear) === 1 ? '' : 's'}
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
                disabled={busy}
                onClick={() => {
                  setSectionFormOpen(true);
                  setSectionNames('');
                  setSectionError('');
                  setError('');
                }}
              >
                Create sections
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
              <p className={styles.muted}>
                Reusing a section copies its latest learner roster into this
                school year without prior assessment results.
              </p>
              <div className={styles.yearList}>
                {sections.map((section) => {
                  const assignment = assignmentFor(section);
                  return (
                    <article key={section.id} className={styles.assignmentRow}>
                      <strong>{section.name}</strong>
                      <div className={styles.teacherAssignment}>
                        <label>
                          <span>Assigned Teacher</span>
                          <Select
                            aria-label={`Assigned teacher for ${section.name}`}
                            value={String(assignment?.teacherId || '')}
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
                        {assignment && (
                          <button
                            type="button"
                            className={styles.unassignTeacher}
                            disabled={busy}
                            onClick={() => void assign(section, '')}
                            aria-label={`Unassign teacher from ${section.name}`}
                          >
                            Unassign
                          </button>
                        )}
                        <span className={styles.sectionControls}>
                          <button
                            type="button"
                            className={styles.secondary}
                            disabled={busy}
                            onClick={() =>
                              openSectionDialog('rename', section)
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.danger}
                            disabled={busy}
                            onClick={() =>
                              openSectionDialog('delete', section)
                            }
                          >
                            Delete
                          </button>
                        </span>
                      </div>
                    </article>
                  );
                })}
                {!sections.length && (
                  <p className={styles.empty}>
                    No reusable sections are available. Use Create sections to
                    add one or more sections.
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

      {sectionFormOpen && (
        <ClassDialog
          title="Create sections"
          showClose
          busy={busy}
          onClose={() => {
            if (!busy) setSectionFormOpen(false);
          }}
        >
          <form className={styles.editorFields} onSubmit={addCreatedSections}>
            <p className={styles.muted}>
              Enter one section name per line. Each section can be assigned to
              any school year and reused without carrying prior assessment
              results.
            </p>
            <label>
              Section names
              <textarea
                required
                rows={6}
                maxLength={2550}
                value={sectionNames}
                aria-invalid={Boolean(sectionError)}
                onChange={(event) => {
                  setSectionNames(event.target.value);
                  setSectionError('');
                }}
                placeholder={'Jupiter\nMars\nSaturn'}
              />
            </label>
            {sectionError && (
              <p role="alert" className={styles.error}>
                {sectionError}
              </p>
            )}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => setSectionFormOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.primary}
                disabled={busy}
              >
                {busy ? 'Creating…' : 'Add created sections'}
              </button>
            </div>
          </form>
        </ClassDialog>
      )}

      {sectionDialog && (
        <ClassDialog
          title={
            sectionDialog.kind === 'rename'
              ? 'Edit section'
              : `Delete ${sectionDialog.target.name}?`
          }
          showClose
          busy={busy}
          onClose={() => {
            if (!busy) setSectionDialog(null);
          }}
        >
          <form className={styles.editorFields} onSubmit={changeSection}>
            {sectionDialog.kind === 'rename' ? (
              <label>
                Section name
                <input
                  required
                  maxLength={50}
                  value={sectionEditName}
                  onChange={(event) => {
                    setSectionEditName(event.target.value);
                    setSectionDialogError('');
                  }}
                />
              </label>
            ) : (
              <>
                <p>
                  This reusable section and its assignments across school years
                  will move to Deleted Sections for 30 days.
                </p>
                {sectionDialog.target.classes?.some(
                  (assignment) => assignment._count?.learners
                ) && (
                  <label>
                    Your administrator password
                    <input
                      required
                      type="password"
                      autoComplete="current-password"
                      value={sectionPassword}
                      onChange={(event) => {
                        setSectionPassword(event.target.value);
                        setSectionDialogError('');
                      }}
                    />
                  </label>
                )}
              </>
            )}
            {sectionDialogError && (
              <p role="alert" className={styles.error}>
                {sectionDialogError}
              </p>
            )}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => setSectionDialog(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={
                  sectionDialog.kind === 'delete'
                    ? styles.danger
                    : styles.primary
                }
                disabled={busy}
              >
                {busy
                  ? 'Saving…'
                  : sectionDialog.kind === 'delete'
                    ? 'Delete'
                    : 'Save changes'}
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
            <p className={styles.muted}>
              If this section was used in an earlier school year, its latest
              learner roster will be copied. Assessment results remain empty.
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
