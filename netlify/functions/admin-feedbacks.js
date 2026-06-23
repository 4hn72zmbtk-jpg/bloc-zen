// Admin-only feedback management.
// GET            → all feedbacks (private, newest first)
// PATCH { id, isPublic } → toggle whether a feedback is shown as a public testimonial

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };
  if (!checkAuth(event)) return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Non autorisé' }) };

  const sb = supabaseHeaders();
  const supaUrl = process.env.SUPABASE_URL;

  if (event.httpMethod === 'GET') {
    try {
      const res = await fetch(
        `${supaUrl}/rest/v1/feedbacks?select=*&order=created_at.desc`,
        { headers: sb }
      );
      const feedbacks = await res.json();
      return ok({ feedbacks: Array.isArray(feedbacks) ? feedbacks : [] });
    } catch {
      return err('Erreur serveur');
    }
  }

  if (event.httpMethod === 'PATCH') {
    const { id, isPublic } = JSON.parse(event.body || '{}');
    if (!id) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'id manquant' }) };
    try {
      await fetch(`${supaUrl}/rest/v1/feedbacks?id=eq.${id}`, {
        method: 'PATCH',
        headers: sb,
        body: JSON.stringify({ is_public: !!isPublic })
      });
      return ok({ success: true });
    } catch {
      return err('Erreur serveur');
    }
  }

  if (event.httpMethod === 'DELETE') {
    const { id } = JSON.parse(event.body || '{}');
    if (!id) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'id manquant' }) };
    try {
      await fetch(`${supaUrl}/rest/v1/feedbacks?id=eq.${id}`, { method: 'DELETE', headers: sb });
      return ok({ success: true });
    } catch {
      return err('Erreur serveur');
    }
  }

  return { statusCode: 405, headers: cors(), body: 'Method Not Allowed' };
};

function checkAuth(event) {
  return event.headers['x-admin-password'] === process.env.ADMIN_PASSWORD;
}

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function ok(body)  { return { statusCode: 200, headers: cors(), body: JSON.stringify(body) }; }
function err(msg)  { return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: msg }) }; }
function cors()    { return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password' }; }
