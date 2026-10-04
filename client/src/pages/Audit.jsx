import React, { useState } from 'react';
import { useT, fmtDate } from '../i18n';
import { usePaged, Loading, ErrorBox, Input, Select, Pager, Empty } from '../ui';

export default function Audit() {
  const { t, lang } = useT();
  const [q, setQ] = useState(''); const [entity, setEntity] = useState('');
  const paged = usePaged('/audit', { q, entity }, [q, entity]); const { data, error, loading, reload } = paged;
  return <div className="glass card">
    <div className="row mb"><Input placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 240 }} /><Select value={entity} onChange={e => setEntity(e.target.value)} style={{ width: 'auto' }}><option value="">{t('entity')}: {t('all')}</option>{['product', 'sale', 'cash', 'supplier', 'category', 'settings', 'database'].map(e => <option key={e} value={e}>{e}</option>)}</Select></div>
    {error && !data && <ErrorBox error={error} onRetry={() => reload(false)} />}
    {loading && !data && <Loading />}
    {data && (!data.items.length ? <Empty /> : <div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>{t('date')}</th><th>{t('action')}</th><th>{t('entity')}</th><th>{t('details')}</th></tr></thead><tbody>
      {data.items.map(a => <tr key={a.id}><td className="muted">{a.id}</td><td>{fmtDate(a.createdAt, lang)}</td><td><span className="badge blue">{a.action}</span></td><td>{a.entity} {a.entityId ? `#${a.entityId}` : ''}</td><td className="hint" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, maxWidth: 480, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={typeof a.details === 'string' ? a.details : JSON.stringify(a.details)}>{typeof a.details === 'string' ? a.details : JSON.stringify(a.details)}</td></tr>)}
    </tbody></table></div>)}
    {data && <Pager total={data.total} page={paged.page} pageSize={paged.pageSize} onPage={paged.setPage} onSize={paged.onSize} />}
  </div>;
}