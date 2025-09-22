const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Stripe = require('stripe');

const app = express();
const port = 3001;

app.use(cors());
// IMPORTANT: Stripe webhook needs the raw body. Mount raw parser BEFORE json,
// and only for the webhook route so other routes still receive parsed JSON.
app.use('/api/stripe/webhook', express.raw({ type: '*/*' }));
app.use(express.json());

// Stripe setup
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
const CURRENCY = (process.env.CURRENCY || 'usd').toLowerCase();
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const FRONTEND_URL = process.env.FRONTEND_URL || '';

// Manufacturer codes: union of known common codes used by V&V
// Note: Some vendors differ (e.g., Whirlpool: WHP vs WHI; GE: GEA vs GEN). Keep both.
const MFG_CODE_NAME_MAP = {
  WHP: 'Whirlpool',
  WHI: 'Whirlpool',
  FRG: 'Frigidaire',
  FRI: 'Freon/Frigidaire (alt)',
  SAM: 'Samsung',
  LG: 'LG Appliance Parts',
  GEA: 'GE Appliances',
  GEN: 'General Electric',
  SUB: 'Sub-Zero',
  SPE: 'Speed Queen',
  MAY: 'Maytag',
  WHR: 'White-Rodgers',
  BRO: 'Broan',
  BSH: 'Bosch',
  GDM: 'Goodman',
  LEN: 'Lennox',
  HON: 'Honeywell',
  TRI: 'Tri-Dim Filter Corp',
  ULI: 'U-Line',
  USI: 'USI',
  NUT: 'Nutone',
  ERP: 'ERP',
};

// Default probe order emphasizes kitchen/major appliance brands first
const DEFAULT_MFG_CODES = [
  'WHP', 'WHI', 'FRG', 'FRI', 'SAM', 'LG', 'GEA', 'GEN', 'MAY', 'BSH', 'BRO', 'SUB', 'SPE', 'WHR', 'GDM', 'LEN', 'HON', 'ULI', 'USI', 'NUT', 'ERP'
];

// Full probe list (expanded from provided catalog)
const FULL_MFG_CODES = [
  'ACM', 'AIR', 'ALL', 'AME', 'APR', 'ATX', 'AQD', 'BRA', 'BIN', 'BRO', 'BRY', 'BSH', 'CAP', 'CAR', 'CHR', 'COE', 'COL', 'DUP', 'DUR', 'EAT', 'EMR', 'ERP', 'ESC', 'EUR', 'EVP', 'EZF', 'FAS', 'FED', 'FLO', 'FRI', 'FRG', 'GAL', 'GAT', 'GDM', 'GEM', 'GEN', 'GEO', 'GLS', 'GRN', 'HAR', 'HON', 'HOR', 'HRP', 'HRT', 'ICM', 'ICS', 'ILE', 'JOG', 'LAN', 'LEN', 'LG', 'LIT', 'LKI', 'LOB', 'LUX', 'MAL', 'MAN', 'MAR', 'MAS', 'MAY', 'MCM', 'MET', 'MID', 'MIS', 'NEL', 'NUA', 'NUT', 'PAC', 'PEE', 'RBN', 'RBS', 'RED', 'RPC', 'RTS', 'SAM', 'SEN', 'SPA', 'SPE', 'STA', 'STH', 'SUB', 'SUP', 'TEL', 'TRA', 'TRI', 'ULI', 'UNI', 'USI', 'UNV', 'VAL', 'VAN', 'VNT', 'WAT', 'WEL', 'WHI', 'WHR', 'YEL', 'YTS', 'WHP', 'GEA'
];

app.get('/api/stripe-config', (req, res) => {
  if (!STRIPE_PUBLISHABLE_KEY) {
    return res.status(400).json({ error: 'Stripe publishable key not configured' });
  }
  res.json({ publishableKey: STRIPE_PUBLISHABLE_KEY, currency: CURRENCY });
});

// Expose manufacturer codes to the frontend
app.get('/api/mfg-codes', (req, res) => {
  const envCodes = (process.env.PROBE_MFG_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
  const codes = envCodes.length ? envCodes : FULL_MFG_CODES;
  const result = codes.map(code => ({ code, name: MFG_CODE_NAME_MAP[code] || '' }));
  res.json(result);
});

app.post('/api/checkout/session', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe not configured on server' });
    }

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const lineItems = items.map((it) => {
      const name = `${it.partNumber || 'Part'}${it.partDescription ? ' — ' + it.partDescription : ''}`.slice(0, 127);
      const unitAmount = Math.round(parseFloat(it.price || '0') * 100);
      const quantity = parseInt(it.qty || 1, 10) || 1;
      if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
        throw new Error('Invalid price on one or more items');
      }
      return {
        price_data: {
          currency: CURRENCY,
          unit_amount: unitAmount,
          product_data: {
            name,
            metadata: { partNumber: String(it.partNumber || '') },
          },
        },
        quantity,
      };
    });

    const successUrl = `${PUBLIC_BASE_URL}/stripe/success/{CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${PUBLIC_BASE_URL}/stripe/cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      phone_number_collection: { enabled: true },
      custom_fields: [
        {
          key: 'phone',
          label: { type: 'custom', custom: 'Phone number' },
          type: 'text',
          optional: false,
        },
      ],
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: 'Pickup at Rochester Appliance (Henrietta Store)',
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: CURRENCY },
            // No delivery_estimate for pickup; 0 can cause Stripe validation errors
          },
        },
        {
          shipping_rate_data: {
            display_name: 'Drop Ship (2 business days)',
            type: 'fixed_amount',
            fixed_amount: { amount: 1500, currency: CURRENCY },
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 1 },
              maximum: { unit: 'business_day', value: 2 },
            },
          },
        },
      ],
      allow_promotion_codes: false,
      billing_address_collection: 'auto',
    });

    res.json({ id: session.id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create checkout session', details: err.message });
  }
});

// Retrieve session summary (items + receipt)
app.get('/api/checkout/session/:id', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
    const sessionId = req.params.id;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    let receiptUrl = '';
    if (session.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent, { expand: ['latest_charge'] });
      const charge = pi.latest_charge || (pi.charges && pi.charges.data && pi.charges.data[0]);
      receiptUrl = charge && charge.receipt_url ? charge.receipt_url : '';
    }
    res.json({
      id: session.id,
      currency: session.currency,
      amount_total: session.amount_total,
      shipping_cost: session.shipping_cost || null,
      shipping_details: session.shipping_details || null,
      custom_fields: session.custom_fields || [],
      customer_email: session.customer_details ? session.customer_details.email : undefined,
      customer_phone: session.customer_details ? session.customer_details.phone : undefined,
      items: (lineItems.data || []).map(li => ({
        description: li.description,
        amount_subtotal: li.amount_subtotal,
        quantity: li.quantity,
      })),
      receipt_url: receiptUrl,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch session', details: err.message });
  }
});

// Success page with receipt link and summary
app.get('/stripe/success/:sid', async (req, res) => {
  if (!stripe) return res.send('Payment successful.');
  const sessionId = req.params.sid;
  if (!sessionId) return res.send('Payment successful.');
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
    let receiptUrl = '';
    if (session.payment_intent) {
      const pi = await stripe.paymentIntents.retrieve(session.payment_intent, { expand: ['latest_charge'] });
      const charge = pi.latest_charge || (pi.charges && pi.charges.data && pi.charges.data[0]);
      receiptUrl = charge && charge.receipt_url ? charge.receipt_url : '';
    }
    const total = (session.amount_total || 0) / 100;
    const currency = (session.currency || 'usd').toUpperCase();
    const itemsHtml = (lineItems.data || []).map(li => `
      <tr><td>${li.description || ''}</td><td style="text-align:right;">${li.quantity || 1}</td><td style="text-align:right;">$${(li.amount_subtotal / 100).toFixed(2)}</td></tr>
    `).join('');
    res.setHeader('Content-Type', 'text/html');
    const shippingChoice = session.shipping_cost && session.shipping_cost.shipping_rate ? 'Shipping' : (session.shipping_cost && session.shipping_cost.amount_total === 0 ? 'Pickup' : '');
    const phoneField = Array.isArray(session.custom_fields) ? session.custom_fields.find(f => f.key === 'phone') : null;
    const phoneDisplay = (session.customer_details && session.customer_details.phone) || (phoneField && phoneField.text && phoneField.text.value) || '';
    const pickupNote = 'Pickup at Rochester Appliance (Henrietta Store) — 585-272-9933, 2975 Brighton Henrietta Town Line Rd';
    const shipNote = 'Drop Ship — Arrives within two business days.';
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Payment successful</title></head><body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:24px;">
      <h2>Payment successful</h2>
      <p>Session: ${session.id}</p>
      ${shippingChoice ? `<p><strong>Fulfillment:</strong> ${shippingChoice === 'Pickup' ? pickupNote : shipNote}</p>` : ''}
      ${phoneDisplay ? `<p><strong>Phone:</strong> ${phoneDisplay}</p>` : ''}
      <table style="width:100%; max-width:720px; border-collapse: collapse;">
        <thead><tr><th style="text-align:left;">Item</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Subtotal</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot><tr><td></td><td style="text-align:right; font-weight:600;">Total</td><td style="text-align:right; font-weight:600;">$${total.toFixed(2)} ${currency}</td></tr></tfoot>
      </table>
      <p style="margin-top:16px;">${receiptUrl ? `<a href="${receiptUrl}" target="_blank">View/download Stripe receipt</a>` : ''}</p>
      <p><a href="${FRONTEND_URL || PUBLIC_BASE_URL}">Return to app</a></p>
    </body></html>`);
  } catch (err) {
    res.send('Payment successful. (Receipt unavailable)');
  }
});
app.get('/stripe/cancel', (req, res) => {
  if (FRONTEND_URL) return res.redirect(FRONTEND_URL);
  res.send('Payment canceled. You can return to the app and try again.');
});

// Root: redirect to frontend if configured to avoid "Cannot GET /"
app.get('/', (req, res) => {
  if (FRONTEND_URL) return res.redirect(FRONTEND_URL);
  res.send('rocparts API is running');
});

// Webhook endpoint (skeleton). IMPORTANT: raw body for signature verification
app.post('/api/stripe/webhook', (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).send('Stripe not configured');
    }
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(400).send('Webhook secret not set');
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    switch (event.type) {
      case 'checkout.session.completed':
        // Fulfillment logic could be added here
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

app.post('/api/get-parts-info', async (req, res) => {
  const { mfgCode, partNumber } = req.body;

  if (!mfgCode || !partNumber) {
    return res.status(400).json({ error: 'Missing mfgCode or partNumber' });
  }

  const requestData = {
    commonHeader: {
      user: 'M1945',
      password: '9dVxdym69mNs3G8',
    },
    mfgCode,
    partNumber,
  };

  const url = 'https://soapbeta.streamflow.ca/vandvapi/GetPartsInfo';

  try {
    const response = await axios.post(url, requestData);
    res.json(response.data);
  } catch (error) {
    res.status(error.response ? error.response.status : 500).json({
      error: 'Failed to get parts info',
      details: error.response ? error.response.data : 'An unknown error occurred',
    });
  }
});

// Number-only Part Search: probes multiple mfgCodes until a hit
app.post('/api/part-search', async (req, res) => {
  const { partNumber, mfgCodes } = req.body || {};
  if (!partNumber) {
    return res.status(400).json({ error: 'Missing partNumber' });
  }

  // Allow override via env or request body; keep a conservative default list
  const envCodes = (process.env.PROBE_MFG_CODES || '').split(',').map(s => s.trim()).filter(Boolean);
  let codes = Array.isArray(mfgCodes) && mfgCodes.length
    ? [...mfgCodes]
    : (envCodes.length ? [...envCodes] : [...FULL_MFG_CODES]);

  // Heuristic prioritization by part number patterns (helps match correct brand faster)
  try {
    const pn = String(partNumber).toUpperCase();
    const moveToFront = (c) => { const i = codes.indexOf(c); if (i > 0) { codes.splice(i, 1); codes.unshift(c); } };
    if (/^530\d{6,}$/.test(pn)) { // Many Frigidaire/Electrolux numbers
      moveToFront('FRG'); moveToFront('FRI');
    }
    if (/^WP?\d+/.test(pn) || /^\d{5,}$/.test(pn)) { // Common Whirlpool numerics (e.g., 341241)
      moveToFront('WHP');
    }
    if (/^DA|^DG|^DC|^DE|^BN/i.test(pn)) { // Samsung prefixes
      moveToFront('SAM');
    }
    if (/^MEF|^ABQ|^AJP|^Z|^EBR|^MDS/i.test(pn)) { // LG-like
      moveToFront('LG');
    }
  } catch (_) { /* ignore */ }

  const url = 'https://soapbeta.streamflow.ca/vandvapi/GetPartsInfo';

  for (const code of codes) {
    const payload = {
      commonHeader: { user: 'M1945', password: '9dVxdym69mNs3G8' },
      mfgCode: code,
      partNumber,
    };
    try {
      const response = await axios.post(url, payload);
      const data = response.data || {};
      const ret = data && data.return ? data.return : {};
      const retCode = String(ret.retCode || (ret.commonResult && ret.commonResult.code) || '').trim();
      const hasPart = data && data.partData && data.partData.partNumber;
      const isSuccess = hasPart && retCode === '200';
      if (isSuccess) {
        return res.json({
          matchedMfgCode: code,
          triedMfgCodes: codes,
          ...data,
        });
      }
    } catch (err) {
      // Continue to next code on 4xx/5xx; only fail after exhausting the list
    }
  }

  return res.status(404).json({ error: 'Part not found for any probed mfgCode', triedMfgCodes: codes });
});

app.post('/api/model-search', async (req, res) => {
  const { modelNumber } = req.body;

  if (!modelNumber) {
    return res.status(400).json({ error: 'Missing modelNumber' });
  }

  const requestData = {
    username: 'M1945',
    password: '9dVxdym69mNs3G8',
    modelNumber,
  };

  const url = 'https://soapbeta.streamflow.ca/iplvandv/model-search';

  try {
    const response = await axios.post(url, requestData);
    res.json(response.data);
  } catch (error) {
    res.status(error.response ? error.response.status : 500).json({
      error: 'Failed to search models',
      details: error.response ? error.response.data : 'An unknown error occurred',
    });
  }
});

app.post('/api/get-diagrams', async (req, res) => {
  const { modelNumber, modelId } = req.body;

  if (!modelNumber || !modelId) {
    return res.status(400).json({ error: 'Missing modelNumber or modelId' });
  }

  const requestData = {
    username: 'M1945',
    password: '9dVxdym69mNs3G8',
    modelNumber,
    modelId,
  };

  const url = 'https://soapbeta.streamflow.ca/iplvandv/get-diagrams';

  try {
    const response = await axios.post(url, requestData);
    res.json(response.data);
  } catch (error) {
    res.status(error.response ? error.response.status : 500).json({
      error: 'Failed to get diagrams',
      details: error.response ? error.response.data : 'An unknown error occurred',
    });
  }
});

app.post('/api/get-diagram-parts', async (req, res) => {
  const { modelNumber, modelId, diagramId } = req.body;

  if (!modelNumber || !modelId || !diagramId) {
    return res.status(400).json({ error: 'Missing modelNumber, modelId or diagramId' });
  }

  const requestData = {
    username: 'M1945',
    password: '9dVxdym69mNs3G8',
    modelNumber,
    modelId,
    diagramId,
  };

  const url = 'https://soapbeta.streamflow.ca/iplvandv/get-diagram-parts';

  try {
    const response = await axios.post(url, requestData);
    res.json(response.data);
  } catch (error) {
    res.status(error.response ? error.response.status : 500).json({
      error: 'Failed to get diagram parts',
      details: error.response ? error.response.data : 'An unknown error occurred',
    });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
