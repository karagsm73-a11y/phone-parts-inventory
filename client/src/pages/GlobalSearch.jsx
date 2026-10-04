import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useT, fmtMoney } from '../i18n';
import { get } from '../api';
import { StockBadge, Spinner } from '../ui';

export default function GlobalSearch({ onClose, onPick }) {
  const { t, lang } = useT(); const [q, setQ] = useState(''); const [items, setItems] = useState([]); const [busy, setBusy] = useState(false); const [idx, setIdx] = useState(0);
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    if (!q.trim()) { setItems([]); return; }
    setBusy(true); const id = setTimeout(() => get(`/search?q=${encodeURIComponent(q)}`).then(r => { setItems(r.items); setIdx(0); }).catch(() => {}).finally(() => setBusy(false)), 180);
    return () => clearTimeout(id);
  }, [q]);
  const onKey = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowDown') setIdx(i => Math.min(items.length - 1, i + 1)); if (e.key === 'ArrowUp') setIdx(i => Math.max(0, i - 1)); if (e.key === 'Enter' && items[idx]) onPick(items[idx]); };
  return <div className="search-modal" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="glass search-box">
      <div className="row" style={{ padding: '4px 8px' }}><Search size={18} className="muted" /><input ref={ref} className="input" style={{ border: 'none', background: 'transparent', boxShadow: 'none' }} placeholder={t('searchPlaceholder')} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} />{busy && <Spinner />}</div>
      <div style={{ maxHeight: '55vh', overflow: 'auto' }}>
        {q && !busy && !items.length && <div className="empty">{t('noResults')}</div>}
        {items.map((p, i) => <div key={p.id} className={`search-result ${i === idx ? 'active' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => onPick(p)}>
          <div><div className="strong">{p.name} <span className="muted">· {p.model}</span></div><div className="hint">{p.categoryName || t('none')} · {p.barcode}</div></div>
          <div className="row" style={{ gap: 10 }}><span>{fmtMoney(p.sellingPrice, lang)}</span><StockBadge qty={p.quantity} /></div>
        </div>)}
      </div>
    </div>
  </div>;
}