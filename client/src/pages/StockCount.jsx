import React, { useState, useMemo } from 'react';
import { FileDown, FileSpreadsheet, Copy, Eraser } from 'lucide-react';
import { useT, fmtDate } from '../i18n';
import { get } from '../api';
import { useLive, Loading, ErrorBox, Btn, AsyncBtn, Input, useToast, copyText, Toggle, Empty } from '../ui';
import { exportPdf, exportCsv } from '../export';

export default function StockCount({ nav }) {
  const { t, lang } = useT(); const push = useToast();
  const { data, error, loading, reload } = useLive(() => get('/stockcount'));
  const [counts, setCounts] = useState(() => { try { return JSON.parse(sessionStorage.getItem('pp_counts') || '{}'); } catch { return {}; } });
  const [onlyDiff, setOnlyDiff] = useState(false); const [q, setQ] = useState('');
  const setCount = (id, v) => { const c = { ...counts }; if (v === '') delete c[id]; else c[id] = v; setCounts(c); sessionStorage.setItem('pp_counts', JSON.stringify(c)); };
  const rows = useMemo(() => (data?.items || []).map(p => { const c = counts[p.id]; const counted = c === undefined || c === '' ? null : Number(c); const diff = counted === null ? null : counted - p.quantity; return { ...p, counted, diff, state: counted === null ? 'notCounted' : diff > 0 ? 'surplus' : diff < 0 ? 'missing' : 'matching' }; }), [data, counts]);
  const stats = useMemo(() => rows.reduce((a, r) => { a[r.state]++; return a; }, { surplus: 0, missing: 0, matching: 0, notCounted: 0 }), [rows]);
  const shown = rows.filter(r => (!onlyDiff || (r.diff !== null && r.diff !== 0)) && (!q || `${r.name} ${r.model} ${r.barcode}`.toLowerCase().includes(q.toLowerCase())));
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload(false)} />;
  if (loading && !data) return <Loading />;
  const head = [t('partName'), t('model'), t('barcode'), t('systemQty'), t('countedQty'), t('difference'), t('status')];
  const body = () => rows.filter(r => r.counted !== null).map(r => [r.name, r.model, r.barcode, r.quantity, r.counted, r.diff, t(r.state)]);
  const title = `${t('stockCount')} — ${nav.store}`; const sub = fmtDate(new Date().toISOString(), lang);
  const summary = [[t('surplus'), stats.surplus], [t('missing'), stats.missing], [t('matching'), stats.matching], [t('notCounted'), stats.notCounted]];
  const asText = () => `${title}\n${sub}\n${summary.map(([k, v]) => `${k}: ${v}`).join(' · ')}\n\n` + body().map(r => r.join('\t')).join('\n');
  const color = { surplus: 'blue', missing: 'red', matching: 'green', notCounted: 'gray' };
  return <div className="grid">
    <div className="hint" style={{ padding: '0 6px' }}>{t('stockCountHint')}</div>
    <div className="grid g4">{['surplus', 'missing', 'matching', 'notCounted'].map(k => <div key={k} className="glass stat"><span className="label">{t(k)}</span><span className={`value ${color[k] === 'gray' ? '' : color[k] === 'blue' ? 'accent' : color[k]}`}>{stats[k]}</span></div>)}</div>
    <div className="glass card">
      <div className="row between mb">
        <div className="row"><Input placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 240 }} /><Toggle on={onlyDiff} onChange={setOnlyDiff} label={t('showOnlyDiff')} /></div>
        <div className="row">
          <AsyncBtn onClick={() => exportPdf({ title, subtitle: sub, head, body: body(), filename: `stock-count-${new Date().toISOString().slice(0, 10)}`, lang, summary })}><FileDown size={16} />{t('exportPdf')}</AsyncBtn>
          <Btn onClick={() => exportCsv({ head, body: body(), filename: `stock-count-${new Date().toISOString().slice(0, 10)}` })}><FileSpreadsheet size={16} />{t('exportCsv')}</Btn>
          <Btn onClick={() => copyText(asText()).then(() => push(t('copied')))}><Copy size={16} />{t('copyText')}</Btn>
          <Btn className="ghost" onClick={() => { setCounts({}); sessionStorage.removeItem('pp_counts'); }}><Eraser size={16} /></Btn>
        </div>
      </div>
      {!shown.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('partName')}</th><th>{t('model')}</th><th>{t('barcode')}</th><th className="num">{t('systemQty')}</th><th className="num">{t('countedQty')}</th><th className="num">{t('difference')}</th><th>{t('status')}</th></tr></thead><tbody>
        {shown.map(r => <tr key={r.id}><td className="strong">{r.name}</td><td>{r.model}</td><td className="muted">{r.barcode}</td><td className="num">{r.quantity}</td><td className="num"><Input type="number" min="0" step="1" value={counts[r.id] ?? ''} onChange={e => setCount(r.id, e.target.value)} style={{ width: 90, minHeight: 36, padding: '6px 8px', textAlign: 'end' }} /></td><td className="num">{r.diff === null ? '—' : (r.diff > 0 ? '+' : '') + r.diff}</td><td><span className={`badge ${color[r.state]}`}>{t(r.state)}</span></td></tr>)}
      </tbody></table></div>}
    </div>
  </div>;
}