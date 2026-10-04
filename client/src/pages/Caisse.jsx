import React, { useState } from 'react';
import { Plus, Undo2, Pencil, Check, RotateCcw } from 'lucide-react';
import { useT, fmtMoney, fmtDate } from '../i18n';
import { get, post, put } from '../api';
import { useLive, usePaged, Loading, ErrorBox, Btn, AsyncBtn, Field, Input, Modal, Confirm, Pager, PaidBadge, useToast, errToast, Empty, Toggle } from '../ui';

export default function Caisse({ nav, param }) {
  const { t, lang } = useT();
  const [tab, setTab] = useState(param?.tab || 'summary');
  const sum = useLive(() => get('/caisse/summary'));
  const s = sum.data;
  return <div className="grid">
    {sum.error && !s && <ErrorBox error={sum.error} onRetry={() => sum.reload(false)} />}
    {s && <div className="grid g4">
      <div className="glass stat"><span className="label">{t('balance')}</span><span className={`value ${s.balance < 0 ? 'red' : 'accent'}`}>{fmtMoney(s.balance, lang)}</span></div>
      <div className="glass stat"><span className="label">{t('totalAssets')}</span><span className="value">{fmtMoney(s.totalAssets, lang)}</span><span className="hint">{t('balance')} + {t('stockValue')}</span></div>
      <div className="glass stat"><span className="label">{t('collected')}</span><span className="value green">{fmtMoney(s.collected, lang)}</span></div>
      <div className="glass stat"><span className="label">{t('unpaidUsed')}</span><span className="value amber">{fmtMoney(s.unpaid, lang)}</span><span className="hint">{s.unpaidCount} {t('items')}</span></div>
      <div className="glass stat"><span className="label">{t('refunds')}</span><span className="value">{fmtMoney(s.refunds, lang)}</span></div>
      <div className="glass stat"><span className="label">{t('expenses')}</span><span className="value">{fmtMoney(s.expenses, lang)}</span></div>
      <div className="glass stat"><span className="label">{t('withdrawals')}</span><span className="value">{fmtMoney(s.withdrawals, lang)}</span></div>
      <div className="glass stat"><span className="label">{t('outstandingDebt')}</span><span className="value red">{fmtMoney(s.outstandingDebt, lang)}</span><span className="hint">{t('paidToSuppliers')}: {fmtMoney(s.paidToSuppliers, lang)}</span></div>
    </div>}
    {s && <div className="hint" style={{ padding: '0 6px' }}>{t('capital')}: {fmtMoney(s.capital, lang)} · {t('balanceFormula')}</div>}
    <div className="glass tabs">{['summary', 'usedParts', 'expenses', 'withdrawals'].map(k => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{t(k === 'summary' ? 'recent' : k)}</button>)}</div>
    {tab === 'summary' && <UsedParts nav={nav} onChanged={sum.reload} paidFilter="" limitRecent />}
    {tab === 'usedParts' && <UsedParts nav={nav} onChanged={sum.reload} paidFilter="0" />}
    {(tab === 'expenses' || tab === 'withdrawals') && <CashList type={tab === 'expenses' ? 'expense' : 'withdrawal'} balance={s?.balance ?? 0} onChanged={sum.reload} />}
  </div>;
}

export function UsedParts({ nav, onChanged, paidFilter, client, limitRecent }) {
  const { t, lang } = useT(); const push = useToast();
  const [paid, setPaid] = useState(paidFilter ?? ''); const [q, setQ] = useState('');
  const paged = usePaged('/sales', { paid, q, client }, [paid, q, client]);
  const { data, error, loading, reload } = paged;
  const [modal, setModal] = useState(null);
  const act = async (fn, msg) => { try { await fn(); push(msg); reload(); onChanged && onChanged(); } catch (e) { errToast(push, t, e); } finally { setModal(null); } };
  return <div className="glass card">
    <div className="row between mb">
      <div className="row"><Input placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 240 }} />
        {paidFilter === undefined || paidFilter === '' ? <div className="tabs" style={{ padding: 3 }}>{[['', t('all')], ['0', t('unpaid')], ['1', t('paid')]].map(([v, l]) => <button key={v} className={paid === v ? 'active' : ''} onClick={() => setPaid(v)} style={{ minHeight: 34, padding: '6px 12px' }}>{l}</button>)}</div> : <span className="badge amber">{t('unpaid')}</span>}
      </div>
    </div>
    {error && !data && <ErrorBox error={error} onRetry={() => reload(false)} />}
    {loading && !data && <Loading />}
    {data && (!data.items.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>{t('date')}</th><th>{t('part')}</th><th>{t('client')}</th><th className="num">{t('price')}</th><th>{t('payment')}</th><th>{t('status')}</th><th></th></tr></thead>
      <tbody>{data.items.map(s => <tr key={s.id}>
        <td>{fmtDate(s.createdAt, lang)}</td><td><div className="strong">{s.productName}</div><div className="hint">{s.productModel}</div></td>
        <td><button className="link" onClick={() => nav.go('clients', { client: s.clientName })}>{s.clientName}</button></td>
        <td className="num">{fmtMoney(s.price, lang)} {!s.paid && s.status === 'active' && <button className="btn ghost sm icon" title={t('editPrice')} onClick={() => setModal({ type: 'price', sale: s })}><Pencil size={12} /></button>}</td>
        <td><PaidBadge paid={s.paid} /></td>
        <td>{s.status === 'returned' ? <span className="badge gray">{t('returned')}</span> : <span className="badge green">{t('active')}</span>}</td>
        <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
          {s.status === 'active' && !s.paid && <Btn className="sm success" onClick={() => setModal({ type: 'pay', sale: s })}><Check size={14} />{t('markPaid')}</Btn>}
          {s.status === 'active' && <Btn className="sm" onClick={() => setModal({ type: 'return', sale: s })} disabled={!!s.productDeleted} title={s.productDeleted ? t('productDeleted') : t('return')}><RotateCcw size={14} />{t('return')}</Btn>}
        </div></td>
      </tr>)}</tbody>
    </table></div>)}
    {data && <Pager total={data.total} page={paged.page} pageSize={paged.pageSize} onPage={paged.setPage} onSize={paged.onSize} />}
    {modal?.type === 'pay' && <Confirm title={t('markPaid')} text={`${t('markPaidConfirm')} ${fmtMoney(modal.sale.price, lang)} — ${modal.sale.productName} (${modal.sale.clientName})`} onCancel={() => setModal(null)} onConfirm={() => act(() => post(`/sales/${modal.sale.id}/pay`), t('paidNow'))} />}
    {modal?.type === 'return' && <Confirm danger title={t('return')} text={`${t('returnConfirm')} ${modal.sale.paid ? `(${fmtMoney(modal.sale.price, lang)} ${t('refunded')})` : ''}`} onCancel={() => setModal(null)} onConfirm={() => act(() => post(`/sales/${modal.sale.id}/return`), t('returnDone'))} />}
    {modal?.type === 'price' && <PriceModal sale={modal.sale} onClose={() => setModal(null)} onSaved={(price) => act(() => put(`/sales/${modal.sale.id}/price`, { price }), t('saved'))} />}
  </div>;
}
function PriceModal({ sale, onClose, onSaved }) {
  const { t } = useT(); const [price, setPrice] = useState(sale.price);
  return <Modal title={t('editPrice')} onClose={onClose} footer={<><Btn onClick={onClose}>{t('cancel')}</Btn><AsyncBtn className="primary" onClick={() => onSaved(price)}>{t('save')}</AsyncBtn></>}><Field label={t('price')}><Input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} autoFocus /></Field></Modal>;
}

function CashList({ type, balance, onChanged }) {
  const { t, lang } = useT(); const push = useToast();
  const paged = usePaged('/cash', { type }, [type]); const { data, error, loading, reload } = paged;
  const [modal, setModal] = useState(null);
  const label = type === 'expense' ? t('addExpense') : t('addWithdrawal');
  return <div className="glass card">
    <div className="row between mb"><h3 className="title" style={{ margin: 0 }}>{t(type === 'expense' ? 'expenses' : 'withdrawals')}</h3><Btn className="primary" onClick={() => setModal({ type: 'add' })}><Plus size={16} />{label}</Btn></div>
    {error && !data && <ErrorBox error={error} onRetry={() => reload(false)} />}
    {loading && !data && <Loading />}
    {data && (!data.items.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('date')}</th><th>{t('description')}</th><th className="num">{t('amount')}</th><th>{t('status')}</th><th></th></tr></thead><tbody>
      {data.items.map(e => <tr key={e.id} style={e.status === 'cancelled' ? { opacity: 0.55 } : undefined}><td>{fmtDate(e.entryAt, lang)}</td><td>{e.description}</td><td className="num">{fmtMoney(e.amount, lang)}</td><td>{e.status === 'cancelled' ? <span className="badge gray">{t('cancelled')} · {t('reversal')} #{e.reversalId}</span> : <span className="badge green">{t('active')}</span>}</td><td>{e.status === 'active' && <Btn className="sm danger" onClick={() => setModal({ type: 'cancel', entry: e })}><Undo2 size={14} />{t('cancel')}</Btn>}</td></tr>)}
    </tbody></table></div>)}
    {data && <Pager total={data.total} page={paged.page} pageSize={paged.pageSize} onPage={paged.setPage} onSize={paged.onSize} />}
    {modal?.type === 'add' && <CashForm type={type} balance={balance} onClose={() => setModal(null)} onSaved={() => { push(t('entryAdded')); reload(); onChanged(); setModal(null); }} />}
    {modal?.type === 'cancel' && <Confirm danger title={t('cancelEntry')} text={t('cancelEntryConfirm')} onCancel={() => setModal(null)} onConfirm={async () => { try { await post(`/cash/${modal.entry.id}/cancel`); push(t('entryCancelled')); reload(); onChanged(); } catch (e) { errToast(push, t, e); } setModal(null); }} />}
  </div>;
}
function CashForm({ type, balance, onClose, onSaved }) {
  const { t, lang } = useT(); const push = useToast();
  const local = new Date(); local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  const [f, setF] = useState({ amount: '', description: '', entryAt: local.toISOString().slice(0, 16) }); const [errors, setErrors] = useState({}); const [warn, setWarn] = useState(false);
  const goesNegative = balance - Number(f.amount || 0) < 0;
  const submit = async () => {
    if (goesNegative && !warn) { setWarn(true); return; }
    setErrors({});
    try { await post('/cash', { type, amount: f.amount, description: f.description, entryAt: new Date(f.entryAt).toISOString() }); onSaved(); } catch (e) { if (e.details) setErrors(e.details); else errToast(push, t, e); }
  };
  return <Modal title={type === 'expense' ? t('addExpense') : t('addWithdrawal')} onClose={onClose} footer={<><Btn onClick={onClose}>{t('cancel')}</Btn><AsyncBtn className={warn ? 'danger' : 'primary'} onClick={submit}>{warn ? t('confirm') : t('save')}</AsyncBtn></>}>
    <div className="grid" style={{ gap: 10 }}>
      <Field label={`${t('amount')} (${t('currency')}) *`} error={errors.amount}><Input type="number" min="0.01" step="0.01" value={f.amount} onChange={e => { setF({ ...f, amount: e.target.value }); setWarn(false); }} autoFocus /></Field>
      <Field label={(type === 'expense' ? t('description') : t('reason')) + ' *'} error={errors.description}><Input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      <Field label={t('date')} error={errors.entryAt}><Input type="datetime-local" value={f.entryAt} onChange={e => setF({ ...f, entryAt: e.target.value })} /></Field>
      {goesNegative && <div className="badge red" style={{ padding: '8px 12px' }}>{warn ? t('negativeConfirm') : t('negativeWarn')} ({fmtMoney(balance - Number(f.amount || 0), lang)})</div>}
    </div>
  </Modal>;
}