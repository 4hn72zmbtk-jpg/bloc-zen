// Public feedback endpoint — client leaves a rating + comment via a private link.
// GET  ?token=xxx  → validate token, return booking info + whether already submitted
// POST { token, rating, comment } → save the feedback (once per booking)

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };

  const sb = supabaseHeaders();
  const supaUrl = process.env.SUPABASE_URL;

  // ── GET : fetch booking by feedback_token ──
  if (event.httpMethod === 'GET') {
    const token = (event.queryStringParameters || {}).token;
    if (!token) return fail('Lien invalide.');

    try {
      const res = await fetch(
        `${supaUrl}/rest/v1/bookings?feedback_token=eq.${token}&select=id,first_name,available_slots(slot_date,time_slot)`,
        { headers: sb }
      );
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) return notFound();

      const b = rows[0];

      // Already submitted?
      const fbRes = await fetch(
        `${supaUrl}/rest/v1/feedbacks?booking_id=eq.${b.id}&select=id`,
        { headers: sb }
      );
      const existing = await fbRes.json();
      const alreadyDone = Array.isArray(existing) && existing.length > 0;

      const slot = b.available_slots || {};
      return ok({
        found: true,
        alreadyDone,
        firstName: b.first_name,
        slotDate: slot.slot_date || null,
        timeSlot: slot.time_slot || null
      });
    } catch (e) {
      console.error('feedback GET error:', e);
      return fail('Erreur serveur.');
    }
  }

  // ── POST : save the feedback ──
  if (event.httpMethod === 'POST') {
    const { token, rating, comment } = JSON.parse(event.body || '{}');
    if (!token) return fail('Lien invalide.');
    if (!rating || rating < 1 || rating > 5) return fail('Merci de mettre une note.');

    try {
      // Resolve the booking
      const res = await fetch(
        `${supaUrl}/rest/v1/bookings?feedback_token=eq.${token}&select=id,first_name,available_slots(slot_date)`,
        { headers: sb }
      );
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) return notFound();
      const b = rows[0];

      // Prevent duplicate
      const fbRes = await fetch(
        `${supaUrl}/rest/v1/feedbacks?booking_id=eq.${b.id}&select=id`,
        { headers: sb }
      );
      const existing = await fbRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        return fail('Tu as déjà laissé ton avis — merci 🌿');
      }

      const slot = b.available_slots || {};
      const insRes = await fetch(`${supaUrl}/rest/v1/feedbacks`, {
        method: 'POST',
        headers: sb,
        body: JSON.stringify({
          booking_id: b.id,
          first_name: b.first_name,
          slot_date: slot.slot_date || null,
          rating: Number(rating),
          comment: (comment || '').trim() || null,
          is_public: false
        })
      });

      if (insRes.status >= 400) {
        console.error('feedback insert failed:', await insRes.text());
        return fail('Impossible d\'enregistrer ton avis.');
      }

      return ok({ success: true });
    } catch (e) {
      console.error('feedback POST error:', e);
      return fail('Erreur serveur.');
    }
  }

  return { statusCode: 405, headers: cors(), body: 'Method Not Allowed' };
};

// ── Helpers ──
function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function ok(body)       { return { statusCode: 200, headers: cors(), body: JSON.stringify(body) }; }
function fail(msg)      { return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: msg }) }; }
function notFound()     { return { statusCode: 200, headers: cors(), body: JSON.stringify({ found: false }) }; }
function cors()         { return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
