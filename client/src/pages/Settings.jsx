import React, { useState } from 'react';
import { Plus, Pencil, Trash2, RotateCcw, Download, AlertTriangle, LogOut } from 'lucide-react';
import { useT, LANG_NAMES, fmtMoney, fmtDate } from '../i18n';
import { get, post, put, api, setToken } from '../api';
import { useLive, Loading, ErrorBox, Btn, AsyncBtn, Field, Input, Select, Modal, Confirm, useToast, errToast, Toggle, Empty } from '../ui';

export default function Settings({ nav }) {
  const { t, lang, setLang, theme, setTheme } = useT(); const push = useToast();
  const { data, error, reload } = useLive(() => get('/settings'));
  const hist = useLive(() => get('/settings/capital-history'));
  const [f, setF] = useState(null); const [pw, setPw] = useState({ current: '', next: '' }); const [clean, setClean] = useState(false); const [ack, setAck] = useState(false);
  const form = f || (data ? { storeName: data.storeName, capital: data.capital } : null);
  const save = async () => { try { await put('/settings', form); push(t('saved')); nav.setStore(form.storeName); setF(null); reload(); hist.reload(); } catch (e) { errToast(push, t, e); } };
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload(false)} />;
  if (!data) return <Loading />;
  return <div className="grid g2">
    <div className="glass card"><h3 className="title">{t('settings')}</h3><div className="grid" style={{ gap: 10 }}>
      <Field label={t('storeName')}><Input value={form.storeName} onChange={e => setF({ ...form, storeName: e.target.value })} /></Field>
      <Field label={`${t('capital')} (${t('currency')})`}><Input type="number" min="0" step="0.01" value={form.capital} onChange={e => setF({ ...form, capital: e.target.value })} /></Field>
      <div className="row end"><AsyncBtn className="primary" disabled={!f} onClick={save}>{t('save')}</AsyncBtn></div>
      <Field label={t('language')}><Select value={lang} onChange={e => setLang(e.target.value)}>{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      <Field label={t('theme')}><Toggle on={theme === 'dark'} onChange={v => setTheme(v ? 'dark' : 'light')} label={theme === 'dark' ? t('dark') : t('light')} /></Field>
    </div></div>
    <div className="glass card"><h3 className="title">{t('capitalHistory')}</h3>{!hist.data ? <Loading /> : !hist.data.items.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('date')}</th><th className="num">{t('from_')}</th><th className="num">{t('to_')}</th></tr></thead><tbody>{hist.data.items.map(h => <tr key={h.id}><td>{fmtDate(h.createdAt, lang)}</td><td className="num muted">{fmtMoney(h.oldValue, lang)}</td><td className="num strong">{fmtMoney(h.newValue, lang)}</td></tr>)}</tbody></table></div>}</div>
    <SimpleList table="categories" title={t('categories')} addLabel={t('addCategory')} />
    <SimpleList table="suppliers" title={t('suppliers')} addLabel={t('addSupplier')} extra />
    <div className="glass card"><h3 className="title">{t('changePassword')}</h3><div className="grid" style={{ gap: 10 }}>
      <Field label={t('currentPassword')}><Input type="password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
      <Field label={t('newPassword')}><Input type="password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
      <div className="row between"><AsyncBtn onClick={async () => { try { await api('POST', '/auth/logout'); setToken(null); nav.onLogout(); } catch (e) { errToast(push, t, e); } }}><LogOut size={16} />{t('logout')}</AsyncBtn><AsyncBtn className="primary" disabled={pw.next.length < 6} onClick={async () => { try { await api('POST', '/auth/password', pw); push(t('passwordChanged')); setPw({ current: '', next: '' }); } catch (e) { errToast(push, t, e.code === 'BAD_CREDENTIALS' ? { message: t('badCredentials') } : e); } }}>{t('save')}</AsyncBtn></div>
      <div className="hint">{t('username')}: {data.username}</div>
    </div></div>
    <div className="glass card"><h3 className="title">{t('databaseTools')}</h3><div className="grid" style={{ gap: 10 }}>
      <div className={`badge ${data.auditRestricted ? 'green' : 'amber'}`} style={{ whiteSpace: 'normal' }}>{data.auditRestricted ? t('auditRestricted') : t('auditNotRestricted')}</div>
      <a className="btn" href="/api/db/backup"><Download size={16} />{t('backup')}</a>
      <Btn className="danger" onClick={() => setClean(true)}><AlertTriangle size={16} />{t('clean')}</Btn>
    </div></div>
    {clean && <Modal title={t('clean')} onClose={() => { setClean(false); setAck(false); }} footer={<><Btn onClick={() => { setClean(false); setAck(false); }}>{t('cancel')}</Btn><AsyncBtn className="danger" disabled={!ack} onClick={async () => { try { await post('/db/clean', { confirm: 'I understand this is permanent' }); window.location.reload(); } catch (e) { errToast(push, t, e); } }}>{t('cleanBtn')}</AsyncBtn></>}>
      <div className="glass card" style={{ borderColor: 'rgba(248,113,113,0.6)', padding: 12 }}><AlertTriangle size={18} color="var(--red)" /> {t('cleanWarn')}</div>
      <label className="row mt" style={{ cursor: 'pointer' }}><input type="checkbox" className="chk" checked={ack} onChange={e => setAck(e.target.checked)} /><span>{t('cleanCheck')}</span></label>
    </Modal>}
  </div>;
}

function SimpleList({ table, title, addLabel, extra }) {
  const { t, lang } = useT(); const push = useToast();
  const [deleted, setDeleted] = useState(false);
  const { data, error, reload } = useLive(() => get(`/${table}?deleted=${deleted ? 1 : 0}`), [deleted]);
  const [modal, setModal] = useState(null);
  const act = async (fn, msg) => { try { await fn(); push(msg || t('saved')); reload(); setModal(null); } catch (e) { if (e.code === 'SUPPLIER_HAS_DEBT') push(t('supplierHasDebt'), 'error'); else errToast(push, t, e); } };
  return <div className="glass card">
    <div className="row between mb"><h3 className="title" style={{ margin: 0 }}>{title}</h3><div className="row"><Toggle on={deleted} onChange={setDeleted} label={t('showDeleted')} /><Btn className="primary sm" onClick={() => setModal({})}><Plus size={14} />{addLabel}</Btn></div></div>
    {error && !data && <ErrorBox error={error} onRetry={() => reload(false)} />}
    {data && (!data.items.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl"><tbody>{data.items.map(x => <tr key={x.id}>
      <td><div className="strong">{x.name}</div>{extra && <div className="hint">{[x.phone, x.address].filter(Boolean).join(' · ')}</div>}</td>
      <td className="num">{table === 'suppliers' ? (Number(x.openDebt) > 0 ? <span className="badge red">{fmtMoney(x.openDebt, lang)}</span> : null) : <span className="hint">{x.productCount} {t('items')}</span>}</td>
      <td><div className="row end" style={{ gap: 4, flexWrap: 'nowrap' }}>{deleted ? <Btn className="sm success" onClick={() => act(() => post(`/${table}/${x.id}/restore`))}><RotateCcw size={14} />{t('restore')}</Btn> : <><Btn className="sm" onClick={() => setModal(x)}><Pencil size={14} /></Btn><Btn className="sm danger" disabled={table === 'suppliers' && Number(x.openDebt) > 0} title={table === 'suppliers' && Number(x.openDebt) > 0 ? t('supplierHasDebt') : t('delete')} onClick={() => setModal({ ...x, _delete: true })}><Trash2 size={14} /></Btn></>}</div></td>
    </tr>)}</tbody></table></div>)}
    {modal && !modal._delete && <ItemForm table={table} extra={extra} item={modal} onClose={() => setModal(null)} onSaved={() => { push(t('saved')); reload(); setModal(null); }} />}
    {modal?._delete && <Confirm danger title={t('delete')} text={`${t('delete')} "${modal.name}"?`} onCancel={() => setModal(null)} onConfirm={() => act(() => post(`/${table}/${modal.id}/delete`), t('deleted'))} />}
  </div>;
}
function ItemForm({ table, extra, item, onClose, onSaved }) {
  const { t } = useT(); const push = useToast();
  const [f, setF] = useState({ name: item.name || '', phone: item.phone || '', address: item.address || '' }); const [errors, setErrors] = useState({});
  const submit = async () => { setErrors({}); try { if (item.id) await put(`/${table}/${item.id}`, f); else await post(`/${table}`, f); onSaved(); } catch (e) { if (e.details) setErrors(e.details); else errToast(push, t, e); } };
  return <Modal title={item.id ? t('edit') : t('add')} onClose={onClose} footer={<><Btn onClick={onClose}>{t('cancel')}</Btn><AsyncBtn className="primary" onClick={submit}>{t('save')}</AsyncBtn></>}>
    <div className="grid" style={{ gap: 10 }}>
      <Field label={t('name') + ' *'} error={errors.name === 'taken' ? 'nameTaken' : errors.name}><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus /></Field>
      {extra && <><Field label={`${t('phone')} (${t('optional')})`}><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field><Field label={`${t('address')} (${t('optional')})`}><Input value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field></>}
    </div>
  </Modal>;
}