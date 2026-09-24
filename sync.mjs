import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const SOURCE='https://anief.org/ricorsi';
const SEARCH_URL='https://www.google.com/search?q=site%3Aanief.org%2Fricorsi3%2Fricorso+ANIEF+ricorso&num=100&filter=0';
const clean=s=>(s||'').replace(/\s+/g,' ').trim();
const category=t=>{t=t.toLowerCase();for(const [k,v] of [['gps','GPS e graduatorie'],['graduator','GPS e graduatorie'],['ata','ATA'],['concor','Concorsi'],['mobilit','Mobilità'],['sostegno','Sostegno'],['pension','Pensioni e previdenza'],['tfr','Retribuzione e carriera'],['rpd','Retribuzione e carriera'],['cia','Retribuzione e carriera'],['carta','Retribuzione e carriera'],['precari','Precari']])if(t.includes(k))return v;return 'Altri ricorsi'};

async function get(url){
 const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; ANIEF-Ricorsi-Indexer/1.0)','accept-language':'it-IT,it;q=0.9'}});
 return {status:r.status,text:await r.text()};
}
function decode(s){return s.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
function normalize(u){
 try{
  u=decodeURIComponent(u.replace(/&amp;/g,'&'));
  const x=new URL(u);
  if(!/(^|\.)anief\.org$/i.test(x.hostname)||!x.pathname.includes('/ricorsi3/ricorso'))return '';
  const id=x.searchParams.get('id'); if(!id)return '';
  return 'https://anief.org/ricorsi3/ricorso?id='+id;
 }catch{return ''}
}

const {status,text:html}=await get(SEARCH_URL);
console.log('discovery status',status,'chars',html.length);
const found=[];
for(const m of html.matchAll(/https?:\/\/anief\.org\/ricorsi3\/ricorso\?id=[^"&<>\s]+/gi)){
 const u=normalize(m[0]); if(u)found.push(u);
}
for(const m of html.matchAll(/\/url\?q=(https?%3A%2F%2Fanief\.org%2Fricorsi3%2Fricorso%3Fid%3D[^&"]+)/gi)){
 const u=normalize(decodeURIComponent(m[1])); if(u)found.push(u);
}
let urls=[...new Set(found)];
console.log('discovered',urls.length,'official ricorso URLs');

let previous={items:[]};
try{previous=JSON.parse(await fs.readFile('ricorsi.json','utf8'))}catch{}
for(const x of previous.items||[])if(x.url){const u=normalize(x.url);if(u)urls.push(u)}
urls=[...new Set(urls)];

const items=[];
for(const url of urls){
 const idParam=new URL(url).searchParams.get('id')||'';
 const slug=idParam.split(':').slice(1).join(':');
 let title=slug.replace(/---/g,' - ').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
 title=title?title.replace(/\b\w/g,c=>c.toUpperCase()):'Ricorso ANIEF';
 const old=(previous.items||[]).find(x=>x.url===url)||{};
 items.push({
  ...old,
  id:crypto.createHash('sha1').update(url).digest('hex'),
  title:old.title||title,
  url,
  category:old.category||category(title),
  status:old.status||'aperto',
  excerpt:old.excerpt||'Consulta la scheda ufficiale ANIEF per requisiti, scadenze e modalità di adesione.',
  synced_at:new Date().toISOString()
 });
}
items.sort((a,b)=>String(b.url).localeCompare(String(a.url)));
await fs.writeFile('ricorsi.json',JSON.stringify({source:SOURCE,discovery:'public search index',generated_at:new Date().toISOString(),count:items.length,items},null,2));
console.log('saved',items.length,'ricorsi');
if(items.length===0){console.error('ERROR: no indexed ANIEF ricorsi found');process.exit(2)}
