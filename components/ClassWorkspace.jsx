"use client";

import { useState, useRef } from "react";
import ClassDialog from "./ClassDialog";
import styles from "./ClassWorkspace.module.css";
export default function ClassWorkspace({
  catalog,
  selectedSectionId,
  choosing,
  onChoose,
  onOpenChooser,
  onCatalog,
  api,
  onReload,
  isOffline,
  loaded
}) {
  const [yearId, setYearId] = useState(''),
    [form, setForm] = useState(null),
    [value, setValue] = useState(''),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const fileRef = useRef(null);
  const years = catalog.schoolYears || [],
    sections = catalog.sections || [],
    archives = catalog.archives || [];
  const section = sections.find(x => x.id === selectedSectionId),
    year = years.find(x => x.id === (section?.schoolYearId || yearId));
  const close = () => {
    if (!busy) {
      setForm(null);
      setError('');
    }
  };
  const open = (type, target = null) => {
    setForm({
      type,
      target
    });
    setError('');
    setValue(type === 'rename' ? target.name : '');
    setAck(false);
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      let action, body;
      if (form.type === 'year') {
        action = 'save_school_year';
        const start = Number(value);
        const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`crl-school-year:${catalog.teacherId}:${start}`))).slice(0, 16);
        bytes[6] = bytes[6] & 15 | 128;
        bytes[8] = bytes[8] & 63 | 128;
        const hex = [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
        const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        body = {
          id,
          start_year: start
        };
      } else if (form.type === 'archive') {
        action = 'archive_class';
        body = {
          id: crypto.randomUUID(),
          class_section_id: section.id,
          confirmation: value,
          completed_ack: ack
        };
      } else {
        action = 'save_class_section';
        body = {
          id: form.target?.id || crypto.randomUUID(),
          school_year_id: form.target?.schoolYearId || yearId,
          name: value
        };
      }
      const data = await api(action, {
        method: 'POST',
        body
      });
      onCatalog(data);
      if (action === 'save_school_year') {
        const added = data.schoolYears.find(x => x.startYear === Number(value));
        if (added) setYearId(added.id);
      }
      setForm(null);
      await onReload?.();
    } catch (e) {
      setError(e.message || 'Unable to save this class.');
    } finally {
      setBusy(false);
    }
  };
  const download = async archive => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const d = await api('download_class_archive', {
        query: {
          archive_id: archive.id
        }
      });
      const url = URL.createObjectURL(new Blob([JSON.stringify(d.backup)], {
        type: 'application/json'
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = d.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const restore = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      if (file.size > 18 * 1024 * 1024) throw Error('The archive file is too large.');
      const backup = JSON.parse(await file.text());
      const d = await api('import_class_archive', {
        method: 'POST',
        body: {
          class_section_id: section.id,
          backup
        }
      });
      onCatalog(d);
      setForm(null);
      await onReload?.();
    } catch (e) {
      setError(e.message || 'Unable to import this archive.');
    } finally {
      setBusy(false);
    }
  };
  return <><section className={styles.workspace} aria-label="School year and section"><div className={styles.header}><h2>{choosing ? 'Choose your class' : `S.Y. ${year?.label || ''} · ${section?.name || ''}`}</h2><div className={styles.actions}>{!choosing && <button className={styles.button} onClick={onOpenChooser}>Change class</button>}<button className={styles.button} onClick={() => open('archives')}>Archives ({archives.length})</button></div></div>
 {!loaded ? <p role="status">Loading school years and sections...</p> : choosing ? <>{yearId ? <><div className={styles.crumbs}><button className={styles.button} onClick={() => setYearId('')}>School years</button><strong>S.Y. {years.find(x => x.id === yearId)?.label}</strong><button className={styles.primary} onClick={() => open('section')}>Add section</button></div><p>Choose a section. Its roster and assessment records are kept separately.</p><div className={styles.cards}>{sections.filter(x => x.schoolYearId === yearId).map(item => <div className={styles.card} key={item.id}><button className={styles.choice} onClick={() => onChoose(item.id)}><strong>{item.name}</strong><span>{item._count?.learners ?? 0} enrolled{item.archivedAt ? ' · Archived' : ''}</span></button>{!item.archivedAt && <button className={styles.button} onClick={() => open('rename', item)} aria-label={`Rename section ${item.name}`}>Rename</button>}</div>)}</div></> : <><div className={styles.actions}><button className={styles.primary} onClick={() => open('year')}>Add school year</button></div><p>Choose a school year, then choose or add a section.</p><div className={styles.cards}>{years.map(item => <div className={styles.card} key={item.id}><button className={styles.choice} onClick={() => setYearId(item.id)}><strong>S.Y. {item.label}</strong><span>{sections.filter(s => s.schoolYearId === item.id).length} sections</span></button></div>)}</div></>}</> : <><div className={styles.actions}>{section?.archivedAt ? <span className={styles.badge}>Archived section. Assessment and remark changes are closed.</span> : <><button className={styles.button} onClick={() => open('rename', section)}>Rename section</button><button className={styles.button} disabled={isOffline} onClick={() => open('archive')}>Archive completed section</button><button className={styles.button} disabled={isOffline} onClick={() => open('import')}>Import section archive</button></>}</div>{isOffline && <p className={styles.hint}>Archives require an internet connection and synchronized records.</p>}</>}
 </section>
 {form && <ClassDialog title={{
      year: 'Add school year',
      section: 'Add section',
      rename: 'Rename section',
      archive: 'Archive completed section',
      archives: 'Section archives',
      import: 'Import section archive'
    }[form.type]} onClose={close} busy={busy}>
 {form.type === 'archives' ? <>{archives.length === 0 ? <p>No section archives yet.</p> : archives.map(a => <div className={styles.archive} key={a.id}><strong>S.Y. {a.schoolYearLabel} · {a.sectionName}</strong><p>{a.learnerCount} learners · {new Date(a.createdAt).toLocaleDateString()}</p><button className={styles.button} disabled={busy || isOffline} onClick={() => download(a)}>Download backup</button></div>)}<p className={styles.hint}>Backups remain available after the original learner records are deleted. Import a downloaded backup into an empty active section using the same teacher account.</p></> : form.type === 'import' ? <><p>Import an original CRL archive into this empty section. Its learners, assessment evidence, and remarks will be restored here without changing another class.</p><input ref={fileRef} type="file" accept=".json" onChange={restore} disabled={busy || isOffline} /></> : <>
 {form.type === 'archive' ? <><p>Save a separate encrypted backup for S.Y. {year?.label}, Section {section?.name}. This closes new assessments and remark edits in this section. Learners without results are included.</p><label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />I confirm this section's school-year records are complete and synchronized on my devices.</label><label>Type <strong>ARCHIVE {section?.name}</strong><input value={value} onChange={e => setValue(e.target.value)} autoComplete="off" /></label></> : <label>{form.type === 'year' ? 'Start year (for example, 2026 for 2026-2027)' : 'Section name'}<input type={form.type === 'year' ? 'number' : 'text'} min={2000} max={2100} maxLength={50} value={value} onChange={e => setValue(e.target.value)} /></label>}
 </>}
 {error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={close}>{['archives', 'import'].includes(form.type) ? 'Close' : 'Cancel'}</button>{!['archives', 'import'].includes(form.type) && <button className={styles.primary} disabled={busy || !value.trim() || form.type === 'archive' && (!ack || value !== `ARCHIVE ${section?.name}`)} onClick={save}>{busy ? 'Saving...' : form.type === 'archive' ? 'Archive section' : 'Save'}</button>}</div></ClassDialog>}
 </>;
}
