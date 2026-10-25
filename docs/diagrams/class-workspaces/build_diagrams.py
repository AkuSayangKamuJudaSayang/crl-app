"""Editable SVG and diagrams.net source for the class-workspace revision.
Coordinates are shared by both formats. Export PNGs with the installed Sharp.
"""
from pathlib import Path
from xml.etree import ElementTree as E
import html, textwrap, json

ROOT=Path(__file__).parent
COLORS=['#e7f0ff','#e2f7ee','#f0e8ff']
class Diagram:
 def __init__(self,name,w=820,h=1000):
  self.name=name;self.w=w;self.h=h;self.items=[];self.lines=[];self.nodes={};self.counter=0;self.entitymeta={};self.entityitems=set()
 def text(self,x,y,text,size=19,anchor='middle',color='#223249',bold=False,width=25):
  lines=[]
  for line in text.split('\n'):lines.extend(textwrap.wrap(line,width=width) or [''])
  self.items.append(('text',x,y,lines,size,anchor,color,bold))
 def rect(self,x,y,w,h,fill,stroke='#34465c',radius=0):self.items.append(('rect',x,y,w,h,fill,stroke,radius))
 def node(self,key,x,y,label,kind='process',w=210,h=48):
  self.nodes[key]=(x-w/2,y-h/2,w,h,kind);self.items.append(('node',key,x,y,w,h,label,kind))
 def point(self,key,side):
  x,y,w,h,_=self.nodes[key]
  if ':' in side:
   edge,fraction=side.split(':');t=float(fraction)
   return {'top':(x+w*t,y),'bottom':(x+w*t,y+h),'left':(x,y+h*t),'right':(x+w,y+h*t)}[edge]
  return {'top':(x+w/2,y),'bottom':(x+w/2,y+h),'left':(x,y+h/2),'right':(x+w,y+h/2)}[side]
 def edge(self,a,b,sa='bottom',sb='top',via=None,label='',labelpos=None,arrow=True,crow=None):
  points=[self.point(a,sa),*(via or []),self.point(b,sb)]
  self.lines.append((a,b,sa,sb,points,label,labelpos,arrow,crow))
 def lanes(self,names):
  for i,name in enumerate(names):
   lane=260 if self.w==820 else (self.w-40)/len(names);x=20+i*lane;self.rect(x,20,lane,self.h-40,(['#dcebf9','#ece5f7','#dff2e8'] if self.name=='figure-08-assessment' else ['#f7faff','#f6fcf9','#fbf8ff'])[i], '#b6c4d2');self.rect(x,20,lane,64 if self.name=='figure-08-assessment' else 52,(['#dcebf9','#ece5f7','#dff2e8'] if self.name=='figure-08-assessment' else COLORS)[i],'#b6c4d2');self.text(x+(130 if self.w==820 else lane/2),44 if self.name=='figure-08-assessment' else 51,name,20,bold=True,width=24)
 def entity(self,key,x,y,w,title,fields):
  first=len(self.items);h=42+len(fields)*25;self.entitymeta[key]=(x,y,w,h,title,fields);self.nodes[key]=(x,y,w,h,'entity');self.rect(x,y,w,h,'#ffffff','#34465c',7);self.rect(x,y,w,37,'#e2ecfa','#34465c',7);self.text(x+w/2,y+26,title,21,bold=True,width=32)
  for i,f in enumerate(fields):self.text(x+14,y+61+i*25,f,18,'start',width=36)
  self.entityitems.update(range(first,len(self.items)))
 def output(self):
  s=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}"><rect width="100%" height="100%" fill="white"/><defs><marker id="arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M1,1 L11,6 L1,11" fill="none" stroke="#34465c" stroke-width="1.8"/></marker></defs>']
  for item in self.items:
   if item[0]=='rect':
    _,x,y,w,h,fill,stroke,r=item;s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
  # Lines below process shapes give clean attached endpoints.
  for a,b,sa,sb,pts,label,lp,arrow,crow in self.lines:
   s.append('<polyline points="'+' '.join(f'{x},{y}' for x,y in pts)+'" fill="none" stroke="#34465c" stroke-width="2.1" stroke-linejoin="round"'+(' marker-end="url(#arrow)"' if arrow else '')+'/>')
  for item in self.items:
   typ=item[0]
   if typ=='rect':
    continue
    _,x,y,w,h,fill,stroke,r=item;s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
   elif typ=='text':
    _,x,y,lines,size,anchor,color,bold=item
    for i,line in enumerate(lines):s.append(f'<text x="{x}" y="{y+i*size*1.17}" text-anchor="{anchor}" font-family="DejaVu Sans,Arial,sans-serif" font-size="{size}" fill="{color}"'+(' font-weight="bold"' if bold else '')+'>'+html.escape(line)+'</text>')
   elif typ=='node':
    _,key,x,y,w,h,label,kind=item
    if kind=='ellipse':s.append(f'<ellipse cx="{x}" cy="{y}" rx="{w/2}" ry="{h/2}" fill="white" stroke="#34465c" stroke-width="2"/>')
    elif kind=='decision':s.append(f'<polygon points="{x},{y-h/2} {x+w/2},{y} {x},{y+h/2} {x-w/2},{y}" fill="#fff0b8" stroke="#34465c" stroke-width="2.2"/>')
    elif kind in ['start','end']:
     s.append(f'<circle cx="{x}" cy="{y}" r="{w/2}" fill="'+('#223249' if kind=='start' else 'white')+'" stroke="#223249" stroke-width="2"/>')
     if kind=='end':s.append(f'<circle cx="{x}" cy="{y}" r="{w/2-5}" fill="#223249"/>')
    else:s.append(f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" rx="9" fill="white" stroke="#34465c" stroke-width="2"/>')
    if label:
     lines=label.split('\n');size=getattr(self,'font',17)
     for i,line in enumerate(lines):s.append(f'<text x="{x}" y="{y+(i-(len(lines)-1)/2)*(21 if size==17 else 25)+6}" text-anchor="middle" font-family="DejaVu Sans,Arial,sans-serif" font-size="{size}" fill="#223249">{html.escape(line)}</text>')
  for a,b,sa,sb,pts,label,lp,arrow,crow in self.lines:
   if label and lp:
    x,y=lp;tw=len(label)*10+12;s.append(f'<rect x="{x-tw/2}" y="{y-17}" width="{tw}" height="23" rx="3" fill="white"/><text x="{x}" y="{y}" text-anchor="middle" font-family="DejaVu Sans,Arial,sans-serif" font-size="18" fill="#223249">{html.escape(label)}</text>')
   if crow:
    # Cardinalities are geometric endpoint symbols, never numeric multiplicities.
    for pos,near,kind in [(pts[0],pts[1],crow[0]),(pts[-1],pts[-2],crow[1])]:
     x,y=pos;dx,dy=near[0]-x,near[1]-y;length=(dx*dx+dy*dy)**.5;ux,uy=dx/length,dy/length;vx,vy=-uy,ux
     def line(u,v,u2,v2):s.append(f'<line x1="{x+u*ux+v*vx}" y1="{y+u*uy+v*vy}" x2="{x+u2*ux+v2*vx}" y2="{y+u2*uy+v2*vy}" stroke="#223249" stroke-width="2"/>')
     if kind=='one':line(8,-9,8,9);line(15,-9,15,9)
     elif kind=='many':
      line(1,-10,18,0);line(1,10,18,0);line(1,0,18,0);s.append(f'<circle cx="{x+28*ux}" cy="{y+28*uy}" r="6" fill="white" stroke="#223249" stroke-width="2"/>')
     elif kind=='optional':line(8,-9,8,9);s.append(f'<circle cx="{x+24*ux}" cy="{y+24*uy}" r="6" fill="white" stroke="#223249" stroke-width="2"/>')
  s.append('</svg>');svg=''.join(s);svg=svg.replace('DejaVu Sans,Arial,sans-serif','Arial,sans-serif') if self.name=='figure-08-assessment' else svg;(ROOT/(self.name+'.svg')).write_text(svg)
  self.drawio()
 def drawio(self):
  mx=E.Element('mxfile',host='app.diagrams.net',version='24.0.0');di=E.SubElement(mx,'diagram',id=self.name,name=self.name);model=E.SubElement(di,'mxGraphModel',dx=str(self.w),dy=str(self.h),grid='1',gridSize='10',page='1',pageWidth=str(self.w),pageHeight=str(self.h));root=E.SubElement(model,'root');E.SubElement(root,'mxCell',id='0');E.SubElement(root,'mxCell',id='1',parent='0');counter=0
  for itemindex,item in enumerate(self.items):
   if itemindex in self.entityitems:continue
   counter+=1;typ=item[0]
   if typ=='rect':
    _,x,y,w,h,fill,stroke,r=item;value='';key='bg'+str(counter);style=f'rounded={int(r>0)};fillColor={fill};strokeColor={stroke};'
   elif typ=='text':
    _,x,y,lines,size,anchor,color,bold=item;value='<br>'.join(html.escape(l) for l in lines);w=600;h=len(lines)*size*1.2;key='txt'+str(counter);x=x if anchor=='start' else x-w/2;y=y-size;style=f'text;html=1;align={"left" if anchor=="start" else "center"};verticalAlign=top;fontSize={size};fontColor={color};fontStyle={int(bold)};strokeColor=none;fillColor=none;'
   else:
    _,key,cx,cy,w,h,value,kind=item;x=cx-w/2;y=cy-h/2;value=html.escape(value).replace('\n','<br>');style=f'rounded=1;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#34465c;strokeWidth=2;fontSize=19;'
    if kind=='ellipse':style+='shape=ellipse;'
    if kind=='decision':style+='shape=rhombus;fillColor=#fff0b8;fontSize=18;'
    if kind in ['start','end']:style+=f'shape={"ellipse" if kind=="start" else "doubleEllipse"};fillColor=#223249;'
   cell=E.SubElement(root,'mxCell',id=key,value=value,style=style,vertex='1',parent='1');E.SubElement(cell,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})
  for key,(x,y,w,h,title,fields) in self.entitymeta.items():
   value='<b>'+html.escape(title)+'</b><br><hr>'+'<br>'.join(html.escape(f) for f in fields)
   cell=E.SubElement(root,'mxCell',id=key,value=value,style='rounded=1;html=1;whiteSpace=wrap;fillColor=#ffffff;strokeColor=#34465c;strokeWidth=2;align=left;verticalAlign=top;spacing=12;fontSize=18;',vertex='1',parent='1');E.SubElement(cell,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})
  for j,(a,b,sa,sb,pts,label,lp,arrow,crow) in enumerate(self.lines):
   ports={'top':(.5,0),'bottom':(.5,1),'left':(0,.5),'right':(1,.5)};ex,ey=ports.get(sa.split(':')[0],(.5,.5));ix,iy=ports.get(sb.split(':')[0],(.5,.5));
   if ':' in sa:
    if sa.startswith(('left','right')):ey=float(sa.split(':')[1])
    else:ex=float(sa.split(':')[1])
   if ':' in sb:
    if sb.startswith(('left','right')):iy=float(sb.split(':')[1])
    else:ix=float(sb.split(':')[1])
   style=f'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow={"open" if arrow else "none"};strokeColor=#34465c;strokeWidth=2;exitX={ex};exitY={ey};entryX={ix};entryY={iy};fontSize=18;labelBackgroundColor=#ffffff;'
   if crow:style+=f'startArrow={"ERmandOne" if crow[0]=="one" else "ERzeroToOne"};endArrow={"ERzeroToMany" if crow[1]=="many" else "ERone"};'
   source=a if a in self.nodes else None;target=b if b in self.nodes else None
   cell=E.SubElement(root,'mxCell',id='edge'+str(j),value=label,style=style,edge='1',parent='1',**({'source':source,'target':target} if source and target else {}));geom=E.SubElement(cell,'mxGeometry',relative='1',**{'as':'geometry'});E.SubElement(geom,'mxPoint',x=str(pts[0][0]),y=str(pts[0][1]),**{'as':'sourcePoint'});E.SubElement(geom,'mxPoint',x=str(pts[-1][0]),y=str(pts[-1][1]),**{'as':'targetPoint'});arr=E.SubElement(geom,'Array',**{'as':'points'})
   for x,y in pts[1:-1]:E.SubElement(arr,'mxPoint',x=str(x),y=str(y))
  E.indent(mx);E.ElementTree(mx).write(ROOT/(self.name+'.drawio'),encoding='utf-8',xml_declaration=True)

def activity(name,lanes,nodes,edges,h=1000):
 d=Diagram(name,h=h);d.lanes(lanes)
 for key,lane,y,label,kind in nodes:d.node(key,150+lane*260,y,label,kind,w=18 if kind in ['start','end'] else 170 if kind=='decision' else (184 if name=='figure-23-section-archive' and key in ['d','f'] else 236),h=18 if kind in ['start','end'] else 74 if kind=='decision' else 52)
 for edge in edges:d.edge(*edge)
 d.output();return d
P='process';D='decision';S='start';F='end'
# Figure 4: colored overall period administration, distinct from the scoring tree.
d=Diagram('figure-04-period-flow',820,990)
for y,h,color,label in [(35,235,'#edf4ff','CLASS AND PERIOD'),(290,335,'#edf9f2','TEACHER-LED TASKS'),(645,330,'#f5f0ff','REVIEW AND RECORDS')]:d.rect(70,y,680,h,color,'#c1ccd8',14);d.text(675,y+65,label,16,bold=True,width=13)
for key,x,y,text,kind,w,h in [('a',410,107,'Choose S.Y. and section',P,360,48),('b',410,180,'Select learner · press Start\nChoose BoSY / MoSY / EoSY',P,360,60),('c',410,318,'Prerequisite\ncompleted?',D,180,78),('blocked',158,318,'Keep period locked',P,180,48),('e',410,420,'Connect learner device\nPresent letter-sound task',P,360,58),('f',410,510,'Mark words if eligible\nApply Part 1 stopping rules',P,360,58),('g',410,600,'If eligible: passage + timer\nMiscues and six questions',P,360,58),('h',410,730,'Teacher reviews and saves\nComputed reading profile',P,360,60),('i',410,825,'Record in the same\nS.Y. / section / period',P,360,58),('j',410,925,'Review, export or choose\nthe next eligible period',P,360,58)]:d.node(key,x,y,text,kind,w,h)
d.edge('a','b');d.edge('b','c');d.edge('c','blocked','left','right',label='No',labelpos=(277,304));d.edge('blocked','b','top','left',[(158,180)],arrow=True);d.edge('c','e',label='Yes',labelpos=(439,377));d.edge('e','f');d.edge('f','g');d.edge('g','h');d.edge('h','i');d.edge('i','j');d.output()
# Figure 6: actor associations are straight lines, without direction arrows.
d=Diagram('figure-06-use-cases',820,1040);d.rect(175,25,520,990,'#f9fbff','#8fa5bb',12);d.text(435,59,'CRL-App teacher and learner workspace',19,bold=True,width=45)
goals=['Register and sign in','Manage profile / recover account','Manage school years and sections','Add, import or delete class learners','Conduct, mark or resume assessment','Edit assessment content','Review scores / edit remarks','Review class analytics / compare','Export class reports','Manage year / section / learner archives','Report a bug / send feedback','Pair, check or dismiss device link','View tasks / respond orally']
for i,label in enumerate(goals):d.node('u'+str(i),435,105+i*70,label,'ellipse',w=438,h=50)
# Actor silhouettes are code-native vector shapes.
for x,y,label in [(75,440,'Teacher /\nReading\nCoordinator'),(755,915,'Learner')]:
 d.items.append(('node','head'+str(x),x,y-45,30,30,'','start'));d.lines.extend([('', '', '', '',[(x,y-29),(x,y+24)],'',None,False,None),('','','','',[(x-27,y-10),(x+27,y-10)],'',None,False,None),('','','','',[(x,y+24),(x-24,y+58)],'',None,False,None),('','','','',[(x,y+24),(x+24,y+58)],'',None,False,None)]);d.text(x,y+88,label,18,width=16)
for i in range(12):d.lines.append(('','','','',[(103,430),(216,105+i*70)],'',None,False,None))
d.lines.append(('','','','',[(728,905),(654,875)],'',None,False,None));d.lines.append(('','','','',[(728,945),(654,945)],'',None,False,None));d.output()
# Figure 8: teacher, application and learner responsibilities.
# Administrator goals include the implemented teacher account-unlock review.
d=Diagram('figure-07-admin-use-cases',820,800)
d.rect(220,35,550,730,'#f8fbff','#8ea7c6',10);d.text(495,70,'CRL-App administrator workspace',22,bold=True,width=38)
admin_goals=['Sign in / sign out','Generate / revoke teacher invitations','Review teachers and audit activity','Review teacher unlock requests','Approve / reject eligible unlock request','Review bug reports / feedback','Create / import / download backups','Restore eligible snapshots']
for i,label in enumerate(admin_goals):d.node('a'+str(i),495,125+i*78,label,'ellipse',w=480,h=48)
d.items.append(('node','adminhead',95,340,30,30,'','start'));d.lines.extend([('','','','',[(95,356),(95,415)],'',None,False,None),('','','','',[(68,383),(122,383)],'',None,False,None),('','','','',[(95,415),(72,449)],'',None,False,None),('','','','',[(95,415),(118,449)],'',None,False,None)]);d.text(95,485,'System Administrator',20,width=16)
for i in range(len(admin_goals)):d.lines.append(('','','','',[(122,383),(255,125+i*78)],'',None,False,None))
d.output()

activity('figure-08-assessment',['Teacher / Reading Coordinator','CRL-App','Learner'],[
 ('s',0,102,'',S),('a',0,153,'Choose S.Y., section\nand learner',P),('b',0,230,'Press Start; select\none period',P),('c',1,230,'Prior period\ncompleted?',D),('n',1,350,'Explain locked period;\nretain class selection',P),('nf',1,410,'',F),('d',2,465,'Scan QR or enter code;\nview current task',P),('e',0,465,'Mark oral letter sounds\nand word responses',P),('f',1,560,'Apply screening rules\nand stopping conditions',P),('g',1,655,'Continue\nto passage?',D),('h',2,755,'Read passage; answer\nsix oral questions',P),('i',0,785,'Manage timer, miscues\nand comprehension',P),('early',0,655,'Review and save\nearly classification',P),('earlyend',0,714,'',F),('j',0,875,'Review result; confirm\nSave Assessment',P),('k',1,950,'Persist in this class;\nqueue locally if offline',P),('z',1,1012,'',F)
],[('s','a'),('a','b'),('b','c','right','left'),('c','n','bottom','top',None,'No',(439,303)),('n','nf'),('c','d','right','top',[(670,230)],'Yes',(536,215)),('d','e','left','right'),('e','f','bottom','left',[(150,560)]),('f','g'),('g','h','right','top',[(670,655)],'Yes',(535,641)),('h','i','left','right',[(550,755),(550,785)]),('i','j'),('g','early','left','right',None,'No',(297,640)),('early','earlyend'),('j','k','bottom','left',[(150,950)]),('k','z')],h=1050)
# Figure 11: authenticated queue handling, including the one-time reset epoch.
activity('figure-11-sync',['Teacher device','Local storage','Application server'],[
 ('s',0,103,'',S),('a',0,154,'Save assessment, remark\nor roster change',P),('b',1,154,'Persist class identity\nand ordered queue',P),('c',1,255,'Internet\nreachable?',D),('n',0,255,'Show saved-offline\nstatus; keep pending work',P),('nf',0,321,'',F),('d',2,358,'Verify teacher ownership,\nclass and roster version',P),('e',2,460,'Deleted or\nreset learner?',D),('x',1,460,'Remove only confirmed\nobsolete learner work',P),('xf',1,527,'',F),('f',2,575,'Apply ordered changes\nwithout duplicate results',P),('g',2,680,'Acknowledged\nsuccessfully?',D),('retry',2,800,'Keep failed work queued;\nshow a clear retry reason',P),('rf',2,866,'',F),('h',1,800,'Clear acknowledged work;\nkeep newer edits pending',P),('i',0,900,'Show green progress\nwith item / learner details',P),('z',0,966,'',F)
],[('s','a'),('a','b','right','left'),('b','c'),('c','n','left','right',None,'No',(278,242)),('n','nf'),('c','d','right','top',[(670,255)],'Yes',(538,241)),('d','e'),('e','x','left','right',None,'Yes',(537,444)),('x','xf'),('e','f','bottom','top',None,'No',(696,523)),('f','g'),('g','retry','bottom','top',None,'No',(697,741)),('retry','rf'),('g','h','left','top',[(410,680)],'Yes',(540,665)),('h','i','left','top',[(150,800)]),('i','z')],h=1005)
# Figure 15: class menus and deliberate learner deletion.
activity('figure-15-class-management',['Teacher / Coordinator','CRL-App','Class records'],[
 ('s',0,100,'',S),('a',0,150,'Choose year, then section\nUse top-left Back',P),('b',1,150,'Authorize class; load\nonly its enrolled roster',P),('c',0,255,'Delete\nlearner(s)?',D),('add',1,255,'Add / import learners\nEdit year / section menu',P),('add2',2,350,'Validate and save in\nthe selected class only',P),('add3',2,430,'Include unassessed\nlearners with no results',P),('addf',2,492,'',F),('d',0,410,'Type required phrase;\nexplain deletion reason',P),('e',1,510,'Valid phrase\nand reason?',D),('bad',0,510,'Explain mismatch;\nkeep records unchanged',P),('badf',0,574,'',F),('f',2,607,'Check ownership and\nactive assessment',P),('arc',2,684,'Archive each learner\nwith assessment records',P),('g',2,761,'Delete enrollment and\ndependent results',P),('h',1,838,'Clear stale learner work;\nkeep other classes',P),('i',1,915,'Refresh this class roster\nand enrolled counts',P),('z',1,979,'',F)
],[('s','a'),('a','b','right','left'),('b','c','bottom','top',[(410,195),(150,195)]),('c','add','right','left',None,'No',(278,239)),('add','add2','right','top',[(670,255)]),('add2','add3'),('add3','addf'),('c','d','bottom','top',None,'Yes',(178,337)),('d','e','right','top',[(410,410)]),('e','bad','left','right',None,'No',(278,495)),('bad','badf'),('e','f','right','top',[(670,510)],'Yes',(539,494)),('f','arc'),('arc','g'),('g','h','bottom','right',[(670,838)]),('h','i'),('i','z')],h=1020)
# Figure 16: stepwise Analytics, explicit graph-only year scope, and Records.
d=Diagram('figure-16-records-reports',1000,1290);d.font=20;d.lanes(['Teacher / Coordinator','CRL-App','Class records'])
nodes=[('s',180,100,'',S),('open',180,160,'Open Records\nor Analytics',P),('choose',180,245,'Choose year, then\nsection / All Sections',P),('auth',500,245,'Verify selected scope\nand teacher',P),('data',820,245,'Load owned class data\nand matching results',P),('view',500,370,'Analytics?',D),('all',180,370,'All\nSections?',D),('combined',180,520,'Review one combined\nprofile graph',P),('cf',180,584,'',F),('charts',500,500,'Review class charts\nand comparisons',P),('learner',500,610,'Choose learner\nand period',P),('detail',820,610,'Return class result\nand evidence',P),('review',500,740,'Review or enlarge\nchart / result',P),('af',500,804,'',F),('records',820,855,'Import class record;\nreview enrolled learners\nand recorded results',P),('edit',500,980,'Edit remarks?',D),('read',820,980,'Review selected\nclass reports',P),('change',500,1090,'Edit remarks',P),('validate',180,1090,'Keep original\nscores and dates',P),('save',180,1190,'Save or queue\nremarks',P),('refresh',500,1190,'Refresh records',P),('export',820,1190,'Download class\nreport if needed',P),('z',820,1254,'',F)]
for key,x,y,label,kind in nodes:d.node(key,x,y,label,kind,w=18 if kind in [S,F] else 210 if kind==D else 236,h=18 if kind in [S,F] else 88 if kind==D else 84 if key=='records' else 52)
for edge in [('s','open'),('open','choose'),('choose','auth','right','left'),('auth','data','right','left'),('data','view','bottom','top',[(820,300),(500,300)]),('view','all','left','right',None,'Yes',(350,355)),('all','combined','left','left',[(42,370),(42,520)],'Yes',(55,350)),('combined','cf'),('all','charts','bottom','top',[(180,450),(500,450)],'No',(210,434)),('charts','learner'),('learner','detail','right','left'),('detail','review','bottom','top',[(820,675),(500,675)]),('review','af'),('view','records','right','right',[(960,370),(960,855)],'No',(650,355)),('records','edit','bottom','top',[(820,910),(500,910)]),('edit','read','right','left',None,'No',(650,965)),('edit','change','bottom','top',None,'Yes',(530,1049)),('read','export'),('change','validate','left','right'),('validate','save'),('save','refresh','right','left'),('refresh','export','right','left'),('export','z')]:d.edge(*edge)
d.output()
# New Figure 23, before the ERD section.
d=Diagram('figure-23-section-archive',1000,1300);d.font=21;d.lanes(['Teacher / Coordinator','CRL-App','Archives / records'])
nodes=[('s',180,100,'',S),('a',180,160,'Open class list',P),('b',180,245,'Import backup?',D),('choose',500,245,'Delete, or Archive\nin Records',P),('c',500,355,'Owned; no\nactive test?',D),('no',180,355,'Explain; retain data',P),('nof',180,419,'',F),('empty',500,480,'Empty\ndeletion?',D),('simple',180,480,'Confirm empty\ndeletion',P),('d',820,480,'Type required phrase;\nreason when deleting',P),('e',820,590,'Save section backups;\nbundle the selected year',P),('f',820,700,'Delete\ncontainer?',D),('del',500,700,'Remove source records;\nretain class identifiers',P),('refresh',500,790,'Refresh active lists;\nkeep other classes',P),('delf',500,854,'',F),('read',820,820,'Keep source class\nread-only',P),('download',180,950,'Download backup\nfrom Records',P),('downf',180,1014,'',F),('g',180,1100,'Use original backup;\nempty year or section',P),('h',500,1100,'Valid backup;\nempty target?',D),('bad',820,1100,'Reject invalid backup;\nkeep destination',P),('badf',820,1164,'',F),('restore',500,1200,'Restore once; retain\noriginal archive',P),('z',500,1264,'',F)]
for key,x,y,label,kind in nodes:d.node(key,x,y,label,kind,w=18 if kind in [S,F] else 210 if kind==D else 236 if x==180 else 278,h=18 if kind in [S,F] else 88 if kind==D else 64)
for edge in [('s','a'),('a','b'),('b','choose','right','left',None,'No',(320,230)),('choose','c'),('c','no','left','right',None,'No',(350,340)),('no','nof'),('c','empty','bottom','top',None,'Yes',(530,423)),('empty','simple','left','right',None,'Yes',(350,465)),('simple','del','bottom','top',[(180,645),(500,645)]),('empty','d','right','left',None,'No',(650,465)),('d','e'),('e','f'),('f','del','left','right',None,'Yes',(675,685)),('del','refresh'),('refresh','delf'),('f','read','bottom','top',None,'No',(850,774)),('read','download','bottom','top',[(820,890),(180,890)]),('download','downf'),('b','g','left','left',[(42,245),(42,1100)],'Yes',(55,230)),('g','h','right','left'),('h','bad','right','left',None,'No',(650,1085)),('bad','badf'),('h','restore','bottom','top',None,'Yes',(531,1158)),('restore','z')]:d.edge(*edge)
d.output()
# ERD 24: selected physical keys for the new enrollment hierarchy.
d=Diagram('figure-24-class-erd',860,1070)
d.entity('user',80,90,300,'users',['PK id','UQ username','role','learner_data_version'])
d.entity('year',490,90,290,'school_years',['PK id','FK teacher_id','start_year; label','archived_at ?; deleted_at ?','UQ active teacher + year'])
d.entity('section',490,330,290,'class_sections',['PK id; FK teacher_id','FK school_year_id','name; name_key','archived_at ?; deleted_at ?','UQ active year + name'])
d.entity('learner',80,355,300,'learners (enrollments)',['PK id; FK teacher_id','FK class_section_id','lrn; first_name; last_name','sex; grade_level','UQ class_section_id + lrn'])
d.entity('session',80,710,300,'assessment_sessions',['PK id; FK learner_id','FK teacher_id','assessment_period','date_administered','is_completed'])
d.entity('archive',490,675,290,'class_archives',['PK id; FK teacher_id','kind: year / section / learner','source_section_id ? (kept)','source_school_year_id ?','source_learner_id ? (kept)','section_count ?','school_year_label','section_name; learner_name ?','encrypted_snapshot'])
for a,b,sa,sb,via,label,lp in [('user','year','right','left',None,'owns',(435,150)),('year','section','bottom','top',None,'year + owner',(635,290)),('section','learner','left','right',None,'class',(435,431)),('learner','session','bottom','top',None,'has',(230,655)),('user','section','right','left',[(435,200),(435,400)],'owns',(435,350)),('user','learner','bottom','top',None,'owns',(230,300)),('user','session','left','left',[(55,200),(55,790)],'',None),('user','archive','left','bottom',[(32,200),(32,1020),(635,1020)],'retains',(635,1010))]:d.edge(a,b,sa,sb,via,label,lp,False,('one','many'))
d.text(430,1058,'Double bar = exactly one · circle and fork = zero or many',17,width=80);d.output()
# ERD 26: separate issuer/redeemer and requester/reviewer foreign keys.
d=Diagram('figure-26-account-erd',860,1000)
d.entity('user',65,90,300,'users',['PK id; UQ username','role; password_hash','failed_login_attempts','login_locked_until ?'])
d.entity('invite',500,90,305,'invite_codes',['PK id; UQ code','FK generated_by ?','FK used_by_id ?','is_used; expires_at ?'])
d.entity('content',65,450,300,'assessment_content',['PK id; FK teacher_id','assessment_period; category','position; content; story_title ?'])
d.entity('unlock',500,450,305,'account_unlock_requests',['PK id; FK teacher_id','FK resolved_by_id ?','lock_id; locked_until','status; resolved_at ?'])
d.entity('host',65,745,300,'host_sessions (selected)',['PK id; UQ code','FK assessment_content_id ?','Other declared host links:','teacher, learner, assessment'])
d.edge('user','invite','right:0.25','left:0.25',None,'issuer',(430,114),False,('optional','many'))
d.edge('user','invite','right:0.60','left:0.60',None,'redeemer',(430,202),False,('optional','many'))
d.edge('user','content','bottom','top',None,'teacher',(215,350),False,('one','many'))
d.edge('user','unlock','right:0.80','left:0.75',[(410,203.6),(410,556.5)],'requester',(443,545),False,('one','many'))
d.edge('user','unlock','right:0.98','left:0.25',[(450,229.16),(450,485.5)],'reviewer',(443,471),False,('optional','many'))
d.edge('content','host','bottom','top',None,'selected content',(215,675),False,('optional','many'))
d.text(635,795,'Selected-key view.\nNullable links use\na circle and bar.\nNo numeric multiplicities.',20,width=28)
d.text(430,975,'? = nullable field · separate lines represent separate declared keys',17,width=83);d.output()
manifest={p.stem:{'svg':p.name,'png':p.with_suffix('.png').name,'drawio':p.with_suffix('.drawio').name} for p in sorted(ROOT.glob('*.svg'))};(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Rendered',len(manifest),'editable diagrams')
