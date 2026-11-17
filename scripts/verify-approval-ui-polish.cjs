const assert=require('node:assert/strict');
const fs=require('node:fs');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const postcss=require('postcss');

(async()=>{
  const source=fs.readFileSync('components/StaffApprovalRequests.jsx','utf8');
  const css=fs.readFileSync('components/StaffApprovalRequests.module.css','utf8');
  const rules=postcss.parse(css);
  const approval=await require('./load-ui-component.cjs')('components/StaffApprovalRequests.jsx');
  const Approval=approval.default;
  const entries=[
    {id:51,role:'teacher',fullName:'Synthetic Teacher',createdAt:'2026-11-17T00:00:00Z'},
    {id:52,role:'reading_coordinator',fullName:'Synthetic Coordinator',createdAt:'2026-11-17T00:00:00Z'}
  ];
  const coordinator=renderToStaticMarkup(React.createElement(Approval,{entries,reviewer:'coordinator'}));
  const administrator=renderToStaticMarkup(React.createElement(Approval,{entries,reviewer:'admin'}));
  assert(coordinator.includes('Synthetic Teacher')&&!coordinator.includes('Synthetic Coordinator'),'Coordinator only reviews teachers');
  assert(administrator.includes('Synthetic Coordinator')&&!administrator.includes('Synthetic Teacher'),'Administrator only reviews coordinators');
  for(const markup of [coordinator,administrator]){
    assert(/class="[^"]*reject[^"]*"[^>]*>Reject<\/button>/.test(markup),'Reject is themed');
    assert(/class="[^"]*approve[^"]*"[^>]*>Approve<\/button>/.test(markup),'Approve is themed');
  }
  assert(source.includes('styles.cancel')&&source.includes('styles.confirmApprove')&&source.includes('styles.confirmReject'),'Portalled dialog actions must be styled');
  assert(source.includes('"Please wait..."')&&!source.includes('Reviewing...'),'Review busy text');
  assert(source.includes('role="status" aria-live="polite"')&&source.includes('createPortal(')&&source.includes('document.body'),'Status must be a fixed bottom portal');
  assert(source.includes('setFeedback({')&&source.includes('decision === "approve" ? "success" : "neutral"'),'Successful approval must show green feedback');
  assert(source.indexOf('const ok = await onReview(')<source.indexOf('setFeedback({'),'Only notify after review succeeds');
  assert(source.includes('if (ok === false) throw')&&source.includes('setSubmitting(false)'),'Failed review cannot report success');
  const find=(name,prop,expected)=>{let actual;rules.walkRules(rule=>{if(rule.selector.includes(name))for(const decl of rule.nodes)if(decl.prop===prop)actual=decl.value;});if(expected)assert.equal(actual,expected,name+' '+prop);else assert(actual,name+' requires '+prop);};
  for(const name of ['.action.approve:hover:not(:disabled)','.action.reject:hover:not(:disabled)','.action.cancel:hover:not(:disabled)','.action.confirmApprove:hover:not(:disabled)','.action.confirmReject:hover:not(:disabled)'])find(name,'background');
  find('.action','min-height');find('.toast','position','fixed');find('.toast','bottom');find('.toastSuccess','background');
  assert(css.includes(':focus-visible')&&css.includes(':disabled')&&css.includes('data-crl-theme="dark"'),'Focus, disabled and dark mode styles present');
  const coordinatorParent=fs.readFileSync('app/admin/AdminDashboard.jsx','utf8');
  assert(!coordinatorParent.includes('setNotice(decision === "approve" ? "Teacher account approved.'),'No duplicate top success notice');
  assert(coordinatorParent.includes('// The shared approval screen owns the bottom success prompt'));
  const adminParent=fs.readFileSync('components/SystemAdminDashboard.jsx','utf8');
  assert(adminParent.includes('await load({ quiet: true })')&&adminParent.includes('if (!quiet) setRefreshing(true)'),'Admin review retains mounted prompt');
  const teacher=fs.readFileSync('app/teacher/page.jsx','utf8');
  assert(teacher.includes('.homeStatsGrid .statCard{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}'),'All overview counters centered');
  assert(teacher.includes('.homeStatsGrid .statCardWide{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}'),'Wide EoSY card preserved');
  assert(teacher.includes('stats[key]')&&teacher.includes("['sectionsAssigned','Sections Assigned'"),'Existing statistics stay data-driven');
  console.log('PASS themed approval actions, role isolation, hover/focus/disabled/dark, bottom success prompt, centered five teacher overview stats');
})().catch(e=>{console.error(e);process.exitCode=1;});
