import React, { useState } from 'react';
import { HandCoins, ChevronDown, ChevronUp } from 'lucide-react';
import { useT, fmtMoney, fmtDate } from '../i18n';
import { get, post } from '../api';
import { useLive, Loading, ErrorBox, Btn, AsyncBtn, Field, Input, Modal, useToast, errToast, Empty } from '../ui';

export default function Debts() {
  const { t, lang } = useT(); const push = useToast();
  const { data, error, loading, reload } = useLive(() => get('/debts'));
  const [open, setOpen] = useState(null); const [pay, setPay] = useState(null);
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload(false)} />;
  if (loading && !data) return <Loading />;
  const items = data.items.filter(s => Number(s.totalDebt) > 0);
  const totalRem = items.reduce((a, s) => a + Number(s.remaining), 0);
  return <div className="grid">
    <div className="glass stat"><span className="label">{t('outstandingDebt')}</span><span className="value red">{fmtMoney(totalRem, lang)}</span></div>
    {!items.length ? <div className="glass card"><Empty text={t('noDebts')} /></div> : items.map(s => <div key={s.supplierId} className="glass card">
      <div className="row between">
        <div><div className="strong" style={{ fontSize: 16 }}>{s.name} {s.deletedAt && <span className="badge gray">{t('deleted')}</span>}</div><div className="hint">{s.phone || ''} · {s.openCount} {t('open')}</div></div>
        <div className="row">
          <div className="row" style={{ gap: 18 }}><div><div className="hint">{t('paidSoFar')}</div><div className="strong" style={{ color: 'var(--green)' }}>{fmtMoney(s.paid, lang)}</div></div><div><div className="hint">{t('remainingDebt')}</div><div className="strong" style={{ color: Number(s.remaining) > 0 ? 'var(--red)' : 'var(--green)' }}>{fmtMoney(s.remaining, lang)}</div></div></div>
          <Btn className="primary" disabled={Number(s.remaining) <= 0} onClick={() => setPay(s)}><HandCoins size={16} />{t('recordPayment')}</Btn>
          <Btn className="icon" onClick={() => setOpen(open === s.supplierId ? null : s.supplierId)}>{open === s.supplierId ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</Btn>
        </div>
      </div>
      {open === s.supplierId && <SupplierDetail id={s.supplierId} key={s.supplierId + ':' + s.paid} />}
    </div>)}
    {pay && <PayModal s={pay} onClose={() => setPay(null)} onSaved={() => { push(t('paymentRecorded')); setPay(null); reload(); }} />}
  </div>;
}
function SupplierDetail({ id }) {
  const { t, lang } = useT();
  const { data, error, reload } = useLive(() => get(`/debts/${id}`), [id]);
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload(false)} />;
  if (!data) return <Loading />;
  return <div className="grid g2 mt">
    <div><h4 className="title">{t('debtHistory')}</h4>{!data.debts.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('date')}</th><th>{t('product')}</th><th className="num">{t('amount')}</th><th className="num">{t('paidSoFar')}</th><th>{t('status')}</th></tr></thead><tbody>
      {data.debts.map(d => <tr key={d.id}><td>{fmtDate(d.createdAt, lang)}</td><td>{d.productName ? <>{d.productName} <span className="hint">×{d.qty}</span></> : '—'}</td><td className="num">{fmtMoney(d.amount, lang)}</td><td className="num">{fmtMoney(d.paidAmount, lang)}</td><td><span className={`badge ${d.status === 'paid' ? 'green' : d.status === 'cancelled' ? 'gray' : 'amber'}`}>{t(d.status)}</span></td></tr>)}
    </tbody></table></div>}</div>
    <div><h4 className="title">{t('paymentHistory')}</h4>{!data.payments.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('date')}</th><th className="num">{t('amount')}</th><th>{t('note')}</th></tr></thead><tbody>
      {data.payments.map(p => <tr key={p.id}><td>{fmtDate(p.createdAt, lang)}</td><td className="num" style={{ color: 'var(--green)' }}>{fmtMoney(p.amount, lang)}</td><td className="muted">{p.note || ''}</td></tr>)}
    </tbody></table></div>}</div>
  </div>;
}
function PayModal({ s, onClose, onSaved }) {
  const { t, lang } = useT(); const push = useToast();
  const [amount, setAmount] = useState(''); const [note, setNote] = useState(''); const [err, setErr] = useState(null);
  const over = Number(amount) > Number(s.remaining) + 0.005;
  const submit = async () => { setErr(null); if (over) { setErr('exceedsDebt'); return; } try { await post(`/debts/${s.supplierId}/pay`, { amount, note }); onSaved(); } catch (e) { if (e.code === 'PAYMENT_EXCEEDS_DEBT') setErr('exceedsDebt'); else if (e.details?.amount) setErr('invalid'); else errToast(push, t, e); } };
  return <Modal title={`${t('recordPayment')} — ${s.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>{t('cancel')}</Btn><AsyncBtn className="primary" disabled={!amount || over} onClick={submit}>{t('confirm')}</AsyncBtn></>}>
    <div className="grid" style={{ gap: 10 }}>
      <div className="row between"><span className="muted">{t('remainingDebt')}</span><span className="strong" style={{ color: 'var(--red)' }}>{fmtMoney(s.remaining, lang)}</span></div>
      <Field label={`${t('amount')} (${t('currency')})`} error={err}><Input type="number" min="0.01" step="0.01" max={s.remaining} value={amount} onChange={e => setAmount(e.target.value)} autoFocus /></Field>
      <div className="row"><Btn className="sm" onClick={() => setAmount(String(s.remaining))}>{t('all')}: {fmtMoney(s.remaining, lang)}</Btn></div>
      <Field label={`${t('note')} (${t('optional')})`}><Input value={note} onChange={e => setNote(e.target.value)} /></Field>
      <span className="hint">{t('fifoHint')}</span>
    </div>
  </Modal>;
}