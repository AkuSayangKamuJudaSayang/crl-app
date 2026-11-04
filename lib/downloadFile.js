// Keep the URL alive while mobile browsers hand the download to their file UI.
// A click starts a browser download; it cannot confirm that the user saved it.
export function downloadBlob(blob, filename) {
  if (!(blob instanceof Blob) || !blob.size) throw new Error('The download is empty. Please try again.');
  const name=String(filename||'CRL-App-download').replace(/[\\/\x00-\x1f\x7f]/g,'_').trim();
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=name||'CRL-App-download';link.hidden=true;
  try {document.body.appendChild(link);link.click();}
  catch(error){URL.revokeObjectURL(url);throw error;}
  finally{link.remove();}
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
