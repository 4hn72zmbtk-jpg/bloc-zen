// Public endpoint — returns only the testimonials Agnès chose to make public.
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };

  const sb = supabaseHeaders();
  try {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/feedbacks?is_public=eq.true&select=first_name,rating,comment&order=created_at.desc`,
      { headers: sb }
    );
    const feedbacks = await res.json();
    return ok({ feedbacks: Array.isArray(feedbacks) ? feedbacks : [] });
  } catch {
    return ok({ feedbacks: [] });
  }
};

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
}

function ok(body) { return { statusCode: 200, headers: cors(), body: JSON.stringify(body) }; }
function cors()   { return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
