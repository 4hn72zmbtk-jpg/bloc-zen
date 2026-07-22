// Notes privées d'Agnès sur chaque personne (mini-CRM).
// GET    → toutes les notes
// POST   { personKey, note } → ajoute une note
// DELETE { id } → supprime une note

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };
  if (!checkAuth(event)) return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Non autorisé' }) };

  const sb = supabaseHeaders();
  const supaUrl = process.env.SUPABASE_URL;

  if (event.httpMethod === 'GET') {
    try {
      const res = await fetch(
        `${supaUrl}/rest/v1/crm_notes?select=*&order=created_at.desc`,
        { headers: sb }
      );
      const notes = await res.json();
      return ok({ notes: Array.isArray(notes) ? notes : [] });
    } catch {
      return ok({ notes: [] });   // table absente → on dégrade en douceur
    }
  }

  if (event.httpMethod === 'POST') {
    const { personKey, note } = JSON.parse(event.body || '{}');
    const text = (note || '').trim();
    if (!personKey || !text) return fail('personKey et note requis.');
    if (text.length > 1000) return fail('Note trop longue (1000 caractères max).');

    try {
      const res = await fetch(`${supaUrl}/rest/v1/crm_notes`, {
        method: 'POST',
        headers: sb,
        body: JSON.stringify({ person_key: personKey, note: text })
      });
      if (res.status >= 400) {
        console.error('crm note insert failed:', await res.text());
        return fail('Impossible d\'enregistrer la note (la table crm_notes existe-t-elle ?).');
      }
      const rows = await res.json();
      return ok({ success: true, note: Array.isArray(rows) ? rows[0] : null });
    } catch (e) {
      console.error('crm POST error:', e);
      return fail('Erreur serveur.');
    }
  }

  if (event.httpMethod === 'DELETE') {
    const { id } = JSON.parse(event.body || '{}');
    if (!id) return fail('id manquant.');
    try {
      await fetch(`${supaUrl}/rest/v1/crm_notes?id=eq.${id}`, { method: 'DELETE', headers: sb });
      return ok({ success: true });
    } catch {
      return fail('Erreur serveur.');
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
function fail(msg) { return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: msg }) }; }
function cors()    { return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password' }; }
