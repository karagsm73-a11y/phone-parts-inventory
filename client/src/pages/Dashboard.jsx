import React, { useState } from 'react';
import { Eye, EyeOff, Copy, Search } from 'lucide-react';
import { useT, fmtMoney } from '../i18n';
import { get } from '../api';
import { useLive, Loading, ErrorBox, Btn, useToast, copyText, Empty } from '../ui';

export default function Dashboard({ nav }) {
  const { t, lang } = useT(); const push = useToast();
  const { data, error, loading, reload } = useLive(() => get('/dashboard'));
  const [hideValue, setHide] = useState(localStorage.getItem('pp_hideValue') === '1');
  if (error && !data) return <ErrorBox error={error} onRetry={() => reload(false)} />;
  if (loading && !data) return <Loading />;
  const copyList = (list, title) => copyText(`${title}\n` + list.map(p => `- ${p.name} (${p.model}) [${p.barcode}] x${p.quantity}`).join('\n')).then(() => push(t('copied'))).catch(() => push(t('errorGeneric'), 'error'));
  return <div className="grid">
    <button className="glass searchbtn" style={{ justifyContent: 'flex-start', padding: 14 }} onClick={nav.openSearch}><Search size={18} /><span>{t('quickSearch')}</span></button>
    <div className="grid g3">
      <div className="glass stat"><span className="label">{t('totalProducts')}</span><span className="value">{data.products}</span></div>
      <div className="glass stat"><span className="label">{t('totalUnits')}</span><span className="value accent">{data.units}</span></div>
      <div className="glass stat"><span className="label">{t('stockValue')} <button className="btn ghost sm icon" onClick={() => { localStorage.setItem('pp_hideValue', hideValue ? '0' : '1'); setHide(!hideValue); }}>{hideValue ? <Eye size={14} /> : <EyeOff size={14} />}</button></span><span className="value">{hideValue ? '••••••' : fmtMoney(data.stockValue, lang)}</span></div>
    </div>
    <div className="grid g2">
      <StockList title={t('lowStock')} color="amber" list={data.low} onCopy={() => copyList(data.low, t('lowStock'))} onPick={(p) => nav.go('inventory', { productId: p.id })} />
      <StockList title={t('outOfStock')} color="red" list={data.out} onCopy={() => copyList(data.out, t('outOfStock'))} onPick={(p) => nav.go('inventory', { productId: p.id })} />
    </div>
  </div>;
}
function StockList({ title, color, list, onCopy, onPick }) {
  const { t } = useT();
  return <div className="glass card">
    <div className="row between mb"><h3 className="title" style={{ margin: 0 }}>{title} <span className={`badge ${color}`}>{list.length}</span></h3><Btn className="sm" onClick={onCopy} disabled={!list.length}><Copy size={14} />{t('copyList')}</Btn></div>
    {!list.length ? <Empty text={t('allGood')} /> : <div className="tbl-wrap"><table className="tbl"><tbody>
      {list.map(p => <tr key={p.id} className="clickable" onClick={() => onPick(p)}><td><div className="strong">{p.name}</div><div className="hint">{p.model}</div></td><td className="muted">{p.barcode}</td><td className="num"><span className={`badge ${color}`}>{p.quantity}</span></td></tr>)}
    </tbody></table></div>}
  </div>;
}