import {
  useState, useEffect, useRef,
  type CSSProperties, type ChangeEvent, type KeyboardEvent,
} from 'react'
import {
  collection, doc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, getDoc, getDocs, writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'

// ── Types ─────────────────────────────────────────────────────
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
interface SavedList { id: string; title: string; date: string; item_count: number; items: SavedItem[]; created_at: number }
interface SavedItem { name: string; qty: string; category: CatKey }
interface Session { code: string; name: string; color: string }
type Screen = 'home' | 'app' | 'history'
type FilterDone = 'all' | 'open' | 'done'

// ── Categories ────────────────────────────────────────────────
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
const CAT_KEYS = Object.keys(CATS) as CatKey[]

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

// ── Helpers ───────────────────────────────────────────────────
function catLocal(name: string): CatKey {
  const low = name.toLowerCase()
  for (const [k, words] of Object.entries(KEYWORDS) as [CatKey, string[]][])
    if (words?.some(w => low.includes(w))) return k
  return 'sonstiges'
}
async function catAI(name: string): Promise<CatKey> {
  try {
    const list = (Object.entries(CATS) as [CatKey, CatCfg][]).map(([k,v]) => `${k}:${v.label}`).join(',')
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:30,
        messages:[{role:'user',content:`Kategorisiere: "${name}". Kategorien: ${list}. Antworte NUR mit dem Schlüssel.`}] })
    })
    const d = await r.json(); const k = d.content?.[0]?.text?.trim().toLowerCase() as CatKey
    return CATS[k] ? k : catLocal(name)
  } catch { return catLocal(name) }
}
const rndColor = () => USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
function genCode() { const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<6;i++) s+=c[Math.floor(Math.random()*c.length)]; return s }
function formatDate(iso: string) { const [y,m,d]=iso.split('-'); return `${d}.${m}.${y}` }
function todayISO() { return new Date().toISOString().split('T')[0] }

// ── Firebase API ──────────────────────────────────────────────
async function createRoom(): Promise<string> {
  const code = genCode(); const ref = doc(db,'rooms',code)
  await setDoc(ref, {code, created_at:Date.now()})
  if (!(await getDoc(ref)).exists()) throw new Error('Raum konnte nicht gespeichert werden.')
  return code
}
async function joinRoom(code: string): Promise<void> {
  try { if ((await getDoc(doc(db,'rooms',code))).exists()) return } catch {}
  try { if ((await getDocs(collection(db,'rooms'))).docs.some(d=>d.id===code)) return } catch {}
  throw new Error(`Raum "${code}" nicht gefunden.`)
}
function subscribeItems(code: string, cb: (i:Item[])=>void) {
  return onSnapshot(query(collection(db,'rooms',code,'items'),orderBy('created_at','asc')),
    s=>cb(s.docs.map(d=>({id:d.id,...d.data()} as Item))), e=>console.error(e))
}
function subscribeSavedLists(code: string, cb: (l:SavedList[])=>void) {
  return onSnapshot(query(collection(db,'rooms',code,'saved_lists'),orderBy('created_at','desc')),
    s=>cb(s.docs.map(d=>({id:d.id,...d.data()} as SavedList))), e=>console.error(e))
}
const fbAddItem    = (rc:string, data:Omit<Item,'id'>) => addDoc(collection(db,'rooms',rc,'items'), data)
const fbToggle     = (rc:string, id:string, done:boolean, by:string) => updateDoc(doc(db,'rooms',rc,'items',id),{done,done_by:done?by:null})
const fbDelete     = (rc:string, id:string) => deleteDoc(doc(db,'rooms',rc,'items',id))
const fbClearDone  = (rc:string, items:Item[]) => Promise.all(items.filter(i=>i.done).map(i=>deleteDoc(doc(db,'rooms',rc,'items',i.id))))
const fbUpdateItem = (rc:string, id:string, fields:Partial<Item>) => updateDoc(doc(db,'rooms',rc,'items',id), fields)
const fbDelSaved   = (rc:string, id:string) => deleteDoc(doc(db,'rooms',rc,'saved_lists',id))

async function fbSaveList(rc:string, items:Item[], title:string, date:string) {
  await addDoc(collection(db,'rooms',rc,'saved_lists'), {
    title, date, item_count:items.length, created_at:Date.now(),
    items: items.map(i=>({name:i.name,qty:i.qty,category:i.category}))
  })
}
async function fbLoadTemplate(rc:string, list:SavedList, uName:string, uColor:string) {
  const batch = writeBatch(db)
  list.items.forEach((item,i) => {
    batch.set(doc(collection(db,'rooms',rc,'items')),
      {name:item.name,qty:item.qty,category:item.category,done:false,added_by:uName,added_color:uColor,done_by:null,created_at:Date.now()+i})
  })
  await batch.commit()
}

// ── Global CSS ────────────────────────────────────────────────
function GlobalStyle() {
  useEffect(()=>{
    if(document.getElementById('mt-css')) return
    const s=document.createElement('style'); s.id='mt-css'
    s.textContent=`*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html,body,#root{height:100%;font-family:'Inter',system-ui,sans-serif;background:#f9fafb;-webkit-font-smoothing:antialiased}input,button,select{font-family:inherit}button{cursor:pointer}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:3px}@keyframes mtSlide{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    .mt-hdr{display:flex;align-items:center;gap:10px}
    .mt-hdr-left{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
    .mt-hdr-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
    .mt-title{font-size:17px;font-weight:800;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mt-stats{display:flex;align-items:center;gap:10px;background:#f9fafb;border-radius:10px;padding:6px 14px;border:1px solid #e5e7eb;flex-shrink:0}
    @media(max-width:600px){
      .mt-hdr{flex-wrap:wrap}
      .mt-title{font-size:16px}
      .mt-hdr-icon{font-size:22px !important}
      .mt-stats{order:3;width:100%;justify-content:center;margin-top:4px}
    }`
    document.head.appendChild(s)
  },[])
  return null
}

// ── Styles ────────────────────────────────────────────────────
const S: Record<string,CSSProperties> = {
  bg:       {minHeight:'100vh',background:'linear-gradient(135deg,#f0fdf4,#e0f2fe)',display:'flex',alignItems:'center',justifyContent:'center',padding:16},
  card:     {background:'#fff',borderRadius:24,padding:'40px 36px',maxWidth:420,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,.1)',display:'flex',flexDirection:'column',gap:12},
  logoRow:  {display:'flex',alignItems:'center',gap:14,marginBottom:8},
  logoBox:  {fontSize:38,background:'#f0fdf4',width:64,height:64,borderRadius:18,display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid #bbf7d0',flexShrink:0},
  logoH:    {fontSize:24,fontWeight:800,color:'#111827',letterSpacing:'-0.5px'},
  logoS:    {fontSize:13,color:'#6b7280',marginTop:2},
  lbl:      {fontSize:13,fontWeight:600,color:'#374151'},
  inp:      {width:'100%',padding:'11px 14px',borderRadius:10,border:'2px solid #e5e7eb',fontSize:15,color:'#111827',background:'#fff',outline:'none'},
  err:      {background:'#fef2f2',color:'#dc2626',borderRadius:8,padding:'12px 14px',fontSize:13,border:'1px solid #fecaca',lineHeight:1.5,whiteSpace:'pre-line'},
  btnG:     {width:'100%',padding:13,background:'linear-gradient(135deg,#16a34a,#15803d)',color:'#fff',border:'none',borderRadius:12,fontSize:16,fontWeight:700},
  btnB:     {width:'100%',padding:13,background:'#f8fafc',color:'#1d4ed8',border:'2px solid #bfdbfe',borderRadius:12,fontSize:16,fontWeight:700},
  divWrap:  {position:'relative',textAlign:'center',margin:'4px 0',borderTop:'1px solid #e5e7eb'},
  divTxt:   {position:'relative',top:-11,background:'#fff',padding:'0 12px',color:'#9ca3af',fontSize:13},
  ftRow:    {display:'flex',flexWrap:'wrap',gap:8,justifyContent:'center',marginTop:8},
  ftTag:    {background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0',borderRadius:20,padding:'5px 12px',fontSize:12,fontWeight:600},
  wrap:     {minHeight:'100vh',display:'flex',flexDirection:'column',maxWidth:700,margin:'0 auto',background:'#f9fafb'},
  toast:    {position:'fixed',top:18,left:'50%',transform:'translateX(-50%)',background:'#111827',color:'#fff',padding:'10px 22px',borderRadius:100,fontSize:14,fontWeight:600,zIndex:999,whiteSpace:'nowrap',boxShadow:'0 4px 20px rgba(0,0,0,.25)',animation:'mtSlide .2s ease',pointerEvents:'none'},
  hdr:      {background:'#fff',borderBottom:'1px solid #e5e7eb',padding:'12px 14px',position:'sticky',top:0,zIndex:10,boxShadow:'0 1px 4px rgba(0,0,0,.06)'},
  hLeft:    {display:'flex',alignItems:'center',gap:12,flex:1,minWidth:0},
  hTitle:   {fontSize:17,fontWeight:800,color:'#111827'},
  hSub:     {display:'flex',alignItems:'center',gap:10,marginTop:2},
  chip:     {background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0',borderRadius:6,padding:'2px 8px',fontSize:12,fontWeight:700,letterSpacing:1},
  uBadge:   {display:'flex',alignItems:'center',gap:5,fontSize:12,color:'#6b7280',fontWeight:600},
  uDot:     {width:8,height:8,borderRadius:'50%',display:'inline-block'},
  stats:    {display:'flex',alignItems:'center',gap:10,background:'#f9fafb',borderRadius:10,padding:'6px 14px',border:'1px solid #e5e7eb',flexShrink:0},
  stI:      {display:'flex',flexDirection:'column',alignItems:'center',minWidth:30},
  stN:      {fontSize:18,fontWeight:800,color:'#111827',lineHeight:'1'},
  stNG:     {fontSize:18,fontWeight:800,color:'#16a34a',lineHeight:'1'},
  stL:      {fontSize:10,color:'#9ca3af',fontWeight:600,textTransform:'uppercase',letterSpacing:.5},
  stDiv:    {width:1,height:28,background:'#e5e7eb'},
  hBtn:     {background:'transparent',border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 10px',fontSize:12,color:'#374151',fontWeight:600,whiteSpace:'nowrap'},
  addBar:   {background:'#fff',padding:'14px 16px 10px',borderBottom:'1px solid #f0f0f0',display:'flex',flexDirection:'column',gap:8},
  addRow:   {display:'flex',gap:8},
  addInp:   {flex:1,padding:'11px 14px',borderRadius:10,border:'2px solid #e5e7eb',fontSize:15,color:'#111827',minWidth:0,outline:'none'},
  qtyInp:   {width:76,padding:'11px 10px',borderRadius:10,border:'2px solid #e5e7eb',fontSize:14,color:'#111827',textAlign:'center',outline:'none'},
  addBtn:   {width:44,height:44,borderRadius:10,background:'linear-gradient(135deg,#16a34a,#15803d)',color:'#fff',border:'none',fontSize:26,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0},
  aiRow:    {display:'flex',alignItems:'center',gap:10},
  aiLbl:    {display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#6b7280',fontWeight:600,cursor:'pointer',userSelect:'none'},
  trk:      {width:34,height:20,borderRadius:10,position:'relative',cursor:'pointer',flexShrink:0},
  thumb:    {position:'absolute',top:2,width:16,height:16,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 4px rgba(0,0,0,.2)',transition:'left .15s'},
  saveBtn:  {marginLeft:'auto',padding:'7px 12px',background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0',borderRadius:8,fontSize:12,fontWeight:700},
  fBar:     {background:'#fff',padding:'8px 16px 10px',borderBottom:'1px solid #f0f0f0',display:'flex',flexDirection:'column',gap:6},
  fScroll:  {display:'flex',gap:6,overflowX:'auto',paddingBottom:2},
  fChip:    {padding:'5px 12px',borderRadius:20,border:'none',fontSize:12,whiteSpace:'nowrap',fontWeight:500,background:'#f3f4f6',color:'#374151'},
  fChipG:   {padding:'5px 12px',borderRadius:20,border:'none',fontSize:12,whiteSpace:'nowrap',fontWeight:700,background:'#16a34a',color:'#fff'},
  fChipB:   {padding:'5px 12px',borderRadius:20,border:'none',fontSize:12,whiteSpace:'nowrap',fontWeight:700,background:'#1d4ed8',color:'#fff'},
  clrBtn:   {padding:'4px 12px',borderRadius:20,border:'1px solid #fecaca',background:'#fef2f2',color:'#dc2626',fontSize:12,fontWeight:600,whiteSpace:'nowrap',marginLeft:'auto'},
  list:     {flex:1,padding:16,display:'flex',flexDirection:'column',gap:20,overflowY:'auto'},
  empty:    {textAlign:'center',padding:'60px 20px',color:'#9ca3af'},
  emptyI:   {fontSize:56,marginBottom:12},
  emptyH:   {fontSize:18,fontWeight:700,color:'#374151',marginBottom:6},
  emptyT:   {fontSize:14},
  catGrp:   {display:'flex',flexDirection:'column',gap:6},
  catHdr:   {display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2},
  catBadge: {borderRadius:20,padding:'4px 12px',fontSize:13,fontWeight:700},
  catCnt:   {fontSize:12,color:'#9ca3af',fontWeight:600},
  // Item card
  iCard:    {background:'#fff',borderRadius:12,boxShadow:'0 1px 4px rgba(0,0,0,.06)',overflow:'hidden',transition:'box-shadow .15s'},
  iMain:    {padding:'12px 14px',display:'flex',alignItems:'center',gap:12},
  iExpand:  {padding:'0 14px 12px',display:'flex',flexDirection:'column',gap:8,borderTop:'1px solid #f3f4f6'},
  chkBtn:   {width:26,height:26,borderRadius:'50%',border:'2.5px solid',background:'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'},
  chkMark:  {color:'#fff',fontSize:13,lineHeight:'1',fontWeight:700},
  iInfo:    {flex:1,minWidth:0},
  iName:    {fontSize:15,fontWeight:600,color:'#111827'},
  iMeta:    {display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#9ca3af',marginTop:2,fontWeight:500},
  mDot:     {width:7,height:7,borderRadius:'50%',flexShrink:0},
  iRight:   {display:'flex',alignItems:'center',gap:8,flexShrink:0},
  qtyBadge: {border:'1.5px solid',borderRadius:8,padding:'2px 10px',fontSize:13,fontWeight:700,minWidth:32,textAlign:'center',cursor:'pointer'},
  editBtn:  {width:28,height:28,borderRadius:8,background:'#f0f9ff',border:'1px solid #bae6fd',color:'#0369a1',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:'1'},
  delBtn:   {width:28,height:28,borderRadius:8,background:'#f9fafb',border:'1px solid #e5e7eb',color:'#9ca3af',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:'1'},
  // Inline edit row
  editRow:  {display:'flex',gap:8,alignItems:'center'},
  editInp:  {flex:1,padding:'7px 10px',borderRadius:8,border:'2px solid #e5e7eb',fontSize:14,color:'#111827',outline:'none'},
  editQty:  {width:70,padding:'7px 8px',borderRadius:8,border:'2px solid #e5e7eb',fontSize:13,color:'#111827',textAlign:'center',outline:'none'},
  editSave: {padding:'7px 12px',background:'linear-gradient(135deg,#16a34a,#15803d)',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700},
  // Category selector in expand
  catLabel: {fontSize:12,fontWeight:600,color:'#6b7280'},
  catGrid:  {display:'flex',flexWrap:'wrap',gap:6},
  catPill:  {padding:'4px 10px',borderRadius:20,border:'1.5px solid',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'},
  shareBar: {background:'#fff',borderTop:'1px solid #e5e7eb',padding:'12px 20px',display:'flex',alignItems:'center',gap:10,position:'sticky',bottom:0},
  shareLbl: {fontSize:12,color:'#6b7280',fontWeight:600},
  shareCode:{background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0',borderRadius:8,padding:'4px 12px',fontSize:14,fontWeight:800,letterSpacing:2,flex:1,textAlign:'center'},
  cpyBtn:   {background:'#fff',border:'1px solid #e5e7eb',borderRadius:8,padding:'6px 14px',fontSize:12,fontWeight:600,color:'#374151',whiteSpace:'nowrap'},
  spinner:  {display:'flex',alignItems:'center',justifyContent:'center',padding:'60px 20px',fontSize:14,color:'#6b7280',gap:10},
  // Modal
  overlay:  {position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:16},
  modal:    {background:'#fff',borderRadius:20,padding:'28px 28px 24px',maxWidth:400,width:'100%',boxShadow:'0 24px 80px rgba(0,0,0,.2)',animation:'fadeIn .2s ease'},
  modalH:   {fontSize:18,fontWeight:800,color:'#111827',marginBottom:6},
  modalS:   {fontSize:13,color:'#6b7280',marginBottom:16},
  modalInp: {width:'100%',padding:'10px 14px',borderRadius:10,border:'2px solid #e5e7eb',fontSize:15,color:'#111827',outline:'none',marginBottom:12},
  modalRow: {display:'flex',gap:8,marginTop:4},
  mBtnSave: {flex:1,padding:'11px',background:'linear-gradient(135deg,#16a34a,#15803d)',color:'#fff',border:'none',borderRadius:10,fontSize:14,fontWeight:700},
  mBtnCancel:{padding:'11px 16px',background:'#f3f4f6',color:'#374151',border:'none',borderRadius:10,fontSize:14,fontWeight:600},
  // History
  histHdr:  {background:'#fff',borderBottom:'1px solid #e5e7eb',padding:'14px 20px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:10},
  histBody: {flex:1,padding:16,display:'flex',flexDirection:'column',gap:12,overflowY:'auto'},
  lCard:    {background:'#fff',borderRadius:14,padding:'16px',boxShadow:'0 1px 6px rgba(0,0,0,.07)',display:'flex',flexDirection:'column',gap:10,animation:'fadeIn .2s ease'},
  lTitle:   {fontSize:16,fontWeight:700,color:'#111827'},
  lDate:    {fontSize:12,color:'#9ca3af',marginTop:2},
  lBtns:    {display:'flex',gap:8},
  lBtnLoad: {flex:1,padding:'9px',background:'linear-gradient(135deg,#1d4ed8,#1e40af)',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700},
  lBtnDel:  {padding:'9px 12px',background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca',borderRadius:10,fontSize:13,fontWeight:600},
  preview:  {display:'flex',flexWrap:'wrap',gap:6},
  prevItem: {background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:8,padding:'3px 10px',fontSize:12,color:'#374151'},
}

// ── Item Card with inline edit ────────────────────────────────
function ItemCard({ item, roomCode, userName, onDelete, onMsg }: {
  item: Item; roomCode: string; userName: string
  onDelete: ()=>void; onMsg: (t:string)=>void
}) {
  const cfg = CATS[item.category] ?? CATS.sonstiges
  const [expanded,  setExpanded]  = useState(false)
  const [editName,  setEditName]  = useState(item.name)
  const [editQty,   setEditQty]   = useState(item.qty)
  const [saving,    setSaving]    = useState(false)

  const handleToggle = async () => {
    await fbToggle(roomCode, item.id, !item.done, userName)
  }

  const handleSaveEdit = async () => {
    if (!editName.trim()) return
    setSaving(true)
    try {
      await fbUpdateItem(roomCode, item.id, { name: editName.trim(), qty: editQty || '1' })
      setExpanded(false)
      onMsg('✅ Gespeichert')
    } catch { onMsg('Fehler beim Speichern') }
    finally { setSaving(false) }
  }

  const handleCatChange = async (newCat: CatKey) => {
    try {
      await fbUpdateItem(roomCode, item.id, { category: newCat })
      onMsg(`Kategorie → ${CATS[newCat].label}`)
    } catch { onMsg('Fehler') }
  }

  return (
    <div style={{ ...S.iCard, borderLeft:`4px solid ${cfg.color}`, opacity: item.done ? 0.55 : 1 }}>
      {/* ── Main row ── */}
      <div style={S.iMain}>
        <button
          style={{ ...S.chkBtn, borderColor:cfg.color, background:item.done?cfg.color:'transparent' }}
          onClick={handleToggle}
        >
          {item.done && <span style={S.chkMark}>✓</span>}
        </button>

        <div style={S.iInfo}>
          <div style={{ ...S.iName, textDecoration:item.done?'line-through':'none' }}>{item.name}</div>
          <div style={S.iMeta}>
            <span style={{ ...S.mDot, background:item.added_color }} />
            {item.added_by}{item.done_by && ` · ✓ ${item.done_by}`}
          </div>
        </div>

        <div style={S.iRight}>
          {/* Menge Badge – klickbar zum Bearbeiten */}
          <span
            style={{ ...S.qtyBadge, borderColor:cfg.color, color:cfg.color }}
            onClick={() => setExpanded(v => !v)}
            title="Menge / Kategorie bearbeiten"
          >
            {item.qty}
          </span>
          {/* Edit Button */}
          <button
            style={S.editBtn}
            onClick={() => { setEditName(item.name); setEditQty(item.qty); setExpanded(v=>!v) }}
            title="Bearbeiten"
          >
            ✏️
          </button>
          <button style={S.delBtn} onClick={onDelete} title="Löschen">×</button>
        </div>
      </div>

      {/* ── Expanded edit panel ── */}
      {expanded && (
        <div style={S.iExpand}>
          {/* Name + Menge bearbeiten */}
          <div style={S.editRow}>
            <input
              style={S.editInp}
              value={editName}
              onChange={(e:ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
              onKeyDown={(e:KeyboardEvent<HTMLInputElement>) => e.key==='Enter' && handleSaveEdit()}
              placeholder="Artikelname"
            />
            <input
              style={S.editQty}
              value={editQty}
              onChange={(e:ChangeEvent<HTMLInputElement>) => setEditQty(e.target.value)}
              onKeyDown={(e:KeyboardEvent<HTMLInputElement>) => e.key==='Enter' && handleSaveEdit()}
              placeholder="Menge"
            />
            <button style={S.editSave} onClick={handleSaveEdit} disabled={saving}>
              {saving ? '⏳' : '✓'}
            </button>
          </div>

          {/* Kategorie wählen */}
          <div style={S.catLabel}>Kategorie ändern:</div>
          <div style={S.catGrid}>
            {CAT_KEYS.map(key => {
              const c = CATS[key]
              const isActive = key === item.category
              return (
                <button
                  key={key}
                  style={{
                    ...S.catPill,
                    borderColor: isActive ? c.color : '#e5e7eb',
                    background:  isActive ? c.bg    : '#fff',
                    color:       isActive ? c.color : '#374151',
                  }}
                  onClick={() => handleCatChange(key)}
                >
                  {c.emoji} {c.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Save Modal ────────────────────────────────────────────────
function SaveModal({ count, onSave, onClose }: { count:number; onSave:(t:string,d:string)=>Promise<void>; onClose:()=>void }) {
  const [title,setTitle]=useState(`Einkauf ${formatDate(todayISO())}`)
  const [date,setDate]=useState(todayISO())
  const [busy,setBusy]=useState(false)
  const go = async () => { setBusy(true); try { await onSave(title.trim(),date) } finally { setBusy(false) } }
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={S.modalH}>💾 Liste speichern</div>
        <div style={S.modalS}>{count} Artikel werden als Vorlage gespeichert.</div>
        <label style={{...S.lbl,display:'block',marginBottom:6}}>Bezeichnung</label>
        <input style={S.modalInp} value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go()} />
        <label style={{...S.lbl,display:'block',marginBottom:6}}>Datum</label>
        <input style={S.modalInp} type="date" value={date} onChange={e=>setDate(e.target.value)} />
        <div style={S.modalRow}>
          <button style={S.mBtnCancel} onClick={onClose}>Abbrechen</button>
          <button style={S.mBtnSave} onClick={go} disabled={busy}>{busy?'⏳ …':'💾 Speichern'}</button>
        </div>
      </div>
    </div>
  )
}

// ── History Screen ────────────────────────────────────────────
function HistoryScreen({ session, onBack, onLoad }: { session:Session; onBack:()=>void; onLoad:(l:SavedList)=>void }) {
  const [lists,setLists]=useState<SavedList[]>([]); const [loading,setLoading]=useState(true); const [toast,setToast]=useState('')
  const msg=(t:string)=>{setToast(t);setTimeout(()=>setToast(''),2400)}
  useEffect(()=>{ const u=subscribeSavedLists(session.code,l=>{setLists(l);setLoading(false)}); return ()=>u() },[session.code])
  return (
    <div style={S.wrap}>
      {toast&&<div style={S.toast}>{toast}</div>}
      <div style={S.histHdr}>
        <button style={S.hBtn} onClick={onBack}>← Zurück</button>
        <div style={{flex:1}}><div style={S.hTitle}>📋 Gespeicherte Listen</div><div style={{fontSize:12,color:'#6b7280'}}>Raum: {session.code}</div></div>
      </div>
      <div style={S.histBody}>
        {loading&&<div style={S.spinner}>⏳ Lade Listen…</div>}
        {!loading&&lists.length===0&&<div style={S.empty}><div style={S.emptyI}>📋</div><div style={S.emptyH}>Noch keine Listen gespeichert</div><div style={{fontSize:14,color:'#9ca3af'}}>In der Einkaufsliste auf "💾 Liste speichern" klicken.</div></div>}
        {lists.map(list=>(
          <div key={list.id} style={S.lCard}>
            <div><div style={S.lTitle}>{list.title}</div><div style={S.lDate}>📅 {formatDate(list.date)} · {list.item_count} Artikel</div></div>
            <div style={S.preview}>
              {list.items.slice(0,8).map((item,i)=><div key={i} style={S.prevItem}>{CATS[item.category]?.emoji} {item.name} ({item.qty})</div>)}
              {list.items.length>8&&<div style={{...S.prevItem,color:'#6b7280'}}>+{list.items.length-8} weitere</div>}
            </div>
            <div style={S.lBtns}>
              <button style={S.lBtnDel} onClick={async()=>{await fbDelSaved(session.code,list.id);msg('Vorlage gelöscht')}}>🗑 Löschen</button>
              <button style={S.lBtnLoad} onClick={()=>onLoad(list)}>📥 Als neue Liste laden</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── HomeScreen ────────────────────────────────────────────────
function HomeScreen({ onEnter }:{ onEnter:(s:Session)=>void }) {
  const [name,setName]=useState(''); const [join,setJoin]=useState(''); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false)
  const create=async()=>{ if(!name.trim()){setErr('Bitte gib deinen Namen ein.');return} setBusy(true);setErr(''); try{const code=await createRoom();onEnter({code,name:name.trim(),color:rndColor()})}catch(e){setErr('Fehler:\n'+(e as Error).message)}finally{setBusy(false)} }
  const doJoin=async()=>{ const code=join.trim().toUpperCase(); if(!name.trim()){setErr('Bitte gib deinen Namen ein.');return} if(code.length<4){setErr('Ungültiger Code.');return} setBusy(true);setErr(''); try{await joinRoom(code);onEnter({code,name:name.trim(),color:rndColor()})}catch(e){setErr((e as Error).message)}finally{setBusy(false)} }
  return (
    <div style={S.bg}><div style={S.card}>
      <div style={S.logoRow}><div style={S.logoBox}>🛒</div><div><div style={S.logoH}>Markttasche</div><div style={S.logoS}>Gemeinsam einkaufen</div></div></div>
      <label style={S.lbl}>Dein Name</label>
      <input style={S.inp} placeholder="z.B. Maria" value={name} onChange={(e:ChangeEvent<HTMLInputElement>)=>{setName(e.target.value);setErr('')}} onKeyDown={(e:KeyboardEvent<HTMLInputElement>)=>e.key==='Enter'&&create()} />
      {err&&<div style={S.err}>{err}</div>}
      <button style={S.btnG} onClick={create} disabled={busy}>{busy?'⏳ Verbinde…':'✨ Neuen Raum erstellen'}</button>
      <div style={S.divWrap}><span style={S.divTxt}>oder</span></div>
      <label style={S.lbl}>Raum-Code eingeben</label>
      <input style={{...S.inp,letterSpacing:'0.15em',fontWeight:700}} placeholder="z.B. AB12CD" value={join} maxLength={8} onChange={(e:ChangeEvent<HTMLInputElement>)=>{setJoin(e.target.value.toUpperCase());setErr('')}} onKeyDown={(e:KeyboardEvent<HTMLInputElement>)=>e.key==='Enter'&&doJoin()} />
      <button style={S.btnB} onClick={doJoin} disabled={busy}>{busy?'⏳ Suche…':'🔗 Raum beitreten'}</button>
      <div style={S.ftRow}>{['🔥 Echtzeit-Sync','👥 Mehrere Nutzer','📋 Listen-Vorlagen'].map(f=><span key={f} style={S.ftTag}>{f}</span>)}</div>
    </div></div>
  )
}

// ── AppScreen ─────────────────────────────────────────────────
function AppScreen({ session, onLeave, onHistory }:{ session:Session; onLeave:()=>void; onHistory:()=>void }) {
  const {code:rc,name:uName,color:uColor}=session
  const [items,setItems]=useState<Item[]>([]); const [loading,setLoading]=useState(true)
  const [inpName,setInpName]=useState(''); const [inpQty,setInpQty]=useState('1')
  const [fCat,setFCat]=useState('all'); const [fDone,setFDone]=useState<FilterDone>('all')
  const [aiOn,setAiOn]=useState(true); const [adding,setAdding]=useState(false)
  const [toast,setToast]=useState(''); const [showSave,setShowSave]=useState(false)
  const ref=useRef<HTMLInputElement>(null)
  const msg=(t:string)=>{setToast(t);setTimeout(()=>setToast(''),2600)}

  useEffect(()=>{ const u=subscribeItems(rc,i=>{setItems(i);setLoading(false)}); return ()=>u() },[rc])

  const add=async()=>{
    const name=inpName.trim(); if(!name) return; setAdding(true)
    try {
      const category=aiOn?await catAI(name):catLocal(name)
      await fbAddItem(rc,{name,qty:inpQty||'1',category,done:false,added_by:uName,added_color:uColor,done_by:null,created_at:Date.now()})
      setInpName(''); setInpQty('1'); ref.current?.focus(); msg(`„${name}" hinzugefügt`)
    } catch(e){msg('Fehler: '+(e as Error).message)} finally{setAdding(false)}
  }

  const filtered=items.filter(i=>(fCat==='all'||i.category===fCat)&&(fDone==='all'||(fDone==='open'&&!i.done)||(fDone==='done'&&i.done)))
  const grouped:Record<string,Item[]>={}
  for(const item of filtered){if(!grouped[item.category])grouped[item.category]=[]; grouped[item.category].push(item)}
  const openN=items.filter(i=>!i.done).length; const doneN=items.filter(i=>i.done).length
  const usedCats=Array.from(new Set(items.map(i=>i.category)))
  const catTabs:[string,string,string][]=[['all','Alle','🛒']]
  for(const c of usedCats){const cfg=CATS[c as CatKey]; if(cfg) catTabs.push([c,cfg.label,cfg.emoji])}
  const doneTabs:[FilterDone,string][]=[['all','Alle'],['open','Offen'],['done','Erledigt']]

  return (
    <div style={S.wrap}>
      {toast&&<div style={S.toast}>{toast}</div>}
      {showSave&&<SaveModal count={items.length} onSave={async(t,d)=>{await fbSaveList(rc,items,t,d);setShowSave(false);msg('✅ Liste gespeichert!')}} onClose={()=>setShowSave(false)}/>}
      <header style={S.hdr}>
        <div className="mt-hdr">
          <div className="mt-hdr-left">
            <span className="mt-hdr-icon" style={{fontSize:26,flexShrink:0}}>🛒</span>
            <div style={{minWidth:0}}>
              <div className="mt-title">Markttasche</div>
              <div style={S.hSub}>
                <span style={S.chip}>{rc}</span>
                <span style={S.uBadge}><span style={{...S.uDot,background:uColor}}/>{uName}</span>
              </div>
            </div>
          </div>
          <div className="mt-stats">
            <div style={S.stI}><span style={S.stN}>{openN}</span><span style={S.stL}>offen</span></div>
            <div style={S.stDiv}/>
            <div style={S.stI}><span style={S.stNG}>{doneN}</span><span style={S.stL}>erledigt</span></div>
          </div>
          <div className="mt-hdr-actions">
            <button style={S.hBtn} onClick={onHistory} title="Gespeicherte Listen">📋</button>
            <button style={S.hBtn} onClick={onLeave} title="Raum verlassen">←</button>
          </div>
        </div>
      </header>

      <div style={S.addBar}>
        <div style={S.addRow}>
          <input ref={ref} style={S.addInp} placeholder="Artikel hinzufügen…" value={inpName}
            onChange={(e:ChangeEvent<HTMLInputElement>)=>setInpName(e.target.value)}
            onKeyDown={(e:KeyboardEvent<HTMLInputElement>)=>e.key==='Enter'&&add()} />
          <input style={S.qtyInp} placeholder="Menge" value={inpQty}
            onChange={(e:ChangeEvent<HTMLInputElement>)=>setInpQty(e.target.value)}
            onKeyDown={(e:KeyboardEvent<HTMLInputElement>)=>e.key==='Enter'&&add()} />
          <button style={S.addBtn} onClick={add} disabled={adding}>{adding?'⏳':'+'}</button>
        </div>
        <div style={S.aiRow}>
          <label style={S.aiLbl}>
            <div style={{...S.trk,background:aiOn?'#16a34a':'#d1d5db'}} onClick={()=>setAiOn(v=>!v)}>
              <div style={{...S.thumb,left:aiOn?18:2}}/>
            </div>
            🤖 KI {aiOn?'ein':'aus'}
          </label>
          {items.length>0&&<button style={S.saveBtn} onClick={()=>setShowSave(true)}>💾 Speichern</button>}
        </div>
      </div>

      <div style={S.fBar}>
        <div style={S.fScroll}>{catTabs.map(([k,l,e])=><button key={k} style={fCat===k?S.fChipG:S.fChip} onClick={()=>setFCat(k)}>{e} {l}</button>)}</div>
        <div style={S.fScroll}>
          {doneTabs.map(([k,l])=><button key={k} style={fDone===k?S.fChipB:S.fChip} onClick={()=>setFDone(k)}>{l}</button>)}
          {doneN>0&&<button style={S.clrBtn} onClick={async()=>{await fbClearDone(rc,items);msg('Erledigte gelöscht')}}>🗑 Erledigte löschen</button>}
        </div>
      </div>

      <div style={S.list}>
        {loading&&<div style={S.spinner}>⏳ Verbinde mit Firebase…</div>}
        {!loading&&Object.keys(grouped).length===0&&<div style={S.empty}><div style={S.emptyI}>🧺</div><div style={S.emptyH}>Noch nichts auf der Liste</div><div style={S.emptyT}>Artikel eingeben und Enter drücken</div></div>}
        {Object.entries(grouped).map(([cat,gitems])=>{
          const cfg=CATS[cat as CatKey]??CATS.sonstiges
          return <div key={cat} style={S.catGrp}>
            <div style={S.catHdr}>
              <span style={{...S.catBadge,background:cfg.bg,color:cfg.color}}>{cfg.emoji} {cfg.label}</span>
              <span style={S.catCnt}>{gitems.filter(i=>!i.done).length}/{gitems.length}</span>
            </div>
            {gitems.map(item=>(
              <ItemCard
                key={item.id}
                item={item}
                roomCode={rc}
                userName={uName}
                onDelete={async()=>{await fbDelete(rc,item.id);msg('Artikel entfernt')}}
                onMsg={msg}
              />
            ))}
          </div>
        })}
      </div>

      <div style={S.shareBar}>
        <span style={S.shareLbl}>Code teilen:</span>
        <span style={S.shareCode}>{rc}</span>
        <button style={S.cpyBtn} onClick={()=>{navigator.clipboard?.writeText(rc);msg('Code kopiert!')}}>📋 Kopieren</button>
      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────
export default function App() {
  const [session,setSession]=useState<Session|null>(null)
  const [screen,setScreen]=useState<Screen>('home')
  const enter=(s:Session)=>{setSession(s);setScreen('app')}
  const leave=()=>{setSession(null);setScreen('home')}
  const handleLoad=async(list:SavedList)=>{
    if(!session) return
    try{await fbLoadTemplate(session.code,list,session.name,session.color);setScreen('app')}catch(e){console.error(e)}
  }
  return <>
    <GlobalStyle/>
    {screen==='home'&&<HomeScreen onEnter={enter}/>}
    {screen==='app'&&session&&<AppScreen session={session} onLeave={leave} onHistory={()=>setScreen('history')}/>}
    {screen==='history'&&session&&<HistoryScreen session={session} onBack={()=>setScreen('app')} onLoad={handleLoad}/>}
  </>
}
