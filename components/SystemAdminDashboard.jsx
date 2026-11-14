'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ClassDialog from './ClassDialog';
import PortalProfile from './PortalProfile';
import PortalThemeToggle from './PortalThemeToggle';
import AdminSchoolArchive from './AdminSchoolArchive';
import SchoolSections from './SchoolSections';
import SchoolStaff from './SchoolStaff';
import SchoolYearAssignments from './SchoolYearAssignments';
import Select from './Select';
import SystemAdminLogs from './SystemAdminLogs';
import StaffApprovalRequests from './StaffApprovalRequests';
import TeacherAvatar from './TeacherAvatar';
import styles from './Portal.module.css';
import ui from './SystemAdmin.module.css';

const ADMIN_TABS = [
  'Coordinators and Teachers',
  'School Years and Sections',
  'Account approvals',
  'Logs',
  'Archive',
];
const TAB_ICONS = {'Coordinators and Teachers':'▦','School Years and Sections':'▤','Account approvals':'✉','Logs':'≡','Archive':'▣'};
const SECTION_TAB = 'School Years and Sections';

export default function SystemAdminDashboard() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('Coordinators and Teachers');
  const [school, setSchool] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [code, setCode] = useState(null);
  const [copyNotice, setCopyNotice] = useState('');
  const [sectionsMenu, setSectionsMenu] = useState(false);
  const [sectionsPinned, setSectionsPinned] = useState(false);
  const [sectionPosition, setSectionPosition] = useState({});
  const [sectionView, setSectionView] = useState('assign');
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const pending = useRef(false);
  const drawer = useRef(null);
  const menu = useRef(null);
  const sectionsTrigger = useRef(null);
  const flyout = useRef(null);
  const hoverTimer = useRef(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/access?role=admin', {
        cache: 'no-store',
      });
      const result = await response.json();
      if (response.status === 401) {
        location.assign('/admin/login');
        return;
      }
      if (!response.ok) throw Error(result.error);
      setData(result);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load().catch((reason) => setError(reason.message));
  }, [load]);
  useEffect(() => {
    if (tab !== 'Account approvals') return undefined;
    const timer = window.setInterval(() => {
      if (document.hidden || pending.current) return;
      void fetch('/api/access?role=admin&action=signup_requests', {cache:'no-store',credentials:'include'})
        .then(async response => {
          if (!response.ok) throw new Error('Approval list unavailable.');
          return response.json();
        })
        .then(({entries}) => setData(current => current ? {...current,signupRequests:entries} : current))
        .catch(reason => console.warn('Approval list refresh will retry:',reason?.message||reason));
    }, 20000);
    return () => window.clearInterval(timer);
  }, [tab]);

  useEffect(() => {
    const query = matchMedia('(max-width:900px)');
    const sync = () => {
      setMobile(query.matches);
      if (!query.matches) setOpen(false);
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!open || !mobile || sectionsMenu) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawer.current?.querySelector('button')?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menu.current?.focus();
      }
      if (event.key === 'Tab') {
        const nodes = [
          ...drawer.current.querySelectorAll('button,a[href]'),
        ].filter((node) => !node.disabled);
        const first = nodes[0];
        const last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, mobile, sectionsMenu]);

  const act = async (body) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/access?role=admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (result.invite) setCode(result.invite);
      setDialog(null);
      void load().catch((reason) => setError(reason.message));
    } catch (reason) {
      setError(reason.message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  const schoolApi = useCallback(async (action, request = {}) => {
    const body = request.body;
    const response = await fetch(
      action === 'school_setup'
        ? '/api/access?role=admin&action=section_setup'
        : '/api/access?role=admin',
      {
        cache: 'no-store',
        ...(body
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...body, action }),
            }
          : {}),
      }
    );
    const result = await response.json();
    if (!response.ok) {
      throw Error(result.error || 'Unable to update school years and sections.');
    }
    return result;
  }, []);

  const closeSections = () => {
    clearTimeout(hoverTimer.current);
    setSectionsMenu(false);
    setSectionsPinned(false);
  };

  const showSections = () => {
    clearTimeout(hoverTimer.current);
    const box = sectionsTrigger.current?.getBoundingClientRect();
    if (!box) return;
    setSectionPosition({
      top: Math.max(
        8,
        Math.min(mobile ? box.bottom + 8 : box.top, innerHeight - 145)
      ),
      left: Math.max(
        8,
        Math.min(mobile ? box.left : box.right + 10, innerWidth - 240)
      ),
    });
    setSectionsMenu(true);
  };

  const leaveSections = () => {
    if (sectionsPinned) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setSectionsMenu(false), 220);
  };

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  useEffect(() => {
    if (!sectionsMenu) return;
    if (sectionsPinned) flyout.current?.querySelector('button')?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSectionsMenu(false);
        setSectionsPinned(false);
        sectionsTrigger.current?.focus();
      }
      if (event.key === 'Tab' && sectionsPinned) {
        const buttons = flyout.current?.querySelectorAll('button');
        const first = buttons?.[0];
        const last = buttons?.[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const outside = (event) => {
      if (
        !sectionsTrigger.current?.contains(event.target) &&
        !flyout.current?.contains(event.target)
      ) {
        setSectionsMenu(false);
        setSectionsPinned(false);
      }
    };
    const resize = () => {
      setSectionsMenu(false);
      setSectionsPinned(false);
    };
    window.addEventListener('keydown', handleKey);
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', resize);
    };
  }, [sectionsMenu, sectionsPinned]);

  const navigate = (nextTab) => {
    setTab(nextTab);
    setSchool(null);
    setCode(null);
    setError('');
    setOpen(false);
  };

  const begin = (kind) => {
    setForm({
      school_id: kind === 'school' ? '' : data?.schools[0]?.id || '',
      school_name: '',
    });
    setDialog(kind);
    setError('');
  };

  const close = () => {
    if (!busy) {
      setDialog(null);
      setError('');
    }
  };

  const people = (role, id) =>
    data?.[role === 'teacher' ? 'teachers' : 'coordinators']?.filter(
      (user) => user.schoolId === id
    ) || [];
  const selected = data?.schools.find((item) => item.id === school) || data?.schools[0];

  return (
    <div className={`${styles.workspace} ${ui.shell}`}>
      {mobile && open && (
        <button
          className={ui.scrim}
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={() => {
            setOpen(false);
            menu.current?.focus();
          }}
        />
      )}
      <aside
        ref={drawer}
        id="admin-sidebar"
        className={`${ui.sidebar} ${open ? ui.open : ''}`}
        inert={mobile && !open ? true : undefined}
        aria-label="Administrator navigation"
      >
        <div className={ui.brand}>
          <a href="/admin">
            <img
              src="/crl-app-logo.png"
              alt="CRL-App"
              width="148"
              height="60"
            />
          </a>
        </div>
        <div className={ui.identity}>
          <button
            className={ui.profilePicture}
            onClick={() => navigate('Profile')}
            aria-label="Open your profile"
          >
            <TeacherAvatar
              name={data?.user?.full_name || 'Administrator'}
              photo={data?.user?.profile_photo}
              large
            />
          </button>
          <strong>{data?.user?.full_name || 'Administrator'}</strong>
          <small>@{data?.user?.username || '…'}</small>
        </div>
        <nav aria-label="Administration">
          {ADMIN_TABS.map((item) => (
            <button
              key={item}
              ref={item === SECTION_TAB ? sectionsTrigger : undefined}
              aria-current={tab === item ? 'page' : undefined}
              onPointerEnter={(event) => {
                if (item === SECTION_TAB && event.pointerType === 'mouse') {
                  showSections();
                }
              }}
              onPointerLeave={() => {
                if (item === SECTION_TAB) leaveSections();
              }}
              onClick={() => {
                if (item === SECTION_TAB) {
                  if (sectionsPinned) closeSections();
                  else {
                    showSections();
                    setSectionsPinned(true);
                  }
                } else {
                  closeSections();
                  navigate(item);
                }
              }}
              aria-expanded={item === SECTION_TAB ? sectionsMenu : undefined}
            >
              <span aria-hidden="true">{TAB_ICONS[item]}</span>
              {item}
              {item === SECTION_TAB && (
                <svg
                  className={ui.sectionArrow}
                  width="17"
                  height="17"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="m7 4 6 6-6 6" />
                </svg>
              )}
            </button>
          ))}
        </nav>
        <button
          className={ui.signout}
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setDialog('logout');
          }}
        >
          Sign out
        </button>
      </aside>

      {sectionsMenu &&
        createPortal(
          <div
            ref={flyout}
            onPointerEnter={() => clearTimeout(hoverTimer.current)}
            onPointerLeave={leaveSections}
            className={ui.sectionFlyout}
            style={sectionPosition}
            role="group"
            aria-label="School year and section views"
          >
            <button
              type="button"
              onClick={() => {
                setSectionView('create');
                closeSections();
                navigate(SECTION_TAB);
              }}
            >
              Create Sections
            </button>
            <button
              type="button"
              onClick={() => {
                setSectionView('assign');
                closeSections();
                navigate(SECTION_TAB);
              }}
            >
              Assign Sections
            </button>

          </div>,
          document.body
        )}

      <div className={ui.body} inert={mobile && open ? true : undefined}>
        <header className={ui.topbar}>
          <button
            ref={menu}
            className={ui.menu}
            aria-label="Open navigation"
            aria-controls="admin-sidebar"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            ☰
          </button>
          <div className={ui.titleRow}>
            <h1>{tab}</h1>
            <PortalThemeToggle />
          </div>
          <button
            className={styles.secondary}
            disabled={busy || refreshing}
            aria-busy={refreshing}
            onClick={() => void load().catch((reason) => setError(reason.message))}
          >
            <span
              className={refreshing ? ui.refreshSpinner : ui.refreshIcon}
              aria-hidden="true"
            >
              ↻
            </span>
            Refresh
          </button>
        </header>
        <main className={ui.main}>
          {error && !dialog && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {!data || refreshing ? (
            <div
              className={styles.panel}
              aria-label="Loading administration"
              aria-busy="true"
            >
              {[1, 2, 3].map((item) => (
                <div key={item} className={styles.skeleton} />
              ))}
            </div>
          ) : tab === 'Profile' ? (
            <PortalProfile
              role="admin"
              onProfileChange={(user) =>
                setData((current) => ({ ...current, user }))
              }
            />
          ) : tab === SECTION_TAB ? (
            sectionView === 'create' ? (
              <SchoolSections refreshToken={data} view="list" />
            ) : sectionView === 'deleted' ? (
              <SchoolSections refreshToken={data} view="deleted" />
            ) : (
              <SchoolYearAssignments api={schoolApi} refreshKey={data} />
            )
          ) : tab === 'Archive' ? (
            <AdminSchoolArchive refreshToken={data} />
          ) : tab === 'Logs' ? (
            <SystemAdminLogs refreshToken={data} />
          ) : tab === 'Account approvals' ? (
            <StaffApprovalRequests reviewer="admin" busy={busy} entries={data.signupRequests || []}
              onReview={async (id, decision) => {
                if (pending.current) return false;
                pending.current = true;
                setBusy(true);
                setError('');
                try {
                  const response = await fetch('/api/access?role=admin', {
                    method:'POST',credentials:'include',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({action:'review_signup',id,decision}),
                  });
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error || 'Unable to review account.');
                  await load();
                  return true;
                } catch (reason) {
                  setError(reason.message || 'Unable to review account.');
                  throw reason;
                } finally {
                  pending.current = false;
                  setBusy(false);
                }
              }}
            />
          ) : (
            <section className={`${styles.panel} ${ui.panel}`}>
              {tab === 'Invite Coordinator' && (
                <div className={ui.actions}>
                  <button
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => begin('invite')}
                  >
                    Invite coordinator
                  </button>
                </div>
              )}
              {tab === 'Coordinators and Teachers' ? (
                selected ? (
                  <>
                    <div className={ui.selectedHeader}>
                      <div className={ui.schoolHeading}>
                        <h2>{selected.name}</h2>
                        <p>School number {selected.id}</p>
                      </div>
                    </div>
                    <SchoolStaff
                      key={selected.id}
                      coordinators={people('reading_coordinator', selected.id)}
                      teachers={people('teacher', selected.id)}
                      onToggle={(user) => setDialog({ type: 'toggle', user })}
                    />
                  </>
                ) : (
                  <div className={ui.schoolList}>
                    {data.schools.map((item) => (
                      <button
                        className={ui.schoolCard}
                        key={item.id}
                        onClick={() => setSchool(item.id)}
                      >
                        <span>
                          <strong>{item.name}</strong>
                          <small>School number {item.id}</small>
                        </span>
                        <span className={ui.counts}>
                          <span>
                            {
                              people('reading_coordinator', item.id).filter(
                                (user) => user.isActive
                              ).length
                            }{' '}
                            active coordinators
                          </span>
                          <span>
                            {
                              people('teacher', item.id).filter(
                                (user) => user.isActive
                              ).length
                            }{' '}
                            active teachers
                          </span>
                        </span>
                        <span aria-hidden="true">→</span>
                      </button>
                    ))}
                  </div>
                )
              ) : tab === 'Invite Coordinator' ? (
                <>
                  <p className={ui.hint}>
                    Coordinator invitations are assigned to a registered school
                    and can be used once within seven days.
                  </p>
                  {copyNotice && (
                    <p className={ui.hint} role="status">
                      {copyNotice}
                    </p>
                  )}
                  <div className={ui.schoolList}>
                    {data.invites
                      .filter((invite) => invite.inviteRole === 'reading_coordinator')
                      .map((invite) => (
                        <article className={ui.person} key={invite.id}>
                          <div>
                            <strong>
                              {
                                data.schools.find(
                                  (item) => item.id === invite.schoolId
                                )?.name
                              }
                            </strong>
                            <div
                              className={`${ui.inviteCode} ${
                                invite.revokedAt ? ui.revokedCode : ''
                              }`}
                            >
                              <code className={styles.code}>{invite.code}</code>
                              <button
                                type="button"
                                disabled={Boolean(invite.revokedAt)}
                                className={styles.secondary}
                                aria-label={`Copy invitation code for ${
                                  data.schools.find(
                                    (item) => item.id === invite.schoolId
                                  )?.name || 'school'
                                }`}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(invite.code);
                                    setCopyNotice('Invitation code copied.');
                                  } catch {
                                    setCopyNotice(
                                      'Copy was unavailable. Select and copy the displayed code.'
                                    );
                                  }
                                }}
                              >
                                Copy
                              </button>
                            </div>
                            <small>
                              Expires{' '}
                              {new Date(invite.expiresAt).toLocaleDateString('en-PH')}
                            </small>
                          </div>
                          {invite.revokedAt ? (
                            <span className={ui.revokedBadge}>Revoked</span>
                          ) : (
                            <button
                              className={styles.danger}
                              disabled={busy}
                              onClick={() =>
                                act({ action: 'revoke_invite', id: invite.id })
                              }
                            >
                              Revoke
                            </button>
                          )}
                        </article>
                      ))}
                  </div>
                  {!data.invites.some(
                    (invite) => invite.inviteRole === 'reading_coordinator'
                  ) && (
                    <p className={styles.empty}>
                      No active coordinator invitations.
                    </p>
                  )}
                </>
              ) : (
                <>
                  {code && (
                    <div className={ui.newCode}>
                      <strong>Administrator invitation</strong>
                      <code>{code.code}</code>
                    </div>
                  )}
                  {data.admins.map((admin) => (
                    <article className={ui.person} key={admin.id}>
                      <div>
                        <strong>{admin.fullName}</strong>
                        <small>@{admin.username}</small>
                      </div>
                      <span className={ui.badge}>
                        {admin.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </article>
                  ))}
                </>
              )}
            </section>
          )}
        </main>
      </div>

      {dialog && (
        <ClassDialog
          title={
            dialog === 'school'
              ? 'Add school'
              : dialog === 'logout'
                ? 'Sign out?'
                : dialog?.type === 'toggle'
                  ? dialog.user.role === 'teacher'
                    ? 'Change teacher access'
                    : 'Change coordinator access'
                  : dialog === 'adminInvite'
                    ? 'Invite administrator'
                    : 'Invite Reading Coordinator'
          }
          showClose
          busy={busy}
          onClose={close}
        >
          <div className={`${styles.workspace} ${ui.dialog}`}>
            <form
              className={styles.form}
              onSubmit={async (event) => {
                event.preventDefault();
                if (dialog === 'logout') {
                  setBusy(true);
                  try {
                    const response = await fetch('/api/access?role=admin', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'logout' }),
                    });
                    if (!response.ok) throw Error('Unable to sign out.');
                    location.assign('/admin/login');
                  } catch (reason) {
                    setError(reason.message);
                    setBusy(false);
                  }
                  return;
                }
                await act(
                  dialog === 'school'
                    ? { action: 'add_school', ...form }
                    : dialog?.type === 'toggle'
                      ? {
                          action:
                            dialog.user.role === 'teacher'
                              ? 'toggle_teacher'
                              : 'toggle_coordinator',
                          id: dialog.user.id,
                        }
                      : {
                          action: 'invite',
                          ...form,
                          invite_role:
                            dialog === 'adminInvite'
                              ? 'admin'
                              : 'reading_coordinator',
                        }
                );
              }}
            >
              {dialog === 'school' ? (
                <>
                  <label className={styles.field}>
                    School name
                    <input
                      required
                      maxLength={150}
                      value={form.school_name}
                      onChange={(event) =>
                        setForm({ ...form, school_name: event.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    School number
                    <input
                      required
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={form.school_id}
                      onChange={(event) =>
                        setForm({ ...form, school_id: event.target.value })
                      }
                    />
                  </label>
                </>
              ) : dialog === 'logout' ? (
                <p>Sign out of your administrator account?</p>
              ) : dialog?.type === 'toggle' ? (
                <p>
                  {dialog.user.isActive ? 'Disable' : 'Enable'}{' '}
                  {dialog.user.fullName}’s account? Other school accounts remain
                  unchanged.
                </p>
              ) : (
                <>
                  {dialog !== 'adminInvite' && (
                    <label className={styles.field}>
                      Registered school
                      <Select
                        required
                        value={form.school_id}
                        onChange={(event) =>
                          setForm({ ...form, school_id: event.target.value })
                        }
                      >
                        <option hidden value="">
                          Choose school
                        </option>
                        {data.schools.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name} · {item.id}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  <p className={ui.hint}>
                    The invitation is valid for one registration within seven
                    days. Share it only with the intended recipient.
                  </p>
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
                  onClick={close}
                >
                  Cancel
                </button>
                <button
                  className={
                    dialog === 'logout' ? styles.danger : styles.primary
                  }
                  disabled={busy}
                >
                  {busy
                    ? 'Please wait…'
                    : dialog === 'logout'
                      ? 'Sign out'
                      : dialog === 'school'
                        ? 'Add school'
                        : dialog?.type === 'toggle'
                          ? 'Confirm'
                          : 'Generate invitation'}
                </button>
              </div>
            </form>
          </div>
        </ClassDialog>
      )}
    </div>
  );
}
