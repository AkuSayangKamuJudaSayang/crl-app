"use client";
import { useRef, useState } from "react";
import styles from "./ClassWorkspace.module.css";

export default function ArchiveImport({kind, yearId, sectionId, catalog, api, onCatalog, onReload, onBusy, disabled}) {
  const input = useRef(null);
  const running = useRef(false);
  const [files, setFiles] = useState([]), [error, setError] = useState(""), [dragging, setDragging] = useState(false), [targetYear, setTargetYear] = useState("");
  const years = (catalog.schoolYears || []).filter(year=>!year.archivedAt);
  const noun = kind === "school_year" ? "school-year" : kind;
  const choose = incoming => {
    if (running.current || disabled) return;
    const list = [...incoming];
    if (list.length > 50 || list.some(file=>file.size > 4*1024*1024 || !file.name.toLowerCase().endsWith(".json"))) {setError("Choose up to 50 CRL JSON backups, each no larger than 4 MB.");return;}
    setError(""); setFiles(list.map(file=>({file,status:"ready",message:"Ready to import"})));
  };
  const restore = async () => {
    if (running.current || disabled || !files.some(row=>row.status!=="done")) return;
    running.current = true; onBusy(true); setError("");
    try {
      for (let i=0;i<files.length;i++) {
        if (files[i].status==="done") continue;
        setFiles(current=>current.map((row,index)=>index===i?{...row,status:"working",message:"Importing..."}:row));
        try {
          const backup = JSON.parse(await files[i].file.text());
          const data = await api("import_class_archive",{method:"POST",body:{backup, expected_kind:kind,
            class_section_id: kind === "school_year" ? null : sectionId || null,
            school_year_id: kind === "school_year" ? targetYear || null : yearId}});
          onCatalog(data);
          setFiles(current=>current.map((row,index)=>index===i?{...row,status:"done",message:`Imported ${data.imported_count || 0} learners${data.already_restored_count ? " · Already restored items skipped" : ""}`} :row));
        } catch (e) {
          setFiles(current=>current.map((row,index)=>index===i?{...row,status:"error",message:e.message || "Unable to import this backup."}:row));
        }
      }
      await onReload?.();
    } catch(e) {setError(e.message || "Unable to refresh the class list.");}
    finally {running.current=false;onBusy(false);}
  };
  return <>
    <p>Choose one or more original {noun} backups from this teacher account. Existing records are kept.</p>
    {kind === "school_year" && <label><span>Destination school year</span><select value={targetYear} disabled={disabled} onChange={event=>setTargetYear(event.target.value)}><option value="">Use each backup's school year</option>{years.map(year=><option key={year.id} value={year.id}>S.Y. {year.label}</option>)}</select></label>}
    <input ref={input} type="file" accept=".json,application/json" multiple hidden disabled={disabled} onChange={event=>{choose(event.target.files || []);event.target.value="";}} />
    <button type="button" className={`${styles.dropZone}${dragging?` ${styles.dragging}`:""}`} disabled={disabled}
      onClick={()=>input.current?.click()} onDragOver={event=>{event.preventDefault();if(!disabled)setDragging(true);}} onDragLeave={()=>setDragging(false)}
      onDrop={event=>{event.preventDefault();setDragging(false);choose(event.dataTransfer.files);}}>
      <span className={styles.uploadIcon} aria-hidden="true">↑</span><strong>Drop {noun} backups here</strong><span>or browse files on your device</span><small>CRL JSON backups · Up to 50 files · 4 MB per file</small>
    </button>
    {files.length>0 && <ul className={styles.fileList} aria-live="polite">{files.map((row,index)=><li key={index}><strong>{row.file.name}</strong><span className={row.status==="error"?styles.error:row.status==="done"?styles.success:styles.hint}>{row.message}</span></li>)}</ul>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.hint}>{kind==="school_year"?"School-year backups restore separate sections into an empty active year. A missing year is created from its backup label.":sectionId?"Section backups restore into this empty active section.":"Each section backup restores its own section in the selected school year. An empty matching section can be reused."}</p>
    <button type="button" className={styles.primary} disabled={disabled || !files.some(row=>row.status!=="done")} onClick={restore}>{disabled?"Importing...":"Import selected files"}</button>
  </>;
}
