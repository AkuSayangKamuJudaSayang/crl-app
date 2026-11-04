"""Update only administrator use cases and shared library activity."""
from pathlib import Path
p=Path(__file__).with_name('build_coordinator_diagrams.py')
s=p.read_text()
exec(compile(s[:s.index('for name,coordinator in')],str(p),'exec'))
block=s[s.index('for name,coordinator in'):s.index("d=Diagram('figure-04-period-flow'")]
exec(block.replace("[('figure-06-use-cases',False),('figure-07-admin-use-cases',True)]","[('figure-07-admin-use-cases',True)]"))
exec(s[s.index("make('figure-17-content-management'"):s.index("make('figure-12-story-editing'")])
