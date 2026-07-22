const crypto    = require('crypto');
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors() };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { slotId, firstName, lastName, phone, email, note } = JSON.parse(event.body || '{}');
  if (!slotId || !firstName || !lastName || !phone || !email) {
    return fail('Données manquantes (prénom, nom, téléphone, email, créneau requis).');
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
          cancel_token: cancelToken,
          note: note || null
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

    await sendEmails({ firstName, lastName, phone, email, note, dateLabel, timeSlot: slot.time_slot, endTime, cancelUrl });

    return ok({ success: true, cancelUrl });

  } catch (e) {
    console.error('book error:', e);
    return fail('Erreur serveur inattendue.');
  }
};

// ── Email ─────────────────────────────────────────────────────────
async function sendEmails({ firstName, lastName, phone, email, note, dateLabel, timeSlot, endTime, cancelUrl }) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  const from = `"BLOC ZEN" <${process.env.GMAIL_USER}>`;

  // Habillage commun — même univers que le site : fond crème, carte blanche, vert sauge
  const wrap = (inner) => `
    <div style="background:#f4f1ea;padding:28px 16px;font-family:Arial,Helvetica,sans-serif">
      <div style="max-width:520px;margin:0 auto;background:#fdfaf6;border:1px solid #d8d0c4;border-radius:16px;padding:32px 28px;color:#2d3a2e">
        <div style="text-align:center;margin-bottom:22px">
          <div style="font-size:30px;line-height:1">🌿</div>
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:2px;color:#6a9478;margin-top:6px">
            B.L.O.C <em style="color:#c5845a">ZEN</em>
          </div>
        </div>
        ${inner}
        <p style="margin:28px 0 0;color:#5e7361;font-size:13px;text-align:center">
          À bientôt pour ta pause 🌿<br>— Agnès
        </p>
      </div>
    </div>`;

  const pill = (txt) => `<span style="display:inline-block;background:#e8f0ea;color:#6a9478;border-radius:999px;padding:6px 16px;font-weight:bold;font-size:14px;margin:3px 4px">${txt}</span>`;

  // Notification pour Agnès
  await transporter.sendMail({
    from,
    to: process.env.ADMIN_EMAIL,
    subject: `[BLOC ZEN] Nouvelle réservation — ${firstName} ${lastName}`,
    html: wrap(`
      <h2 style="font-family:Georgia,serif;color:#2d3a2e;font-size:19px;margin:0 0 16px;text-align:center">Nouvelle réservation !</h2>
      <div style="text-align:center;margin-bottom:18px">
        ${pill('📅 ' + dateLabel)} ${pill('🕐 ' + timeSlot + ' – ' + endTime)}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:7px 0;color:#5e7361;width:110px">Prénom</td><td><strong>${firstName}</strong></td></tr>
        <tr><td style="padding:7px 0;color:#5e7361">Nom</td><td><strong>${lastName}</strong></td></tr>
        <tr><td style="padding:7px 0;color:#5e7361">Téléphone</td><td><strong>${phone}</strong></td></tr>
        ${email ? `<tr><td style="padding:7px 0;color:#5e7361">Email</td><td>${email}</td></tr>` : ''}
        ${note ? `<tr><td style="padding:7px 0;color:#5e7361;vertical-align:top">Son mot</td><td style="font-style:italic">« ${note} »</td></tr>` : ''}
      </table>
      <p style="font-size:12px;color:#5e7361;margin:18px 0 0;border-top:1px solid #d8d0c4;padding-top:14px">
        Lien d'annulation : <a href="${cancelUrl}" style="color:#6a9478">${cancelUrl}</a>
      </p>
    `)
  });

  // Confirmation pour la collègue
  if (email) {
    await transporter.sendMail({
      from,
      to: email,
      subject: 'BLOC ZEN — Ta réservation est confirmée 🌿',
      html: wrap(`
        <h2 style="font-family:Georgia,serif;color:#5a9e74;font-size:19px;margin:0 0 10px;text-align:center">C'est réservé !</h2>
        <p style="text-align:center;margin:0 0 16px">Bonjour ${firstName}, ta séance de relaxation t'attend :</p>
        <div style="text-align:center;margin-bottom:20px">
          ${pill('📅 ' + dateLabel)} ${pill('🕐 ' + timeSlot + ' – ' + endTime)} ${pill('📍 Salle 4')}
        </div>
        <p style="text-align:center;font-size:14px;color:#5e7361;margin:0 0 18px">
          N'oublie pas ton huile ou ta crème si tu en as une 🧴
        </p>
        <p style="text-align:center;font-size:13px;color:#5e7361;margin:0 0 8px">Un imprévu ? Annule en un clic :</p>
        <div style="text-align:center">
          <a href="${cancelUrl}"
             style="display:inline-block;padding:13px 26px;background:#6a9478;color:white;text-decoration:none;border-radius:16px;font-weight:bold">
            Annuler ma réservation
          </a>
        </div>
      `)
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
