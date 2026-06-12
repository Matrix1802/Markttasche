import { useState, useEffect, useCallback, useRef, CSSProperties } from 'react';
 
// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────
type CategoryKey =
  | 'obst_gemuese' | 'fleisch_fisch' | 'milch' | 'backwaren'
  | 'tiefkuehl' | 'getraenke' | 'snacks' | 'haushalt'
  | 'koerperpflege' | 'gewuerze' | 'konserven' | 'sonstiges';
 
interface CategoryConfig { label: string; emoji: string; color: string; bg: string; }
 
interface Item {
  id: string;
  name: string;
  qty: string;
  category: CategoryKey;
  done: boolean;
  added_by: string;
  added_color: string;
  done_by: string | null;
  created_at: string;
}
 
interface Session { code: string; name: string; color: string; }
 
interface AddPayload {
  room_code: string; name: string; qty: string;
  category: CategoryKey; added_by: string; added_color: string;
}
 
type FilterDone = 'all' | 'open' | 'done';
 
// ─────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────
const CATEGORIES: Record<CategoryKey, CategoryConfig> = {
  obst_gemuese:  { label: 'Obst & Gemüse',    emoji: '🥦', color: '#16a34a', bg: '#dcfce7' },
  fleisch_fisch: { label: 'Fleisch & Fisch',   emoji: '🥩', color: '#dc2626', bg: '#fee2e2' },
  milch:         { label: 'Milch & Käse',      emoji: '🧀', color: '#d97706', bg: '#fef3c7' },
  backwaren:     { label: 'Backwaren',          emoji: '🍞', color: '#92400e', bg: '#fde8d8' },
  tiefkuehl:     { label: 'Tiefkühl',           emoji: '🧊', color: '#0284c7', bg: '#e0f2fe' },
  getraenke:     { label: 'Getränke',           emoji: '🥤', color: '#7c3aed', bg: '#ede9fe' },
  snacks:        { label: 'Snacks & Süßes',    emoji: '🍫', color: '#db2777', bg: '#fce7f3' },
  haushalt:      { label: 'Haushalt',           emoji: '🧹', color: '#0f766e', bg: '#ccfbf1' },
  koerperpflege: { label: 'Körperpflege',       emoji: '🧴', color: '#6d28d9', bg: '#ede9fe' },
  gewuerze:      { label: 'Gewürze & Öl',      emoji: '🧂', color: '#b45309', bg: '#fef9c3' },
  konserven:     { label: 'Konserven & Pasta',  emoji: '🥫', color: '#1d4ed8', bg: '#dbeafe' },
  sonstiges:     { label: 'Sonstiges',          emoji: '🛒', color: '#6b7280', bg: '#f3f4f6' },
};
 
const KEYWORD_MAP: Partial<Record<CategoryKey, string[]>> = {
  obst_gemuese:  ['apfel','birne','banane','orange','zitrone','traube','erdbeere','himbeere','kirsche','pfirsich','mango','ananas','avocado','salat','tomaten','tomate','gurke','paprika','karotte','kartoffel','kartoffeln','zwiebel','zwiebeln','knoblauch','brokkoli','blumenkohl','spinat','zucchini','champignon','pilze','lauch','sellerie','rote bete','erbsen','bohnen','kohl','grünkohl','feldsalat','rucola','kräuter','basilikum','petersilie','schnittlauch','dill','minze','gemüse','obst','möhren','möhre'],
  fleisch_fisch: ['hackfleisch','hähnchen','hühnchen','schwein','rind','lamm','wurst','bratwurst','schinken','speck','salami','thunfisch','lachs','garnelen','fisch','steak','schnitzel','leberwurst','putenbrust','pute','fleisch'],
  milch:         ['milch','butter','quark','joghurt','käse','sahne','schmand','creme fraiche','mozzarella','parmesan','gouda','emmentaler','frischkäse','kefir','buttermilch','skyr'],
  backwaren:     ['brot','brötchen','baguette','toast','semmel','kuchen','croissant','mehl','hefe','backpulver'],
  tiefkuehl:     ['tiefkühl','gefroren','pizza','pommes','frozen'],
  getraenke:     ['wasser','saft','cola','bier','wein','sekt','kaffee','tee','limonade','sprudel','orangensaft','apfelsaft','smoothie','energy'],
  snacks:        ['chips','schokolade','gummibärchen','kekse','müsliriegel','nüsse','mandeln','erdnüsse','popcorn','cracker','bonbon','weingummi','praline'],
  haushalt:      ['spülmittel','waschmittel','putzmittel','schwamm','müllbeutel','küchenrolle','toilettenpapier','taschentuch','folie','alufolie','backpapier','reiniger','weichspüler'],
  koerperpflege: ['shampoo','duschgel','deo','zahnpasta','zahnbürste','rasierer','creme','lotion','parfüm','wattestäbchen','rasierschaum'],
  gewuerze:      ['salz','pfeffer','paprikapulver','curry','zimt','zucker','öl','olivenöl','essig','senf','ketchup','mayonnaise','sojasauce','chili','oregano','thymian','rosmarin','kurkuma','ingwer','vanille','honig'],
  konserven:     ['nudeln','pasta','spaghetti','reis','linsen','kichererbsen','mais','tomatenmark','dosentomaten','suppe','brühe'],
};
 
const USER_COLORS: string[] = ['#0ea5e9','#f59e0b','#ec4899','#10b981','#8b5cf6','#ef4444','#06b6d4','#84cc16'];
 
// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────
function categorizeLocal(name: string): CategoryKey {
  const lower = name.toLowerCase();
  const entries = Object.entries(KEYWORD_MAP) as Array<[CategoryKey, string[]]>;
  for (const [cat, keywords] of entries) {
    if (keywords && keywords.some((k) => lower.includes(k))) return cat;
  }
  return 'sonstiges';
}
 
async function aiCategorize(name: string): Promise<CategoryKey> {
  try {
    const catList = (Object.entries(CATEGORIES) as Array<[CategoryKey, CategoryConfig]>)
      .map(([k, v]) => `${k}: ${v.label}`).join(', ');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 50,
        messages: [{ role: 'user', content: `Kategorisiere diesen Einkaufsartikel: "${name}". Kategorien: ${catList}. Antworte NUR mit dem Schlüssel, z.B. "obst_gemuese".` }],
      }),
    });
    const data = await res.json();
    const key = data.content?.[0]?.text?.trim().toLowerCase() as CategoryKey;
    return CATEGORIES[key] ? key : categorizeLocal(name);
  } catch {
    return categorizeLocal(name);
  }
}
 
const randomColor = (): string => USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
const generateId  = (): string => Math.random().toString(36).slice(2, 9);
 
// ─────────────────────────────────────────────────────────────
//  localStorage Storage
// ─────────────────────────────────────────────────────────────
function storageLoad(roomCode: string): Item[] {
  try { return JSON.parse(localStorage.getItem(`room_${roomCode}`) ?? '[]') as Item[]; }
  catch { return []; }
}
function storageSave(roomCode: string, items: Item[]): void {
  localStorage.setItem(`room_${roomCode}`, JSON.stringify(items));
}
 
const roomsApi = {
  create(): Promise<{ code: string }> {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    localStorage.setItem(`roomExists_${code}`, '1');
    return Promise.resolve({ code });
  },
  check(code: string): Promise<{ room: { code: string } }> {
    if (localStorage.getItem(`roomExists_${code}`) !== '1')
      return Promise.reject(new Error('Raum nicht gefunden.'));
    return Promise.resolve({ room: { code } });
  },
};
 
const itemsApi = {
  getAll(roomCode: string): Promise<{ items: Item[] }> {
    return Promise.resolve({ items: storageLoad(roomCode) });
  },
  add(p: AddPayload): Promise<{ item: Item }> {
    const items = storageLoad(p.room_code);
    const item: Item = {
      id: generateId(), name: p.name, qty: p.qty || '1',
      category: p.category, done: false, added_by: p.added_by,
      added_color: p.added_color, done_by: null,
      created_at: new Date().toISOString(),
    };
    items.push(item);
    storageSave(p.room_code, items);
    return Promise.resolve({ item });
  },
  toggle(id: string, done: boolean, doneBy: string, roomCode: string): Promise<{ success: boolean }> {
    const items = storageLoad(roomCode);
    const idx = items.findIndex((i) => i.id === id);
    if (idx !== -1) { items[idx].done = done; items[idx].done_by = done ? doneBy : null; storageSave(roomCode, items); }
    return Promise.resolve({ success: true });
  },
  delete(id: string, roomCode: string): Promise<{ success: boolean }> {
    storageSave(roomCode, storageLoad(roomCode).filter((i) => i.id !== id));
    return Promise.resolve({ success: true });
  },
  clearDone(roomCode: string): Promise<{ deleted: boolean }> {
    storageSave(roomCode, storageLoad(roomCode).filter((i) => !i.done));
    return Promise.resolve({ deleted: true });
  },
};
 
// ─────────────────────────────────────────────────────────────
//  Global CSS injection
// ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; font-family: 'Inter', system-ui, sans-serif; background: #f9fafb; -webkit-font-smoothing: antialiased; }
  input, button { font-family: inherit; }
  button { cursor: pointer; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
  @keyframes slideDown {
    from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
`;
 
function GlobalStyle() {
  useEffect(() => {
    if (document.getElementById('mt-styles')) return;
    const el = document.createElement('style');
    el.id = 'mt-styles';
    el.textContent = GLOBAL_CSS;
    document.head.appendChild(el);
  }, []);
  return null;
}
 
// ─────────────────────────────────────────────────────────────
//  Styles
// ─────────────────────────────────────────────────────────────
const S: Record<string, CSSProperties> = {
  pageBg:       { minHeight:'100vh', background:'linear-gradient(135deg,#f0fdf4 0%,#e0f2fe 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  homeCard:     { background:'#fff', borderRadius:24, padding:'40px 36px', maxWidth:420, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.10),0 4px 20px rgba(0,0,0,.06)', display:'flex', flexDirection:'column', gap:12 },
  logoRow:      { display:'flex', alignItems:'center', gap:14, marginBottom:8 },
  logoIcon:     { fontSize:38, background:'#f0fdf4', width:64, height:64, borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #bbf7d0', flexShrink:0 },
  logoTitle:    { fontSize:24, fontWeight:800, color:'#111827', letterSpacing:'-0.5px' },
  logoSub:      { fontSize:13, color:'#6b7280', marginTop:2 },
  fieldLabel:   { fontSize:13, fontWeight:600, color:'#374151' },
  textInput:    { width:'100%', padding:'11px 14px', borderRadius:10, border:'2px solid #e5e7eb', fontSize:15, color:'#111827', background:'#fff', outline:'none' },
  errorBox:     { background:'#fef2f2', color:'#dc2626', borderRadius:8, padding:'10px 14px', fontSize:13, border:'1px solid #fecaca' },
  btnPrimary:   { width:'100%', padding:13, background:'linear-gradient(135deg,#16a34a,#15803d)', color:'#fff', border:'none', borderRadius:12, fontSize:16, fontWeight:700 },
  btnSecondary: { width:'100%', padding:13, background:'#f8fafc', color:'#1d4ed8', border:'2px solid #bfdbfe', borderRadius:12, fontSize:16, fontWeight:700 },
  divider:      { position:'relative', textAlign:'center', margin:'4px 0', borderTop:'1px solid #e5e7eb' },
  dividerSpan:  { position:'relative', top:-11, background:'#fff', padding:'0 12px', color:'#9ca3af', fontSize:13 },
  featureRow:   { display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', marginTop:8 },
  featureTag:   { background:'#f0fdf4', color:'#15803d', border:'1px solid #bbf7d0', borderRadius:20, padding:'5px 12px', fontSize:12, fontWeight:600 },
  appWrap:      { minHeight:'100vh', display:'flex', flexDirection:'column', maxWidth:700, margin:'0 auto', background:'#f9fafb' },
  toast:        { position:'fixed', top:18, left:'50%', transform:'translateX(-50%)', background:'#111827', color:'#fff', padding:'10px 22px', borderRadius:100, fontSize:14, fontWeight:600, zIndex:999, whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(0,0,0,.25)', animation:'slideDown .2s ease', pointerEvents:'none' },
  appHeader:    { background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'14px 20px', display:'flex', alignItems:'center', gap:12, position:'sticky', top:0, zIndex:10, boxShadow:'0 1px 4px rgba(0,0,0,.06)' },
  headerLeft:   { display:'flex', alignItems:'center', gap:12, flex:1, minWidth:0 },
  headerTitle:  { fontSize:17, fontWeight:800, color:'#111827', letterSpacing:'-0.3px' },
  headerSub:    { display:'flex', alignItems:'center', gap:10, marginTop:2 },
  codeChip:     { background:'#f0fdf4', color:'#15803d', border:'1px solid #bbf7d0', borderRadius:6, padding:'2px 8px', fontSize:12, fontWeight:700, letterSpacing:1 },
  userBadge:    { display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#6b7280', fontWeight:600 },
  userDot:      { width:8, height:8, borderRadius:'50%', display:'inline-block' },
  headerStats:  { display:'flex', alignItems:'center', gap:10, background:'#f9fafb', borderRadius:10, padding:'6px 14px', border:'1px solid #e5e7eb', flexShrink:0 },
  statItem:     { display:'flex', flexDirection:'column', alignItems:'center', minWidth:30 },
  statNum:      { fontSize:18, fontWeight:800, color:'#111827', lineHeight:'1' },
  statNumGreen: { fontSize:18, fontWeight:800, color:'#16a34a', lineHeight:'1' },
  statLbl:      { fontSize:10, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 },
  statDiv:      { width:1, height:28, background:'#e5e7eb' },
  btnLeave:     { background:'transparent', border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 12px', fontSize:13, color:'#6b7280', fontWeight:600, whiteSpace:'nowrap' },
  addBar:       { background:'#fff', padding:'14px 16px 10px', borderBottom:'1px solid #f0f0f0', display:'flex', flexDirection:'column', gap:8 },
  addRow:       { display:'flex', gap:8 },
  addInput:     { flex:1, padding:'11px 14px', borderRadius:10, border:'2px solid #e5e7eb', fontSize:15, color:'#111827', minWidth:0, outline:'none' },
  qtyInput:     { width:76, padding:'11px 10px', borderRadius:10, border:'2px solid #e5e7eb', fontSize:14, color:'#111827', textAlign:'center', outline:'none' },
  btnAdd:       { width:44, height:44, borderRadius:10, background:'linear-gradient(135deg,#16a34a,#15803d)', color:'#fff', border:'none', fontSize:26, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  aiLabel:      { display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#6b7280', fontWeight:600, cursor:'pointer', userSelect:'none' },
  toggleTrack:  { width:34, height:20, borderRadius:10, position:'relative', cursor:'pointer', flexShrink:0, transition:'background .2s' },
  toggleThumb:  { position:'absolute', top:2, width:16, height:16, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,.2)', transition:'left .2s' },
  filterBar:    { background:'#fff', padding:'8px 16px 10px', borderBottom:'1px solid #f0f0f0', display:'flex', flexDirection:'column', gap:6 },
  filterScroll: { display:'flex', gap:6, overflowX:'auto', paddingBottom:2 },
  chipBase:     { padding:'5px 12px', borderRadius:20, border:'none', fontSize:12, whiteSpace:'nowrap', fontWeight:500, background:'#f3f4f6', color:'#374151' },
  chipGreen:    { padding:'5px 12px', borderRadius:20, border:'none', fontSize:12, whiteSpace:'nowrap', fontWeight:700, background:'#16a34a', color:'#fff' },
  chipBlue:     { padding:'5px 12px', borderRadius:20, border:'none', fontSize:12, whiteSpace:'nowrap', fontWeight:700, background:'#1d4ed8', color:'#fff' },
  clearBtn:     { padding:'4px 12px', borderRadius:20, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', fontSize:12, fontWeight:600, whiteSpace:'nowrap', marginLeft:'auto' },
  listArea:     { flex:1, padding:16, display:'flex', flexDirection:'column', gap:20, overflowY:'auto' },
  emptyState:   { textAlign:'center', padding:'60px 20px', color:'#9ca3af' },
  emptyIcon:    { fontSize:56, marginBottom:12 },
  emptyTitle:   { fontSize:18, fontWeight:700, color:'#374151', marginBottom:6 },
  emptyText:    { fontSize:14 },
  catGroup:     { display:'flex', flexDirection:'column', gap:6 },
  catHeader:    { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 },
  catBadge:     { borderRadius:20, padding:'4px 12px', fontSize:13, fontWeight:700 },
  catCount:     { fontSize:12, color:'#9ca3af', fontWeight:600 },
  itemCard:     { background:'#fff', borderRadius:12, padding:'12px 14px', display:'flex', alignItems:'center', gap:12, boxShadow:'0 1px 4px rgba(0,0,0,.06)' },
  checkBtn:     { width:26, height:26, borderRadius:'50%', border:'2.5px solid', background:'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' },
  checkMark:    { color:'#fff', fontSize:13, lineHeight:'1', fontWeight:700 },
  itemInfo:     { flex:1, minWidth:0 },
  itemName:     { fontSize:15, fontWeight:600, color:'#111827' },
  itemMeta:     { display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#9ca3af', marginTop:2, fontWeight:500 },
  metaDot:      { width:7, height:7, borderRadius:'50%', flexShrink:0 },
  itemRight:    { display:'flex', alignItems:'center', gap:8, flexShrink:0 },
  qtyBadge:     { border:'1.5px solid', borderRadius:8, padding:'2px 10px', fontSize:13, fontWeight:700, minWidth:32, textAlign:'center' },
  deleteBtn:    { width:28, height:28, borderRadius:8, background:'#f9fafb', border:'1px solid #e5e7eb', color:'#9ca3af', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:'1' },
  shareBar:     { background:'#fff', borderTop:'1px solid #e5e7eb', padding:'12px 20px', display:'flex', alignItems:'center', gap:10, position:'sticky', bottom:0 },
  shareLabel:   { fontSize:12, color:'#6b7280', fontWeight:600 },
  shareCode:    { background:'#f0fdf4', color:'#15803d', border:'1px solid #bbf7d0', borderRadius:8, padding:'4px 12px', fontSize:14, fontWeight:800, letterSpacing:2, flex:1, textAlign:'center' },
  copyBtn:      { background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:600, color:'#374151', whiteSpace:'nowrap' },
};
 
// ─────────────────────────────────────────────────────────────
//  HomeScreen
// ─────────────────────────────────────────────────────────────
function HomeScreen({ onEnter }: { onEnter: (s: Session) => void }) {
  const [nameInput, setNameInput] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
 
  const handleCreate = async () => {
    const name = nameInput.trim();
    if (!name) { setError('Bitte gib deinen Namen ein.'); return; }
    setLoading(true);
    try {
      const { code } = await roomsApi.create();
      onEnter({ code, name, color: randomColor() });
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  };
 
  const handleJoin = async () => {
    const name = nameInput.trim();
    const code = joinInput.trim().toUpperCase();
    if (!name)           { setError('Bitte gib deinen Namen ein.'); return; }
    if (code.length < 4) { setError('Bitte gib einen gültigen Code ein.'); return; }
    setLoading(true);
    try {
      await roomsApi.check(code);
      onEnter({ code, name, color: randomColor() });
    } catch (e) {
      setError((e as Error).message || 'Raum nicht gefunden.');
    } finally { setLoading(false); }
  };
 
  return (
    <div style={S.pageBg}>
      <div style={S.homeCard}>
        <div style={S.logoRow}>
          <div style={S.logoIcon}>🛒</div>
          <div>
            <div style={S.logoTitle}>Markttasche</div>
            <div style={S.logoSub}>Gemeinsam einkaufen</div>
          </div>
        </div>
        <label style={S.fieldLabel}>Dein Name</label>
        <input style={S.textInput} placeholder="z.B. Maria" value={nameInput}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setNameInput(e.target.value); setError(''); }}
          onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleCreate()} />
        {error && <div style={S.errorBox}>{error}</div>}
        <button style={S.btnPrimary} onClick={handleCreate} disabled={loading}>
          {loading ? '⏳ Wird erstellt…' : '✨ Neuen Raum erstellen'}
        </button>
        <div style={S.divider}><span style={S.dividerSpan}>oder</span></div>
        <label style={S.fieldLabel}>Raum-Code eingeben</label>
        <input style={{ ...S.textInput, letterSpacing:'0.15em', fontWeight:700 }}
          placeholder="z.B. AB12CD" value={joinInput} maxLength={8}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setJoinInput(e.target.value.toUpperCase()); setError(''); }}
          onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleJoin()} />
        <button style={S.btnSecondary} onClick={handleJoin} disabled={loading}>
          {loading ? '⏳ Verbinde…' : '🔗 Raum beitreten'}
        </button>
        <div style={S.featureRow}>
          {['🤖 KI-Kategorisierung', '👥 Mehrere Nutzer', '🔄 Echtzeit-Sync'].map((f) => (
            <span key={f} style={S.featureTag}>{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────
//  AppScreen
// ─────────────────────────────────────────────────────────────
function AppScreen({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const { code: roomCode, name: userName, color: userColor } = session;
  const [items, setItems]           = useState<Item[]>([]);
  const [inputName, setInputName]   = useState('');
  const [inputQty, setInputQty]     = useState('1');
  const [filterCat, setFilterCat]   = useState('all');
  const [filterDone, setFilterDone] = useState<FilterDone>('all');
  const [aiMode, setAiMode]         = useState(true);
  const [isAdding, setIsAdding]     = useState(false);
  const [toast, setToast]           = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
 
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2600); };
 
  const loadItems = useCallback(async () => {
    try { const { items: f } = await itemsApi.getAll(roomCode); setItems(f); } catch { /* ignore */ }
  }, [roomCode]);
 
  useEffect(() => {
    loadItems();
    pollRef.current = setInterval(loadItems, 3500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadItems]);
 
  const handleAdd = async () => {
    const name = inputName.trim();
    if (!name) return;
    setIsAdding(true);
    try {
      const category = aiMode ? await aiCategorize(name) : categorizeLocal(name);
      const { item } = await itemsApi.add({ room_code:roomCode, name, qty:inputQty||'1', category, added_by:userName, added_color:userColor });
      setItems((p) => [...p, item]);
      setInputName(''); setInputQty('1');
      inputRef.current?.focus();
      showToast(`„${name}" hinzugefügt`);
    } catch (e) {
      showToast('Fehler: ' + (e as Error).message);
    } finally { setIsAdding(false); }
  };
 
  const handleToggle = async (item: Item) => {
    const newDone = !item.done;
    setItems((p) => p.map((i) => i.id === item.id ? { ...i, done:newDone, done_by:newDone ? userName : null } : i));
    try { await itemsApi.toggle(item.id, newDone, userName, roomCode); } catch { loadItems(); }
  };
 
  const handleDelete = async (id: string) => {
    setItems((p) => p.filter((i) => i.id !== id));
    try { await itemsApi.delete(id, roomCode); showToast('Artikel entfernt'); } catch { loadItems(); }
  };
 
  const handleClearDone = async () => {
    setItems((p) => p.filter((i) => !i.done));
    try { await itemsApi.clearDone(roomCode); showToast('Erledigte Artikel gelöscht'); } catch { loadItems(); }
  };
 
  const filtered = items.filter((i) => {
    const catOk  = filterCat  === 'all' || i.category === filterCat;
    const doneOk = filterDone === 'all' || (filterDone === 'open' && !i.done) || (filterDone === 'done' && i.done);
    return catOk && doneOk;
  });
 
  const grouped = filtered.reduce<Record<string, Item[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});
 
  const openCount = items.filter((i) => !i.done).length;
  const doneCount = items.filter((i) =>  i.done).length;
  const usedCats  = Array.from(new Set(items.map((i) => i.category)));
 
  // Build category filter tabs – explicit typing avoids concat inference issues
  const catTabs: Array<[string, string, string]> = [['all', 'Alle', '🛒']];
  usedCats.forEach((c) => {
    const cfg = CATEGORIES[c as CategoryKey];
    if (cfg) catTabs.push([c, cfg.label, cfg.emoji]);
  });
 
  const doneFilters: Array<[FilterDone, string]> = [['all','Alle'],['open','Offen'],['done','Erledigt']];
 
  return (
    <div style={S.appWrap}>
      {toast && <div style={S.toast}>{toast}</div>}
 
      <header style={S.appHeader}>
        <div style={S.headerLeft}>
          <span style={{ fontSize:26 }}>🛒</span>
          <div>
            <div style={S.headerTitle}>Markttasche</div>
            <div style={S.headerSub}>
              <span style={S.codeChip}>{roomCode}</span>
              <span style={S.userBadge}>
                <span style={{ ...S.userDot, background:userColor }} />{userName}
              </span>
            </div>
          </div>
        </div>
        <div style={S.headerStats}>
          <div style={S.statItem}><span style={S.statNum}>{openCount}</span><span style={S.statLbl}>offen</span></div>
          <div style={S.statDiv} />
          <div style={S.statItem}><span style={S.statNumGreen}>{doneCount}</span><span style={S.statLbl}>erledigt</span></div>
        </div>
        <button style={S.btnLeave} onClick={onLeave}>← Verlassen</button>
      </header>
 
      <div style={S.addBar}>
        <div style={S.addRow}>
          <input ref={inputRef} style={S.addInput} placeholder="Artikel hinzufügen…"
            value={inputName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleAdd()} />
          <input style={S.qtyInput} placeholder="Menge" value={inputQty}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputQty(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleAdd()} />
          <button style={S.btnAdd} onClick={handleAdd} disabled={isAdding}>
            {isAdding ? '⏳' : '+'}
          </button>
        </div>
        <label style={S.aiLabel}>
          <div style={{ ...S.toggleTrack, background:aiMode ? '#16a34a' : '#d1d5db' }}
            onClick={() => setAiMode((v) => !v)}>
            <div style={{ ...S.toggleThumb, left:aiMode ? 18 : 2 }} />
          </div>
          🤖 KI-Kategorisierung {aiMode ? 'ein' : 'aus'}
        </label>
      </div>
 
      <div style={S.filterBar}>
        <div style={S.filterScroll}>
          {catTabs.map(([key, label, emoji]) => (
            <button key={key} style={filterCat === key ? S.chipGreen : S.chipBase}
              onClick={() => setFilterCat(key)}>{emoji} {label}</button>
          ))}
        </div>
        <div style={S.filterScroll}>
          {doneFilters.map(([k, l]) => (
            <button key={k} style={filterDone === k ? S.chipBlue : S.chipBase}
              onClick={() => setFilterDone(k)}>{l}</button>
          ))}
          {doneCount > 0 && (
            <button style={S.clearBtn} onClick={handleClearDone}>🗑 Erledigte löschen</button>
          )}
        </div>
      </div>
 
      <div style={S.listArea}>
        {Object.keys(grouped).length === 0 && (
          <div style={S.emptyState}>
            <div style={S.emptyIcon}>🧺</div>
            <div style={S.emptyTitle}>Noch nichts auf der Liste</div>
            <div style={S.emptyText}>Artikel eingeben und Enter drücken</div>
          </div>
        )}
        {Object.entries(grouped).map(([cat, catItems]) => {
          const cfg = CATEGORIES[cat as CategoryKey] ?? CATEGORIES.sonstiges;
          return (
            <div key={cat} style={S.catGroup}>
              <div style={S.catHeader}>
                <span style={{ ...S.catBadge, background:cfg.bg, color:cfg.color }}>
                  {cfg.emoji} {cfg.label}
                </span>
                <span style={S.catCount}>
                  {catItems.filter((i) => !i.done).length}/{catItems.length}
                </span>
              </div>
              {catItems.map((item) => (
                <div key={item.id} style={{ ...S.itemCard, borderLeft:`4px solid ${cfg.color}`, opacity:item.done ? 0.55 : 1 }}>
                  <button style={{ ...S.checkBtn, borderColor:cfg.color, background:item.done ? cfg.color : 'transparent' }}
                    onClick={() => handleToggle(item)}>
                    {item.done && <span style={S.checkMark}>✓</span>}
                  </button>
                  <div style={S.itemInfo}>
                    <div style={{ ...S.itemName, textDecoration:item.done ? 'line-through' : 'none' }}>{item.name}</div>
                    <div style={S.itemMeta}>
                      <span style={{ ...S.metaDot, background:item.added_color }} />
                      {item.added_by}{item.done_by && ` · ✓ ${item.done_by}`}
                    </div>
                  </div>
                  <div style={S.itemRight}>
                    <span style={{ ...S.qtyBadge, borderColor:cfg.color, color:cfg.color }}>{item.qty}</span>
                    <button style={S.deleteBtn} onClick={() => handleDelete(item.id)}>×</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
 
      <div style={S.shareBar}>
        <span style={S.shareLabel}>Code teilen:</span>
        <span style={S.shareCode}>{roomCode}</span>
        <button style={S.copyBtn}
          onClick={() => { navigator.clipboard?.writeText(roomCode); showToast('Code kopiert!'); }}>
          📋 Kopieren
        </button>
      </div>
    </div>
  );
}
 
// ─────────────────────────────────────────────────────────────
//  Root
// ─────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  return (
    <>
      <GlobalStyle />
      {!session
        ? <HomeScreen onEnter={setSession} />
        : <AppScreen session={session} onLeave={() => setSession(null)} />
      }
    </>
  );
}