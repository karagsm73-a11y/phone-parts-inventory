import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import arabicFontUrl from './assets/arabic.ttf?url';

let fontB64 = null;
async function loadFont() {
  if (fontB64) return fontB64;
  const buf = await (await fetch(arabicFontUrl)).arrayBuffer();
  let s = ''; const bytes = new Uint8Array(buf); const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  fontB64 = btoa(s); return fontB64;
}

export async function exportPdf({ title, subtitle, head, body, filename, lang, summary }) {
  const b64 = await loadFont();
  const doc = new jsPDF({ orientation: head.length > 6 ? 'landscape' : 'portrait', unit: 'pt' });
  doc.addFileToVFS('Cairo.ttf', b64); doc.addFont('Cairo.ttf', 'Cairo', 'normal'); doc.setFont('Cairo');
  const rtl = lang === 'ar'; const W = doc.internal.pageSize.getWidth();
  doc.setFontSize(16); doc.text(title, rtl ? W - 40 : 40, 48, { align: rtl ? 'right' : 'left' });
  doc.setFontSize(10); if (subtitle) doc.text(subtitle, rtl ? W - 40 : 40, 66, { align: rtl ? 'right' : 'left' });
  let y = 84;
  if (summary && summary.length) {
    autoTable(doc, { startY: y, body: summary, theme: 'plain', styles: { font: 'Cairo', fontSize: 10, halign: rtl ? 'right' : 'left', cellPadding: 3 }, columnStyles: { 1: { fontStyle: 'normal', halign: rtl ? 'left' : 'right' } }, margin: { left: 40, right: 40 } });
    y = doc.lastAutoTable.finalY + 14;
  }
  autoTable(doc, { startY: y, head: [rtl ? [...head].reverse() : head], body: rtl ? body.map(r => [...r].reverse()) : body, styles: { font: 'Cairo', fontSize: 9, halign: rtl ? 'right' : 'left' }, headStyles: { fillColor: [30, 41, 59], textColor: 255, font: 'Cairo' }, margin: { left: 40, right: 40 } });
  doc.save(filename.endsWith('.pdf') ? filename : filename + '.pdf');
}

export function exportCsv({ head, body, filename }) {
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [head.map(esc).join(','), ...body.map(r => r.map(esc).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename.endsWith('.csv') ? filename : filename + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}