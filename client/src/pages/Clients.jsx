import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useT, fmtMoney, fmtDate } from '../i18n';
import { get } from '../api';
import { useLive, usePaged, Loading, ErrorBox, Btn, Pager, Empty } from '../ui';
import { UsedParts } from './Caisse';

export default function Clients({ nav, param }) {
  const { t, lang } = useT();
  const [client, setClient] = useState(param?.client || null);
  if (client) return <ClientHistory name={client} nav={nav} onBack={() => setClient(null)} />;
  const paged = usePaged('/clients', {}, []); const { data, error, loading, reload } = paged;
  return <div className="glass card">
    {error && !data && <ErrorBox error={error} onRetry={() => reload(false)} />}
    {loading && !data && <Loading />}
    {data && (!data.items.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>{t('client')}</th><th className="num">{t('purchases')}</th><th className="num">{t('totalSpent')}</th><th className="num">{t('unpaid')}</th><th>{t('lastPurchase')}</th></tr></thead><tbody>
      {data.items.map(c => <tr key={c.clientName} className="clickable" onClick={() => setClient(c.clientName)}><td className="strong">{c.clientName}</td><td className="num">{c.purchases}</td><td className="num">{fmtMoney(c.totalSpent, lang)}</td><td className="num">{Number(c.unpaid) > 0 ? <span className="badge amber">{fmtMoney(c.unpaid, lang)}</span> : '—'}</td><td>{fmtDate(c.lastPurchase, lang)}</td></tr>)}
    </tbody></table></div>)}
    {data && <Pager total={data.total} page={paged.page} pageSize={paged.pageSize} onPage={paged.setPage} onSize={paged.onSize} />}
  </div>;
}
function ClientHistory({ name, nav, onBack }) {
  const { t, lang } = useT();
  const { data, error, reload } = useLive(() => get(`/clients/${encodeURIComponent(name)}`), [name]);
  return <div className="grid">
    <div className="row"><Btn onClick={onBack}><ArrowLeft size={16} />{t('back')}</Btn><h2 style={{ margin: 0 }}>{t('clientHistory')}: {name}</h2></div>
    {error && !data && <ErrorBox error={error} onRetry={() => reload(false)} />}
    {data && <div className="grid g3">
      <div className="glass stat"><span className="label">{t('purchases')}</span><span className="value">{data.purchases}</span></div>
      <div className="glass stat"><span className="label">{t('totalSpent')}</span><span className="value accent">{fmtMoney(data.totalSpent, lang)}</span></div>
      <div className="glass stat"><span className="label">{t('unpaid')}</span><span className={`value ${Number(data.unpaid) > 0 ? 'amber' : ''}`}>{fmtMoney(data.unpaid, lang)}</span></div>
    </div>}
    <UsedParts nav={nav} client={name} onChanged={reload} />
  </div>;
}