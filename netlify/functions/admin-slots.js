exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };
  if (!checkAuth(event)) return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: 'Non autorisé' }) };

  const sb = supabaseHeaders();
  const supaUrl = process.env.SUPABASE_URL;
  const today = new Date().toISOString().split('T')[0];

  // GET — all upcoming slots with their bookings
  if (event.httpMethod === 'GET') {
    try {
      const res = await fetch(
        `${supaUrl}/rest/v1/available_slots` +
        `?slot_date=gte.${today}&order=slot_date.asc,time_slot.asc` +
        `&select=*,bookings(id,first_name,last_name,phone)`,
        { headers: sb }
      );
      const slots = await res.json();
      return ok({ slots: Array.isArray(slots) ? slots : [] });
    } catch {
      return err('Erreur serveur');
    }
  }

  // POST — add a new day (creates both time slots)
  if (event.httpMethod === 'POST') {
    const { date } = JSON.parse(event.body || '{}');
    if (!date) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Date manquante' }) };
    try {
      const res = await fetch(
        `${supaUrl}/rest/v1/available_slots`,
        {
          method: 'POST',
          // ignore-duplicates = don't error if day already exists
          headers: { ...sb, Prefer: 'return=representation,resolution=ignore-duplicates' },
          body: JSON.stringify([
            { slot_date: date, time_slot: '13:30', is_available: true },
            { slot_date: date, time_slot: '14:00', is_available: true }
          ])
        }
      );
      const result = await res.json();
      return ok({ slots: result });
    } catch {
      return err('Erreur serveur');
    }
  }

  // PATCH — toggle a slot's availability
  if (event.httpMethod === 'PATCH') {
    const { slotId, isAvailable } = JSON.parse(event.body || '{}');
    if (!slotId) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'slotId manquant' }) };
    try {
      const res = await fetch(
        `${supaUrl}/rest/v1/available_slots?id=eq.${slotId}`,
        { method: 'PATCH', headers: sb, body: JSON.stringify({ is_available: isAvailable }) }
      );
      const result = await res.json();
      return ok({ slot: result });
    } catch {
      return err('Erreur serveur');
    }
  }

  // DELETE — remove all slots for a date
  if (event.httpMethod === 'DELETE') {
    const { date } = JSON.parse(event.body || '{}');
    if (!date) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Date manquante' }) };
    try {
      await fetch(
        `${supaUrl}/rest/v1/available_slots?slot_date=eq.${date}`,
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
