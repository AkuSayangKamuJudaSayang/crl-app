export function recordSectionSelection(sections=[],selected=[],search=''){
 const rows=sections||[],ids=new Set(rows.map(row=>row.id)),selection=[...new Set(selected)].filter(id=>ids.has(id)),picked=new Set(selection),q=search.trim().toLowerCase();
 return {rows,visible:rows.filter(row=>`${row.name} ${row.assignedTeacherName||''}`.toLowerCase().includes(q)),selection,allSelected:rows.length>0&&selection.length===rows.length,targets:selection.length?rows.filter(row=>picked.has(row.id)):rows};
}
