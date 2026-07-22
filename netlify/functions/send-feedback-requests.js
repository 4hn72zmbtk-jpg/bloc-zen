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
            <div style="background:#f4f1ea;padding:28px 16px;font-family:Arial,Helvetica,sans-serif">
              <div style="max-width:520px;margin:0 auto;background:#fdfaf6;border:1px solid #d8d0c4;border-radius:16px;padding:32px 28px;color:#2d3a2e">
                <div style="text-align:center;margin-bottom:22px">
                  <div style="font-size:30px;line-height:1">🌿</div>
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:2px;color:#6a9478;margin-top:6px">
                    B.L.O.C <em style="color:#c5845a">ZEN</em>
                  </div>
                </div>
                <h2 style="font-family:Georgia,serif;color:#2d3a2e;font-size:19px;margin:0 0 12px;text-align:center">Alors, cette pause ?</h2>
                <p style="text-align:center;margin:0 0 6px">Bonjour ${b.first_name},</p>
                <p style="text-align:center;margin:0 0 18px">J'espère que ta séance t'a fait du bien 😊<br>
                Ton petit mot me ferait très plaisir — c'est rapide :</p>
                <div style="text-align:center">
                  <a href="${feedbackUrl}"
                     style="display:inline-block;padding:13px 26px;background:#6a9478;color:white;text-decoration:none;border-radius:16px;font-weight:bold">
                    Laisser mon petit mot 💚
                  </a>
                </div>
                <p style="margin:28px 0 0;color:#5e7361;font-size:13px;text-align:center">
                  Merci 🌿<br>— Agnès
                </p>
              </div>
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
