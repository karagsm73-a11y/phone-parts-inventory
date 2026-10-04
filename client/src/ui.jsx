import React, { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
import { X, Check, AlertTriangle, Info } from 'lucide-react';
import { useT } from './i18n';
import { get, onNetwork } from './api';

export const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = 'success') => { const id = Math.random(); setToasts(t => [...t, { id, msg, type }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500); }, []);
  return <ToastCtx.Provider value={push}>{children}
    <div className="toasts">{toasts.map(t => <div key={t.id} className={`glass toast ${t.type}`}>{t.type === 'success' ? <Check size={16} color="var(--green)" /> : t.type === 'error' ? <AlertTriangle size={16} color="var(--red)" /> : <Info size={16} color="var(--amber)" />}<span>{t.msg}</span></div>)}</div>
  </ToastCtx.Provider>;
}

export function Spinner() { return <span className="spinner" />; }
export function Loading() { const { t } = useT(); return <div className="loading"><Spinner />&nbsp;{t('loading')}</div>; }
export function Empty({ text }) { const { t } = useT(); return <div className="empty">{text || t('emptyList')}</div>; }

export function Btn({ children, onClick, busy, className = '', type = 'button', ...rest }) {
  return <button type={type} className={`btn ${className}`} onClick={onClick} disabled={busy || rest.disabled} {...rest}>{busy ? <Spinner /> : null}{children}</button>;
}
// Button that guards against double submits: disabled while the async handler runs.
export function AsyncBtn({ onClick, children, ...rest }) {
  const [busy, setBusy] = useState(false); const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const h = async (e) => { if (busy) return; setBusy(true); try { await onClick(e); } finally { if (alive.current) setBusy(false); } };
  return <Btn {...rest} busy={busy} onClick={h}>{children}</Btn>;
}

export function Field({ label, error, children, hint }) {
  const { t } = useT();
  return <div className="field"><label>{label}</label>{children}{error ? <span className="err">{t(error) || error}</span> : hint ? <span className="hint">{hint}</span> : null}</div>;
}
export function Input({ error, className = '', ...rest }) { return <input className={`input ${error ? 'error' : ''} ${className}`} {...rest} />; }
export function Select({ error, className = '', children, ...rest }) { return <select className={`input ${error ? 'error' : ''} ${className}`} {...rest}>{children}</select>; }
export function Toggle({ on, onChange, label }) { return <div className="row" style={{ gap: 8 }} onClick={() => onChange(!on)}><div className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} />{label && <span style={{ cursor: 'pointer' }}>{label}</span>}</div>; }

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
    <div className={`glass modal ${wide ? 'wide' : ''}`}>
      <div className="row between" style={{ marginBottom: 12 }}><h2 style={{ margin: 0 }}>{title}</h2>{onClose && <button className="btn ghost icon sm" onClick={onClose} aria-label="close"><X size={18} /></button>}</div>
      {children}
      {footer && <div className="row end mt">{footer}</div>}
    </div>
  </div>;
}

export function Confirm({ title, text, onCancel, onConfirm, danger, confirmLabel }) {
  const { t } = useT();
  return <Modal title={title} onClose={onCancel} footer={<><Btn onClick={onCancel}>{t('cancel')}</Btn><AsyncBtn className={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel || t('confirm')}</AsyncBtn></>}><p style={{ margin: 0 }}>{text}</p></Modal>;
}

export function ErrorBox({ error, onRetry }) {
  const { t } = useT();
  if (!error) return null;
  const msg = error.code === 'NETWORK' ? t('serverUnreachable') : (error.message || t('errorGeneric'));
  return <div className="glass card row between" style={{ borderColor: 'rgba(248,113,113,0.5)' }}><span className="row"><AlertTriangle size={18} color="var(--red)" />{msg}</span>{onRetry && <Btn onClick={onRetry}>{t('retry')}</Btn>}</div>;
}

export function Pager({ total, page, pageSize, onPage, onSize }) {
  const { t } = useT();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="pager">
    <span>{t('total')}: {total} · {t('page')} {page} {t('of')} {pages}</span>
    <div className="row">
      <select className="input" style={{ minHeight: 36, padding: '6px 10px', width: 'auto' }} value={pageSize} onChange={e => onSize(Number(e.target.value))}>{[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} {t('perPage')}</option>)}</select>
      <Btn className="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</Btn>
      <Btn className="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</Btn>
    </div>
  </div>;
}

// Live data: fetch now, every 30s, and on window focus. Returns {data, error, loading, reload}.
export function useLive(fetcher, deps = [], { interval = 30000 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fRef = useRef(fetcher); fRef.current = fetcher;
  const seq = useRef(0);
  const reload = useCallback(async (silent = true) => {
    const my = ++seq.current;
    if (!silent) setState(s => ({ ...s, loading: true }));
    try { const data = await fRef.current(); if (my === seq.current) setState({ data, error: null, loading: false }); }
    catch (error) { if (my === seq.current) setState(s => ({ ...s, error, loading: false })); }
  }, []);
  useEffect(() => { reload(false); }, deps); // eslint-disable-line
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && reload(), interval);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [reload, interval]);
  return { ...state, reload };
}

export function usePaged(path, params, deps = []) {
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(Number(localStorage.getItem('pp_pageSize')) || 10);
  useEffect(() => { setPage(1); }, deps); // eslint-disable-line
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== '' && v !== null)), page, pageSize }).toString();
  const live = useLive(() => get(`${path}?${qs}`), [qs]);
  const onSize = (n) => { localStorage.setItem('pp_pageSize', n); setPageSize(n); setPage(1); };
  return { ...live, page, pageSize, setPage, onSize };
}

export function OfflineBanner() {
  const { t } = useT(); const [off, setOff] = useState(false);
  useEffect(() => onNetwork(ok => setOff(!ok)), []);
  if (!off) return null;
  return <div className="offline"><div className="glass"><AlertTriangle size={18} color="var(--red)" /><span>{t('serverUnreachable')}</span><Btn className="sm" onClick={() => get('/status').catch(() => {})}>{t('retry')}</Btn></div></div>;
}

export function StockBadge({ qty }) { const { t } = useT(); if (qty === 0) return <span className="badge red">{t('out')}</span>; if (qty === 1) return <span className="badge amber">{t('low')}</span>; return <span className="badge green">{qty}</span>; }
export function PaidBadge({ paid }) { const { t } = useT(); return paid ? <span className="badge green">{t('paid')}</span> : <span className="badge amber">{t('unpaid')}</span>; }

export function copyText(text) { return navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(); }
export function errToast(push, t, e) { push(e?.code === 'NETWORK' ? t('serverUnreachable') : (e?.message || t('errorGeneric')), 'error'); }