exports.handler = async () => {
  const today = new Date().toISOString().split('T')[0];

  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/available_slots` +
      `?is_available=eq.true&slot_date=gte.${today}` +
      `&select=id,slot_date,time_slot&order=slot_date.asc,time_slot.asc`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
        }
      }
    );

    const slots = await res.json();
    return ok({ slots: Array.isArray(slots) ? slots : [] });
  } catch {
    return err('Erreur serveur');
  }
};

function ok(body)  { return { statusCode: 200, headers: cors(), body: JSON.stringify(body) }; }
function err(msg)  { return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: msg }) }; }
function cors()    { return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }; }
