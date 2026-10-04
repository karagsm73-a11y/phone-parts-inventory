import React, { useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { useT, fmtMoney } from '../i18n';
import { get } from '../api';
import { useLive, Loading, ErrorBox, Btn, AsyncBtn, Field, Input, Empty } from '../ui';
import { exportPdf, exportCsv } from '../export';

const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
export default function Reports({ nav }) {
  const { t, lang } = useT();
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1))); const [to, setTo] = useState(iso(now));
  const tz = -new Date().getTimezoneOffset();
  const { data, error, loading, reload } = useLive(() => get(`/reports?from=${from}&to=${to}&tzOffset=${tz}`), [from, to]);
  const presets = [
    [t('today'), () => { setFrom(iso(now)); setTo(iso(now)); }],
    [t('last7'), () => { const d = new Date(now); d.setDate(d.getDate() - 6); setFrom(iso(d)); setTo(iso(now)); }],
    [t('thisMonth'), () => { setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1))); setTo(iso(now)); }],
    [t('lastMonth'), () => { setFrom(iso(new Date(now.getFullYear(), now.getMonth() - 1, 1))); setTo(iso(new Date(now.getFullYear(), now.getMonth(), 0))); }],
  ];
  const d = data;
  const kpis = d ? [[t('partsUsed'), d.partsUsed], [t('revenue'), fmtMoney(d.revenue, lang)], [t('revenuePaid'), fmtMoney(d.revenuePaid, lang)], [t('revenueUnpaid'), fmtMoney(d.revenueUnpaid, lang)], [t('cost'), fmtMoney(d.cost, lang)], [t('expenses'), fmtMoney(d.expenses, lang)], [t('withdrawals'), fmtMoney(d.withdrawals, lang)], [t('refunds'), fmtMoney(d.refunds, lang)], [t('profit'), fmtMoney(d.profit, lang)], [t('topPart'), d.topPart ? `${d.topPart.name} (${d.topPart.count})` : '—'], [t('outstandingDebt'), fmtMoney(d.outstandingDebt, lang)]] : [];
  const head = [t('day'), t('partsUsed'), t('revenue'), t('cost')];
  const body = () => (d?.daily || []).map(r => [r.day, r.parts, Number(r.revenue), Number(r.cost)]);
  const fname = `report-${from}-${to}`;
  return <div className="grid">
    <div className="glass card"><div className="row between">
      <div className="row"><Field label={t('from')}><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label={t('to')}><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
        <div className="row" style={{ alignSelf: 'flex-end' }}>{presets.map(([l, fn]) => <Btn key={l} className="sm" onClick={fn}>{l}</Btn>)}</div></div>
      <div className="row" style={{ alignSelf: 'flex-end' }}>
        <AsyncBtn disabled={!d} onClick={() => exportPdf({ title: `${t('report')} — ${nav.store}`, subtitle: `${from} → ${to}`, head, body: body(), filename: fname, lang, summary: kpis })}><FileDown size={16} />{t('exportPdf')}</AsyncBtn>
        <Btn disabled={!d} onClick={() => exportCsv({ head: ['Metric', 'Value'], body: [...kpis, [], head, ...body()], filename: fname })}><FileSpreadsheet size={16} />{t('exportCsv')}</Btn>
      </div>
    </div></div>
    {error && !d && <ErrorBox error={error} onRetry={() => reload(false)} />}
    {loading && !d && <Loading />}
    {d && <>
      <div className="grid g4">
        <div className="glass stat"><span className="label">{t('partsUsed')}</span><span className="value">{d.partsUsed}</span></div>
        <div className="glass stat"><span className="label">{t('revenue')}</span><span className="value accent">{fmtMoney(d.revenue, lang)}</span><span className="hint">{t('paid')}: {fmtMoney(d.revenuePaid, lang)} · {t('unpaid')}: {fmtMoney(d.revenueUnpaid, lang)}</span></div>
        <div className="glass stat"><span className="label">{t('cost')}</span><span className="value">{fmtMoney(d.cost, lang)}</span></div>
        <div className="glass stat"><span className="label">{t('profit')}</span><span className={`value ${d.profit >= 0 ? 'green' : 'red'}`}>{fmtMoney(d.profit, lang)}</span><span className="hint">{t('profitFormula')}</span></div>
        <div className="glass stat"><span className="label">{t('expenses')}</span><span className="value">{fmtMoney(d.expenses, lang)}</span></div>
        <div className="glass stat"><span className="label">{t('withdrawals')}</span><span className="value">{fmtMoney(d.withdrawals, lang)}</span></div>
        <div className="glass stat"><span className="label">{t('refunds')}</span><span className="value">{fmtMoney(d.refunds, lang)}</span></div>
        <div className="glass stat"><span className="label">{t('outstandingDebt')}</span><span className="value red">{fmtMoney(d.outstandingDebt, lang)}</span></div>
      </div>
      <div className="grid g2">
        <div className="glass card"><h3 className="title">{t('topParts')}</h3>{!d.topParts.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('part')}</th><th className="num">{t('count')}</th><th className="num">{t('revenue')}</th></tr></thead><tbody>{d.topParts.map((p, i) => <tr key={i}><td><div className="strong">{p.name}</div><div className="hint">{p.model}</div></td><td className="num">{p.count}</td><td className="num">{fmtMoney(p.revenue, lang)}</td></tr>)}</tbody></table></div>}</div>
        <div className="glass card"><h3 className="title">{t('daily')}</h3>{!d.daily.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('day')}</th><th className="num">{t('partsUsed')}</th><th className="num">{t('revenue')}</th><th className="num">{t('cost')}</th></tr></thead><tbody>{d.daily.map(r => <tr key={r.day}><td>{r.day}</td><td className="num">{r.parts}</td><td className="num">{fmtMoney(r.revenue, lang)}</td><td className="num">{fmtMoney(r.cost, lang)}</td></tr>)}</tbody></table></div>}</div>
      </div>
    </>}
  </div>;
}