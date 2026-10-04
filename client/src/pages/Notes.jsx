import React, { useState } from 'react';
import { Plus, Trash2, Pencil, Check } from 'lucide-react';
import { useT, fmtDate } from '../i18n';
import { get, post, put, del } from '../api';
import { useLive, Loading, ErrorBox, Btn, AsyncBtn, Input, useToast, errToast, Empty } from '../ui';

export default function Notes() {
  const { t, lang } = useT(); const push = useToast();
  const { data, error, loading, reload } = useLive(() => get('/notes'));
  const [text, setText] = useState(''); const [edit, setEdit] = useState(null);
  const add = async () => { if (!text.trim()) return; try { await post('/notes', { text }); setText(''); reload(); } catch (e) { errToast(push, t, e); } };
  const save = async (n, patch) => { try { await put(`/notes/${n.id}`, patch); setEdit(null); reload(); } catch (e) { errToast(push, t, e); } };
  return <div className="grid">
    <form className="glass card row" onSubmit={e => { e.preventDefault(); add(); }}><Input placeholder={t('newNote')} value={text} onChange={e => setText(e.target.value)} style={{ flex: 1 }} /><AsyncBtn type="submit" className="primary" onClick={add}><Plus size={16} />{t('add')}</AsyncBtn></form>
    {error && !data && <ErrorBox error={error} onRetry={() => reload(false)} />}
    {loading && !data && <Loading />}
    {data && (!data.items.length ? <div className="glass card"><Empty text={t('noNotes')} /></div> : <div className="list-cards">{data.items.map(n => <div key={n.id} className={`glass note-row ${n.done ? 'done' : ''}`}>
      <input type="checkbox" className="chk" checked={!!n.done} onChange={e => save(n, { done: e.target.checked })} />
      {edit?.id === n.id ? <><Input value={edit.text} onChange={e => setEdit({ ...edit, text: e.target.value })} style={{ flex: 1 }} autoFocus onKeyDown={e => e.key === 'Enter' && save(n, { text: edit.text })} /><Btn className="sm success" onClick={() => save(n, { text: edit.text })}><Check size={14} /></Btn></> : <><div style={{ flex: 1 }}><div className="text">{n.text}</div><div className="hint">{fmtDate(n.createdAt, lang)}</div></div><Btn className="sm ghost icon" onClick={() => setEdit({ id: n.id, text: n.text })}><Pencil size={14} /></Btn></>}
      <AsyncBtn className="sm ghost icon" onClick={async () => { try { await del(`/notes/${n.id}`); reload(); } catch (e) { errToast(push, t, e); } }}><Trash2 size={14} color="var(--red)" /></AsyncBtn>
    </div>)}</div>)}
  </div>;
}