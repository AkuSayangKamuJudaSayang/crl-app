"""Release .6: regenerate only affected recovery activities in the native theme."""
from pathlib import Path
source_path=Path(__file__).with_name('build_coordinator_diagrams.py')
coordinator=source_path.read_text()
# Reuse geometry/theme helpers without rewriting unrelated figures.
exec(compile(coordinator[:coordinator.index('for name,coordinator in')],str(source_path),'exec'))
block=coordinator[coordinator.index("make('figure-23-section-archive'"):coordinator.index("d=Diagram('figure-26b-coordinator-erd'")]
exec(block)
block=coordinator[coordinator.index("legacy=source[source.index('# Figure 15:')"):coordinator.index("make('figure-19-admin-audit'")]
exec(block)
make('figure-20-admin-recovery',['Reading Coordinator','CRL-App','Protected records'],[
 ('s',0,100,'',S),('open',0,165,'Open Recovery; choose\narchive or backup action',P),('auth',1,165,'Verify coordinator\naccess',P),('choice',1,310,'Backups?',D),('teachers',2,310,'Load chosen teachers\nor the saved backup',P),('create',2,465,'Create encrypted copy;\nor validate backup action',P),('manage',2,620,'Save name / deletion;\nor return backup download',P),('bf',2,715,'',F),('category',0,310,'Choose Deleted Learners\nor Classes',P),('load',1,465,'Read available archives;\nshow teacher and days',P),('action',0,620,'Restore?',D),('verify',1,620,'Validate original archive\nand eligible destination',P),('restore',1,805,'Restore selected records;\nretain original deadline',P),('rf',1,900,'',F),('download',0,805,'Open Download dialog;\nsave the archive file',P),('df',0,900,'',F)
],[('s','open'),('open','auth','right','left'),('auth','choice'),('choice','teachers','right','left',None,'Yes',(538,293)),('teachers','create'),('create','manage'),('manage','bf'),('choice','category','left','right',None,'No',(278,293)),('category','load','bottom','left',[(150,465)]),('load','action','bottom','top',[(410,540),(150,540)]),('action','verify','right','left',None,'Yes',(278,603)),('verify','restore'),('restore','rf'),('action','download','bottom','top',None,'No',(180,720)),('download','df')],h=960)
