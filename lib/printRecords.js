// Wait for fixed inline report artwork before invoking the native print dialog.
export function waitForPrintArtwork(images,timeoutMs=8000){
 return Promise.all(Array.from(images||[],img=>{
  if(img.complete)return img.naturalWidth?Promise.resolve():Promise.reject(new Error('Print artwork unavailable.'));
  return new Promise((resolve,reject)=>{let finished=false;const cleanup=()=>{clearTimeout(timer);img.removeEventListener?.('load',done);img.removeEventListener?.('error',fail);},done=()=>{if(finished)return;finished=true;cleanup();resolve();},fail=()=>{if(finished)return;finished=true;cleanup();reject(new Error('Print artwork unavailable.'));},timer=setTimeout(fail,timeoutMs);
   img.addEventListener?.('load',done);img.addEventListener?.('error',fail);if(img.decode)Promise.resolve().then(()=>img.decode()).then(done,fail);else if(img.complete)img.naturalWidth?done():fail();
  });
 }));
}
// Browser-added headers live in page margins. Keep the last print rule explicit
// for every sheet; custom printer/browser preferences remain user-controlled.
export const CLEAN_PRINT_PAGE_CSS=['',' :first',' :left',' :right',' crlaPart2',' crlaPart2:first',' crlaPart2:left',' crlaPart2:right'].map(name=>`@page${name}{margin:0!important;${['top-left-corner','top-left','top-center','top-right','top-right-corner','bottom-left-corner','bottom-left','bottom-center','bottom-right','bottom-right-corner'].map(box=>`@${box}{content:none!important}`).join('')}}`).join('');
export const CLEAN_PRINT_HINT='For a clean copy, use Margins: None and turn off Headers and footers in your browser’s print settings.';
// Clone rendered text rather than interpolate learner input into HTML.
export function printAssessmentElement(element,title,{orientation='landscape',css='',showTitle=true,onError}={}){
 if(!element)throw new Error('Open a report before printing.');
 const frame=document.createElement('iframe');frame.title='Print assessment record';frame.style.cssText='position:fixed;width:1px;height:1px;right:0;bottom:0;border:0';document.body.appendChild(frame);
 const doc=frame.contentDocument;doc.open();doc.write('<!doctype html><html><head><meta charset="UTF-8"><title></title></head><body></body></html>');doc.close();doc.title='';
 const style=doc.createElement('style');style.textContent='@page{size:A4 landscape;margin:10mm}body{margin:0;padding:10mm;font:10px Arial;color:#111}h1{font-size:17px}h2,h3{font-size:13px}table{border-collapse:collapse;width:100%;font:inherit}th,td{border:1px solid #999;padding:5px;white-space:normal}thead{display:table-header-group}tr{break-inside:avoid}svg{max-width:100%}*{max-height:none!important;overflow:visible!important;position:static!important}button,nav,select,input{display:none!important}';doc.head.appendChild(style);
 if(orientation==='portrait'||css){const extraStyle=doc.createElement('style');extraStyle.textContent=(orientation==='portrait'?'@page{size:A4 portrait;margin:12mm}':'')+css;doc.head.appendChild(extraStyle);}
 const cleanStyle=doc.createElement('style');cleanStyle.textContent=CLEAN_PRINT_PAGE_CSS;doc.head.appendChild(cleanStyle);
 if(showTitle){const heading=doc.createElement('h1');heading.textContent=title;doc.body.appendChild(heading);}
 const clone=element.cloneNode(true);clone.querySelectorAll('[data-print-exclude],button,nav,select,[role=tablist],.recordsHeaderActions,.containerBackArrow').forEach(n=>n.remove());clone.querySelectorAll('textarea,input').forEach(n=>{const text=doc.createElement('span');text.textContent=n.value||'';n.replaceWith(text);});clone.querySelectorAll('[style]').forEach(n=>n.removeAttribute('style'));clone.querySelectorAll('details').forEach(n=>n.open=true);doc.body.appendChild(clone);
 // SVG report artwork is not included in document.images. Decode the same
 // embedded sources before printing so official logos cannot race the dialog.
 const svgArtwork=Array.from(doc.querySelectorAll('svg image'),node=>{const image=doc.createElement('img');image.src=node.getAttribute('href')||node.getAttribute('xlink:href')||'';return image;});
 const cleanup=()=>frame.remove();frame.contentWindow.addEventListener('afterprint',cleanup,{once:true});Promise.all([Promise.resolve(doc.fonts?.ready),waitForPrintArtwork([...doc.images,...svgArtwork])]).then(()=>{frame.contentWindow.focus();frame.contentWindow.print();}).catch(error=>{cleanup();onError?.(error);});
}
