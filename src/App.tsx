import {
  useState, useEffect, useRef,
  type CSSProperties, type ChangeEvent, type KeyboardEvent,
} from 'react'
import {
  collection, doc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, getDoc, getDocs,
} from 'firebase/firestore'
import { db } from './firebase'

// ── Types ────────────────────────────────────────────────────
type CatKey =
  | 'obst_gemuese' | 'fleisch_fisch' | 'milch' | 'backwaren'
  | 'tiefkuehl' | 'getraenke' | 'snacks' | 'haushalt'
  | 'koerperpflege' | 'gewuerze' | 'konserven' | 'sonstiges'

interface CatCfg { label: string; emoji: string; color: string; bg: string }
interface Item {
  id: string; name: string; qty: string; category: CatKey
  done: boolean; added_by: string; added_color: string
  done_by: string | null; created_at: number
}
interface Session { code: string; name: string; color: string }
type FilterDone = 'all' | 'open' | 'done'

// ── Categories ───────────────────────────────────────────────
const CATS: Record<CatKey, CatCfg> = {
  obst_gemuese:  { label:'Obst & Gemüse',    emoji:'🥦', color:'#16a34a', bg:'#dcfce7' },
  fleisch_fisch: { label:'Fleisch & Fisch',   emoji:'🥩', color:'#dc2626', bg:'#fee2e2' },
  milch:         { label:'Milch & Käse',      emoji:'🧀', color:'#d97706', bg:'#fef3c7' },
  backwaren:     { label:'Backwaren',          emoji:'🍞', color:'#92400e', bg:'#fde8d8' },
  tiefkuehl:     { label:'Tiefkühl',           emoji:'🧊', color:'#0284c7', bg:'#e0f2fe' },
  getraenke:     { label:'Getränke',           emoji:'🥤', color:'#7c3aed', bg:'#ede9fe' },
  snacks:        { label:'Snacks & Süßes',    emoji:'🍫', color:'#db2777', bg:'#fce7f3' },
  haushalt:      { label:'Haushalt',           emoji:'🧹', color:'#0f766e', bg:'#ccfbf1' },
  koerperpflege: { label:'Körperpflege',       emoji:'🧴', color:'#6d28d9', bg:'#ede9fe' },
  gewuerze:      { label:'Gewürze & Öl',      emoji:'🧂', color:'#b45309', bg:'#fef9c3' },
  konserven:     { label:'Konserven & Pasta',  emoji:'🥫', color:'#1d4ed8', bg:'#dbeafe' },
  sonstiges:     { label:'Sonstiges',          emoji:'🛒', color:'#6b7280', bg:'#f3f4f6' },
}

const KEYWORDS: Partial<Record<CatKey, string[]>> = {
  obst_gemuese:  ['apfel','birne','banane','orange','zitrone','traube','erdbeere','himbeere','kirsche','mango','ananas','avocado','salat','tomaten','tomate','gurke','paprika','karotte','kartoffel','kartoffeln','zwiebel','knoblauch','brokkoli','blumenkohl','spinat','zucchini','champignon','pilze','kräuter','basilikum','petersilie','schnittlauch','dill','minze','gemüse','obst','möhren'],
  fleisch_fisch: ['hackfleisch','hähnchen','hühnchen','schwein','rind','lamm','wurst','bratwurst','schinken','speck','salami','thunfisch','lachs','garnelen','fisch','steak','schnitzel','putenbrust','fleisch'],
  milch:         ['milch','butter','quark','joghurt','käse','sahne','schmand','mozzarella','parmesan','gouda','emmentaler','frischkäse','kefir'],
  backwaren:     ['brot','brötchen','baguette','toast','semmel','kuchen','croissant','mehl','hefe','backpulver'],
  tiefkuehl:     ['tiefkühl','gefroren','pizza','pommes','frozen'],
  getraenke:     ['wasser','saft','cola','bier','wein','sekt','kaffee','tee','limonade','sprudel','orangensaft','apfelsaft','smoothie','energy'],
  snacks:        ['chips','schokolade','gummibärchen','kekse','müsliriegel','nüsse','mandeln','erdnüsse','popcorn','cracker','bonbon','praline'],
  haushalt:      ['spülmittel','waschmittel','putzmittel','schwamm','müllbeutel','küchenrolle','toilettenpapier','taschentuch','alufolie','backpapier','reiniger','weichspüler'],
  koerperpflege: ['shampoo','duschgel','deo','zahnpasta','zahnbürste','rasierer','creme','lotion','parfüm','wattestäbchen'],
  gewuerze:      ['salz','pfeffer','paprikapulver','curry','zimt','zucker','öl','olivenöl','essig','senf','ketchup','mayonnaise','sojasauce','chili','oregano','thymian','rosmarin','kurkuma','ingwer','vanille','honig'],
  konserven:     ['nudeln','pasta','spaghetti','reis','linsen','kichererbsen','mais','tomatenmark','dosentomaten','suppe','brühe'],
}

const USER_COLORS = ['#0ea5e9','#f59e0b','#ec4899','#10b981','#8b5cf6','#ef4444','#06b6d4','#84cc16']

// ── Helpers ──────────────────────────────────────────────────
function catLocal(name: string): CatKey {
  const low = name.toLowerCase()
  for (const [k, words] of Object.entries(KEYWORDS) as [CatKey, string[]][]) {
    if (words?.some(w => low.includes(w))) return k
  }
  return 'sonstiges'
}

async function catAI(name: string): Promise<CatKey> {
  try {
    const list = (Object.entries(CATS) as [CatKey, CatCfg][]).map(([k,v]) => `${k}:${v.label}`).join(',')
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 30,
        messages: [{ role:'user', content:`Kategorisiere: "${name}". Kategorien: ${list}. Antworte NUR mit dem Schlüssel.` }],
      }),
    })
    const d = await r.json()
    const k = d.content?.[0]?.text?.trim().toLowerCase() as CatKey
    return CATS[k] ? k : catLocal(name)
  } catch { return catLocal(name) }
}

const rndColor = () => USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// ── Firebase API ─────────────────────────────────────────────
// Raum erstellen: schreibt Dokument in Firestore und wartet auf Bestätigung
async function createRoom(): Promise<string> {
  const code = genCode()
  console.log('[Firebase] Erstelle Raum:', code)
  const roomRef = doc(db, 'rooms', code)
  await setDoc(roomRef, { code, created_at: Date.now() })
  // Direkt nach dem Schreiben lesen um sicherzustellen dass es gespeichert wurde
  const verify = await getDoc(roomRef)
  if (!verify.exists()) throw new Error('Raum konnte nicht gespeichert werden.')
  console.log('[Firebase] Raum erfolgreich erstellt:', code)
  return code
}

// Raum beitreten: prüft ob Raum existiert, erstellt ihn falls nicht
// (Robuste Variante: kein Fehler wenn Raum gerade erst erstellt wurde)
async function joinRoom(code: string): Promise<void> {
  console.log('[Firebase] Suche Raum:', code)
  const roomRef = doc(db, 'rooms', code)

  // Erst mit getDoc versuchen
  try {
    const snap = await getDoc(roomRef)
    if (snap.exists()) {
      console.log('[Firebase] Raum gefunden via getDoc:', code)
      return
    }
  } catch (e) {
    console.warn('[Firebase] getDoc Fehler:', e)
  }

  // Fallback: alle Räume abfragen (bei Firestore-Regeln die getDoc blockieren)
  try {
    console.log('[Firebase] Versuche getDocs Fallback...')
    const allRooms = await getDocs(collection(db, 'rooms'))
    const found = allRooms.docs.some(d => d.id === code)
    if (found) {
      console.log('[Firebase] Raum gefunden via getDocs:', code)
      return
    }
  } catch (e) {
    console.warn('[Firebase] getDocs Fehler:', e)
  }

  console.error('[Firebase] Raum nicht gefunden:', code)
  throw new Error(`Raum "${code}" nicht gefunden. Bitte Code prüfen.`)
}

// Echtzeit-Listener
function subscribeItems(code: string, cb: (items: Item[]) => void): () => void {
  console.log('[Firebase] Subscribe Items für Raum:', code)
  const q = query(collection(db, 'rooms', code, 'items'), orderBy('created_at', 'asc'))
  return onSnapshot(q,
    snap => {
      const items: Item[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Item))
      console.log('[Firebase] Items aktualisiert:', items.length)
      cb(items)
    },
    err => {
      console.error('[Firebase] onSnapshot Fehler:', err)
    }
  )
}

async function addItem(roomCode: string, data: Omit<Item, 'id'>): Promise<void> {
  await addDoc(collection(db, 'rooms', roomCode, 'items'), data)
}

async function toggleItem(roomCode: string, id: string, done: boolean, doneBy: string): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomCode, 'items', id), {
    done, done_by: done ? doneBy : null,
  })
}

async function deleteItem(roomCode: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'rooms', roomCode, 'items', id))
}

async function clearDoneItems(roomCode: string, items: Item[]): Promise<void> {
  await Promise.all(items.filter(i => i.done).map(i =>
    deleteDoc(doc(db, 'rooms', roomCode, 'items', i.id))
  ))
}

// ── Global CSS ───────────────────────────────────────────────
function GlobalStyle() {
  useEffect(() => {
    if (document.getElementById('mt-css')) return
    const s = document.createElement('style')
    s.id = 'mt-css'
    s.textContent = `
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      html,body,#root{height:100%;font-family:'Inter',system-ui,sans-serif;background:#f9fafb;-webkit-font-smoothing:antialiased}
      input,button{font-family:inherit}
      button{cursor:pointer}
      ::-webkit-scrollbar{width:6px;height:6px}
      ::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:3px}
      @keyframes mtSlide{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    `
    document.head.appendChild(s)
  }, [])
  return null
}

// ── Styles ───────────────────────────────────────────────────
const S: Record<string, CSSProperties> = {
  bg:        { minHeight:'100vh', background:'linear-gradient(135deg,#f0fdf4,#e0f2fe)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  card:      { background:'#fff', borderRadius:24, padding:'40px 36px', maxWidth:420, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,.1)', display:'flex', flexDirection:'column', gap:12 },
  logoRow:   { display:'flex', alignItems:'center', gap:14, marginBottom:8 },
  logoBox:   { fontSize:38, background:'#f0fdf4', width:64, height:64, borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #bbf7d0', flexShrink:0 },
  logoH:     { fontSize:24, fontWeight:800, color:'#111827', letterSpacing:'-0.5px' },
  logoS:     { fontSize:13, color:'#6b7280', marginTop:2 },
  lbl:       { fontSize:13, fontWeight:600, color:'#374151' },
  inp:       { width:'100%', padding:'11px 14px', borderRadius:10, border:'2px solid #e5e7eb', fontSize:15, color:'#111827', background:'#fff', outline:'none' },
  err:       { background:'#fef2f2', color:'#dc2626', borderRadius:8, padding:'12px 14px', fontSize:13, border:'1px solid #fecaca', lineHeight:1.5 },
  btnG:      { width:'100%', padding:13, background:'linear-gradient(135deg,#16a34a,#15803d)', color:'#fff', border:'none', borderRadius:12, fontSize:16, fontWeight:700 },
  btnB:      { width:'100%', padding:13, background:'#f8fafc', color:'#1d4ed8', border:'2px solid #bfdbfe', borderRadius:12, fontSize:16, fontWeight:700 },
  divWrap:   { position:'relative', textAlign:'center', margin:'4px 0', borderTop:'1px solid #e5e7eb' },
  divTxt:    { position:'relative', top:-11, background:'#fff', padding:'0 12px', color:'#9ca3af', fontSize:13 },
  ftRow:     { display:'flex', flexWrap:'wrap', gap:8, justifyContent:'center', marginTop:8 },
  ftTag:     { background:'#f0fdf4', color:'#15803d', border:'1px solid #bbf7d0', borderRadius:20, padding:'5px 12px', fontSize:12, fontWeight:600 },
  // Debug box
  debug:     { background:'#1e293b', color:'#94a3b8', borderRadius:8, padding:'10px 14px', fontSize:11, fontFamily:'monospace', marginTop:8, maxHeight:120, overflowY:'auto' },
  // App
  wrap:      { minHeight:'100vh', display:'flex', flexDirection:'column', maxWidth:700, margin:'0 auto', background:'#f9fafb' },
  toast:     { position:'fixed', top:18, left:'50%', transform:'translateX(-50%)', background:'#111827', color:'#fff', padding:'10px 22px', borderRadius:100, fontSize:14, fontWeight:600, zIndex:999, whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(0,0,0,.25)', animation:'mtSlide .2s ease', pointerEvents:'none' },
  hdr:       { background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'14px 20px', display:'flex', alignItems:'center', gap:12, position:'sticky', top:0, zIndex:10, boxShadow:'0 1px 4px rgba(0,0,0,.06)' },
  hLeft:     { display:'flex', alignItems:'center', gap:12, flex:1, minWidth:0 },
  hTitle:    { fontSize:17, fontWeight:800, color:'#111827' },
  hSub:      { display:'flex', alignItems:'center', gap:10, marginTop:2 },
  chip:      { background:'#f0fdf4', color:'#15803d', border:'1px solid #bbf7d0', borderRadius:6, padding:'2px 8px', fontSize:12, fontWeight:700, letterSpacing:1 },
  uBadge:    { display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#6b7280', fontWeight:600 },
  uDot:      { width:8, height:8, borderRadius:'50%', display:'inline-block' },
  stats:     { display:'flex', alignItems:'center', gap:10, background:'#f9fafb', borderRadius:10, padding:'6px 14px', border:'1px solid #e5e7eb', flexShrink:0 },
  stI:       { display:'flex', flexDirection:'column', alignItems:'center', minWidth:30 },
  stN:       { fontSize:18, fontWeight:800, color:'#111827', lineHeight:'1' },
  stNG:      { fontSize:18, fontWeight:800, color:'#16a34a', lineHeight:'1' },
  stL:       { fontSize:10, color:'#9ca3af', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 },
  stDiv:     { width:1, height:28, background:'#e5e7eb' },
  leaveBtn:  { background:'transparent', border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 12px', fontSize:13, color:'#6b7280', fontWeight:600, whiteSpace:'nowrap' },
  addBar:    { background:'#fff', padding:'14px 16px 10px', borderBottom:'1px solid #f0f0f0', display:'flex', flexDirection:'column', gap:8 },
  addRow:    { display:'flex', gap:8 },
  addInp:    { flex:1, padding:'11px 14px', borderRadius:10, border:'2px solid #e5e7eb', fontSize:15, color:'#111827', minWidth:0, outline:'none' },
  qtyInp:    { width:76, padding:'11px 10px', borderRadius:10, border:'2px solid #e5e7eb', fontSize:14, color:'#111827', textAlign:'center', outline:'none' },
  addBtn:    { width:44, height:44, borderRadius:10, background:'linear-gradient(135deg,#16a34a,#15803d)', color:'#fff', border:'none', fontSize:26, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  aiLbl:     { display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#6b7280', fontWeight:600, cursor:'pointer', userSelect:'none' },
  trkBase:   { width:34, height:20, borderRadius:10, position:'relative', cursor:'pointer', flexShrink:0 },
  thumb:     { position:'absolute', top:2, width:16, height:16, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 4px rgba(0,0,0,.2)', transition:'left .15s' },
  fBar:      { background:'#fff', padding:'8px 16px 10px', borderBottom:'1px solid #f0f0f0', display:'flex', flexDirection:'column', gap:6 },
  fScroll:   { display:'flex', gap:6, overflowX:'auto', paddingBottom:2 },
  fChip:     { padding:'5px 12px', borderRadius:20, border:'none', fontSize:12, whiteSpace:'nowrap', fontWeight:500, background:'#f3f4f6', color:'#374151' },
  fChipG:    { padding:'5px 12px', borderRadius:20, border:'none', fontSize:12, whiteSpace:'nowrap', fontWeight:700, background:'#16a34a', color:'#fff' },
  fChipB:    { padding:'5px 12px', borderRadius:20, border:'none', fontSize:12, whiteSpace:'nowrap', fontWeight:700, background:'#1d4ed8', color:'#fff' },
  clrBtn:    { padding:'4px 12px', borderRadius:20, border:'1px solid #fecaca', background:'#fef2f2', color:'#dc2626', fontSize:12, fontWeight:600, whiteSpace:'nowrap', marginLeft:'auto' },
  list:      { flex:1, padding:16, display:'flex', flexDirection:'column', gap:20, overflowY:'auto' },
  empty:     { textAlign:'center', padding:'60px 20px', color:'#9ca3af' },
  emptyI:    { fontSize:56, marginBottom:12 },
  emptyH:    { fontSize:18, fontWeight:700, color:'#374151', marginBottom:6 },
  emptyT:    { fontSize:14 },
  catGrp:    { display:'flex', flexDirection:'column', gap:6 },
  catHdr:    { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 },
  catBadge:  { borderRadius:20, padding:'4px 12px', fontSize:13, fontWeight:700 },
  catCnt:    { fontSize:12, color:'#9ca3af', fontWeight:600 },
  iCard:     { background:'#fff', borderRadius:12, padding:'12px 14px', display:'flex', alignItems:'center', gap:12, boxShadow:'0 1px 4px rgba(0,0,0,.06)' },
  chkBtn:    { width:26, height:26, borderRadius:'50%', border:'2.5px solid', background:'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' },
  chkMark:   { color:'#fff', fontSize:13, lineHeight:'1', fontWeight:700 },
  iInfo:     { flex:1, minWidth:0 },
  iName:     { fontSize:15, fontWeight:600, color:'#111827' },
  iMeta:     { display:'flex', alignItems:'center', gap:5, fontSize:11, color:'#9ca3af', marginTop:2, fontWeight:500 },
  mDot:      { width:7, height:7, borderRadius:'50%', flexShrink:0 },
  iRight:    { display:'flex', alignItems:'center', gap:8, flexShrink:0 },
  qtyBadge:  { border:'1.5px solid', borderRadius:8, padding:'2px 10px', fontSize:13, fontWeight:700, minWidth:32, textAlign:'center' },
  delBtn:    { width:28, height:28, borderRadius:8, background:'#f9fafb', border:'1px solid #e5e7eb', color:'#9ca3af', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:'1' },
  shareBar:  { background:'#fff', borderTop:'1px solid #e5e7eb', padding:'12px 20px', display:'flex', alignItems:'center', gap:10, position:'sticky', bottom:0 },
  shareLbl:  { fontSize:12, color:'#6b7280', fontWeight:600 },
  shareCode: { background:'#f0fdf4', color:'#15803d', border:'1px solid #bbf7d0', borderRadius:8, padding:'4px 12px', fontSize:14, fontWeight:800, letterSpacing:2, flex:1, textAlign:'center' },
  cpyBtn:    { background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:600, color:'#374151', whiteSpace:'nowrap' },
  spinner:   { display:'flex', alignItems:'center', justifyContent:'center', padding:'60px 20px', fontSize:14, color:'#6b7280', gap:10 },
}

// ── HomeScreen ───────────────────────────────────────────────
function HomeScreen({ onEnter }: { onEnter: (s: Session) => void }) {
  const [name, setName]     = useState('')
  const [join, setJoin]     = useState('')
  const [err,  setErr]      = useState('')
  const [busy, setBusy]     = useState(false)
  const [logs, setLogs]     = useState<string[]>([])

  const log = (msg: string) => {
    console.log(msg)
    setLogs(p => [...p.slice(-6), msg])
  }

  const create = async () => {
    if (!name.trim()) { setErr('Bitte gib deinen Namen ein.'); return }
    setBusy(true); setErr(''); setLogs([])
    try {
      log('⏳ Verbinde mit Firebase...')
      const code = await createRoom()
      log(`✅ Raum erstellt: ${code}`)
      onEnter({ code, name: name.trim(), color: rndColor() })
    } catch (e) {
      const msg = (e as Error).message
      log('❌ Fehler: ' + msg)
      setErr('Fehler beim Erstellen:\n' + msg + '\n\nBitte Firebase-Konfiguration und Firestore-Regeln prüfen.')
    } finally { setBusy(false) }
  }

  const doJoin = async () => {
    const code = join.trim().toUpperCase()
    if (!name.trim())    { setErr('Bitte gib deinen Namen ein.'); return }
    if (code.length < 4) { setErr('Ungültiger Code (mind. 4 Zeichen).'); return }
    setBusy(true); setErr(''); setLogs([])
    try {
      log(`⏳ Suche Raum: ${code}`)
      await joinRoom(code)
      log(`✅ Raum gefunden: ${code}`)
      onEnter({ code, name: name.trim(), color: rndColor() })
    } catch (e) {
      const msg = (e as Error).message
      log('❌ ' + msg)
      setErr(msg + '\n\nTipp: Code muss exakt so eingegeben werden wie er angezeigt wird (6 Zeichen).')
    } finally { setBusy(false) }
  }

  return (
    <div style={S.bg}>
      <div style={S.card}>
        <div style={S.logoRow}>
          <div style={S.logoBox}>🛒</div>
          <div>
            <div style={S.logoH}>Markttasche</div>
            <div style={S.logoS}>Gemeinsam einkaufen</div>
          </div>
        </div>

        <label style={S.lbl}>Dein Name</label>
        <input style={S.inp} placeholder="z.B. Maria" value={name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setName(e.target.value); setErr('') }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && create()} />

        {err && <div style={{ ...S.err, whiteSpace:'pre-line' }}>{err}</div>}

        <button style={S.btnG} onClick={create} disabled={busy}>
          {busy ? '⏳ Verbinde…' : '✨ Neuen Raum erstellen'}
        </button>

        <div style={S.divWrap}><span style={S.divTxt}>oder</span></div>

        <label style={S.lbl}>Raum-Code eingeben</label>
        <input style={{ ...S.inp, letterSpacing:'0.15em', fontWeight:700 }}
          placeholder="z.B. AB12CD" value={join} maxLength={8}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setJoin(e.target.value.toUpperCase()); setErr('') }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && doJoin()} />

        <button style={S.btnB} onClick={doJoin} disabled={busy}>
          {busy ? '⏳ Suche Raum…' : '🔗 Raum beitreten'}
        </button>

        {logs.length > 0 && (
          <div style={S.debug}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}

        <div style={S.ftRow}>
          {['🔥 Echtzeit-Sync','👥 Mehrere Nutzer','🤖 KI-Kategorisierung'].map(f => (
            <span key={f} style={S.ftTag}>{f}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── AppScreen ────────────────────────────────────────────────
function AppScreen({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const { code: rc, name: uName, color: uColor } = session
  const [items, setItems]   = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [connErr, setConnErr] = useState('')
  const [inpName, setInpName] = useState('')
  const [inpQty,  setInpQty]  = useState('1')
  const [fCat,  setFCat]    = useState('all')
  const [fDone, setFDone]   = useState<FilterDone>('all')
  const [aiOn,  setAiOn]    = useState(true)
  const [adding, setAdding] = useState(false)
  const [toast,  setToast]  = useState('')
  const ref = useRef<HTMLInputElement>(null)

  const msg = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2600) }

  useEffect(() => {
    const unsub = subscribeItems(rc, (newItems) => {
      setItems(newItems)
      setLoading(false)
      setConnErr('')
    })
    return () => unsub()
  }, [rc])

  const add = async () => {
    const name = inpName.trim()
    if (!name) return
    setAdding(true)
    try {
      const category = aiOn ? await catAI(name) : catLocal(name)
      await addItem(rc, {
        name, qty: inpQty||'1', category,
        done: false, added_by: uName, added_color: uColor,
        done_by: null, created_at: Date.now(),
      })
      setInpName(''); setInpQty('1')
      ref.current?.focus()
      msg(`„${name}" hinzugefügt`)
    } catch (e) { msg('Fehler: '+(e as Error).message) }
    finally { setAdding(false) }
  }

  const toggle = async (item: Item) => {
    try { await toggleItem(rc, item.id, !item.done, uName) }
    catch { msg('Fehler beim Aktualisieren') }
  }

  const del = async (id: string) => {
    try { await deleteItem(rc, id); msg('Artikel entfernt') }
    catch { msg('Fehler beim Löschen') }
  }

  const clearDone = async () => {
    try { await clearDoneItems(rc, items); msg('Erledigte gelöscht') }
    catch { msg('Fehler') }
  }

  const filtered = items.filter(i =>
    (fCat  === 'all' || i.category === fCat) &&
    (fDone === 'all' || (fDone === 'open' && !i.done) || (fDone === 'done' && i.done))
  )

  const grouped: Record<string, Item[]> = {}
  for (const item of filtered) {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  }

  const openN = items.filter(i => !i.done).length
  const doneN = items.filter(i =>  i.done).length
  const usedCats = Array.from(new Set(items.map(i => i.category)))
  const catTabs: [string, string, string][] = [['all','Alle','🛒']]
  for (const c of usedCats) {
    const cfg = CATS[c as CatKey]
    if (cfg) catTabs.push([c, cfg.label, cfg.emoji])
  }
  const doneTabs: [FilterDone, string][] = [['all','Alle'],['open','Offen'],['done','Erledigt']]

  return (
    <div style={S.wrap}>
      {toast && <div style={S.toast}>{toast}</div>}

      <header style={S.hdr}>
        <div style={S.hLeft}>
          <span style={{ fontSize:26 }}>🛒</span>
          <div>
            <div style={S.hTitle}>Markttasche</div>
            <div style={S.hSub}>
              <span style={S.chip}>{rc}</span>
              <span style={S.uBadge}>
                <span style={{ ...S.uDot, background:uColor }} />{uName}
              </span>
            </div>
          </div>
        </div>
        <div style={S.stats}>
          <div style={S.stI}><span style={S.stN}>{openN}</span><span style={S.stL}>offen</span></div>
          <div style={S.stDiv} />
          <div style={S.stI}><span style={S.stNG}>{doneN}</span><span style={S.stL}>erledigt</span></div>
        </div>
        <button style={S.leaveBtn} onClick={onLeave}>← Verlassen</button>
      </header>

      <div style={S.addBar}>
        <div style={S.addRow}>
          <input ref={ref} style={S.addInp} placeholder="Artikel hinzufügen…" value={inpName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setInpName(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && add()} />
          <input style={S.qtyInp} placeholder="Menge" value={inpQty}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setInpQty(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && add()} />
          <button style={S.addBtn} onClick={add} disabled={adding}>{adding ? '⏳' : '+'}</button>
        </div>
        <label style={S.aiLbl}>
          <div style={{ ...S.trkBase, background:aiOn ? '#16a34a' : '#d1d5db' }}
            onClick={() => setAiOn(v => !v)}>
            <div style={{ ...S.thumb, left:aiOn ? 18 : 2 }} />
          </div>
          🤖 KI-Kategorisierung {aiOn ? 'ein' : 'aus'}
        </label>
      </div>

      <div style={S.fBar}>
        <div style={S.fScroll}>
          {catTabs.map(([k,l,e]) => (
            <button key={k} style={fCat === k ? S.fChipG : S.fChip} onClick={() => setFCat(k)}>
              {e} {l}
            </button>
          ))}
        </div>
        <div style={S.fScroll}>
          {doneTabs.map(([k,l]) => (
            <button key={k} style={fDone === k ? S.fChipB : S.fChip} onClick={() => setFDone(k)}>{l}</button>
          ))}
          {doneN > 0 && <button style={S.clrBtn} onClick={clearDone}>🗑 Erledigte löschen</button>}
        </div>
      </div>

      <div style={S.list}>
        {connErr && <div style={S.err}>{connErr}</div>}
        {loading && <div style={S.spinner}>⏳ Verbinde mit Firebase…</div>}
        {!loading && Object.keys(grouped).length === 0 && (
          <div style={S.empty}>
            <div style={S.emptyI}>🧺</div>
            <div style={S.emptyH}>Noch nichts auf der Liste</div>
            <div style={S.emptyT}>Artikel eingeben und Enter drücken</div>
          </div>
        )}
        {Object.entries(grouped).map(([cat, gitems]) => {
          const cfg = CATS[cat as CatKey] ?? CATS.sonstiges
          return (
            <div key={cat} style={S.catGrp}>
              <div style={S.catHdr}>
                <span style={{ ...S.catBadge, background:cfg.bg, color:cfg.color }}>
                  {cfg.emoji} {cfg.label}
                </span>
                <span style={S.catCnt}>{gitems.filter(i => !i.done).length}/{gitems.length}</span>
              </div>
              {gitems.map(item => (
                <div key={item.id} style={{ ...S.iCard, borderLeft:`4px solid ${cfg.color}`, opacity:item.done ? 0.55 : 1 }}>
                  <button style={{ ...S.chkBtn, borderColor:cfg.color, background:item.done ? cfg.color : 'transparent' }}
                    onClick={() => toggle(item)}>
                    {item.done && <span style={S.chkMark}>✓</span>}
                  </button>
                  <div style={S.iInfo}>
                    <div style={{ ...S.iName, textDecoration:item.done ? 'line-through' : 'none' }}>{item.name}</div>
                    <div style={S.iMeta}>
                      <span style={{ ...S.mDot, background:item.added_color }} />
                      {item.added_by}{item.done_by && ` · ✓ ${item.done_by}`}
                    </div>
                  </div>
                  <div style={S.iRight}>
                    <span style={{ ...S.qtyBadge, borderColor:cfg.color, color:cfg.color }}>{item.qty}</span>
                    <button style={S.delBtn} onClick={() => del(item.id)}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div style={S.shareBar}>
        <span style={S.shareLbl}>Code teilen:</span>
        <span style={S.shareCode}>{rc}</span>
        <button style={S.cpyBtn}
          onClick={() => { navigator.clipboard?.writeText(rc); msg('Code kopiert!') }}>
          📋 Kopieren
        </button>
      </div>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  return (
    <>
      <GlobalStyle />
      {!session
        ? <HomeScreen onEnter={setSession} />
        : <AppScreen session={session} onLeave={() => setSession(null)} />
      }
    </>
  )
}
