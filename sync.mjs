import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const SOURCE='https://anief.org/ricorsi';
const clean=s=>(s||'').replace(/\s+/g,' ').trim();
const category=t=>{t=t.toLowerCase();for(const [k,v] of [['gps','GPS e graduatorie'],['graduator','GPS e graduatorie'],['ata','ATA'],['concor','Concorsi'],['mobilit','Mobilità'],['sostegno','Sostegno'],['pension','Pensioni e previdenza'],['tfr','Retribuzione e carriera'],['carta docente','Retribuzione e carriera'],['precari','Precari']])if(t.includes(k))return v;return 'Docenti'};

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({locale:'it-IT',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36'});
await page.goto(SOURCE,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(2500);

const links=await page.locator('a[href]').evaluateAll((as,src)=>{
 const out=[];
 for(const a of as){
  try{
   const u=new URL(a.getAttribute('href'),location.href);
   const txt=(a.textContent||'').toLowerCase();
   if(u.href!==src && u.hostname.endsWith('anief.org') && (/ricors/i.test(u.pathname)||/ricorso/i.test(txt))) out.push(u.href);
  }catch{}
 }
 return [...new Set(out)];
},SOURCE);

const items=[];
for(const url of links.slice(0,150)){
 try{
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(700);
  const x=await page.evaluate(()=>{
   const c=s=>(s||'').replace(/\s+/g,' ').trim();
   const section=(labels)=>{
    for(const el of document.querySelectorAll('h2,h3,h4,strong,b')){
     const t=c(el.textContent).toLowerCase();
     if(labels.some(l=>t.includes(l))){
      let n=el.nextElementSibling,out=[];
      for(let i=0;n&&i<8;i++,n=n.nextElementSibling){
       if(/^H[234]$/.test(n.tagName))break;
       const z=c(n.textContent); if(z)out.push(z);
      }
      if(out.length)return out.join('\n');
     }
    }
    return '';
   };
   const main=document.querySelector('main,[role=main],article,.content')||document.body;
   const text=c(main.innerText);
   const title=c(document.querySelector('h1')?.textContent)||c(document.title);
   let join='';
   for(const a of document.querySelectorAll('a[href]')){
    const t=c(a.textContent).toLowerCase(),u=a.href.toLowerCase();
    if(t.includes('aderisc')||t.includes('adesion')||u.includes('aderisc')||u.includes('adesion')){join=a.href;break}
   }
   return {title,text,excerpt:text.split(' ').slice(0,38).join(' ')+'…',join_url:join,finalita:section(['finalità','finalita','oggetto']),requisiti:section(['requisiti','destinatari','chi può aderire','chi puo aderire']),documenti:section(['documentazione','documenti']),procedura:section(['come aderire','modalità di adesione','modalita di adesione']),costi:section(['quanto costa','costi','costo'])};
  });
  if(!x.title)continue;
  let deadline='';
  const m=x.text.match(/(?:scadenza|entro il|termine)[^0-9]{0,30}(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i);
  if(m){const p=m[1].replace(/[.-]/g,'/').split('/').map(Number);let y=p[2];if(y<100)y+=2000;deadline=`${y}-${String(p[1]).padStart(2,'0')}-${String(p[0]).padStart(2,'0')}`}
  let status=/adesioni chiuse|ricorso chiuso|termini scaduti/i.test(x.text)?'chiuso':/prossima apertura|in apertura/i.test(x.text)?'prossimo':'aperto';
  if(deadline&&new Date(deadline+'T23:59:59')<new Date())status='chiuso';
  items.push({...x,id:crypto.createHash('sha1').update(url).digest('hex'),url,category:category(x.title+' '+x.text),status,deadline,synced_at:new Date().toISOString()});
 }catch(e){console.error('skip',url,e.message)}
}
await browser.close();
await fs.writeFile('ricorsi.json',JSON.stringify({source:SOURCE,generated_at:new Date().toISOString(),count:items.length,items},null,2));
console.log(`saved ${items.length} ricorsi`);