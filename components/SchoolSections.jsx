'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { sectionName } from '../lib/classWorkspace.mjs';
import { archiveRetentionLabel } from '../lib/archiveRetention.mjs';
import ClassDialog from './ClassDialog';
import WorkspaceLoading from './WorkspaceLoading';
import styles from './Coordinator.module.css';

export default function SchoolSections({ refreshToken, view = 'list' }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [clock, setClock] = useState(Date.now());
  const generation = useRef(0);
  const pending = useRef(false);
  const offset = useRef(0);
  const deleted = view === 'deleted';
  const errorId = useId();

  const call = async (body) => {
    const response = await fetch(
      body
        ? '/api/access?role=admin'
        : `/api/access?role=admin&action=${deleted ? 'section_deleted' : 'section_setup'}`,
      {
        cache: 'no-store',
        ...(body
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      }
    );
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Unable to load sections.');
    return result;
  };

  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const result = await call();
      if (token !== generation.current) return;
      setData(result);
      offset.current = result.serverNow
        ? Date.parse(result.serverNow) - Date.now()
        : 0;
      setClock(Date.now() + offset.current);
    } finally {
      if (token === generation.current) setLoading(false);
    }
  }, [deleted]);

  useEffect(() => {
    setForm(null);
    setFormError('');
    setError('');
    void load().catch((reason) => setError(reason.message));
    return () => {
      generation.current++;
    };
  }, [load, refreshToken]);

  useEffect(() => {
    const timer = setInterval(
      () => setClock(Date.now() + offset.current),
      60000
    );
    return () => clearInterval(timer);
  }, []);

  const open = (kind, row) => {
    setForm({ kind, row });
    setName(row?.name || '');
    setPassword('');
    setFormError('');
  };

  const close = () => {
    if (!pending.current) {
      setForm(null);
      setFormError('');
    }
  };

  let duplicate = '';
  if (form && ['add', 'rename'].includes(form.kind) && name.trim()) {
    try {
      const key = sectionName(name).toLowerCase();
      if (
        data?.sections.some(
          (section) =>
            !section.deletedAt &&
            section.id !== form.row?.id &&
            sectionName(section.name).toLowerCase() === key
        )
      ) {
        duplicate = 'This section already exists in your school.';
      }
    } catch {}
  }

  const formMessage = duplicate || formError;
  const submit = async (event) => {
    event.preventDefault();
    if (pending.current || !form || duplicate) return;
    pending.current = true;
    setBusy(true);
    setFormError('');
    try {
      await call({
        action: 'section_action',
        section_action: form.kind,
        id: form.row?.id,
        name,
        confirmation_password: password,
      });
      setForm(null);
      void load().catch((reason) => setError(reason.message));
    } catch (reason) {
      setFormError(reason.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const sections = deleted
    ? (data?.sections || []).filter(
        (section) => Date.parse(section.expiresAt) > clock
      )
    : data?.sections || [];

  return (
    <section className={styles.root}>
      <div
        className={`${styles.panel} ${
          deleted ? styles.deletedSectionsPanel : ''
        }`}
      >
        <div className={styles.contentHeading}>
          {deleted ? (
            <h2>Deleted Sections</h2>
          ) : (
            <>
              <div>
                <h2>School sections</h2>
                <p className={styles.muted}>
                  Create a section once, then assign it to teachers in any
                  school year.
                </p>
              </div>
              <button
                className={styles.primary}
                disabled={busy || loading}
                onClick={() => open('add')}
              >
                Add section
              </button>
            </>
          )}
        </div>

        {error && !form && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <WorkspaceLoading
            label={
              deleted ? 'Loading deleted sections…' : 'Loading sections…'
            }
            variant="years"
          />
        ) : !deleted && !sections.length ? (
          <p className={styles.empty}>
            No sections yet. Add a reusable section before assigning it to
            teachers.
          </p>
        ) : (
          <div
            className={`${styles.yearList} ${
              deleted && !sections.length ? styles.deletedSectionsEmpty : ''
            }`}
          >
            {sections.map((section) => {
              const assignments = [...(section.classes || [])].sort(
                (a, b) =>
                  Number(b.schoolYear?.startYear || 0) -
                  Number(a.schoolYear?.startYear || 0)
              );
              const assignment = assignments[0];
              const teacher = data?.teachers?.find(
                (row) => row.id === assignment?.teacherId
              );
              const schoolYearCount = new Set(
                assignments.map((row) => row.schoolYear?.startYear)
              ).size;

              return (
                <article key={section.id} className={styles.yearRow}>
                  <div>
                    <strong>{section.name}</strong>
                    <p className={styles.muted}>
                      {deleted
                        ? 'Reusable school section'
                        : !assignment
                          ? 'Not assigned to a teacher'
                          : `${teacher?.fullName || 'Assigned teacher'} · ${
                              assignment._count?.learners || 0
                            } learners${
                              schoolYearCount > 1
                                ? ` · ${schoolYearCount} school years`
                                : ''
                            }`}
                    </p>
                    {deleted && (
                      <span className={styles.retentionBadge}>
                        {archiveRetentionLabel(section, clock)}
                      </span>
                    )}
                  </div>
                  <div className={styles.toolbar}>
                    {deleted ? (
                      <button
                        className={styles.secondary}
                        disabled={busy}
                        onClick={() => open('restore', section)}
                      >
                        Restore
                      </button>
                    ) : (
                      <>
                        <button
                          className={styles.secondary}
                          disabled={busy}
                          onClick={() => open('rename', section)}
                        >
                          Edit
                        </button>
                        <button
                          className={styles.danger}
                          disabled={busy}
                          onClick={() => open('delete', section)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
            {!sections.length && (
              <p className={styles.empty}>No deleted sections.</p>
            )}
          </div>
        )}
      </div>

      {form && (
        <ClassDialog
          title={
            form.kind === 'add'
              ? 'Add section'
              : form.kind === 'rename'
                ? 'Edit section'
                : `${form.kind === 'restore' ? 'Restore' : 'Delete'} ${
                    form.row.name
                  }?`
          }
          showClose
          busy={busy}
          onClose={close}
        >
          <form className={styles.editorFields} onSubmit={submit}>
            {form.kind === 'restore' ? (
              <p>
                Restore this reusable section and its retained assignment and
                learner records?
              </p>
            ) : form.kind === 'delete' ? (
              <>
                <p>
                  This section will stay in Deleted Sections for 30 days before
                  permanent removal.
                </p>
                {form.row.classes.some(
                  (assignment) => assignment._count.learners
                ) && (
                  <label>
                    Your administrator password
                    <input
                      required
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setFormError('');
                      }}
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                {form.kind === 'add' && (
                  <p className={styles.muted}>
                    School year is chosen later when the Reading Coordinator
                    assigns this section.
                  </p>
                )}
                <label>
                  Section name
                  <input
                    required
                    maxLength={50}
                    value={name}
                    aria-invalid={Boolean(formMessage)}
                    aria-describedby={formMessage ? errorId : undefined}
                    onChange={(event) => {
                      setName(event.target.value);
                      setFormError('');
                    }}
                  />
                </label>
              </>
            )}
            {formMessage && (
              <p id={errorId} role="alert" className={styles.error}>
                {formMessage}
              </p>
            )}
            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={close}
              >
                Cancel
              </button>
              <button
                className={
                  form.kind === 'delete' ? styles.danger : styles.primary
                }
                disabled={busy || Boolean(duplicate)}
              >
                {busy
                  ? 'Saving…'
                  : form.kind === 'delete'
                    ? 'Delete'
                    : form.kind === 'restore'
                      ? 'Restore'
                      : 'Save section'}
              </button>
            </div>
          </form>
        </ClassDialog>
      )}
    </section>
  );
}
