"""Editable coordinator-governance figures. Reuses the established native theme.
Only explicit figures below are generated. SVG and diagrams.net share geometry.
"""
from pathlib import Path
source=Path(__file__).with_name('build_diagrams.py').read_text()
exec(source[:source.index('# Figure 4:')])
def make(name,lanes,nodes,edges,h=1050):
 PASSWORD_FIGURES.add(name);d=Diagram(name,1000,h);d.font=20;d.lanes(lanes)
 for key,lane,y,label,kind in nodes:
  if kind==P:label='\n'.join(line for part in label.split('\n') for line in textwrap.wrap(part,26))
  d.node(key,180+lane*320,y,label,kind,w=18 if kind in [S,F] else 220 if kind==D else 270,h=18 if kind in [S,F] else 100 if kind==D else max(70,20+25*len(label.split('\n'))))
 def px(x):return 20+(x-20)*960/780
 for e in edges:
  e=list(e)
  if len(e)>4 and e[4]:e[4]=[(px(x),y) for x,y in e[4]]
  if len(e)>6 and e[6]:e[6]=(px(e[6][0]),e[6][1])
  d.edge(*e)
 d.output();return d
def actor(d,x,y,label):
 d.items.append(('node','head'+str(x),x,y-45,30,30,'','start'))
 for pts in [[(x,y-29),(x,y+24)],[(x-27,y-10),(x+27,y-10)],[(x,y+24),(x-24,y+58)],[(x,y+24),(x+24,y+58)]]:d.lines.append(('','','','',pts,'',None,False,None))
 d.text(x,y+88,label,18,width=17)
for name,coordinator in [('figure-06-use-cases',False),('figure-07-admin-use-cases',True)]:
 d=Diagram(name,820,1000);d.rect(180,25,500,950,'#f9fbff','#8fa5bb',12);d.text(430,65,'CRL-App',22,bold=True)
 goals=['Manage teacher access','Manage classes and learners','Manage assessment contents','View class reports','Review system activity','Manage reports and feedback','Manage backups and archives'] if coordinator else ['Manage account','Conduct assessment','View assessment contents','View results and analytics','Manage assessment records','Send reports and feedback']
 for i,g in enumerate(goals):d.node('u'+str(i),430,125+i*86,g,'ellipse',w=440,h=58)
 actor(d,80,430,'Reading\nCoordinator' if coordinator else 'Teacher')
 for i in range(len(goals)):d.lines.append(('','','','',[(107,420),(210,125+i*86)],'',None,False,None))
 if not coordinator:
  d.node('learner',430,900,'View assessment','ellipse',w=440,h=58);actor(d,750,910,'Learner');d.lines.append(('','','','',[(650,900),(723,900)],'',None,False,None))
 d.output()
 for ext in ['svg','drawio']:
  p=ROOT/(name+'.'+ext);p.write_text(p.read_text().replace('DejaVu Sans,Arial,sans-serif','Arial,sans-serif').replace('fontFamily=DejaVu Sans','fontFamily=Arial').replace('#34465c','#263b4d').replace('#223249','#263b4d'))
d=Diagram('figure-04-period-flow',820,1020);PASSWORD_FIGURES.add(d.name)
for y,h,c,label in [(25,260,'#dcebfa','CLASS AND PERIOD'),(305,350,'#ebe3f6','TEACHER-LED TASKS'),(680,315,'#def1e5','REVIEW AND RECORDS')]:d.rect(55,y,710,h,c,'#b6c4d2',12);d.text(675,y+60,label,15,bold=True,width=13)
for key,x,y,label,kind,w,h in [('a',390,90,'Coordinator prepares shared contents\nfor BoSY, MoSY and EoSY',P,370,62),('b',390,200,'Teacher selects class and learner\nChooses an eligible timeline',P,370,62),('c',390,355,'Eligible\nlearner?',D,170,80),('no',145,355,'Explain restriction',P,170,52),('nf',145,425,'',F,18,18),('e',390,470,'Connect learner display\nPresent letter-sound task',P,370,62),('f',390,560,'Mark words if eligible\nApply stopping rules',P,370,62),('g',390,650,'If eligible: passage, timer,\nmiscues and six questions',P,370,62),('h',390,760,'Review and save computed\nassessment result',P,370,62),('i',390,860,'Persist the class and period\nQueue locally when offline',P,370,62),('j',390,955,'View, print or export\nowned assessment records',P,370,62)]:d.node(key,x,y,label,kind,w,h)
for e in [('a','b'),('b','c'),('c','no','left','right',None,'No',(278,337)),('no','nf'),('c','e','bottom','top',None,'Yes',(420,418)),('e','f'),('f','g'),('g','h'),('h','i'),('i','j')]:d.edge(*e)
d.output()
make('figure-08-assessment',['Teacher','CRL-App','Learner display'],[
 ('s',0,105,'',S),('class',0,165,'Choose school year and\nsection from class menu',P),('start',0,260,'Select learner; press Start\nChoose eligible timeline',P),('valid',1,260,'Timeline and\nprerequisites\nvalid?',D),('deny',1,400,'Explain restriction;\nretain existing records',P),('denyf',1,470,'',F),('bind',2,260,'Bind saved contents\nand connect display',P),('present',2,500,'Show current\nassessment item',P),('mark',0,500,'Record oral responses;\ncontrol progression',P),('continue',1,680,'Continue to\nnext task?',D),('next',2,680,'Present next letters,\nwords, story or question',P),('review',0,820,'Review computed results\nand confirm save',P),('store',1,930,'Save to the owned class;\nqueue locally if offline',P),('end',1,1010,'',F)
],[('s','class'),('class','start'),('start','valid','right','left'),('valid','deny','bottom','top',None,'No',(438,329)),('deny','denyf'),('valid','bind','right','left',None,'Yes',(538,243)),('bind','present'),('present','mark','left','right'),('mark','continue','bottom','top',[(150,600),(410,600)]),('continue','next','right','left',None,'Yes',(538,663)),('next','present','right','right',[(788,680),(788,500)]),('continue','review','left','top',[(275,680),(275,755),(150,755)],'No',(286,663)),('review','store','bottom','left',[(150,930)]),('store','end')],h=1070)
make('figure-15-class-management',['Reading Coordinator','CRL-App','Class records'],[
 ('s',0,95,'',S),('owner',0,165,'School Year: add a year\nClasses: select a teacher',P),('scope',1,165,'Verify coordinator access;\nretain teacher ownership',P),('edit',0,300,'Use class dropdowns;\nAdd new section by name',P),('dup',1,300,'Already\nexists?',D),('warn',0,450,'Show existing-year\nor section prompt',P),('wf',0,520,'',F),('save',2,300,'Save shared year; keep\nteacher-owned sections',P),('list',2,450,'Show assigned class controls\nand enrolled learner table',P),('end',2,530,'',F)
],[('s','owner'),('owner','scope','right','left'),('scope','edit','bottom','top',[(410,225),(150,225)]),('edit','dup','right','left'),('dup','warn','bottom','top',[(410,385),(150,385)],'Yes',(440,365)),('warn','wf'),('dup','save','right','left',None,'No',(538,283)),('save','list'),('list','end')],h=600)
make('figure-16-records-reports',['Teacher / Coordinator','CRL-App','Class records'],[
 ('s',0,105,'',S),('scope',0,165,'Teacher: choose class;\ncoordinator: open Records',P),('auth',1,165,'Verify role and\nreport ownership',P),('load',2,165,'Read enrolled roster\nand matching results',P),('teacher',1,310,'Owning\nteacher?',D),('adminview',2,310,'View three report layouts;\nPrint or Export if needed',P),('adminend',2,390,'',F),('mode',0,310,'Choose Records, Analytics\nor Conduct → View',P),('edit',0,470,'Edit\nremarks?',D),('review',1,470,'Review results; compare\ntimelines in one bar chart',P),('change',0,630,'Change remarks only;\nretain scores and evidence',P),('persist',1,630,'Save remarks or\nqueue locally',P),('output',2,760,'Print or export\nselected-class report',P),('end',2,840,'',F)
],[('s','scope'),('scope','auth','right','left'),('auth','load','right','left'),('load','teacher','bottom','top',[(670,230),(410,230)]),('teacher','adminview','right','left',None,'No',(538,293)),('adminview','adminend'),('teacher','mode','left','right',None,'Yes',(278,293)),('mode','edit'),('edit','review','right','left',None,'No',(278,453)),('edit','change','bottom','top',None,'Yes',(180,545)),('change','persist','right','left'),('persist','output','right','top',[(670,630)]),('review','output','right','right',[(788,470),(788,760)]),('output','end')],h=900)
make('figure-17-content-management',['Reading Coordinator','CRL-App','Shared library'],[
 ('s',0,105,'',S),('open',0,165,'Choose period and\ncontent category',P),('access',1,165,'Verify coordinator access;\nload current library',P),('edit',0,310,'Manage items, defaults\nand selection mode',P),('validate',1,310,'Contents\nvalid?',D),('error',0,450,'Explain validation issues;\nkeep the draft',P),('ef',0,520,'',F),('publish',2,310,'Publish a new\nimmutable version',P),('sync',2,460,'Share with teacher apps\non synchronization',P),('retain',1,610,'Running assessments retain\ntheir original version',P),('end',1,690,'',F)
],[('s','open'),('open','access','right','left'),('access','edit','bottom','top',[(410,230),(150,230)]),('edit','validate','right','left'),('validate','error','bottom','top',[(410,385),(150,385)],'No',(440,375)),('error','ef'),('validate','publish','right','left',None,'Yes',(538,293)),('publish','sync'),('sync','retain','bottom','right',[(670,610)]),('retain','end')],h=750)
make('figure-12-story-editing',['Reading Coordinator','CRL-App','Shared library'],[
 ('s',0,95,'',S),('edit',0,165,'Edit or import passage;\nuse text / word blocks',P),('draft',1,165,'Retain local draft and\nsix question / answer pairs',P),('close',0,310,'Unsaved\nedits?',D),('choice',1,310,'Choose how\nto proceed',D),('keep',2,165,'Keep draft open;\nreturn to the editor',P),('kf',2,245,'',F),('discard',2,310,'Discard unsaved draft;\nretain published version',P),('df',2,395,'',F),('save',0,525,'Save complete story\nand shared contents',P),('valid',1,525,'Complete\nstory?',D),('bad',0,690,'Explain validation issue;\nretain editable draft',P),('bf',0,775,'',F),('publish',2,525,'Publish new immutable\nassessment version',P),('retain',2,690,'Use for new attempts;\nretain running versions',P),('end',2,775,'',F)
],[('s','edit'),('edit','draft','right','left'),('draft','close','bottom','top',[(410,235),(150,235)]),('close','choice','right','left',None,'Yes',(278,293)),('choice','discard','right','left',None,'Discard',(524,293)),('discard','df'),('choice','keep','top','left',[(410,245),(540,245),(540,165)],'Keep editing',(475,235)),('keep','kf'),('choice','save','bottom','top:0.8',[(410,425),(215.8125,425)],'Save',(440,375)),('close','save','bottom','top',None,'No',(180,405)),('save','valid','right','left'),('valid','bad','bottom','top',[(410,615),(150,615)],'No',(440,605)),('bad','bf'),('valid','publish','right','left',None,'Yes',(538,508)),('publish','retain'),('retain','end')],h=830)
make('figure-23-section-archive',['Reading Coordinator','CRL-App','Archives / records'],[
 ('s',0,105,'',S),('target',0,165,'Delete year / section,\nor open Recovery',P),('request',0,300,'Restore\nbackup?',D),('validate',1,300,'Verify original backup\nand empty destination',P),('restore',2,300,'Restore class once;\nretain original deadline',P),('rf',2,380,'',F),('delete',0,465,'Delete\ncontainer?',D),('archive',1,465,'Keep class unchanged;\nreturn to the workspace',P),('af',1,545,'',F),('empty',0,630,'Empty\ncontainer?',D),('simple',1,630,'Request secondary\nconfirmation',P),('password',0,790,'Verify account password;\nreason: year required;\nsection optional; confirm sync',P),('valid',1,790,'Confirmed;\nno active test?',D),('cancel',0,940,'Retain source data;\nexplain restriction',P),('cf',0,1010,'',F),('commit',2,790,'Archive source; remove it\nin one transaction',P),('days',2,940,'Show original teacher\nand 30 days in Recovery',P),('end',2,1020,'',F)
],[('s','target'),('target','request'),('request','validate','right','left',None,'Yes',(278,283)),('validate','restore','right','left'),('restore','rf'),('request','delete','bottom','top',None,'No',(180,382)),('delete','archive','right','left',None,'No',(278,448)),('archive','af'),('delete','empty','bottom','top',None,'Yes',(180,548)),('empty','simple','right','left',None,'Yes',(278,613)),('simple','valid','bottom','top'),('empty','password','bottom','top',None,'No',(180,710)),('password','valid','right','left'),('valid','commit','right','left',None,'Yes',(538,773)),('valid','cancel','bottom','right',[(410,940)],'No',(440,855)),('cancel','cf'),('commit','days'),('days','end')],h=1080)
d=Diagram('figure-26b-coordinator-erd',860,920)
boxes=[('global',40,25,330,'global_school_years',['PK start_year','label; deleted_at ?','created_at'],'#def1e5'),('owned',490,25,330,'school_years (selected)',['PK id; FK teacher_id','FK start_year','label; archived_at ?; deleted_at ?'],'#dcebfa'),('head',40,330,330,'assessment_library_heads',['PK period','FK revision_id'],'#ebe3f6'),('version',490,330,330,'assessment_library_revisions',['PK id; period; version','rows (immutable JSON)','FK published_by ?','created_at; UQ period + version'],'#fff0c9'),('user',40,680,330,'users (selected)',['PK id; role','profile_photo ?','Teacher class owner','Coordinator content publisher'],'#def1f2'),('host',490,680,330,'host_sessions (selected)',['PK id; UQ code','FK catalog_revision_id ?','Other host links remain','teacher / learner / assessment'],'#dcebfa')]
for key,x,y,w,title,fields,c in boxes:
 first=len(d.items);d.entity(key,x,y,w,title,fields)
 for i in range(first,len(d.items)):
  if d.items[i][0]=='rect':v=list(d.items[i]);v[5]=c;v[6]='#728ba0';v[7]=0;d.items[i]=tuple(v)
for e in [('global','owned','right:0.597826','left:0.470085',None,'defines',(430,60),('one','many')),('user','owned','left','right',[(20,738.5),(20,250),(840,250),(840,83.5)],'owns',(315,232),('one','many')),('head','version','right','left:0.323944',None,'selects',(430,355),('many','one')),('user','version','right','left:0.774648',[(430,738.5),(430,440)],'publishes',(430,600),('optional','many')),('version','host','bottom','top',None,'retains version',(720,610),('optional','many'))]:
 a,b,sa,sb,via,label,pos,crow=e;d.edge(a,b,sa,sb,via,label,pos,False,crow)
for i,item in enumerate(d.items):
 if item[0]=='text' and any(b[4]==''.join(item[3]) for b in boxes):
  v=list(item);v[4]=17;d.items[i]=tuple(v)
d.output()
for ext in ['svg','drawio']:
 p=ROOT/(d.name+'.'+ext);p.write_text(p.read_text().replace('DejaVu Sans,Arial,sans-serif','Arial,sans-serif').replace('fontFamily=DejaVu Sans','fontFamily=Arial').replace('#223249','#263b4d'))
xml=E.parse(ROOT/'figure-26b-coordinator-erd.drawio');cells={cell.get('id'):cell for cell in xml.iter('mxCell')}
for key,x,y,w,title,fields,color in boxes:
 cell=cells[key];cell.set('style',cell.get('style').replace('fillColor=#ffffff',f'fillColor={color}').replace('strokeColor=#34465c','strokeColor=#728ba0')+'fontFamily=Arial;fontSize=17;')
for j,line in enumerate(d.lines):
 crow=line[-1]
 if crow:
  cell=cells['edge'+str(j)];cell.set('style',cell.get('style')+'startArrow='+{'one':'ERmandOne','many':'ERzeroToMany','optional':'ERzeroToOne'}[crow[0]]+';endArrow='+{'one':'ERmandOne','many':'ERzeroToMany','optional':'ERzeroToOne'}[crow[1]]+';')
xml.write(ROOT/'figure-26b-coordinator-erd.drawio',encoding='utf-8',xml_declaration=True)
legacy=source[source.index('# Figure 15:'):source.index('# Figure 16:')]
legacy=legacy.replace('figure-15-class-management','figure-15b-learner-management').replace('Teacher / Coordinator','Reading Coordinator').replace('Choose year, then section\\nUse top-left Back','Choose teacher and class\\nfrom Classes').replace('Add / import learners\\nEdit year / section menu','Add learner rows / Import\\nCheck LRNs as entered').replace('Validate and save in\\nthe selected class only','Validate; save all or none\\nin the selected class')
PASSWORD_FIGURES.add('figure-15b-learner-management');exec(legacy)

make('figure-19-admin-audit',['Reading Coordinator','CRL-App','Protected records'],[
 ('s',0,95,'',S),('open',0,165,'Choose invitation action\nor open Audit Log',P),('verify',1,165,'Verify coordinator access;\nload authorized records',P),('invite',0,310,'Invitation\naction?',D),('audit',1,310,'Read 10 recent activities;\nexclude expired events',P),('show',2,310,'View event and saved items;\npage details when needed',P),('af',2,395,'',F),('choose',0,485,'Generate or revoke\nan unused invite',P),('valid',1,485,'Confirmed\nand eligible?',D),('reject',0,650,'Retain invitation;\nexplain restriction',P),('rf',0,735,'',F),('save',2,485,'Save invitation change\nand protected audit event',P),('end',2,570,'',F),('timer',1,745,'',S),('clock',1,820,'After 7 elapsed days',P),('purge',2,820,'Erase expired audit events\nautomatically',P),('pf',2,905,'',F)
],[('s','open'),('open','verify','right','left'),('verify','invite','bottom','top',[(410,235),(150,235)]),('invite','audit','right','left',None,'No',(278,293)),('audit','show','right','left'),('show','af'),('invite','choose','bottom','top',None,'Yes',(180,395)),('choose','valid','right','left'),('valid','reject','bottom','top',[(410,570),(150,570)],'No',(440,565)),('reject','rf'),('valid','save','right','left',None,'Yes',(538,468)),('save','end'),('timer','clock'),('clock','purge','right','left'),('purge','pf')],h=960)

make('figure-14-profile-recovery',['Teacher','CRL-App','Account records'],[
 ('s',0,95,'',S),('open',0,165,'Open Profile\nor account access',P),('profile',0,310,'Update\nprofile?',D),('edit',1,310,'Edit details, or select\nand crop a profile picture',P),('valid',1,475,'Valid\nchanges?',D),('bad',0,475,'Explain the issue;\nretain the editable draft',P),('bf',0,555,'',F),('persist',2,475,'Save own account; reflect\npicture / initial in Classes',P),('pf',2,555,'',F),('recover',0,650,'Recover\naccount?',D),('verify',1,650,'Verify recovery request;\nretain security checks',P),('reset',2,650,'Save authorized\npassword update',P),('rf',2,735,'',F),('logout',0,820,'Confirm sign-out',P),('endSession',1,820,'End authorized session;\nreturn to account access',P),('end',1,905,'',F)
],[('s','open'),('open','profile'),('profile','edit','right','left',None,'Yes',(278,293)),('edit','valid'),('valid','bad','left','right',None,'No',(278,458)),('bad','bf'),('valid','persist','right','left',None,'Yes',(538,458)),('persist','pf'),('profile','recover','left','top',[(35,310),(35,575),(150,575)],'No',(65,340)),('recover','verify','right','left',None,'Yes',(278,633)),('verify','reset','right','left'),('reset','rf'),('recover','logout','bottom','top',None,'No',(180,735)),('logout','endSession','right','left'),('endSession','end')],h=960)
