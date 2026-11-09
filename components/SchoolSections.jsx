'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { sectionName } from '../lib/classWorkspace.mjs';
import { archiveRetentionLabel } from '../lib/archiveRetention.mjs';
import ClassDialog from './ClassDialog';
import Select from './Select';
import WorkspaceLoading from './WorkspaceLoading';
import styles from './Coordinator.module.css';

export default function SchoolSections({ refreshToken, view = 'list' }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [names, setNames] = useState(['']);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
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
    setNames(kind === 'add' ? [''] : row?.name ? [row.name] : []);
    setPassword('');
    setFormError('');
  };

  const close = () => {
    if (!pending.current) {
      setForm(null);
      setFormError('');
    }
  };

  const sectionKey = (value) =>
    String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const draftNames =
    form?.kind === 'add'
      ? names
      : form?.kind === 'rename'
        ? names.slice(0, 1)
        : [];
  const draftKeys = draftNames.map(sectionKey);
  const keyCounts = draftKeys.reduce((counts, key) => {
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
  const existingKeys = new Set(
    (data?.sections || [])
      .filter(
        (section) =>
          !section.deletedAt && section.id !== form?.row?.id
      )
      .map((section) => sectionKey(section.name))
  );
  const rowIssues = draftNames.map((value, index) => {
    const key = draftKeys[index];
    if (!key) return '';
    if ((keyCounts.get(key) || 0) > 1) {
      return 'This section is already entered in another row.';
    }
    if (existingKeys.has(key)) {
      return 'This section already exists in your school.';
    }
    return '';
  });
  const canSaveDraft =
    draftNames.length > 0 &&
    draftNames.length <= 50 &&
    draftNames.every((value, index) => sectionKey(value) && !rowIssues[index]);
  const submit = async (event) => {
    event.preventDefault();
    if (pending.current || !form) return;
    const sectionDraft = ['add', 'rename'].includes(form.kind);
    if (sectionDraft && !canSaveDraft) return;
    pending.current = true;
    setBusy(true);
    setFormError('');
    try {
      const cleanedNames = draftNames.map((value) => sectionName(value));
      await call(
        form.kind === 'add'
          ? {
              action: 'section_action',
              section_action: 'add_many',
              names: cleanedNames,
            }
          : {
              action: 'section_action',
              section_action: form.kind,
              id: form.row?.id,
              name: cleanedNames[0],
              confirmation_password: password,
            }
      );
      setForm(null);
      void load().catch((reason) => setError(reason.message));
    } catch (reason) {
      setFormError(reason.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const allSections = deleted
    ? (data?.sections || []).filter(
        (section) => Date.parse(section.expiresAt) > clock
      )
    : data?.sections || [];
  const searchTerm = search.trim().toLowerCase();
  const sections = allSections
    .filter(
      (section) =>
        !searchTerm || String(section.name).toLowerCase().includes(searchTerm)
    )
    .sort((left, right) => {
      const comparison =
        sortBy === 'createdAt'
          ? Number(new Date(left.createdAt || 0)) -
            Number(new Date(right.createdAt || 0))
          : String(left.name).localeCompare(String(right.name), undefined, {
              sensitivity: 'base',
            });
      return (sortDirection === 'asc' ? 1 : -1) * comparison;
    });
  const changeName = (index, value) => {
    setNames((current) =>
      current.map((name, position) => (position === index ? value : name))
    );
    setFormError('');
  };
  const addNameRow = () =>
    setNames((current) => (current.length >= 50 ? current : [...current, '']));
  const removeNameRow = (index) =>
    setNames((current) =>
      current.length === 1
        ? ['']
        : current.filter((_, position) => position !== index)
    );
  const formatCreatedAt = (value) => {
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString('en-PH', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
  };

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
            <h2>Section list</h2>
          )}
        </div>

        {!deleted && (
          <div className={styles.sectionListTools}>
            <input
              type="search"
              aria-label="Search sections"
              placeholder="Search sections"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              aria-label="Sort sections by"
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.target.value);
                setSortDirection(event.target.value === 'createdAt' ? 'desc' : 'asc');
              }}
            >
              <option value="name">Name</option>
              <option value="createdAt">Date created</option>
            </Select>
            <Select
              aria-label="Section sort direction"
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value)}
            >
              {sortBy === 'createdAt' ? (
                <>
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </>
              ) : (
                <>
                  <option value="asc">A – Z</option>
                  <option value="desc">Z – A</option>
                </>
              )}
            </Select>
            <button
              className={`${styles.primary} ${styles.createSectionButton}`}
              disabled={busy || loading}
              aria-label="Create +"
              onClick={() => open('add')}
            >
              Create
              <span aria-hidden="true">+</span>
            </button>
          </div>
        )}

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
        ) : !deleted && !allSections.length ? (
          <p className={styles.empty}>
            No sections yet. Use Create + to add the first section.
          </p>
        ) : (
          <div
            className={`${styles.yearList} ${styles.sectionDirectoryList} ${
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
                          ? 'Not inserted in a school year'
                          : `${schoolYearCount} school year${
                              schoolYearCount === 1 ? '' : 's'
                            }`}
                    </p>
                    {!deleted && formatCreatedAt(section.createdAt) && (
                      <time
                        className={styles.createdAt}
                        dateTime={section.createdAt}
                      >
                        Created {formatCreatedAt(section.createdAt)}
                      </time>
                    )}
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
              <p className={styles.empty}>
                {deleted
                  ? 'No deleted sections.'
                  : 'No sections match your search.'}
              </p>
            )}
          </div>
        )}
      </div>

      {form && (
        <ClassDialog
          title={
            form.kind === 'add'
              ? 'Create Sections'
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
              <div className={styles.sectionRows}>
                {draftNames.map((value, index) => (
                  <div className={styles.sectionRow} key={index}>
                    <label>
                      {form.kind === 'add'
                        ? `Section ${index + 1}`
                        : 'Section name'}
                      <input
                        required
                        maxLength={50}
                        value={value}
                        aria-invalid={Boolean(rowIssues[index])}
                        aria-describedby={
                          rowIssues[index]
                            ? `${errorId}-row-${index}`
                            : undefined
                        }
                        onChange={(event) =>
                          changeName(index, event.target.value)
                        }
                      />
                      {rowIssues[index] && (
                        <span
                          id={`${errorId}-row-${index}`}
                          className={styles.rowError}
                          role="alert"
                        >
                          {rowIssues[index]}
                        </span>
                      )}
                    </label>
                    {form.kind === 'add' && names.length > 1 && (
                      <button
                        type="button"
                        className={styles.removeSectionRow}
                        aria-label={`Remove section row ${index + 1}`}
                        onClick={() => removeNameRow(index)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {form.kind === 'add' && (
                  <button
                    type="button"
                    className={`${styles.secondary} ${styles.addSectionRow}`}
                    disabled={names.length >= 50}
                    aria-label="Add row +"
                    onClick={addNameRow}
                  >
                    Add row
                    <span aria-hidden="true">+</span>
                  </button>
                )}
              </div>
            )}
            {formError && (
              <p id={errorId} role="alert" className={styles.error}>
                {formError}
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
                disabled={
                  busy ||
                  (['add', 'rename'].includes(form.kind) && !canSaveDraft)
                }
              >
                {busy
                  ? 'Saving…'
                  : form.kind === 'delete'
                    ? 'Delete'
                    : form.kind === 'restore'
                      ? 'Restore'
                      : 'Save'}
              </button>
            </div>
          </form>
        </ClassDialog>
      )}
    </section>
  );
}
