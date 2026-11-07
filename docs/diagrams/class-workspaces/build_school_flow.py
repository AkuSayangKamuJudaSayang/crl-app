"""School assignment and live-timeline views, using the established native theme."""
from pathlib import Path
p=Path(__file__).with_name('build_coordinator_diagrams.py')
s=p.read_text();exec(compile(s[:s.index('for name,coordinator in')],str(p),'exec'))
make('figure-15c-assessment-activation',['Reading Coordinator','CRL-App','School records'],[
 ('s',0,85,'',S),('create',0,170,'Select school year;\nchoose a timeline card',P),('check',1,170,'Verify school, year and\npublished timeline contents',P),('draft',2,170,'Read current activation\nand published version',P),('live',0,340,'Choose Go live\non the timeline card',P),('version',1,340,'Validate current version;\nprotect concurrent changes',P),('persist',2,340,'Create or update the\nlive trigger atomically',P),('choice',0,520,'Pause new\nstarts?',D),('serve',2,520,'Return only live timelines\nto assigned teacher apps',P),('sf',2,605,'',F),('pause',1,700,'Pause future starts; retain\nalready-running attempts',P),('pf',1,785,'',F)
],[('s','create'),('create','check','right','left'),('check','draft','right','left'),('draft','live','bottom','top',[(670,255),(150,255)]),('live','version','right','left'),('version','persist','right','left'),('persist','choice','bottom','top',[(670,435),(150,435)]),('choice','serve','right','left',None,'No',(300,503)),('serve','sf'),('choice','pause','bottom','top',[(150,620),(410,620)],'Yes',(180,600)),('pause','pf')],h=850)
d=Diagram('figure-26c-school-flow-erd',1000,1200)
d.entity('year',35,45,400,'global_school_years',['PK school_id, start_year','label; deleted_at ?'])
d.entity('user',565,45,400,'users (selected)',['PK id; FK school_id','role; UQ one admin per school'])
d.entity('definition',35,335,400,'school_sections',['PK id; FK (school_id, start_year)','name; name_key; deleted_at ?', 'expires_at ? (30 days)', 'recovery_class_id ?','recovery_archive_id ?','UQ active school / year / name'])
d.entity('class',565,335,400,'class_sections (selected)',['PK id; FK teacher_id','FK (school_year_id, teacher_id)','FK school_section_id ?','UQ active section assignment','name; deleted_at ?'])
d.entity('revision',35,785,400,'assessment_library_revisions',['PK id; UQ (school_id, id)','period; version; immutable rows'])
d.entity('assessment',565,785,400,'school_assessments',['PK id; FK (school_id, start_year)','FK (school_id, catalog_revision_id)','FK created_by (coordinator)','UQ school / year / period','is_live; revision; updated_at','UQ one live school / year (index)','schedule_enabled; schedule_paused','starts_at ?; ends_at ? (TIMESTAMPTZ)', 'starts_on ?; ends_on ? (legacy)' ])
d.edge('year','definition','bottom','top',None,'year',(235,250),False,('one','many'))
d.edge('user','class','bottom','top',None,'teacher',(765,250),False,('one','many'))
d.edge('definition','class','right','left',None,'assignment',(500,412),False,('optional','many'))
d.edge('revision','assessment','right','left',None,'contents',(500,855),False,('one','many'))
d.edge('year','assessment','left','top',[(15,100),(15,680),(765,680)],'year',(735,660),False,('one','many'))
d.edge('user','assessment','right:0.75','right:0.75',[(985,132),(985,910)],'creator',(915,620),False,('one','many'))
d.text(500,1110,'Partial unique indexes enforce one administrator per school and one active assignment.\nOne live timeline per school / year; enabled time ranges cannot overlap.',17,width=95);d.output()
for ext in ['svg','drawio']:
 path=ROOT/('figure-26c-school-flow-erd.'+ext);path.write_text(path.read_text().replace('DejaVu Sans,Arial,sans-serif','Arial,sans-serif').replace('fontFamily=DejaVu Sans','fontFamily=Arial').replace('#34465c','#263b4d').replace('#223249','#263b4d'))

make('figure-15d-section-recycle',['School administrator','CRL-App','School records'],[
 ('s',0,85,'',S),('delete',0,170,'Sections → Section List;\nconfirm section deletion',P),('archive',1,170,'Validate school and password;\nretain original class backup',P),('retain',2,170,'Mark definition deleted;\nset 30-day expiry',P),('open',0,365,'Sections → Deleted Sections;\nview countdown; choose Restore',P),('valid',1,550,'Unexpired;\nno conflict?',D),('deny',0,735,'Explain restriction;\nretain existing records',P),('df',0,825,'',F),('restore',2,735,'Restore definition and original\nteacher assignment / records',P),('rf',2,825,'',F),('timer',1,920,'',S),('due',1,1000,'Scheduled deadline check',P),('expire',2,1000,'After 30 days: expire backups;\nremove section definition',P),('ef',2,1100,'',F)
],[('s','delete'),('delete','archive','right','left'),('archive','retain','right','left'),('retain','open','bottom','top',[(670,260),(150,260)]),('open','valid','bottom','left',[(150,550)]),('valid','deny','bottom','top',[(410,650),(150,650)],'No',(440,630)),('deny','df'),('valid','restore','right','top',[(670,550)],'Yes',(538,533)),('restore','rf'),('timer','due'),('due','expire','right','left'),('expire','ef')],h=1160)

make('figure-15e-timeline-scheduling',['Reading Coordinator','CRL-App','School records'],[
 ('s',0,85,'',S),('edit',0,170,'Open Set / Edit start/stop dates;\nchoose dates / AM-PM or Clear',P),('validate',1,170,'Check role, school, year\nand current revision',P),('valid',1,340,'Request\nvalid?',D),('reject',0,340,'Explain the conflict;\nretain calendar draft',P),('rf',0,435,'',F),('save',2,510,'Save times or clear range;\nClear retains live state;\nenforce one live timeline',P),('clock',2,700,'Private job runs each minute;\nAPI checks exact time',P),('effective',1,700,'Activate within time range;\nwait if another is live;\nend / pause blocks starts',P),('overview',0,700,'Show live / upcoming\ntimeline; start / stop times',P),('ef',0,825,'',F)
],[('s','edit'),('edit','validate','right','left'),('validate','valid'),('valid','reject','left','right',None,'No',(278,323)),('reject','rf'),('valid','save','right','top',[(670,340)],'Yes',(538,323)),('save','clock'),('clock','effective','left','right'),('effective','overview','left','right'),('overview','ef')],h=890)
