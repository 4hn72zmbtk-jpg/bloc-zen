exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };

  const token = event.queryStringParameters?.token;
  if (!token) return notFound('Token manquant.');

  const sb = supabaseHeaders();

  // GET — fetch booking info by token
  if (event.httpMethod === 'GET') {
    try {
      const res = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/bookings` +
        `?cancel_token=eq.${encodeURIComponent(token)}&select=*,available_slots(slot_date,time_slot)`,
        { headers: sb }
      );
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) return notFound('Réservation introuvable.');
      return ok({ booking: rows[0] });
    } catch {
      return err('Erreur serveur.');
    }
  }

  // POST — confirm cancellation
  if (event.httpMethod === 'POST') {
    try {
      // Find booking
      const findRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/bookings?cancel_token=eq.${encodeURIComponent(token)}&select=id,slot_id`,
        { headers: sb }
      );
      const rows = await findRes.json();
      if (!Array.isArray(rows) || rows.length === 0) return notFound('Réservation introuvable ou déjà annulée.');

      const { id: bookingId, slot_id: slotId } = rows[0];

      // Re-enable slot
      if (slotId) {
        await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/available_slots?id=eq.${slotId}`,
          { method: 'PATCH', headers: sb, body: JSON.stringify({ is_available: true }) }
        );
      }

      // Delete booking
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`,
        { method: 'DELETE', headers: sb }
      );

      return ok({ success: true });
    } catch {
      return err('Erreur serveur.');
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function ok(body)       { return { statusCode: 200,  headers: cors(), body: JSON.stringify(body) }; }
function notFound(msg)  { return { statusCode: 404,  headers: cors(), body: JSON.stringify({ error: msg }) }; }
function err(msg)       { return { statusCode: 500,  headers: cors(), body: JSON.stringify({ error: msg }) }; }
function cors()         { return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
