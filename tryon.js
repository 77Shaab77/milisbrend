// Примерочная: принимает фото человека и фото вещи, отправляет в сервис FASHN, возвращает готовую картинку.
// Ключ сервиса хранится в секретной переменной FASHN_API_KEY и не попадает на страницу сайта.
const MAX_FILE = 12 * 1024 * 1024;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: JSON_HEADERS });
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

async function asDataUri(file) {
  const type = file.type && file.type.indexOf('image/') === 0 ? file.type : 'image/jpeg';
  return 'data:' + type + ';base64,' + toBase64(await file.arrayBuffer());
}

// Защита от лишних трат: не больше N примерок с одного устройства в день и M всего в день.
async function limitOk(env, request) {
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const perIp = Number(env.TRYON_PER_IP || 5);
  const perDay = Number(env.TRYON_PER_DAY || 100);
  const kIp = 'rl:' + day + ':' + ip;
  const kAll = 'rl:' + day + ':all';
  const [a, b] = await Promise.all([env.STORE.get(kIp), env.STORE.get(kAll)]);
  const nIp = Number(a || 0);
  const nAll = Number(b || 0);
  if (nIp >= perIp || nAll >= perDay) return false;
  await Promise.all([
    env.STORE.put(kIp, String(nIp + 1), { expirationTtl: 172800 }),
    env.STORE.put(kAll, String(nAll + 1), { expirationTtl: 172800 })
  ]);
  return true;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

export async function onRequestPost({ request, env }) {
  if (!env.FASHN_API_KEY || !env.STORE) return json({ error: 'not_configured' }, 500);

  let fd;
  try { fd = await request.formData(); } catch (e) { return json({ error: 'bad_request' }, 400); }
  const person = fd.get('person');
  const garment = fd.get('garment');
  if (!person || !garment || typeof person === 'string' || typeof garment === 'string') {
    return json({ error: 'bad_request' }, 400);
  }
  if (person.size > MAX_FILE || garment.size > MAX_FILE) return json({ error: 'too_big' }, 413);
  if (!(await limitOk(env, request))) return json({ error: 'limit' }, 429);

  const auth = { 'Authorization': 'Bearer ' + env.FASHN_API_KEY };
  let run;
  try {
    run = await fetch('https://api.fashn.ai/v1/run', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify({
        model_name: 'tryon-max',
        inputs: {
          model_image: await asDataUri(person),
          product_image: await asDataUri(garment),
          generation_mode: 'fast',
          resolution: '1k',
          output_format: 'jpeg',
          return_base64: true
        }
      })
    });
  } catch (e) { return json({ error: 'upstream' }, 502); }

  const started = await run.json().catch(function () { return null; });
  if (!run.ok || !started || !started.id) return json({ error: 'upstream' }, 502);

  // Ждём результат до 2 минут.
  for (let i = 0; i < 60; i++) {
    await sleep(2000);
    let st;
    try {
      const r = await fetch('https://api.fashn.ai/v1/status/' + started.id, { headers: auth });
      st = await r.json();
    } catch (e) { continue; }
    if (st.status === 'failed') return json({ error: 'failed' }, 502);
    if (st.status === 'completed' && st.output && st.output[0]) {
      const out = st.output[0];
      const m = typeof out === 'string' && out.match(/^data:([^;]+);base64,([\s\S]*)$/);
      let bytes, type;
      if (m) {
        type = m[1];
        const bin = atob(m[2]);
        bytes = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      } else {
        const img = await fetch(out);
        type = img.headers.get('content-type') || 'image/jpeg';
        bytes = new Uint8Array(await img.arrayBuffer());
      }
      return new Response(bytes, { headers: { 'content-type': type, 'cache-control': 'no-store' } });
    }
  }
  return json({ error: 'timeout' }, 504);
}
