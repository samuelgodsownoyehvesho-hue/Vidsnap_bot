const TG=process.env.BOT_TOKEN||'8179653144:AAFx4sm2_jWlhFpkxbWjX_QNBpADpIWd3fE';
const KEY=process.env.SOCIAVAULT_KEY||'sk_live_697723ebb316f09ccbd5ce1d72e572f1';
const BASE='https://api.sociavault.com/v1/scrape';
const http=require('http'),https=require('https');

function tg(m,b){return new Promise((res,rej)=>{const d=JSON.stringify(b);const r=https.request({hostname:'api.telegram.org',path:`/bot${TG}/${m}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(d)}},(rs)=>{let raw='';rs.on('data',c=>raw+=c);rs.on('end',()=>res(JSON.parse(raw)))});r.on('error',rej);r.write(d);r.end()})}

const send=(id,t)=>tg('sendMessage',{chat_id:id,text:t,parse_mode:'HTML',disable_web_page_preview:true});

function get(path){return new Promise((res,rej)=>{https.get(BASE+path,{headers:{'X-API-Key':KEY}},(r)=>{let raw='';r.on('data',c=>raw+=c);r.on('end',()=>{try{res(JSON.parse(raw))}catch{rej(new Error('Bad response'))}})}).on('error',rej)})}

async function fetch(url){
  if(/tiktok\.com/i.test(url)){
    const r=await get('/tiktok/video-info?url='+encodeURIComponent(url));
    if(!r.success)throw new Error(r.message||'TikTok error');
    const d=r.data,wf=d.video?.download_no_watermark_addr?.url_list,rg=d.video?.play_addr?.url_list;
    const dl=wf?.['0']||wf?.[0]||rg?.['0']||rg?.[0];
    if(!dl)throw new Error('No URL found. Video may be private.');
    return{dl,title:d.desc?.slice(0,80)||'TikTok Video',meta:'@'+(d.author?.unique_id||'unknown')};
  }
  if(/instagram\.com/i.test(url)){
    const r=await get('/instagram/post-info?url='+encodeURIComponent(url));
    if(!r.success)throw new Error(r.message||'Instagram error');
    const m=r.data?.data?.xdt_shortcode_media;
    if(!m)throw new Error('Could not parse response.');
    if(!m.is_video)throw new Error('Photos not supported. Reels/videos only.');
    if(!m.video_url)throw new Error('No video URL. Reel may be private.');
    const cap=m.edge_media_to_caption?.edges?.['0']?.node?.text||'';
    return{dl:m.video_url,title:cap.slice(0,80)||'Instagram Reel',meta:'@'+(m.owner?.username||'unknown')};
  }
  if(/twitter\.com|x\.com/i.test(url)){
    const match=url.match(/status\/(\d+)/);
    if(!match)throw new Error('Invalid Twitter URL.');
    const r=await get('/twitter/tweet?tweet_id='+match[1]);
    if(!r.success)throw new Error(r.message||'Twitter error');
    const d=r.data,vs=d.extended_entities?.media?.['0']?.video_info?.variants||d.extended_entities?.media?.[0]?.video_info?.variants||[];
    const best=vs.filter(v=>v.content_type==='video/mp4').sort((a,b)=>(b.bitrate||0)-(a.bitrate||0))[0];
    if(!best?.url)throw new Error('No video in this tweet.');
    return{dl:best.url,title:d.full_text?.slice(0,80)||'Twitter Video',meta:'@'+(d.user?.screen_name||'unknown')};
  }
  throw new Error('Unsupported. Send TikTok, Instagram or Twitter/X link.');
}

let offset=0;
async function poll(){
  try{
    const r=await tg('getUpdates',{offset,timeout:30,allowed_updates:['message']});
    for(const u of r.result||[]){
      offset=u.update_id+1;
      const msg=u.message;if(!msg)continue;
      const id=msg.chat.id,txt=(msg.text||'').trim();if(!txt)continue;
      if(txt==='/start'){send(id,'👋 <b>VidSnap Bot</b>\n\nSend a TikTok, Instagram or Twitter/X video link and I\'ll get the download URL!\n\n⬇️ Just paste a link.');continue;}
      if(txt==='/help'){send(id,'1. Copy a video link\n2. Paste it here\n3. Tap the download link');continue;}
      try{new URL(txt)}catch{send(id,'❌ Invalid URL. Send a TikTok, Instagram or Twitter/X link.');continue;}
      send(id,'⏳ Fetching...');
      fetch(txt).then(({dl,title,meta})=>send(id,`✅ <b>${title}</b>\n<i>${meta}</i>\n\n<a href="${dl}">⬇️ Tap to download</a>`)).catch(e=>send(id,'❌ '+e.message));
    }
  }catch(e){console.error(e.message);}
  setTimeout(poll,1000);
}

http.createServer((_,r)=>{r.writeHead(200);r.end('ok')}).listen(process.env.PORT||3000);
console.log('VidSnap Bot started');
poll();
