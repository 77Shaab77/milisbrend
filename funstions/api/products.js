// Каталог: читать может любой, сохранять только хозяйка (по паролю).
function dec(v) { try { return decodeURIComponent(v || ''); } catch (e) { return String(v || ''); } }
function same(a, b) {
  a = dec(a); b = String(b || '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export async function onRequestGet({ env }) {
  if (!env.STORE) return new Response('{"products":null}', { headers: HEADERS });
  const v = await env.STORE.get('products');
  return new Response(v || '{"products":null}', { headers: HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (!env.STORE || !env.ADMIN_PASSWORD || !env.ADMIN_LOGIN) {
    return new Response('{"error":"not_configured"}', { status: 500, headers: HEADERS });
  }
  if (!same(request.headers.get('x-admin-login'), env.ADMIN_LOGIN) || !same(request.headers.get('x-admin-password'), env.ADMIN_PASSWORD)) {
    return new Response('{"error":"forbidden"}', { status: 403, headers: HEADERS });
  }
  const body = await request.text();
  if (body.length > 20 * 1024 * 1024) {
    return new Response('{"error":"too_big"}', { status: 413, headers: HEADERS });
  }
  let data;
  try { data = JSON.parse(body); } catch (e) {
    return new Response('{"error":"bad_json"}', { status: 400, headers: HEADERS });
  }
  if (!data || !Array.isArray(data.products)) {
    return new Response('{"error":"bad_shape"}', { status: 400, headers: HEADERS });
  }
  await env.STORE.put('products', JSON.stringify({ products: data.products }));
  return new Response('{"ok":true}', { headers: HEADERS });
}
