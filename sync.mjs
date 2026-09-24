import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const SOURCE='https://anief.org/ricorsi';
const clean=s=>(s||'').replace(/\s+/g,' ').trim();
const category=t=>{t=t.toLowerCase();for(const [k,v] of [['gps','GPS e graduatorie'],['graduator','GPS e graduatorie'],['ata','ATA'],['concor','Concorsi'],['mobilit','Mobilità'],['sostegno','Sostegno'],['pension','Pensioni e previdenza'],['tfr','Retribuzione e carriera'],['carta docente','Retribuzione e carriera'],['precari','Precari']])if(t.includes(k))return v;return 'Docenti'};

const browser=await chromium.launch({headless:true});
const context=await browser.newContext({
 locale:'it-IT',
 timezoneId:'Europe/Rome',
 viewport:{width:1440,height:1200},
 userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
 extraHTTPHeaders:{'Accept-Language':'it-IT,it;q=0.9,en;q=0.8'}
});
const page=await context.newPage();

async function load(url){
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForTimeout(2500);
 try{await page.waitForLoadState('networkidle',{timeout:8000})}catch{}
 return response;
}

const response=await load(SOURCE);
console.log('source status',response?.status(), 'final url',page.url(), 'title',await page.title());
console.log('source anchors',await page.locator('a[href]').count(),'body chars',(await page.locator('body').innerText()).length);

let links=await page.locator('a[href]').evaluateAll(as=>{
 const out=[];
 for(const a of as){
  try{
   const raw=a.getAttribute('href'); if(!raw)continue;
   const u=new URL(raw,location.href);
   const txt=(a.textContent||'').replace(/\s+/g,' ').trim();
   const blob=(txt+' '+u.pathname+' '+u.search).toLowerCase();
   const same=u.hostname==='anief.org'||u.hostname.endsWith('.anief.org');
   const skip=/login|registr|privacy|cookie|facebook|instagram|twitter|linkedin|youtube/i.test(blob);
   if(same&&!skip&&u.href!==location.href&&(
     /ricors|azione legale|aderisc|adesion|tutela legale/i.test(blob) ||
     a.closest('main,article,[class*="ricors"],[class*="card"],[class*="item"],[class*="content"]')
   )) out.push(u.href.split('#')[0]);
  }catch{}
 }
 return [...new Set(out)];
});

if(!links.length){
 const html=await page.content();
 const absolute=[...html.matchAll(/https?:\\?\/\\?\/(?:www\\.)?anief\.org\\?\/[^"'<>\\s]+/gi)].map(m=>m[0].replaceAll('\\/','/'));
 const relative=[...html.matchAll(/["'](\/[^"'<>]*(?:ricors|aderisc|adesion)[^"'<>]*)["']/gi)].map(m=>new URL(m[1],SOURCE).href);
 links=[...new Set([...absolute,...relative])].filter(u=>u!==SOURCE);
}

links=links.filter(u=>{try{const x=new URL(u);return (x.hostname==='anief.org'||x.hostname.endsWith('.anief.org'))&&!/\.(jpg|jpeg|png|gif|svg|css|js|pdf)(\?|$)/i.test(x.pathname)}catch{return false}});
console.log('candidate links',links.length);
if(links.length)console.log(links.slice(0,20).join('\n'));

const items=[];
for(const url of links.slice(0,200)){
 try{
  await load(url);
  const x=await page.evaluate(()=>{
   const c=s=>(s||'').replace(/\s+/g,' ').trim();
   const root=document.querySelector('main,[role=main],article,.item-page,.com-content-article,.content')||document.body;
   const text=c(root.innerText);
   const title=c(root.querySelector('h1,h2')?.textContent)||c(document.querySelector('h1')?.textContent)||c(document.title);
   const section=labels=>{
    for(const el of root.querySelectorAll('h2,h3,h4,h5,strong,b')){
     const t=c(el.textContent).toLowerCase();
     if(labels.some(l=>t.includes(l))){
      let n=el.nextElementSibling,out=[];
      for(let i=0;n&&i<10;i++,n=n.nextElementSibling){
       if(/^H[2345]$/.test(n.tagName))break;
       const z=c(n.textContent);if(z)out.push(z);
      }
      if(out.length)return out.join('\n');
     }
    }
    return '';
   };
   let join='';
   for(const a of root.querySelectorAll('a[href]')){
    const t=c(a.textContent).toLowerCase(),u=a.href.toLowerCase();
    if(/aderisc|adesion|partecipa|iscriv/i.test(t+' '+u)){join=a.href;break}
   }
   return {title,text,excerpt:text.split(' ').slice(0,45).join(' ')+'…',join_url:join,finalita:section(['finalità','finalita','oggetto']),requisiti:section(['requisiti','destinatari','chi può aderire','chi puo aderire']),documenti:section(['documentazione','documenti']),procedura:section(['come aderire','modalità di adesione','modalita di adesione']),costi:section(['quanto costa','costi','costo'])};
  });
  if(!x.title||x.text.length<80)continue;
  if(!/ricors|azione legale|aderisc|adesion|tribunal|giudic|tar\b/i.test(x.title+' '+x.text))continue;
  let deadline='';
  const m=x.text.match(/(?:scadenza|entro il|termine)[^0-9]{0,40}(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i);
  if(m){const p=m[1].replace(/[.-]/g,'/').split('/').map(Number);let y=p[2];if(y<100)y+=2000;deadline=`${y}-${String(p[1]).padStart(2,'0')}-${String(p[0]).padStart(2,'0')}`}
  let status=/adesioni chiuse|ricorso chiuso|termini scaduti|non è più possibile aderire/i.test(x.text)?'chiuso':/prossima apertura|in apertura/i.test(x.text)?'prossimo':'aperto';
  if(deadline&&new Date(deadline+'T23:59:59')<new Date())status='chiuso';
  items.push({...x,id:crypto.createHash('sha1').update(url).digest('hex'),url,category:category(x.title+' '+x.text),status,deadline,synced_at:new Date().toISOString()});
 }catch(e){console.error('skip',url,e.message)}
}

const unique=[...new Map(items.map(x=>[x.url,x])).values()];
await browser.close();
await fs.writeFile('ricorsi.json',JSON.stringify({source:SOURCE,generated_at:new Date().toISOString(),count:unique.length,items:unique},null,2));
console.log(`saved ${unique.length} ricorsi`);
if(unique.length===0){
 console.error('ERROR: zero ricorsi extracted; refusing a false-success feed');
 process.exit(2);
}
