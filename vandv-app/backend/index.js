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

app.get('/api/stripe-config', (req, res) => {
  if (!STRIPE_PUBLISHABLE_KEY) {
    return res.status(400).json({ error: 'Stripe publishable key not configured' });
  }
  res.json({ publishableKey: STRIPE_PUBLISHABLE_KEY, currency: CURRENCY });
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
      allow_promotion_codes: false,
      billing_address_collection: 'auto',
      shipping_address_collection: { allowed_countries: ['US'] },
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
      customer_email: session.customer_details ? session.customer_details.email : undefined,
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
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Payment successful</title></head><body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding:24px;">
      <h2>Payment successful</h2>
      <p>Session: ${session.id}</p>
      <table style="width:100%; max-width:720px; border-collapse: collapse;">
        <thead><tr><th style="text-align:left;">Item</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Subtotal</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot><tr><td></td><td style="text-align:right; font-weight:600;">Total</td><td style="text-align:right; font-weight:600;">$${total.toFixed(2)} ${currency}</td></tr></tfoot>
      </table>
      <p style="margin-top:16px;">${receiptUrl ? `<a href="${receiptUrl}" target="_blank">View/download Stripe receipt</a>` : ''}</p>
      <p><a href="${PUBLIC_BASE_URL}/">Return to app</a></p>
    </body></html>`);
  } catch (err) {
    res.send('Payment successful. (Receipt unavailable)');
  }
});
app.get('/stripe/cancel', (req, res) => {
  res.send('Payment canceled. You can return to the app and try again.');
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
