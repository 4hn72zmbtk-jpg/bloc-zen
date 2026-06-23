// Scheduled function — runs once a day.
// Finds bookings whose session date is today or earlier, that have an email,
// and that haven't been asked for feedback yet → sends the "how was it?" email.
const nodemailer = require('nodemailer');

exports.handler = async () => {
  const sb = supabaseHeaders();
  const supaUrl = process.env.SUPABASE_URL;
  const siteUrl = process.env.SITE_URL || 'https://bloczen.netlify.app';

  const today = new Date().toISOString().slice(0, 10);

  try {
    // Bookings not yet asked, with an email
    const res = await fetch(
      `${supaUrl}/rest/v1/bookings?feedback_requested=eq.false&email=not.is.null&select=id,first_name,email,feedback_token,available_slots(slot_date)`,
      { headers: sb }
    );
    const bookings = await res.json();
    if (!Array.isArray(bookings)) return done(0);

    // Keep only sessions that already happened (slot_date <= today)
    const due = bookings.filter(b => {
      const d = b.available_slots && b.available_slots.slot_date;
      return d && d <= today;
    });

    if (due.length === 0) return done(0);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
    const from = `"BLOC ZEN" <${process.env.GMAIL_USER}>`;

    let sent = 0;
    for (const b of due) {
      const feedbackUrl = `${siteUrl}/avis.html?token=${b.feedback_token}`;
      try {
        await transporter.sendMail({
          from,
          to: b.email,
          subject: 'BLOC ZEN — Alors, cette petite pause ? 🌿',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;color:#2d3a2e">
              <h2 style="color:#6a9478">🌿 Alors, cette pause ?</h2>
              <p>Bonjour ${b.first_name},</p>
              <p>J'espère que ta séance de relaxation t'a fait du bien 😊</p>
              <p>Ça me ferait super plaisir d'avoir ton petit retour — c'est rapide et ça reste entre nous :</p>
              <a href="${feedbackUrl}"
                 style="display:inline-block;padding:12px 24px;background:#6a9478;color:white;text-decoration:none;border-radius:10px;font-weight:bold;margin-top:8px">
                Donner mon avis
              </a>
              <p style="margin-top:28px;color:#7a8f7c;font-size:13px">Merci 🌿<br>Agnès — BLOC ZEN</p>
            </div>
          `
        });

        // Mark as requested so we never email twice
        await fetch(`${supaUrl}/rest/v1/bookings?id=eq.${b.id}`, {
          method: 'PATCH',
          headers: sb,
          body: JSON.stringify({ feedback_requested: true })
        });
        sent++;
      } catch (e) {
        console.error('feedback mail failed for', b.id, e);
      }
    }

    return done(sent);
  } catch (e) {
    console.error('send-feedback-requests error:', e);
    return { statusCode: 500, body: 'error' };
  }
};

function done(n) {
  console.log(`Feedback requests sent: ${n}`);
  return { statusCode: 200, body: `sent ${n}` };
}

function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}
