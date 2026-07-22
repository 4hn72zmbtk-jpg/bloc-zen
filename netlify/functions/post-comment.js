// Avis libre — n'importe qui peut laisser un mot depuis le site, sans lien privé.
// Enregistré comme les autres avis : PRIVÉ par défaut, Agnès décide de le publier.

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors(), body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return fail('Requête invalide.'); }

  const { firstName, rating, comment, website } = body;

  // Piège à robots : champ caché que seul un spam remplirait
  if (website) return ok({ success: true });

  const name = (firstName || '').trim();
  const text = (comment || '').trim();
  const note = Number(rating);

  if (!name) return fail('Merci d\'indiquer ton prénom.');
  if (name.length > 40) return fail('Prénom trop long.');
  if (!note || note < 1 || note > 5) return fail('Merci de mettre une note.');
  if (text.length > 1000) return fail('Message trop long (1000 caractères max).');

  const sb = supabaseHeaders();
  const supaUrl = process.env.SUPABASE_URL;

  try {
    // Anti-spam simple : max 3 avis libres par tranche de 10 minutes
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recentRes = await fetch(
      `${supaUrl}/rest/v1/feedbacks?booking_id=is.null&created_at=gte.${since}&select=id`,
      { headers: sb }
    );
    const recent = await recentRes.json();
    if (Array.isArray(recent) && recent.length >= 3) {
      return fail('Trop de messages d\'un coup. Réessaie dans quelques minutes 🌿');
    }

    const res = await fetch(`${supaUrl}/rest/v1/feedbacks`, {
      method: 'POST',
      headers: sb,
      body: JSON.stringify({
        booking_id: null,          // avis libre : pas rattaché à une réservation
        first_name: name,
        slot_date: null,
        rating: note,
        comment: text || null,
        is_public: false           // privé par défaut, comme les autres
      })
    });

    if (res.status >= 400) {
      console.error('post-comment insert failed:', await res.text());
      return fail('Impossible d\'enregistrer ton message.');
    }

    return ok({ success: true });
  } catch (e) {
    console.error('post-comment error:', e);
    return fail('Erreur serveur.');
  }
};

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
function cors()    { return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
