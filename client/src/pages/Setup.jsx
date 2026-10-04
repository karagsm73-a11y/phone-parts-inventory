import React, { useState } from 'react';
import { Smartphone, Database, Store, UserCog, CheckCircle2 } from 'lucide-react';
import { useT, LANG_NAMES } from '../i18n';
import { api } from '../api';
import { Btn, AsyncBtn, Field, Input, Select, useToast, errToast } from '../ui';

export default function Setup({ hasSaved, onDone }) {
  const { t, lang, setLang } = useT(); const push = useToast();
  const [step, setStep] = useState(0);
  const [db, setDb] = useState({ host: 'localhost', port: 3306, user: '', password: '', database: '', useSaved: false });
  const [test, setTest] = useState(null);
  const [store, setStore] = useState({ storeName: '', capital: '' });
  const [admin, setAdmin] = useState({ username: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({}); const [finished, setFinished] = useState(false);

  const doTest = async () => {
    setTest(null);
    try { const r = await api('POST', '/setup/test-connection', db); setTest(r); if (!r.empty) push(t('dbNotEmpty'), 'error'); else push(t('connectionOk')); }
    catch (e) { setTest({ ok: false, message: e.message }); errToast(push, t, e); }
  };
  const finish = async () => {
    const errs = {};
    if (!store.storeName.trim()) errs.storeName = 'required';
    if (store.capital === '' || isNaN(Number(store.capital)) || Number(store.capital) < 0) errs.capital = 'invalid';
    if (admin.username.trim().length < 3) errs.username = 'min3';
    if (admin.password.length < 6) errs.password = 'min6';
    if (admin.password !== admin.confirm) errs.confirm = 'passwordsMismatch';
    setErrors(errs); if (Object.keys(errs).length) return;
    try { await api('POST', '/setup/finish', { db, storeName: store.storeName, capital: Number(store.capital), username: admin.username, password: admin.password }); setFinished(true); }
    catch (e) { if (e.details) setErrors(e.details); if (e.code === 'DB_NOT_EMPTY') { push(t('dbNotEmpty'), 'error'); setStep(0); } else errToast(push, t, e); }
  };
  const icons = [Database, Store, UserCog, CheckCircle2]; const Icon = icons[step];
  const canNext = step === 0 ? (test && test.ok && test.empty) : true;
  return <div className="center-page"><div className="glass auth-card">
    <div className="logo"><Smartphone size={28} /></div>
    <div className="row between mb"><h2 style={{ margin: 0 }}>{t('setupTitle')}</h2><Select value={lang} onChange={e => setLang(e.target.value)} style={{ width: 'auto', minHeight: 36, padding: '6px 10px' }}>{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
    <div className="steps">{[0, 1, 2, 3].map(i => <span key={i} className={i <= step ? 'done' : ''} />)}</div>
    <div className="row mb" style={{ gap: 8 }}><Icon size={18} color="var(--accent)" /><span className="strong">{[t('setupDb'), t('setupStore'), t('setupAdmin'), t('setupFinish')][step]}</span></div>
    {finished ? <div><p>{t('setupDone')}</p><Btn className="primary" onClick={onDone} style={{ width: '100%' }}>{t('login')}</Btn></div> : <>
      {step === 0 && <div className="grid" style={{ gap: 10 }}>
        {hasSaved && <label className="row" style={{ cursor: 'pointer' }}><input type="checkbox" className="chk" checked={db.useSaved} onChange={e => { setDb({ ...db, useSaved: e.target.checked }); setTest(null); }} /><span>{t('useSaved')}</span></label>}
        {hasSaved && <span className="hint">{t('savedConnectionHint')}</span>}
        {!db.useSaved && <>
          <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 10 }}>
            <Field label={t('host')}><Input value={db.host} onChange={e => setDb({ ...db, host: e.target.value })} /></Field>
            <Field label={t('port')}><Input type="number" value={db.port} onChange={e => setDb({ ...db, port: e.target.value })} /></Field>
          </div>
          <Field label={t('user')}><Input value={db.user} onChange={e => setDb({ ...db, user: e.target.value })} autoComplete="off" /></Field>
          <Field label={t('password')}><Input type="password" value={db.password} onChange={e => setDb({ ...db, password: e.target.value })} autoComplete="new-password" /></Field>
          <Field label={t('database')}><Input value={db.database} onChange={e => setDb({ ...db, database: e.target.value })} /></Field>
        </>}
        <span className="hint">{t('connectionSavedServer')}</span>
        <AsyncBtn onClick={doTest}>{t('testConnection')}</AsyncBtn>
        {test && test.ok && <span className={test.empty ? 'badge green' : 'badge red'}>{test.empty ? `${t('dbEmpty')} (MySQL ${test.version})` : t('dbNotEmpty')}</span>}
        {test && !test.ok && <span className="err">{test.message}</span>}
      </div>}
      {step === 1 && <div className="grid" style={{ gap: 10 }}>
        <Field label={t('storeName')} error={errors.storeName}><Input value={store.storeName} onChange={e => setStore({ ...store, storeName: e.target.value })} /></Field>
        <Field label={`${t('initialCapital')} (${t('currency')})`} error={errors.capital}><Input type="number" min="0" step="0.01" value={store.capital} onChange={e => setStore({ ...store, capital: e.target.value })} /></Field>
      </div>}
      {step === 2 && <div className="grid" style={{ gap: 10 }}>
        <Field label={t('username')} error={errors.username}><Input value={admin.username} onChange={e => setAdmin({ ...admin, username: e.target.value })} autoComplete="username" /></Field>
        <Field label={t('password')} error={errors.password}><Input type="password" value={admin.password} onChange={e => setAdmin({ ...admin, password: e.target.value })} autoComplete="new-password" /></Field>
        <Field label={t('confirmPassword')} error={errors.confirm}><Input type="password" value={admin.confirm} onChange={e => setAdmin({ ...admin, confirm: e.target.value })} autoComplete="new-password" /></Field>
      </div>}
      {step === 3 && <div className="grid" style={{ gap: 6 }}>
        <div className="row between"><span className="muted">{t('database')}</span><span>{db.useSaved ? t('useSaved') : `${db.user}@${db.host}:${db.port}/${db.database}`}</span></div>
        <div className="row between"><span className="muted">{t('storeName')}</span><span>{store.storeName}</span></div>
        <div className="row between"><span className="muted">{t('initialCapital')}</span><span>{store.capital} {t('currency')}</span></div>
        <div className="row between"><span className="muted">{t('username')}</span><span>{admin.username}</span></div>
        {Object.keys(errors).length > 0 && <span className="err">{Object.entries(errors).map(([k, v]) => `${t(k)}: ${t(v)}`).join(' · ')}</span>}
      </div>}
      <div className="row between mt">
        <Btn disabled={step === 0} onClick={() => setStep(step - 1)}>{t('back')}</Btn>
        {step < 3 ? <Btn className="primary" disabled={!canNext} onClick={() => { if (step === 1) { const e = {}; if (!store.storeName.trim()) e.storeName = 'required'; if (store.capital === '' || isNaN(Number(store.capital))) e.capital = 'invalid'; setErrors(e); if (Object.keys(e).length) return; } if (step === 2) { const e = {}; if (admin.username.trim().length < 3) e.username = 'min3'; if (admin.password.length < 6) e.password = 'min6'; if (admin.password !== admin.confirm) e.confirm = 'passwordsMismatch'; setErrors(e); if (Object.keys(e).length) return; } setErrors({}); setStep(step + 1); }}>{t('next')}</Btn>
          : <AsyncBtn className="primary" onClick={finish}>{t('createTables')}</AsyncBtn>}
      </div>
    </>}
  </div></div>;
}