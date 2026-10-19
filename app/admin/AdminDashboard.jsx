"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";
const LABELS = { "account.unlocked": "Teacher account unlocked", "account.unlock_dismissed": "Unlock request dismissed", "report.deleted": "Report deleted", login: "Signed in", "teacher.registered": "Teacher registered", "learner.created": "Learner added", "learner.deleted": "Learner deleted", "learners.imported": "Learners imported", "learners.deleted": "Learners deleted", "content.changed": "Assessment content changed", "invite.generated": "Invite generated", "invite.revoked": "Invite revoked", "backup.created": "Backup created", "recovery.restored": "Recovery completed" };
const date = value => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value)) : "—";
const name = row => [row.first_name, row.middle_name, row.last_name, row.suffix].filter(Boolean).join(" ");
function Modal({ title, children, onClose, compact = false }) {
  const dialog = useRef(null), close = useRef(null);
  useEffect(() => {
    const focus = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";(close.current || dialog.current?.querySelector('button:not([disabled])'))?.focus();
    return () => { document.body.style.overflow = overflow;focus?.focus?.({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const handleEscape = e => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault();onClose(); } };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);
  return createPortal(<div className={`${styles.portal} admin-modal-backdrop`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => {
    if (e.key === "Escape") { e.preventDefault();onClose(); }
    if (e.key === "Tab") {
      const nodes = Array.from(dialog.current.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),summary,[tabindex="0"]')).filter(n => n.getClientRects().length);
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault();nodes.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault();nodes[0]?.focus(); }
    }
  }}><section ref={dialog} className={`admin-modal${compact ? " admin-confirmation" : ""}`} role="dialog" aria-modal="true" aria-labelledby="admin-modal-title"><header><h2 id="admin-modal-title">{title}</h2>{!compact && <button ref={close} className="admin-close" aria-label="Close" onClick={onClose}>×</button>}</header><div className="admin-modal-body">{children}</div></section></div>, document.body);
}
function LearnerDetails({ learner }) {
  return <article className="admin-detail"><h3>{name(learner)}</h3><p>{learner.sex || "Sex not recorded"} · {learner.section || "No section"} · LRN {learner.lrn}</p>
    {learner.assessments?.length ? learner.assessments.map(s => <details key={s.id}><summary>{s.period} · {date(s.date)} · {s.classification || (s.completed ? "Completed" : "Incomplete")}</summary><dl className="admin-facts">
      <dt>Letter sounds</dt><dd>{s.metrics?.task1Score ?? "—"} / 10</dd><dt>Word recognition</dt><dd>{s.metrics?.task2Score ?? "—"} / 10</dd><dt>Comprehension</dt><dd>{s.metrics?.comprehensionScore ?? "—"} / 6</dd><dt>Reading accuracy</dt><dd>{s.metrics?.timerSeconds == null ? "—" : `${s.metrics.miscueAccuracy}%`}</dd><dt>Miscues</dt><dd>{s.metrics?.timerSeconds == null ? "—" : s.metrics.totalMiscues}</dd><dt>Reading time</dt><dd>{s.metrics?.timerSeconds == null ? "—" : `${s.metrics.timerSeconds}s`}</dd>
    </dl></details>) : <p>No assessment records at this time.</p>}
  </article>;
}
function filterTeachers(teachers, search, sort) {
  const query = search.trim().toLowerCase();
  return teachers.filter(t => `${t.fullName} ${t.username} ${t.section || ""}`.toLowerCase().includes(query)).sort((a, b) => sort === "recent" ? new Date(b.createdAt) - new Date(a.createdAt) || a.id - b.id : (sort === "name-desc" ? -1 : 1) * a.fullName.localeCompare(b.fullName) || a.id - b.id);
}
function TeacherSort({ value, onChange }) {
  return <label className="admin-teacher-sort"><span>Sort</span><select aria-label="Sort teachers" value={value} onChange={e => onChange(e.target.value)}><option value="name-asc">A–Z</option><option value="name-desc">Z–A</option><option value="recent">Recent</option></select></label>;
}
function TeacherDirectory({ teachers, selected, onSelect }) {
  const [search, setSearch] = useState(""), [sort, setSort] = useState("name-asc");
  const visible = filterTeachers(teachers, search, sort);
  return <aside className="admin-teacher-directory" aria-label="Teacher audit directory">
    <div className="admin-directory-tools">
      <label className="admin-directory-search"><span>Search</span><input type="search" placeholder="Name, username or section" aria-label="Search teachers" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <TeacherSort value={sort} onChange={setSort} />
    </div>
    <div className="admin-teacher-list">
      <button type="button" className="admin-teacher-choice" aria-pressed={!selected} onClick={() => onSelect("")}><strong>All Activities</strong><small>Overview of all activity</small></button>
      {visible.map(t => <button type="button" key={t.id} className="admin-teacher-choice" aria-pressed={String(t.id) === selected} onClick={() => onSelect(String(t.id))}><strong>{t.fullName}</strong><small>{t.section || "No section"}</small></button>)}
      {!visible.length && <p className="admin-muted">{teachers.length ? "No matching teachers." : "No teachers yet."}</p>}
    </div>
  </aside>;
}
export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState(null), [tab, setTab] = useState("Overview"), [filter, setFilter] = useState(""), [search, setSearch] = useState("");
  const [teacherSort, setTeacherSort] = useState("name-asc");
  const [rows, setRows] = useState([]), [cursor, setCursor] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [modal, setModal] = useState(null), [confirmation, setConfirmation] = useState(null), [detailPage, setDetailPage] = useState(0);
  const upload = useRef(null), fetchGeneration = useRef(0), actionBusy = useRef(false);
  const api = useCallback(async (action, options = {}) => {
    const response = await fetch(options.body ? "/api/admin" : `/api/admin?action=${action}${options.query || ""}`, { credentials: "include", cache: "no-store", ...(options.body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...options.body }) } : {}) });
    const result = await response.json();
    if (response.status === 401 || response.status === 403) { router.replace("/admin/login");throw new Error("Administrator sign-in is required."); }
    if (!response.ok) throw new Error(result.error || "Unable to complete this request.");
    return result;
  }, [router]);
  const loadOverview = useCallback(async () => { const result = await api("overview");setData(result); }, [api]);
  useEffect(() => { loadOverview().catch(e => setError(e.message)).finally(() => setLoading(false)); }, [loadOverview]);
  useEffect(() => {
    if (notice !== "Backup saved.") return;
    const timer = window.setTimeout(() => setNotice(""), 2000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const loadRows = useCallback(async (next = null) => {
    if (!["Audit Log", "Recovery", "Unlock requests"].includes(tab)) return;
    const generation = ++fetchGeneration.current;setLoading(true);
    try {
      const result = await api(tab === "Audit Log" ? "audit" : tab === "Unlock requests" ? "unlock_requests" : "recovery", { query: `${filter ? `&teacher_id=${filter}` : ""}${next ? `&cursor=${encodeURIComponent(next)}` : ""}` });
      if (generation !== fetchGeneration.current) return;
      setRows(current => next ? [...current, ...result.entries] : result.entries);setCursor(result.next_cursor);
    } catch(e) { if (generation === fetchGeneration.current) setError(e.message); }
    finally { if (generation === fetchGeneration.current) setLoading(false); }
  }, [tab, filter, api]);
  useEffect(() => { setRows([]);setCursor(null);setError("");void loadRows();return () => { fetchGeneration.current++; }; }, [loadRows]);
  useEffect(() => {
    if (tab !== "Unlock requests") return;
    const timer = window.setInterval(() => { if (!document.hidden && !actionBusy.current) void loadRows(); }, 20000);
    return () => window.clearInterval(timer);
  }, [tab, loadRows]);
  const act = async (action, body = {}) => {
    if (actionBusy.current) return;
    actionBusy.current = true;setBusy(true);setError("");setNotice("");
    try { await api(action, { body });setConfirmation(null);setNotice(action === "approve_unlock" ? "Account unlocked. The teacher must sign in again." : action === "dismiss_unlock" ? "Unlock request dismissed." : action === "restore" ? "Recovery completed." : action === "create_backup" ? "Backup saved." : action === "import_backup" ? "Backup added. Review it in Recovery before restoring." : "Saved.");await loadOverview();await loadRows(); }
    catch(e) { setError(e.message); }
    finally { actionBusy.current = false;setBusy(false); }
  };
  const openAudit = async (id, page = 0) => {
    setBusy(true);setError("");
    try { const result = await api("audit_detail", { query: `&id=${id}&page=${page}` });setModal({ type: "audit", ...result });setDetailPage(page); }
    catch(e) { setError(e.message); }finally { setBusy(false); }
  };
  const openRecovery = async (id, page = 0) => {
    setBusy(true);setError("");
    try { const result = await api("recovery_detail", { query: `&id=${id}&page=${page}` });setModal({ type: "recovery", ...result });setDetailPage(page); }
    catch(e) { setError(e.message); }finally { setBusy(false); }
  };
  const restorePrompt = row => { setModal(null);setConfirmation({title:"Restore data",text:row.kind === "backup" ? "Add missing records from this backup? Existing records will be kept." : row.kind === "content" ? "Restore the previous content version? Later changes will be protected." : "Restore these records?",action:"restore",body:{id:row.id}}); };
  const teacherName = id => data?.teachers.find(t => t.id === id)?.fullName || (id ? `Teacher ${id}` : "Administrator");
  const teacherOption = <><option value="">All teachers</option>{data?.teachers.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}</>;
  const active = data?.invites.find(i => i.status === "active");
  const visibleTeachers = filterTeachers(data?.teachers || [], search, teacherSort);
  const logout = async () => { setBusy(true);try { const response = await fetch("/api/auth?action=logout&scope=admin", { method: "POST", credentials: "include" });if (!response.ok) throw new Error("Unable to sign out.");router.replace("/admin/login");router.refresh(); } catch(e) { setError(e.message);setBusy(false); } };
  return <div className={styles.root}><header className="admin-header"><a href="/admin" aria-label="Admin home"><img src="/crl-app-logo.png" alt="CRL-App" width="160" height="64" /></a><span>Administrator</span><button className="admin-signout" onClick={() => { setError("");setConfirmation({title:"Sign out?",action:"sign_out"}); }} disabled={busy}>Sign out</button></header>
    <nav className="admin-nav" aria-label="Admin menu">{["Overview", "Audit Log", "Recovery", "Reports", "Unlock requests"].map(item => <button key={item} aria-current={tab === item ? "page" : undefined} onClick={() => { setTab(item);setNotice(""); }}>{item}</button>)}</nav>
    <main className="admin-main"><div className="admin-title"><h1>{tab}</h1><button disabled={busy || loading} onClick={() => { setError("");loadOverview().catch(e=>setError(e.message));void loadRows(); }}>Refresh</button></div>
      {error && <p className="admin-error" role="alert">{error}</p>}{notice && <p className="admin-notice" role="status">{notice}</p>}
      {!data ? <p role="status">{loading ? "Loading…" : "Dashboard unavailable."}</p> : <>
        {tab === "Overview" && <div className="admin-stats">{[[data.stats.teachers,"Teachers"],[data.stats.activeInvites,"Active invites"],[data.stats.auditEvents,"History entries"],[data.stats.recoveryItems,"Recovery items"]].map(([count,label])=><div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>}
        {tab === "Overview" && <><section className="admin-section"><div className="admin-section-heading"><h2>Registration codes</h2><button className="admin-primary" disabled={busy} onClick={()=>setConfirmation({ title:"Generate a teacher registration code?", action:"generate_code" })}>Generate code</button></div>
          {active && <div className="admin-active-code"><code>{active.code}</code><button onClick={async()=>{try{await navigator.clipboard.writeText(active.code);setNotice("Code copied.");}catch{setError("Select the code to copy it.");}}}>Copy</button></div>}
          <div className="admin-list">{data.invites.map(i=><div className="admin-row" key={i.id}><div><code>{i.code}</code><span className={`admin-status ${i.status}`}>{i.status}</span><small>{date(i.used_at || i.revoked_at || i.created_at)}</small></div><div>{i.teacher ? <button onClick={()=>setModal({type:"teacher",teacher:i.teacher,invite:i})}>{i.teacher.fullName}</button> : i.status === "used" ? <small>Teacher unavailable for older codes</small> : null}{i.status === "active" && <button className="admin-danger" disabled={busy} onClick={()=>setConfirmation({title:"Revoke invite",text:"This unused code will no longer allow registration.",action:"revoke_code",body:{id:i.id}})}>Revoke</button>}</div></div>)}</div>
        </section><section className="admin-section"><div className="admin-section-heading"><h2>Teachers</h2></div><div className="admin-overview-teacher-tools"><label><span>Search</span><input type="search" placeholder="Find a teacher" aria-label="Find a teacher" value={search} onChange={e=>setSearch(e.target.value)} /></label><TeacherSort value={teacherSort} onChange={setTeacherSort} /></div><div className="admin-list">{visibleTeachers.map(t=><div className="admin-row" key={t.id}><div><strong>{t.fullName}</strong><small>{t.section || "No section"}</small></div><button onClick={()=>setModal({type:"teacher",teacher:t})}>View</button></div>)}</div>{!visibleTeachers.length && <p className="admin-muted">{data.teachers.length ? "No matching teachers." : "No teachers yet."}</p>}</section></>}
        {["Audit Log","Recovery"].includes(tab) && <div className={tab === "Audit Log" ? "admin-audit-workspace" : undefined}>{tab === "Audit Log" && <TeacherDirectory teachers={data.teachers} selected={filter} onSelect={setFilter} />}<div className="admin-history-panel">{tab === "Audit Log" && <h2 className="admin-history-heading">{filter ? teacherName(Number(filter)) : "All Activities"}</h2>}<div className="admin-toolbar">{tab === "Recovery" && <select aria-label="Filter by teacher" value={filter} onChange={e=>setFilter(e.target.value)}>{teacherOption}</select>}{tab === "Recovery" && <><button className="admin-primary" disabled={busy} onClick={()=>setConfirmation({title:"Create backup",text:filter ? `Back up ${teacherName(Number(filter))}'s assessment data?` : "Back up all teachers’ assessment data?",action:"create_backup",body:{teacher_id:filter ? Number(filter) : null}})}>Create backup</button><button disabled={busy} onClick={()=>upload.current.click()}>Import backup</button><input ref={upload} type="file" accept=".crlbackup,application/json" hidden onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;try{if(file.size>18*1024*1024)throw new Error("Choose a smaller backup.");const payload=JSON.parse(await file.text());if(payload.format!=="crl-admin-backup-v1")throw new Error("Choose a CRL-App backup.");await act("import_backup",{encrypted_backup:payload.encrypted_backup});}catch(err){setError(err.message);}}} /></>}</div>
          {tab === "Recovery" && <p className="admin-muted">Deleted learners and content versions: 30 days. Backups: 90 days. Restoring a backup adds missing data.</p>}
          <section className="admin-section"><div className="admin-list">{rows.map(row=><div className="admin-row" key={row.id}><div><strong>{tab === "Audit Log" ? LABELS[row.event] || row.event : row.kind === "learners" ? "Deleted learners" : row.kind === "content" ? "Content version" : row.kind === "report" ? "Deleted report" : "Backup"}</strong><small>{tab === "Recovery" && row.kind === "backup" && !row.teacher_id ? "All teachers" : teacherName(row.teacherId ?? row.teacher_id)} · {row.entityCount ?? row.count} item{(row.entityCount ?? row.count)===1 ? "" : "s"}</small><small>{date(row.occurredAt || row.created_at)}{row.expires_at ? ` · Until ${date(row.expires_at)}` : ""}</small></div><div>{tab === "Audit Log" ? <button disabled={busy} onClick={()=>openAudit(row.id)}>View</button> : <><button disabled={busy} onClick={()=>openRecovery(row.id)}>View</button>{row.kind === "backup" && <a className="admin-button" href={`/api/admin?action=download_backup&id=${row.id}`}>Download</a>}<button disabled={busy || Boolean(row.restored_at)} onClick={()=>restorePrompt(row)}>{row.restored_at ? "Restored" : "Restore"}</button></>}</div></div>)}</div>{!rows.length && !loading && <p className="admin-muted">No entries yet.</p>}{loading && <p role="status">Loading…</p>}{cursor && <button disabled={loading} onClick={()=>loadRows(cursor)}>Load more</button>}</section></div></div>}
        {tab === "Unlock requests" && <section className="admin-section"><p className="admin-muted">These requests come from the sign-in page and do not verify identity. Confirm the teacher’s identity through a trusted school contact before unlocking. Unlocking does not reset a password or bypass two-factor authentication.</p><div className="admin-list">{rows.map(row => <article className="admin-row" key={row.id}><div><strong>{row.teacher.fullName}</strong><small>{row.teacher.username} · {row.teacher.section || "No section"}</small><small>Requested {date(row.created_at)} · Locked until {date(row.locked_until)}</small><small>Status: {row.status}</small></div><div><button className="admin-primary" disabled={busy || row.status !== "pending"} onClick={() => setConfirmation({ title: "Unlock teacher account?", text: "Confirm that you have verified this teacher’s identity. Their password and authenticator remain required.", action: "approve_unlock", body: { id: row.id } })}>Unlock</button><button disabled={busy || row.status !== "pending"} onClick={() => setConfirmation({ title: "Dismiss unlock request?", text: "The account will stay locked until its timer expires.", action: "dismiss_unlock", body: { id: row.id } })}>Dismiss</button></div></article>)}</div>{loading && <p role="status">Loading requests…</p>}{!loading && !rows.length && <p className="admin-muted">No unlock requests yet.</p>}{cursor && <button disabled={busy || loading} onClick={() => loadRows(cursor)}>Load more</button>}</section>}
        {tab === "Reports" && <div className="admin-reports">{[["Bug reports",data.bug_reports,"bug"],["Feedback",data.feedback,"feedback"]].map(([title,entries,type])=><section className="admin-section" key={type}><h2>{title}</h2>{entries.length ? entries.map(entry=><article className="admin-report" key={entry.id}><strong>{entry.name || "Anonymous"}</strong><small>{date(entry.createdAt)}</small><p>{entry.message}</p>{entry.contact && <small>{entry.contact}</small>}<div className="admin-toolbar"><button disabled={busy} onClick={()=>act("update_report",{id:entry.id,type,is_resolved:!entry.isResolved})}>{entry.isResolved ? "Reopen" : "Resolve"}</button><button className="admin-danger" disabled={busy} onClick={()=>setConfirmation({title:"Delete report",text:"Delete this report?",action:"delete_report",body:{id:entry.id,type}})}>Delete</button></div></article>) : <p className="admin-muted">No entries yet.</p>}</section>)}</div>}
      </>}
    </main>
    {modal?.type === "teacher" && <Modal title="Teacher information" onClose={()=>setModal(null)}><h3>{modal.teacher.fullName}</h3><dl className="admin-facts"><dt>Username</dt><dd>{modal.teacher.username}</dd><dt>School</dt><dd>{modal.teacher.schoolName || "—"}</dd><dt>School ID</dt><dd>{modal.teacher.schoolId || "—"}</dd><dt>Section</dt><dd>{modal.teacher.section || "—"}</dd><dt>Registered</dt><dd>{date(modal.teacher.createdAt)}</dd>{modal.invite && <><dt>Invite code</dt><dd><code>{modal.invite.code}</code></dd><dt>Used</dt><dd>{date(modal.invite.used_at)}</dd></>}</dl><button className="admin-primary" onClick={()=>{setFilter(String(modal.teacher.id));setTab("Audit Log");setModal(null);}}>View audit log</button></Modal>}
    {["audit","recovery"].includes(modal?.type) && <Modal title={modal.type === "recovery" ? "Recovery preview" : LABELS[modal.entry.event] || "Audit entry"} onClose={()=>setModal(null)}><p className="admin-muted">{modal.type === "recovery" ? `${teacherName(modal.item.teacher_id)} · ${date(modal.item.created_at)}` : `${teacherName(modal.entry.teacher_id)} · ${date(modal.entry.occurred_at)}`}</p>
      {modal.detail.learners?.map(row=><LearnerDetails key={row.id} learner={row} />)}
      {modal.detail.changes?.map((change,index)=><article className="admin-detail" key={index}><h3>{modal.detail.period} · {(change.after||change.before).category} · Item {(change.after||change.before).position+1} · {change.action}</h3>{change.before && <><small>Before</small><p className="admin-content">{change.before.storyTitle && <strong>{change.before.storyTitle}<br/></strong>}{change.before.content}</p></>}{change.after && <><small>After</small><p className="admin-content">{change.after.storyTitle && <strong>{change.after.storyTitle}<br/></strong>}{change.after.content}</p></>}</article>)}
      {modal.detail.scope && <p>{modal.detail.scope === "admin" ? "Admin console" : "Teacher app"}</p>}{modal.detail.inviteId && <p>Registration code record #{modal.detail.inviteId}</p>}
      {modal.detail.report && <article className="admin-detail"><h3>{modal.detail.report.type === "bug" ? "Bug report" : "Feedback"}</h3><p>{modal.detail.report.name}</p><p className="admin-content">{modal.detail.report.message}</p></article>}{modal.type === "recovery" && <button className="admin-primary" disabled={busy || Boolean(modal.item.restored_at)} onClick={()=>restorePrompt(modal.item)}>{modal.item.restored_at ? "Restored" : "Restore"}</button>}
      {modal.detail.recoveryId && <button onClick={()=>{setModal(null);setTab("Recovery");setFilter(modal.entry.teacher_id ? String(modal.entry.teacher_id) : "");}}>Open Recovery</button>}
      {modal.detail.total > 25 && <div className="admin-toolbar"><button disabled={busy || detailPage===0} onClick={()=>modal.type === "recovery" ? openRecovery(modal.item.id,detailPage-1) : openAudit(modal.entry.id,detailPage-1)}>Previous</button><span>{detailPage*25+1}–{Math.min((detailPage+1)*25,modal.detail.total)} of {modal.detail.total}</span><button disabled={busy || (detailPage+1)*25>=modal.detail.total} onClick={()=>modal.type === "recovery" ? openRecovery(modal.item.id,detailPage+1) : openAudit(modal.entry.id,detailPage+1)}>Next</button></div>}
    </Modal>}
    {confirmation && <Modal title={confirmation.title} compact={["generate_code", "revoke_code", "sign_out", "approve_unlock", "dismiss_unlock"].includes(confirmation.action)} onClose={()=>{if(!busy)setConfirmation(null);}}>{confirmation.text && <p>{confirmation.text}</p>}{error && <p className="admin-error" role="alert">{error}</p>}<div className="admin-toolbar"><button disabled={busy} onClick={()=>setConfirmation(null)}>Cancel</button><button className={confirmation.action === "sign_out" ? "admin-signout" : "admin-primary"} disabled={busy} onClick={()=>confirmation.action === "sign_out" ? logout() : act(confirmation.action,confirmation.body || {})}>{busy ? (confirmation.action === "sign_out" ? "Signing out…" : "Saving…") : "Confirm"}</button></div></Modal>}
  </div>;
}
