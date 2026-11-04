"""Targeted activity lease / recovery update, using the established theme."""
from pathlib import Path
s=Path(__file__).with_name('build_coordinator_diagrams.py').read_text()
exec(compile(s[:s.index('for name,coordinator in')],__file__,'exec'))
exec(s[s.index("make('figure-17-content-management'"):s.index("make('figure-12-story-editing'")].replace('no active run?','no live lease?'))
make('figure-22-assessment-recovery',['Teacher','CRL-App','Saved progress'],[
 ('s',0,100,'',S),('open',0,160,'Reopen interrupted app',P),('load',1,160,'Pause after interruption;\nrelease stale live lock',P),('read',2,160,'Load owned checkpoint\nand original content version',P),('eligible',1,320,'Within 24h;\nstill eligible?',D),('stop',0,320,'End expired attempt;\nretain recorded evidence',P),('sf',0,410,'',F),('offer',1,490,'Offer Continue or End',P),('choice',1,650,'Continue?',D),('end',0,650,'End explicitly; retain\nresults and sync journal',P),('ef',0,750,'',F),('restore',2,650,'Restore paused timer;\nreconnect learner display',P),('live',2,850,'Confirm fresh learner;\nresume live assessment',P),('rf',2,950,'',F)
],[('s','open'),('open','load','right','left'),('load','read','right','left'),('read','eligible','bottom','right',[(670,320)]),('eligible','stop','left','right',None,'No',(278,300)),('stop','sf'),('eligible','offer','bottom','top',None,'Yes',(440,405)),('offer','choice'),('choice','end','left','right',None,'No',(278,630)),('end','ef'),('choice','restore','right','left',None,'Yes',(538,630)),('restore','live'),('live','rf')],h=1000)
