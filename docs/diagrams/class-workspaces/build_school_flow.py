"""School assignment and live-timeline views, using the established native theme."""
from pathlib import Path
p=Path(__file__).with_name('build_coordinator_diagrams.py')
s=p.read_text();exec(compile(s[:s.index('for name,coordinator in')],str(p),'exec'))
make('figure-15c-assessment-activation',['Reading Coordinator','CRL-App','School records'],[
 ('s',0,85,'',S),('create',0,170,'Select school year;\ncreate BoSY, MoSY or EoSY',P),('check',1,170,'Verify school, year and\npublished timeline contents',P),('draft',2,170,'Save assessment as draft',P),('live',0,340,'Choose Go live',P),('version',1,340,'Validate current version;\nprotect concurrent changes',P),('persist',2,340,'Set this school-year\ntimeline live',P),('choice',0,520,'Pause new\nstarts?',D),('serve',2,520,'Return only live timelines\nto assigned teacher apps',P),('sf',2,605,'',F),('pause',1,700,'Pause future starts; retain\nalready-running attempts',P),('pf',1,785,'',F)
],[('s','create'),('create','check','right','left'),('check','draft','right','left'),('draft','live','bottom','top',[(670,255),(150,255)]),('live','version','right','left'),('version','persist','right','left'),('persist','choice','bottom','top',[(670,435),(150,435)]),('choice','serve','right','left',None,'No',(300,503)),('serve','sf'),('choice','pause','bottom','top',[(150,620),(410,620)],'Yes',(180,600)),('pause','pf')],h=850)
d=Diagram('figure-26c-school-flow-erd',1000,1120)
d.entity('year',35,45,400,'global_school_years',['PK school_id, start_year','label; deleted_at ?'])
d.entity('user',565,45,400,'users (selected)',['PK id; FK school_id','role; UQ one admin per school'])
d.entity('definition',35,335,400,'school_sections',['PK id; FK (school_id, start_year)','name; name_key; deleted_at ?','UQ active school / year / name'])
d.entity('class',565,335,400,'class_sections (selected)',['PK id; FK teacher_id','FK (school_year_id, teacher_id)','FK school_section_id ?','UQ active section assignment','name; deleted_at ?'])
d.entity('revision',35,785,400,'assessment_library_revisions',['PK id; UQ (school_id, id)','period; version; immutable rows'])
d.entity('assessment',565,785,400,'school_assessments',['PK id; FK (school_id, start_year)','FK (school_id, catalog_revision_id)','FK created_by (coordinator)','UQ school / year / period','is_live; revision; updated_at'])
d.edge('year','definition','bottom','top',None,'year',(235,250),False,('one','many'))
d.edge('user','class','bottom','top',None,'teacher',(765,250),False,('one','many'))
d.edge('definition','class','right','left',None,'assignment',(500,412),False,('optional','many'))
d.edge('revision','assessment','right','left',None,'contents',(500,855),False,('one','many'))
d.edge('year','assessment','left','top',[(15,100),(15,680),(765,680)],'year',(735,660),False,('one','many'))
d.edge('user','assessment','right:0.75','right:0.75',[(985,132),(985,910)],'creator',(915,620),False,('one','many'))
d.text(500,1050,'Partial unique indexes enforce one administrator per school and one active assignment.\nOnly the owning school can read or change these records.',17,width=95);d.output()
for ext in ['svg','drawio']:
 path=ROOT/('figure-26c-school-flow-erd.'+ext);path.write_text(path.read_text().replace('DejaVu Sans,Arial,sans-serif','Arial,sans-serif').replace('fontFamily=DejaVu Sans','fontFamily=Arial').replace('#34465c','#263b4d').replace('#223249','#263b4d'))
