/* Shared stroke geometry keeps the menu readable across platforms and fonts. */
const paths = {
    conduct: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="m9 8 6 4-6 4Z" /></>,
    records: <><path d="M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" /><rect x="8" y="2" width="8" height="5" rx="1.5" /><path d="m7 13 2 2 3-4m2 2h3m-10 5h10" /></>,
    activities: <><path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15M5 8h3m-3 4h3m8-4h3m-3 4h3" /></>,
    analytics: <><path d="M3 3v18h18M7 16v-5m5 5V7m5 9V4" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    reports: <><path d="M21 11a8 8 0 0 1-8 8H7l-5 3V11a9 9 0 0 1 9-9h2a8 8 0 0 1 8 9Z" /><path d="M7 8h9m-9 5h6" /></>,
};

export default function TeacherMenuIcon({ name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.activities}</svg>;
}
