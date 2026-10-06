// Independent fixture/oracle for synthetic browser accounts. Never shipped.
// Reads/writes use the real private HTTP endpoint, cookies, CSRF and versioning.
export function browserVault({ evaluate, account, origin, defaultContext }) {
  const codes = new Map();
  const encoder = new TextEncoder();
  async function read(ctx = defaultContext) {
    const id = await account(ctx);
    const box = JSON.parse(await evaluate(`(async()=>{
      const r=await fetch('/api/vault',{headers:{'X-Activity-Account':${JSON.stringify(id)}}});
      if(!r.ok)throw new Error('Fixture read failed');return JSON.stringify(await r.json());
    })()`, ctx));
    const normalized = codes.get(id).replaceAll('-', '').toUpperCase();
    const material = await crypto.subtle.importKey('raw', encoder.encode(normalized), 'HKDF', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('activity-hub:private-storage:v1'),info:encoder.encode('content-encryption')},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    const data = await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(box.iv,'base64'),additionalData:encoder.encode(`activity-hub:vault:v1:${id}:${box.version}`),tagLength:128},key,Buffer.from(box.ciphertext,'base64'));
    return { id, key, box, content: JSON.parse(new TextDecoder().decode(data)) };
  }
  return {
    remember(id, code) { codes.set(id, code); },
    async query(route, ctx = defaultContext) {
      const { box, content } = await read(ctx);
      const url = new URL(route, origin);
      const id = /^\/api\/fronts\/([^/]+)$/.exec(url.pathname)?.[1];
      if (id) {
        const front = content.fronts.find(f=>f.id===id);
        return front ? { status:200, body:front } : { status:404, body:{detail:'Front not found'} };
      }
      const states = url.searchParams.getAll('states');
      const items = url.pathname === '/api/history'
        ? content.checks.filter(ch=>ch.day>=url.searchParams.get('start') && ch.day<=url.searchParams.get('end'))
        : content.fronts.filter(f=>(!states.length || states.includes(f.state)) && (!url.searchParams.has('search') || f.name.includes(url.searchParams.get('search'))));
      return { status:200, body:{items,total:items.length}, version:box.version };
    },
    async seed(fixtures, ctx = defaultContext) {
      const { id, key, box, content } = await read(ctx);
      for (const [index, data] of fixtures.entries()) {
        const front = {id:crypto.randomUUID(),name:data.name,state:data.state,reference:data.reference ?? null,
          created_at:new Date(Date.parse(box.now)-fixtures.length+index).toISOString(),updated_at:box.now};
        content.fronts.push(front);
        for (const day of data.days || []) content.checks.push({front_id:front.id,day});
      }
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(`activity-hub:vault:v1:${id}:${box.version+1}`),tagLength:128},key,encoder.encode(JSON.stringify(content)));
      const body = {version:box.version,day:box.day,iv:Buffer.from(iv).toString('base64'),ciphertext:Buffer.from(encrypted).toString('base64')};
      const status = await evaluate(`(async()=>{
        const proof=await(await fetch('/auth/session')).json();
        return (await fetch('/api/vault',{method:'PUT',headers:{'Content-Type':'application/json','X-Activity-Account':${JSON.stringify(id)},'X-CSRF-Token':proof.csrf_token},body:${JSON.stringify(JSON.stringify(body))}})).status;
      })()`, ctx);
      if (status !== 200) throw new Error('Encrypted fixture write failed');
    },
  };
}
