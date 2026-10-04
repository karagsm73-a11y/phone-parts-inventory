import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { LayoutDashboard, Package, ClipboardList, Wallet, HandCoins, BarChart3, StickyNote, Settings as SettingsIcon, MoreHorizontal, Search, Sun, Moon, PanelLeftClose, PanelLeftOpen, Smartphone, Users, ScrollText } from 'lucide-react';
import { I18nContext, makeT, LANG_NAMES } from './i18n';
import { get } from './api';
import { ToastHost, OfflineBanner, Loading, ErrorBox } from './ui';
import Setup from './pages/Setup';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import StockCount from './pages/StockCount';
import Caisse from './pages/Caisse';
import Debts from './pages/Debts';
import Reports from './pages/Reports';
import Notes from './pages/Notes';
import Settings from './pages/Settings';
import Clients from './pages/Clients';
import Audit from './pages/Audit';
import GlobalSearch from './pages/GlobalSearch';

const PAGES = [
  { id: 'dashboard', icon: LayoutDashboard, el: Dashboard },
  { id: 'inventory', icon: Package, el: Inventory },
  { id: 'stockCount', icon: ClipboardList, el: StockCount },
  { id: 'caisse', icon: Wallet, el: Caisse },
  { id: 'debts', icon: HandCoins, el: Debts },
  { id: 'reports', icon: BarChart3, el: Reports },
  { id: 'notes', icon: StickyNote, el: Notes },
  { id: 'clients', icon: Users, el: Clients },
  { id: 'audit', icon: ScrollText, el: Audit },
  { id: 'settings', icon: SettingsIcon, el: Settings },
];
const MOBILE_MAIN = ['dashboard', 'inventory', 'caisse'];

export default function App() {
  const [lang, setLangState] = useState(localStorage.getItem('pp_lang') || 'en');
  const [theme, setTheme] = useState(localStorage.getItem('pp_theme') || 'dark');
  const t = useMemo(() => makeT(lang), [lang]);
  const setLang = (l) => { localStorage.setItem('pp_lang', l); setLangState(l); };
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }, [lang]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('pp_theme', theme); }, [theme]);
  return <I18nContext.Provider value={{ t, lang, setLang, theme, setTheme }}><ToastHost><OfflineBanner /><Root /></ToastHost></I18nContext.Provider>;
}

function Root() {
  const [status, setStatus] = useState(null); const [err, setErr] = useState(null);
  const load = useCallback(() => { setErr(null); get('/status').then(setStatus).catch(setErr); }, []);
  useEffect(load, [load]);
  useEffect(() => {
    const unauth = () => setStatus(s => s && { ...s, authenticated: false });
    const setup = () => setStatus(s => s && { ...s, setupComplete: false });
    window.addEventListener('pp:unauth', unauth); window.addEventListener('pp:setup', setup);
    return () => { window.removeEventListener('pp:unauth', unauth); window.removeEventListener('pp:setup', setup); };
  }, []);
  if (err) return <div className="center-page"><div style={{ width: '100%', maxWidth: 480 }}><ErrorBox error={err} onRetry={load} /></div></div>;
  if (!status) return <div className="center-page"><Loading /></div>;
  if (!status.setupComplete) return <Setup hasSaved={status.hasSavedConnection} onDone={load} />;
  if (!status.authenticated) return <Login onDone={load} />;
  return <Shell onLogout={load} />;
}

function Shell({ onLogout }) {
  const { t, theme, setTheme } = React.useContext(I18nContext);
  const [page, setPage] = useState(localStorage.getItem('pp_page') || 'dashboard');
  const [pageParam, setPageParam] = useState(null);
  const [collapsed, setCollapsed] = useState(localStorage.getItem('pp_collapsed') === '1');
  const [more, setMore] = useState(false); const [searchOpen, setSearchOpen] = useState(false);
  const [store, setStore] = useState('');
  useEffect(() => { get('/settings').then(s => setStore(s.storeName)).catch(() => {}); }, []);
  useEffect(() => { const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  const go = (id, param = null) => { if (id === page && !param) window.scrollTo({ top: 0, behavior: 'smooth' }); setPage(id); setPageParam(param); localStorage.setItem('pp_page', id); setMore(false); };
  const Page = PAGES.find(p => p.id === page)?.el || Dashboard;
  const nav = { go, openSearch: () => setSearchOpen(true), store, setStore, onLogout };
  return <div className="layout">
    <aside className={`glass sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand"><div className="logo"><Smartphone size={20} /></div><span>{store || t('appName')}</span></div>
      {PAGES.map(p => <button key={p.id} className={`navitem ${page === p.id ? 'active' : ''}`} onClick={() => go(p.id)} title={t(p.id)}><p.icon size={20} /><span>{t(p.id)}</span></button>)}
      <div className="spacer" />
      <button className="navitem" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}<span>{theme === 'dark' ? t('light') : t('dark')}</span></button>
      <button className="navitem" onClick={() => { localStorage.setItem('pp_collapsed', collapsed ? '0' : '1'); setCollapsed(!collapsed); }}>{collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}<span>{t('collapse')}</span></button>
    </aside>
    <main className="main">
      <div className="topbar">
        <h1>{t(page)}</h1>
        <button className="searchbtn" onClick={() => setSearchOpen(true)}><Search size={16} /><span>{t('search')}</span><kbd>Ctrl K</kbd></button>
        <button className="btn icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ display: 'none' }} />
      </div>
      <Page key={page} nav={nav} param={pageParam} />
    </main>
    <nav className="glass bottomnav">
      {MOBILE_MAIN.map((id, i) => { const p = PAGES.find(x => x.id === id); return <React.Fragment key={id}>
        {i === Math.ceil(MOBILE_MAIN.length / 2) && <button className="navsearch" aria-label={t('search')} onClick={() => { setMore(false); setSearchOpen(true); }}><span className="navsearch-btn"><Search size={26} /></span><span>{t('search')}</span></button>}
        <button className={page === id ? 'active' : ''} onClick={() => go(id)}><p.icon size={22} /><span>{t(id)}</span></button>
      </React.Fragment>; })}
      <button className={!MOBILE_MAIN.includes(page) ? 'active' : ''} onClick={() => setMore(m => !m)}><MoreHorizontal size={22} /><span>{t('more')}</span></button>
    </nav>
    {more && <div className="glass more-sheet">
      {PAGES.filter(p => !MOBILE_MAIN.includes(p.id)).map(p => <button key={p.id} onClick={() => go(p.id)}><p.icon size={22} /><span>{t(p.id)}</span></button>)}
      <button onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setMore(false); }}>{theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}<span>{theme === 'dark' ? t('light') : t('dark')}</span></button>
    </div>}
    {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} onPick={(p) => { setSearchOpen(false); go('inventory', { productId: p.id, action: p.quantity > 0 ? 'use' : 'detail', ts: Date.now() }); }} />}
  </div>;
}