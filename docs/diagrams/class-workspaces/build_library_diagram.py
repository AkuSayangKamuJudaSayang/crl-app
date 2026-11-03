"""Regenerate only Figure 17 with the established activity-diagram geometry."""
from pathlib import Path
p=Path(__file__).with_name('build_coordinator_diagrams.py')
coordinator_source=p.read_text()
exec(compile(coordinator_source[:coordinator_source.index('for name,coordinator in')],str(p),'exec'))
exec(coordinator_source[coordinator_source.index("make('figure-17-content-management'"):coordinator_source.index("make('figure-12-story-editing'")])
