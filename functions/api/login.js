// Проверка логина и пароля хозяйки.
function dec(v) { try { return decodeURIComponent(v || ''); } catch (e) { return String(v || ''); } }
function same(a, b) {
  a = dec(a); b = String(b || '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
export async function onRequestPost({ request, env }) {
  const ok = !!env.ADMIN_PASSWORD && !!env.ADMIN_LOGIN &&
    same(request.headers.get('x-admin-login'), env.ADMIN_LOGIN) &&
    same(request.headers.get('x-admin-password'), env.ADMIN_PASSWORD);
  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 403,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
