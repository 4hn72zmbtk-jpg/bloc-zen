exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };
  if (!checkAuth(event)) return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Non autorisé' }) };

  const sb = supabaseHeaders();
  const supaUrl = process.env.SUPABASE_URL;

  // GET — all bookings with slot info
  if (event.httpMethod === 'GET') {
    try {
      const res = await fetch(
        `${supaUrl}/rest/v1/bookings?select=*,available_slots(slot_date,time_slot)&order=created_at.desc`,
        { headers: sb }
      );
      const bookings = await res.json();
      return ok({ bookings: Array.isArray(bookings) ? bookings : [] });
    } catch {
      return err('Erreur serveur');
    }
  }

  // DELETE — admin cancels a booking and frees the slot
  if (event.httpMethod === 'DELETE') {
    const { bookingId, slotId } = JSON.parse(event.body || '{}');
    if (!bookingId) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'bookingId manquant' }) };

    try {
      // Re-enable slot
      if (slotId) {
        await fetch(
          `${supaUrl}/rest/v1/available_slots?id=eq.${slotId}`,
          { method: 'PATCH', headers: sb, body: JSON.stringify({ is_available: true }) }
        );
      }
      // Delete booking
      await fetch(
        `${supaUrl}/rest/v1/bookings?id=eq.${bookingId}`,
        { method: 'DELETE', headers: sb }
      );
      return ok({ success: true });
    } catch {
      return err('Erreur serveur');
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
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
