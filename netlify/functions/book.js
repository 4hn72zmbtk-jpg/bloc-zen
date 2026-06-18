const crypto    = require('crypto');
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { slotId, firstName, lastName, phone, email } = JSON.parse(event.body || '{}');
  if (!slotId || !firstName || !lastName || !phone) {
    return fail('Données manquantes (prénom, nom, téléphone, créneau requis).');
  }

  const sb = supabaseHeaders();

  try {
    // 1. Atomically mark slot unavailable (fails silently if already taken)
    const patchRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/available_slots?id=eq.${slotId}&is_available=eq.true`,
      { method: 'PATCH', headers: sb, body: JSON.stringify({ is_available: false }) }
    );
    const updated = await patchRes.json();

    if (!Array.isArray(updated) || updated.length === 0) {
      return fail('Ce créneau vient d\'être réservé. Choisissez-en un autre.');
    }

    const slot = updated[0];

    // 2. Create booking
    const cancelToken = crypto.randomUUID();
    const bookRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/bookings`,
      {
        method: 'POST',
        headers: sb,
        body: JSON.stringify({
          slot_id: slotId,
          first_name: firstName,
          last_name: lastName,
          phone,
          email: email || null,
          cancel_token: cancelToken
        })
      }
    );

    if (bookRes.status >= 400) {
      // Rollback slot
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/available_slots?id=eq.${slotId}`,
        { method: 'PATCH', headers: sb, body: JSON.stringify({ is_available: true }) }
      );
      return fail('Erreur lors de la création de la réservation.');
    }

    // 3. Send emails
    const siteUrl   = process.env.SITE_URL || 'https://bloc-zen.netlify.app';
    const cancelUrl = `${siteUrl}/cancel.html?token=${cancelToken}`;
    const dateLabel = formatDate(slot.slot_date);
    const endTime   = addMinutes(slot.time_slot, 20);

    await sendEmails({ firstName, lastName, phone, email, dateLabel, timeSlot: slot.time_slot, endTime, cancelUrl });

    return ok({ success: true, cancelUrl });

  } catch (e) {
    console.error('book error:', e);
    return fail('Erreur serveur inattendue.');
  }
};

// ── Email ─────────────────────────────────────────────────────────
async function sendEmails({ firstName, lastName, phone, email, dateLabel, timeSlot, endTime, cancelUrl }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  const from = `"BLOC ZEN" <${process.env.GMAIL_USER}>`;

  // Admin notification
  await transporter.sendMail({
    from,
    to: process.env.ADMIN_EMAIL,
    subject: `[BLOC ZEN] Nouvelle réservation — ${firstName} ${lastName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;color:#2d3a2e">
        <h2 style="color:#6a9478">🌿 Nouvelle réservation</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#7a8f7c;width:130px">Prénom</td><td><strong>${firstName}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#7a8f7c">Nom</td><td><strong>${lastName}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#7a8f7c">Téléphone</td><td><strong>${phone}</strong></td></tr>
          ${email ? `<tr><td style="padding:6px 0;color:#7a8f7c">Email</td><td>${email}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#7a8f7c">Date</td><td style="text-transform:capitalize"><strong>${dateLabel}</strong></td></tr>
          <tr><td style="padding:6px 0;color:#7a8f7c">Horaire</td><td><strong>${timeSlot} – ${endTime}</strong></td></tr>
        </table>
        <hr style="border:1px solid #d8d0c4;margin:20px 0">
        <p style="font-size:12px;color:#7a8f7c">Lien d'annulation : <a href="${cancelUrl}">${cancelUrl}</a></p>
      </div>
    `
  });

  // User confirmation (only if email provided)
  if (email) {
    await transporter.sendMail({
      from,
      to: email,
      subject: 'BLOC ZEN — Votre réservation est confirmée',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;color:#2d3a2e">
          <h2 style="color:#6a9478">🌿 Réservation confirmée !</h2>
          <p>Bonjour ${firstName},</p>
          <p>Votre séance de relaxation est bien réservée :</p>
          <div style="background:#e8f0ea;border-radius:10px;padding:16px;margin:16px 0">
            <p style="margin:4px 0;text-transform:capitalize">📅 <strong>${dateLabel}</strong></p>
            <p style="margin:4px 0">🕐 <strong>${timeSlot} – ${endTime}</strong></p>
          </div>
          <p>Si vous ne pouvez plus venir, annulez facilement ici :</p>
          <a href="${cancelUrl}"
             style="display:inline-block;padding:12px 24px;background:#6a9478;color:white;text-decoration:none;border-radius:10px;font-weight:bold;margin-top:8px">
            Annuler ma réservation
          </a>
          <p style="margin-top:28px;color:#7a8f7c;font-size:13px">À bientôt 🌿<br>BLOC ZEN</p>
        </div>
      `
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function supabaseHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function addMinutes(t, min) {
  const [h, m] = t.split(':').map(Number);
  const tot = h * 60 + m + min;
  return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
}

function ok(body)   { return { statusCode: 200, headers: cors(), body: JSON.stringify(body) }; }
function fail(msg)  { return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: msg }) }; }
function cors()     { return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }; }
