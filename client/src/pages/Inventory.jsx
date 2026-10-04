import React, { useEffect, useState } from 'react';
import { Plus, Layers, Pencil, Copy, Trash2, RotateCcw, PackagePlus, ShoppingCart, Printer, Undo2 } from 'lucide-react';
import { useT, fmtMoney, fmtDate } from '../i18n';
import { get, post, put, withOp } from '../api';
import { usePaged, Loading, ErrorBox, Btn, AsyncBtn, Field, Input, Select, Modal, Confirm, Pager, StockBadge, PaidBadge, useToast, errToast, Toggle, Empty, copyText } from '../ui';

export default function Inventory({ nav, param }) {
  const { t, lang } = useT(); const push = useToast();
  const [q, setQ] = useState(''); const [stock, setStock] = useState(''); const [cat, setCat] = useState(''); const [deleted, setDeleted] = useState(false);
  const [cats, setCats] = useState([]); const [sups, setSups] = useState([]);
  const [modal, setModal] = useState(null); // {type, product}
  const [detailId, setDetailId] = useState(param?.action === 'use' ? null : (param?.productId || null));
  // Opened from quick search: go straight to the Use-part dialog (or details when out of stock)
  useEffect(() => {
    if (!param?.productId) return;
    if (param.action === 'use') {
      setDetailId(null);
      get(`/products/${param.productId}`).then(d => { if (d.product.quantity > 0) setModal({ type: 'use', product: d.product }); else setDetailId(param.productId); }).catch(() => setDetailId(param.productId));
    }
    else setDetailId(param.productId);
  }, [param?.productId, param?.action, param?.ts]);
  const refs = async () => { const [c, s] = await Promise.all([get('/categories'), get('/suppliers')]); setCats(c.items); setSups(s.items); };
  useEffect(() => { refs(); }, []);
  const paged = usePaged('/products', { q, stock, category: cat, deleted: deleted ? '1' : '' }, [q, stock, cat, deleted]);
  const { data, error, loading, reload } = paged;
  const onSaved = (msg) => { if (msg) push(msg); reload(); setModal(null); };
  return <div className="grid">
    <div className="glass card">
      <div className="row between">
        <div className="row" style={{ flex: 1 }}>
          <Input placeholder={t('searchPlaceholder')} value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 320 }} />
          <Select value={stock} onChange={e => setStock(e.target.value)} style={{ width: 'auto' }}><option value="">{t('stock')}: {t('all')}</option><option value="low">{t('low')}</option><option value="out">{t('out')}</option></Select>
          <Select value={cat} onChange={e => setCat(e.target.value)} style={{ width: 'auto' }}><option value="">{t('category')}: {t('all')}</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Toggle on={deleted} onChange={setDeleted} label={t('showDeleted')} />
        </div>
        <div className="row">
          <Btn onClick={() => setModal({ type: 'bulk' })}><Layers size={16} />{t('addMultiple')}</Btn>
          <Btn className="primary" onClick={() => setModal({ type: 'add' })}><Plus size={16} />{t('addProduct')}</Btn>
        </div>
      </div>
    </div>
    {error && !data && <ErrorBox error={error} onRetry={() => reload(false)} />}
    {loading && !data && <Loading />}
    {data && <div className="glass card">
      {!data.items.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>{t('partName')}</th><th>{t('model')}</th><th>{t('category')}</th><th className="num">{t('costPrice')}</th><th className="num">{t('sellingPrice')}</th><th className="num">{t('qty')}</th><th>{t('barcode')}</th><th></th></tr></thead>
        <tbody>{data.items.map(p => <tr key={p.id} className="clickable" onClick={() => setDetailId(p.id)}>
          <td className="strong">{p.name}</td><td>{p.model}</td><td className="muted">{p.categoryName || '—'}</td>
          <td className="num">{fmtMoney(p.cost, lang)}</td><td className="num">{fmtMoney(p.sellingPrice, lang)}</td><td className="num"><StockBadge qty={p.quantity} /></td><td className="muted">{p.barcode}</td>
          <td onClick={e => e.stopPropagation()}><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            {deleted ? <AsyncBtn className="sm success" onClick={async () => { try { await post(`/products/${p.id}/restore`); onSaved(t('productRestored')); } catch (e) { errToast(push, t, e); } }}><RotateCcw size={14} />{t('restore')}</AsyncBtn> : <>
              <Btn className="sm primary" disabled={p.quantity < 1} onClick={() => setModal({ type: 'use', product: p })} title={t('use')}><ShoppingCart size={14} /></Btn>
              <Btn className="sm" onClick={() => setModal({ type: 'restock', product: p })} title={t('restock')}><PackagePlus size={14} /></Btn>
              <Btn className="sm" onClick={() => setModal({ type: 'edit', product: p })} title={t('edit')}><Pencil size={14} /></Btn>
              <Btn className="sm" onClick={() => setModal({ type: 'add', product: { ...p, barcode: '', quantity: 0 } })} title={t('copyProduct')}><Copy size={14} /></Btn>
              <Btn className="sm danger" disabled={p.quantity !== 0} onClick={() => setModal({ type: 'delete', product: p })} title={p.quantity !== 0 ? t('deleteProductHint') : t('delete')}><Trash2 size={14} /></Btn>
            </>}
          </div></td>
        </tr>)}</tbody>
      </table></div>}
      <Pager total={data.total} page={paged.page} pageSize={paged.pageSize} onPage={paged.setPage} onSize={paged.onSize} />
    </div>}
    {modal?.type === 'add' && <ProductForm cats={cats} sups={sups} initial={modal.product} onClose={() => setModal(null)} onSaved={() => onSaved(t('productSaved'))} />}
    {modal?.type === 'edit' && <ProductForm cats={cats} sups={sups} initial={modal.product} edit onClose={() => setModal(null)} onSaved={() => onSaved(t('productSaved'))} />}
    {modal?.type === 'bulk' && <BulkForm cats={cats} sups={sups} onClose={() => setModal(null)} onSaved={(n) => onSaved(`${n} ${t('bulkSaved')}`)} />}
    {modal?.type === 'restock' && <RestockForm sups={sups} product={modal.product} onClose={() => setModal(null)} onSaved={() => onSaved(t('restocked'))} />}
    {modal?.type === 'use' && <UseForm product={modal.product} store={nav.store} onClose={() => setModal(null)} onSaved={() => { reload(); }} />}
    {modal?.type === 'delete' && <Confirm danger title={t('delete')} text={`${t('delete')} "${modal.product.name}"?`} onCancel={() => setModal(null)} onConfirm={async () => { try { await post(`/products/${modal.product.id}/delete`); onSaved(t('deleted')); } catch (e) { errToast(push, t, e); } }} />}
    {detailId && <ProductDetail id={detailId} sups={sups} nav={nav} onClose={() => setDetailId(null)} onChanged={() => reload()} onAction={(type, product) => { setModal({ type, product }); }} />}
  </div>;
}

export function ProductForm({ cats, sups, initial, edit, onClose, onSaved }) {
  const { t, lang } = useT(); const push = useToast();
  const [f, setF] = useState({ name: initial?.name || '', categoryId: initial?.categoryId || '', model: initial?.model || '', cost: edit ? initial.cost : (initial?.cost ?? ''), sellingPrice: initial?.sellingPrice ?? '', quantity: edit ? initial.quantity : (initial?.quantity ?? 0), barcode: initial?.barcode || '', supplierId: '' });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setErrors({});
    try { if (edit) await put(`/products/${initial.id}`, f); else await post('/products', f); onSaved(); }
    catch (e) { if (e.details) setErrors(e.details); else errToast(push, t, e); }
  };
  return <Modal title={edit ? t('edit') : t('addProduct')} onClose={onClose} footer={<><Btn onClick={onClose}>{t('cancel')}</Btn><AsyncBtn className="primary" onClick={submit}>{t('save')}</AsyncBtn></>}>
    <div className="grid" style={{ gap: 10 }}>
      <Field label={t('partName') + ' *'} error={errors.name}><Input value={f.name} onChange={set('name')} autoFocus /></Field>
      <div className="grid g2">
        <Field label={t('category')} error={errors.categoryId}><Select value={f.categoryId} onChange={set('categoryId')}><option value="">{t('none')}</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label={t('model') + ' *'} error={errors.model}><Input value={f.model} onChange={set('model')} /></Field>
      </div>
      <div className="grid g2">
        <Field label={t('costPrice') + ' *'} error={errors.cost} hint={edit ? t('readOnlyEdit') : undefined}><Input type="number" min="0" step="0.01" value={f.cost} onChange={set('cost')} disabled={edit} /></Field>
        <Field label={t('sellingPrice') + ' *'} error={errors.sellingPrice}><Input type="number" min="0" step="0.01" value={f.sellingPrice} onChange={set('sellingPrice')} /></Field>
      </div>
      <div className="grid g2">
        <Field label={t('quantity') + ' *'} error={errors.quantity}><Input type="number" min="0" step="1" value={f.quantity} onChange={set('quantity')} disabled={edit} /></Field>
        <Field label={t('barcode')} error={errors.barcode} hint={edit ? undefined : t('autoSku')}><Input value={f.barcode} onChange={set('barcode')} /></Field>
      </div>
      {!edit && Number(f.quantity) > 0 && <Field label={t('supplier') + ' *'} error={errors.supplierId} hint={t('supplierRequiredQty')}><Select value={f.supplierId} onChange={set('supplierId')}><option value="">{t('chooseSupplier')}</option>{sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>{Number(f.quantity) > 0 && Number(f.cost) >= 0 && <span className="hint">{t('restockCreatesDebt')} {fmtMoney(Number(f.quantity) * Number(f.cost || 0), lang)}</span>}</Field>}
    </div>
  </Modal>;
}

function BulkForm({ cats, sups, onClose, onSaved }) {
  const { t, lang } = useT(); const push = useToast();
  const blank = () => ({ name: '', categoryId: '', model: '', cost: '', sellingPrice: '', quantity: 0, barcode: '' });
  const [rows, setRows] = useState([blank(), blank(), blank()]); const [supplierId, setSup] = useState(''); const [errors, setErrors] = useState({});
  const upd = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const submit = async () => {
    const filled = rows.filter(r => r.name || r.model || r.barcode); if (!filled.length) return;
    setErrors({});
    try { const r = await post('/products/bulk', { rows: filled, supplierId }); onSaved(r.count); }
    catch (e) { if (e.details?.rows) { const map = {}; filled.forEach((row, fi) => { const oi = rows.indexOf(row); if (e.details.rows[fi]) map[oi] = e.details.rows[fi]; }); setErrors(map); } else if (e.details) setErrors({ _: e.details }); else errToast(push, t, e); }
  };
  const needSup = rows.some(r => Number(r.quantity) > 0);
  const total = rows.reduce((a, r) => a + Number(r.quantity || 0) * Number(r.cost || 0), 0);
  const cell = (i, k, type = 'text', extra = {}) => <Input type={type} value={rows[i][k]} onChange={e => upd(i, k, e.target.value)} error={errors[i]?.[k]} style={{ minHeight: 38, padding: '6px 8px' }} {...extra} />;
  return <Modal wide title={t('addMultiple')} onClose={onClose} footer={<><Btn onClick={onClose}>{t('cancel')}</Btn><AsyncBtn className="primary" onClick={submit}>{t('save')} ({rows.filter(r => r.name).length})</AsyncBtn></>}>
    <p className="hint" style={{ marginTop: 0 }}>{t('bulkHint')}</p>
    <div className="row mb"><Field label={t('supplier') + (needSup ? ' *' : '')} error={errors._?.supplierId}><Select value={supplierId} onChange={e => setSup(e.target.value)} style={{ width: 'auto', minWidth: 220 }}><option value="">{t('chooseSupplier')}</option>{sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field><span className="hint" style={{ alignSelf: 'flex-end', paddingBottom: 12 }}>{t('restockCreatesDebt')} {fmtMoney(total, lang)}</span></div>
    <div className="tbl-wrap bulk-table"><table className="tbl" style={{ minWidth: 820 }}>
      <thead><tr><th>#</th><th>{t('partName')} *</th><th>{t('model')} *</th><th>{t('category')}</th><th>{t('costPrice')} *</th><th>{t('sellingPrice')} *</th><th>{t('qty')} *</th><th>{t('barcode')}</th><th></th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>
        <td className="muted">{i + 1}</td><td>{cell(i, 'name')}</td><td>{cell(i, 'model')}</td>
        <td><Select value={r.categoryId} onChange={e => upd(i, 'categoryId', e.target.value)} style={{ minHeight: 38, padding: '6px 8px' }}><option value="">—</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></td>
        <td>{cell(i, 'cost', 'number', { min: 0, step: 0.01, style: { width: 90, minHeight: 38, padding: '6px 8px' } })}</td><td>{cell(i, 'sellingPrice', 'number', { min: 0, step: 0.01, style: { width: 90, minHeight: 38, padding: '6px 8px' } })}</td><td>{cell(i, 'quantity', 'number', { min: 0, step: 1, style: { width: 70, minHeight: 38, padding: '6px 8px' } })}</td><td>{cell(i, 'barcode')}</td>
        <td><Btn className="sm ghost icon" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>✕</Btn>{errors[i] && <div className="err">{Object.entries(errors[i]).map(([k, v]) => `${t(k)}: ${t(v)}`).join(', ')}</div>}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="row mt"><Btn className="sm" disabled={rows.length >= 50} onClick={() => setRows([...rows, blank()])}><Plus size={14} />{t('addRow')}</Btn><span className="hint">{rows.length}/50</span></div>
  </Modal>;
}

function RestockForm({ sups, product, onClose, onSaved }) {
  const { t, lang } = useT(); const push = useToast();
  const [f, setF] = useState({ supplierId: '', qty: 1, unitCost: product.cost, newSellingPrice: '' }); const [errors, setErrors] = useState({});
  const qty = Number(f.qty) || 0, uc = Number(f.unitCost) || 0;
  const newCost = qty > 0 ? Math.round((product.quantity * Number(product.cost) + qty * uc) / (product.quantity + qty)) : Number(product.cost);
  const submit = async () => { setErrors({}); try { await post(`/products/${product.id}/restock`, f); onSaved(); } catch (e) { if (e.details) setErrors(e.details); else errToast(push, t, e); } };
  return <Modal title={`${t('restock')} — ${product.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>{t('cancel')}</Btn><AsyncBtn className="primary" onClick={submit}>{t('restock')}</AsyncBtn></>}>
    <div className="grid" style={{ gap: 10 }}>
      <Field label={t('supplier') + ' *'} error={errors.supplierId}><Select value={f.supplierId} onChange={e => setF({ ...f, supplierId: e.target.value })} autoFocus><option value="">{t('chooseSupplier')}</option>{sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      <div className="grid g2"><Field label={t('restockQty') + ' *'} error={errors.qty}><Input type="number" min="1" step="1" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} /></Field><Field label={t('unitCost') + ' *'} error={errors.unitCost}><Input type="number" min="0" step="0.01" value={f.unitCost} onChange={e => setF({ ...f, unitCost: e.target.value })} /></Field></div>
      <Field label={t('updateSelling')} error={errors.newSellingPrice}><Input type="number" min="0" step="0.01" value={f.newSellingPrice} placeholder={String(product.sellingPrice)} onChange={e => setF({ ...f, newSellingPrice: e.target.value })} /></Field>
      <div className="glass card" style={{ padding: 12, fontSize: 13 }}><div className="row between"><span className="muted">{t('restockCreatesDebt')}</span><span className="strong" style={{ color: 'var(--red)' }}>{fmtMoney(qty * uc, lang)}</span></div><div className="row between"><span className="muted">{t('newAvgCost')}</span><span className="strong">{fmtMoney(newCost, lang)}</span></div><div className="row between"><span className="muted">{t('quantity')}</span><span>{product.quantity} → {product.quantity + qty}</span></div></div>
    </div>
  </Modal>;
}

export function UseForm({ product, store, onClose, onSaved }) {
  const { t, lang } = useT(); const push = useToast();
  const [f, setF] = useState({ price: product.sellingPrice, clientName: '', paid: false }); const [errors, setErrors] = useState({}); const [result, setResult] = useState(null);
  const submit = async () => { setErrors({}); try { const r = await post('/sales/use', { productId: product.id, ...f }); setResult(r); onSaved(r); push(`${t('used')} · ${r.remaining} ${t('remaining')}`); } catch (e) { if (e.details && e.code === 'VALIDATION') setErrors(e.details); else { errToast(push, t, e); if (e.code === 'OUT_OF_STOCK') onClose(); } } };
  if (result) return <Modal title={t('receipt')} onClose={onClose} footer={<><Btn onClick={onClose}>{t('close')}</Btn><Btn className="primary" onClick={() => window.print()}><Printer size={16} />{t('printReceipt')}</Btn></>}><Receipt store={store} sale={{ ...result, productName: result.product.name, productModel: result.product.model, createdAt: new Date().toISOString() }} /></Modal>;
  return <Modal title={`${t('useOne')} — ${product.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>{t('cancel')}</Btn><AsyncBtn className="primary" onClick={submit}>{t('confirmUse')}</AsyncBtn></>}>
    <div className="grid" style={{ gap: 10 }}>
      <div className="hint">{product.model} · {t('inStock')}: {product.quantity} · {t('costPrice')}: {fmtMoney(product.cost, lang)}</div>
      <Field label={t('price') + ' *'} error={errors.price} hint={Number(f.price) < Number(product.cost) ? t('belowCost') : undefined}><Input type="number" min="0" step="0.01" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} autoFocus /></Field>
      <Field label={t('clientName')}><Input value={f.clientName} placeholder={t('passenger')} onChange={e => setF({ ...f, clientName: e.target.value })} /></Field>
      <Toggle on={f.paid} onChange={v => setF({ ...f, paid: v })} label={f.paid ? t('paid') : t('unpaid')} />
    </div>
  </Modal>;
}

export function Receipt({ store, sale }) {
  const { t, lang } = useT();
  return <div className="receipt"><h3>{store || t('appName')}</h3><hr /><div className="line"><span>{t('date')}</span><span>{fmtDate(sale.createdAt, lang)}</span></div><div className="line"><span>{t('client')}</span><span>{sale.clientName}</span></div><hr /><div className="line"><span>{sale.productName}</span><span>{fmtMoney(sale.price, lang)}</span></div><div className="line"><span className="muted">{sale.productModel}</span><span></span></div><hr /><div className="line"><strong>{t('total')}</strong><strong>{fmtMoney(sale.price, lang)}</strong></div><div className="line"><span>{t('status')}</span><span>{sale.paid ? t('paid') : t('unpaid')}</span></div></div>;
}

function ProductDetail({ id, sups, nav, onClose, onChanged, onAction }) {
  const { t, lang } = useT(); const push = useToast();
  const [d, setD] = useState(null); const [err, setErr] = useState(null); const [confirm, setConfirm] = useState(null);
  const load = () => get(`/products/${id}`).then(x => { setD(x); setErr(null); }).catch(setErr);
  useEffect(() => { load(); }, [id]);
  const act = async (fn, msg) => { try { await fn(); push(msg); load(); onChanged(); } catch (e) { errToast(push, t, e); } finally { setConfirm(null); } };
  if (err) return <Modal title={t('details')} onClose={onClose}><ErrorBox error={err} onRetry={load} /></Modal>;
  if (!d) return <Modal title={t('details')} onClose={onClose}><Loading /></Modal>;
  const p = d.product;
  return <Modal wide title={`${p.name} · ${p.model}`} onClose={onClose}>
    {p.deletedAt && <div className="glass card mb" style={{ borderColor: 'rgba(248,113,113,0.5)', padding: 12 }}><div className="row between"><span>{t('productDeleted')}</span><AsyncBtn className="success sm" onClick={() => act(() => post(`/products/${p.id}/restore`), t('productRestored'))}><RotateCcw size={14} />{t('restoreProduct')}</AsyncBtn></div></div>}
    <div className="grid g4 mb">
      <div className="glass stat"><span className="label">{t('quantity')}</span><span className="value"><StockBadge qty={p.quantity} /></span></div>
      <div className="glass stat"><span className="label">{t('costPrice')}</span><span className="value" style={{ fontSize: 20 }}>{fmtMoney(p.cost, lang)}</span></div>
      <div className="glass stat"><span className="label">{t('sellingPrice')}</span><span className="value accent" style={{ fontSize: 20 }}>{fmtMoney(p.sellingPrice, lang)}</span></div>
      <div className="glass stat"><span className="label">{t('barcode')}</span><span className="value" style={{ fontSize: 15 }}>{p.barcode} <button className="btn ghost sm icon" onClick={() => copyText(p.barcode).then(() => push(t('copied')))}><Copy size={12} /></button></span><span className="hint">{p.categoryName || t('none')}</span></div>
    </div>
    {!p.deletedAt && <div className="row mb">
      <Btn className="primary" disabled={p.quantity < 1} onClick={() => { onClose(); onAction('use', p); }}><ShoppingCart size={16} />{t('useOne')}</Btn>
      <Btn onClick={() => { onClose(); onAction('restock', p); }}><PackagePlus size={16} />{t('restock')}</Btn>
      <Btn onClick={() => { onClose(); onAction('edit', p); }}><Pencil size={16} />{t('edit')}</Btn>
    </div>}
    <h3 className="title">{t('restockHistory')}</h3>
    {!d.restocks.length ? <Empty /> : <div className="tbl-wrap mb"><table className="tbl"><thead><tr><th>{t('date')}</th><th>{t('supplier')}</th><th className="num">{t('qty')}</th><th className="num">{t('unitCost')}</th><th className="num">{t('amount')}</th><th>{t('status')}</th><th></th></tr></thead><tbody>
      {d.restocks.map(r => <tr key={r.id}><td>{fmtDate(r.createdAt, lang)}</td><td>{r.supplierName}</td><td className="num">+{r.qty}</td><td className="num">{fmtMoney(r.unitCost, lang)}</td><td className="num">{fmtMoney(r.debtAmount ?? r.qty * r.unitCost, lang)}</td>
        <td>{r.status === 'cancelled' ? <span className="badge gray">{t('cancelled')}</span> : r.debtStatus === 'paid' ? <span className="badge green">{t('paidDebt')}</span> : Number(r.debtPaid) > 0 ? <span className="badge blue">{t('paidSoFar')}: {fmtMoney(r.debtPaid, lang)}</span> : <span className="badge amber">{t('unpaid')}</span>}</td>
        <td>{r.cancellable && <Btn className="sm danger" title={t('cancelRestockHint')} onClick={() => setConfirm({ title: t('cancelRestock'), text: t('cancelRestockHint'), fn: () => act(() => post(`/restocks/${r.id}/cancel`), t('restockCancelled')) })}><Undo2 size={14} />{t('cancelRestock')}</Btn>}</td></tr>)}
    </tbody></table></div>}
    <h3 className="title">{t('salesHistory')}</h3>
    {!d.sales.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('date')}</th><th>{t('client')}</th><th className="num">{t('price')}</th><th>{t('payment')}</th><th>{t('status')}</th></tr></thead><tbody>
      {d.sales.map(s => <tr key={s.id}><td>{fmtDate(s.createdAt, lang)}</td><td><button className="link" onClick={() => { onClose(); nav.go('clients', { client: s.clientName }); }}>{s.clientName}</button></td><td className="num">{fmtMoney(s.price, lang)}</td><td>{s.type === 'return' ? <span className="badge gray">{t('return')}</span> : <PaidBadge paid={s.paid} />}</td><td>{s.type === 'sale' && s.status === 'returned' ? <span className="badge gray">{t('returned')}</span> : s.type === 'return' ? <span className="badge blue">{t('return')} #{s.linkedSaleId}</span> : <span className="badge green">{t('active')}</span>}</td></tr>)}
    </tbody></table></div>}
    {confirm && <Confirm danger title={confirm.title} text={confirm.text} onCancel={() => setConfirm(null)} onConfirm={confirm.fn} />}
  </Modal>;
}