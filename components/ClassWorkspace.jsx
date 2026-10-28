"use client";

import { useEffect, useRef, useState } from "react";
import ClassDialog from "./ClassDialog";
import ArchiveImport from "./ArchiveImport";
import LearnerArchiveRestore from "./LearnerArchiveRestore";
import { classLifecyclePhrase, orderedSchoolYears } from "../lib/classWorkspace.mjs";
import styles from "./ClassWorkspace.module.css";
export default function ClassWorkspace({
  catalog,
  onBack,
  importControl = null,
  selectedSectionId,
  selectedYearId,
  choosing,
  mode,
  onYearChoose,
  onChoose,
  onCatalog,
  api,
  onReload,
  isOffline,
  loaded
}) {
  const [form, setForm] = useState(null),
    [value, setValue] = useState(""),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [menu, setMenu] = useState(null);
  const menuTrigger = useRef(null);
  const records = mode === "records";
  const years = orderedSchoolYears(catalog.schoolYears).filter(x => records || !x.archivedAt);
  const sections = (catalog.sections || []).filter(x => records || !x.archivedAt);
  const archives = catalog.archives || [];
  const section = sections.find(x => x.id === selectedSectionId);
  const year = years.find(x => x.id === (choosing ? selectedYearId : section?.schoolYearId));
  useEffect(() => {
    if (!menu) return;
    const close = e => {
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type === "pointerdown" && e.target.closest("[data-class-menu]")) return;
      setMenu(null);
      if (e.type !== "pointerdown") menuTrigger.current?.focus();
      if (e.type === "crl-pwa-back") e.stopImmediatePropagation();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("crl-pwa-back", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("crl-pwa-back", close, true);
    };
  }, [menu]);
  const close = () => {
    if (!busy) {
      setForm(null);
      setError("");
    }
  };
  const open = (type, target = null, kind = null) => {
    setMenu(null);
    setForm({
      type,
      target,
      kind,
      empty: type === "delete" && (kind === "year" ? !(catalog.sections || []).some(x => x.schoolYearId === target.id) : Number(target._count?.learners ?? 0) === 0)
    });
    setError("");
    setReason("");
    setAck(false);
    setValue(type === "edit" ? kind === "year" ? String(target.startYear) : target.name : "");
  };
  const updateValue = e => {
    setValue(e.target.value);
    setError("");
  };
  const lifecycle = form && ["delete", "archive"].includes(form.type);
  const action = lifecycle ? form.kind === "year" ? `${form.type}_school_year` : form.type === "delete" ? "delete_class_section" : "archive_class" : null;
  const phrase = lifecycle ? classLifecyclePhrase(action, form.target) : "";
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let mutation, body;
      if (lifecycle) {
        mutation = action;
        body = {
          id: crypto.randomUUID(),
          [form.kind === "year" ? "school_year_id" : "class_section_id"]: form.target.id,
          confirmation: form.empty ? undefined : value,
          completed_ack: form.empty ? undefined : ack,
          deletion_reason: form.empty ? undefined : reason,
          ...(form.empty ? {empty_confirmation: true} : {})
        };
      } else if (form.kind === "year") {
        mutation = form.type === "edit" ? "edit_school_year" : "save_school_year";
        body = {
          id: form.target?.id || crypto.randomUUID(),
          start_year: Number(value)
        };
      } else {
        mutation = "save_class_section";
        body = {
          id: form.target?.id || crypto.randomUUID(),
          school_year_id: form.target?.schoolYearId || selectedYearId,
          name: value
        };
      }
      const data = await api(mutation, {
        method: "POST",
        body
      });
      onCatalog(data);
      setForm(null);
      await onReload?.();
    } catch (e) {
      setError(e.message || "Unable to save this change.");
      if (form?.empty && e.message?.includes("now has records")) {
        setForm(current => current ? {...current, empty: false} : current);
        await Promise.resolve(onReload?.()).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };
  const download = async item => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await api("download_class_archive", {
        query: {
          archive_id: item.id
        }
      });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data.backup)], {
        type: "application/json"
      }));
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const menuFor = (target, kind) => {
    const isOpen = menu === target.id,
      locked = Boolean(target.archivedAt);
    return <div className={styles.menuWrap} data-class-menu><button type="button" className={styles.more} aria-label={`Options for ${kind === "year" ? `S.Y. ${target.label}` : target.name}`} aria-haspopup="menu" aria-expanded={isOpen} onClick={e => {
        menuTrigger.current = e.currentTarget;
        setMenu(isOpen ? null : target.id);
      }}>⋮</button>{isOpen && <div className={styles.menu} role="menu" aria-label={`${kind === "year" ? "School year" : "Section"} options`} onKeyDown={e => {
        const items = [...e.currentTarget.querySelectorAll("button:not(:disabled)")];
        const index = items.indexOf(document.activeElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (index + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
        }
      }}>
      <button type="button" role="menuitem" disabled={locked} onClick={() => open("edit", target, kind)}>Edit</button>
      <button type="button" role="menuitem" className={styles.deleteItem} disabled={isOffline} onClick={() => open("delete", target, kind)}>Delete</button>
      {records && kind === "section" && !choosing && !locked && <button type="button" role="menuitem" disabled={isOffline} onClick={() => open("import",target,"section")}>Import section backup</button>}{records && <button type="button" role="menuitem" disabled={(locked && (kind !== "year" || archives.some(item => item.kind === "school_year" && item.sourceSchoolYearId === target.id))) || isOffline} onClick={() => open("archive", target, kind)}>Archive</button>}
    </div>}</div>;
  };
  const availableSections = sections.filter(x => x.schoolYearId === selectedYearId);
  return <>
    {(choosing || records) && <section className={`${styles.workspace}${!choosing ? ` ${styles.compactWorkspace}` : ""}`} aria-label="School year and section">
      {onBack && (year || !choosing && section) && <button type="button" className={styles.backArrow} onClick={onBack} aria-label={choosing ? "Back to school years" : "Back to sections"} title={choosing ? "Back to school years" : "Back to sections"}><span aria-hidden="true">←</span></button>}
      <div className={styles.header}><div className={styles.heading}>{choosing ? year ? <><h2 className={styles.yearTitle}>S.Y. {year.label}</h2><p className={styles.subtitle}>Choose Section</p></> : <h2>Choose School Year</h2> : <><h2>School Year {year?.label}</h2><p className={styles.subtitle}>Section: {section?.name}</p>{section?.archivedAt && <p className={styles.badge}>Archived section. Assessment and remark changes are closed.</p>}</>}</div><div className={styles.actions}>{loaded && choosing && <button type="button" className={styles.primary} disabled={Boolean(year?.archivedAt)} onClick={() => open("add", null, year ? "section" : "year")}>{year ? "Add section" : "Add school year"}</button>}{records && <button type="button" className={styles.button} onClick={() => open("archives")}>Archives ({archives.length})</button>}{records && choosing && !year?.archivedAt && <button type="button" className={styles.button} disabled={isOffline} onClick={() => open("import", null, year ? "section" : "school_year")}>{year ? "Import section" : "Import school year"}</button>}{records && !choosing && section && <>{!section.archivedAt && !year?.archivedAt && importControl}{menuFor(section, "section")}</>}</div></div>
      {!loaded ? <p role="status">Loading school years and sections...</p> : choosing ? <>
        <p>{year ? "Choose the section whose learners or records you want to open." : "Choose a school year, then a section. Each class keeps its own learners and records."}</p>
        {(year ? availableSections : years).length === 0 ? <div className={styles.empty}><h3>{year ? "No sections yet" : "No school years yet"}</h3><p>{year ? "Add a section to start organizing this school year's learners." : "Add your first school year to begin organizing your classes."}</p></div> : <div className={styles.cards}>{(year ? availableSections : years).map(item => <div className={styles.card} key={item.id}><button type="button" className={styles.choice} onClick={() => {
              setMenu(null);
              year ? onChoose(item.id) : onYearChoose(item.id);
            }}><strong>{year ? item.name : `S.Y. ${item.label}`}</strong><span>{year ? `${item._count?.learners ?? 0} enrolled` : `${(catalog.sections || []).filter(x => x.schoolYearId === item.id).length} sections`}{item.archivedAt ? " · Archived" : ""}</span></button>{menuFor(item, year ? "section" : "year")}</div>)}</div>}
      </> : null}
      {records && isOffline && <p className={styles.hint}>Archives and deletion require an internet connection and synchronized records.</p>}
    </section>}
    {form && <ClassDialog title={form.type === "archives" ? "Archives" : form.type === "import" ? `Import ${form.kind === "school_year" ? "school year" : "section"}` : form.type === "restore" ? "Restore learners" : `${form.type === "add" ? "Add" : form.type === "edit" ? "Edit" : form.type === "delete" ? "Delete" : "Archive"} ${form.kind === "year" ? "school year" : "section"}`} onClose={close} busy={busy}>
      {form.type === "archives" ? <>{archives.length === 0 ? <div className={styles.empty}><h3>No archives yet</h3><p>Archived school years, sections and individually deleted learners will appear here.</p></div> : <>{["school_year", "section", "learner"].map(kind => {
        const rows=archives.filter(item=>item.kind===kind || kind==="section" && !item.kind);
        if(!rows.length)return null;
        const groups=[];
        for(const item of rows){
          const key=kind==="learner" && item.deletionGroupId ? item.deletionGroupId : item.id;
          const existing=groups.find(group=>group.key===key);
          if(existing)existing.items.push(item);else groups.push({key,items:[item]});
        }
        return <section key={kind} className={styles.archiveCategory}><h3>{kind==="school_year"?"School years":kind==="section"?"Sections":"Deleted learners"}</h3>{groups.map(group=>{
          const item=group.items[0], grouped=group.items.length>1;
          return <div className={styles.archive} key={group.key}>
            <span className={styles.badge}>{kind==="school_year"?"School Year":kind==="section"?"Section":grouped?"Learner Group":"Learner"}</span>
            <strong>{kind==="school_year"?`S.Y. ${item.schoolYearLabel}`:kind==="section"?`S.Y. ${item.schoolYearLabel} · ${item.sectionName}`:grouped?`${group.items.length} deleted learners`:item.learnerName}</strong>
            <p>{kind==="learner"?`S.Y. ${item.schoolYearLabel} · ${item.sectionName} · `:`${kind==="school_year"?`${item.sectionCount} sections · `:""}${item.learnerCount} learners · `}{new Date(item.createdAt).toLocaleDateString()}{item.offline_pending?" · Pending sync":""}{item.restoredAt&&!grouped?" · Restored":""}</p>
            {kind==="learner"?<button type="button" className={styles.button} disabled={busy||isOffline||group.items.every(row=>row.offline_pending)} onClick={()=>open("restore",group.items)}>{grouped?"Choose learners to restore":"Restore or download"}</button>:<button type="button" className={styles.button} disabled={busy||isOffline||item.offline_pending} onClick={()=>download(item)}>Download backup</button>}
          </div>;
        })}</section>;
      })}</>}<p className={styles.hint}>School-year and section backups are imported from their corresponding chooser. Deleted learners can be restored individually or by group into an active class. Archives remain after source deletion.</p></> : form.type === "import" ? <ArchiveImport kind={form.kind} yearId={year?.id} sectionId={!choosing?section?.id:null} catalog={catalog} api={api} onCatalog={onCatalog} onReload={onReload} onBusy={setBusy} disabled={busy||isOffline} /> : form.type === "restore" ? <LearnerArchiveRestore items={form.target} catalog={catalog} api={api} onCatalog={onCatalog} onReload={onReload} onBusy={setBusy} disabled={busy||isOffline} onDone={()=>open("archives")} onDownload={download} /> : lifecycle && form.empty ? <><p>Delete {form.kind === "year" ? `S.Y. ${form.target.label}` : `Section ${form.target.name}`}? It has no {form.kind === "year" ? "sections" : "learners"}.</p><p className={styles.hint}>This removes the empty container. Existing archives are kept.</p></> : lifecycle ? <>
        <p>{form.type === "delete" ? `Remove ${form.kind === "year" ? `S.Y. ${form.target.label} and all its sections` : `Section ${form.target.name}`} from the active lists. Its current section records are saved to Archives before deletion. Existing backups remain available in Assessment Records.` : "Confirm these school-year records are complete. An encrypted backup is retained and new assessments and remarks edits are closed."}</p>
        <label className={styles.checkbox}><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />I have synchronized this class on all my devices{form.type === "archive" ? " and confirm its records are complete" : ""}.</label>
        {form.type === "delete" && <label><span>Reason for deletion</span><textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Explain why this school year or section should be removed" /></label>}
        <label><span>Type <strong>{phrase}</strong> to confirm</span><input value={value} onChange={updateValue} autoComplete="off" spellCheck={false} /></label>
      </> : <label><span>{form.kind === "year" ? "School-year start (for example, 2027 for 2027-2028)" : "Section name"}</span><input type={form.kind === "year" ? "number" : "text"} min={2000} max={2100} maxLength={50} value={value} onChange={updateValue} inputMode={form.kind === "year" ? "numeric" : undefined} /></label>}
      {error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={form.type==="restore"?()=>open("archives"):close}>{form.type==="restore"?"Back to archives":["archives", "import"].includes(form.type)?"Close":"Cancel"}</button>{!["archives", "import", "restore"].includes(form.type) && <button type="button" className={form.type === "delete" ? styles.danger : styles.primary} disabled={busy || !form.empty && (!value.trim() || Boolean(lifecycle && (!ack || value !== phrase || form.type === "delete" && reason.trim().length < 5)))} onClick={save}>{busy ? "Saving..." : form.type === "delete" ? form.empty ? "Delete" : "Archive and delete" : form.type === "archive" ? "Archive" : "Save"}</button>}</div>
    </ClassDialog>}
  </>;
}
