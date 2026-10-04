import React, { useState } from 'react';
import { Smartphone } from 'lucide-react';
import { useT, LANG_NAMES } from '../i18n';
import { api, setToken } from '../api';
import { AsyncBtn, Field, Input, Select } from '../ui';

export default function Login({ onDone }) {
  const { t, lang, setLang } = useT();
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState(null);
  const submit = async () => { setErr(null); try { const r = await api('POST', '/auth/login', { username: u, password: p }, { allow401: true }); if (r.token) setToken(r.token); onDone(); } catch (e) { setErr(e.code === 'BAD_CREDENTIALS' ? t('badCredentials') : e.code === 'NETWORK' ? t('serverUnreachable') : e.message); } };
  return <div className="center-page"><form className="glass auth-card" onSubmit={e => { e.preventDefault(); submit(); }}>
    <div className="logo"><Smartphone size={28} /></div>
    <div className="row between mb"><h2 style={{ margin: 0 }}>{t('loginTitle')}</h2><Select value={lang} onChange={e => setLang(e.target.value)} style={{ width: 'auto', minHeight: 36, padding: '6px 10px' }}>{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
    <div className="grid" style={{ gap: 10 }}>
      <Field label={t('username')}><Input value={u} onChange={e => setU(e.target.value)} autoComplete="username" autoFocus /></Field>
      <Field label={t('password')}><Input type="password" value={p} onChange={e => setP(e.target.value)} autoComplete="current-password" /></Field>
      {err && <span className="err">{err}</span>}
      <AsyncBtn type="submit" className="primary" onClick={submit}>{t('login')}</AsyncBtn>
    </div>
  </form></div>;
}