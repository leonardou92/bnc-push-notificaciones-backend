const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());

const API_KEY = process.env.API_KEY || 'test-api-key';
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

function verifyApiKey(req) {
  const key = req.header('x-api-key');
  return key && key === API_KEY;
}

function verifyJwt(req) {
  const auth = req.header('authorization') || req.header('Authorization');
  if (!auth) return false;
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return false;
  const token = parts[1];
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch (e) {
    return false;
  }
}

app.get('/ping', (req, res) => {
  res.sendStatus(200);
});

app.post('/notifications', (req, res) => {
  // Authentication must be validated BEFORE acknowledging
  if (!verifyApiKey(req) && !verifyJwt(req)) {
    return res.status(401).json({ error: 'Unauthorized: invalid API key or token' });
  }

  // Lightweight pre-ack validation: ensure required general fields are present and well-formed
  const payload = req.body || {};
  const preRequired = [
    'PaymentType',
    'OriginBankReference',
    'DestinyBankReference',
    'OriginBankCode',
    'TxHour',
    'CurrencyCode',
    'Amount',
    'TxDate'
  ];

  const missing = preRequired.filter((f) => !payload[f]);
  if (missing.length) {
    return res.status(400).json({ error: 'Missing required fields', missing });
  }

  // Basic format checks before ack
  if (!/^\d{4}$/.test(String(payload.TxHour))) {
    return res.status(400).json({ error: 'Invalid TxHour format (expected HHMM)' });
  }
  if (!/^\d{8}$/.test(String(payload.TxDate))) {
    return res.status(400).json({ error: 'Invalid TxDate format (expected yyyyMMdd)' });
  }
  if (!/^\d{1,15}\.\d{2}$/.test(String(payload.Amount))) {
    return res.status(400).json({ error: 'Invalid Amount format (expected 15+2 with dot)'});
  }

  // Immediate acknowledgement per spec
  res.sendStatus(200);

  // Continue processing asynchronously without blocking acknowledgement
  setImmediate(() => {
    const errors = [];

    // Validators
    function validTxHour(v) {
      if (typeof v !== 'string' || !/^\d{4}$/.test(v)) return false;
      const hh = parseInt(v.slice(0, 2), 10);
      const mm = parseInt(v.slice(2), 10);
      return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
    }

    function validTxDate(v) {
      return typeof v === 'string' && /^\d{8}$/.test(v);
    }

    function validAmount(v) {
      return typeof v === 'string' && /^\d{1,15}\.\d{2}$/.test(v);
    }

    function is20Digits(v) {
      return typeof v === 'string' && /^\d{20}$/.test(v);
    }

    function validDebtorId(v) {
      return typeof v === 'string' && /^[VJ]\d{6,}$/.test(v);
    }

    if (payload.TxHour && !validTxHour(payload.TxHour)) errors.push('Invalid TxHour format (HHMM)');
    if (payload.TxDate && !validTxDate(payload.TxDate)) errors.push('Invalid TxDate format (yyyyMMdd)');
    if (payload.Amount && !validAmount(payload.Amount)) errors.push('Invalid Amount format (15+2 with dot)');

    // Type-specific validations
    const pType = String(payload.PaymentType || '').toUpperCase();
    if (pType === 'P2P') {
      if (!payload.ClientPhone) errors.push('Missing ClientPhone for P2P');
      if (!payload.Concept) errors.push('Missing Concept for P2P');
      if (!payload.CommercePhone) errors.push('Missing CommercePhone for P2P');
    }

    if (pType === 'TRF' || pType === 'DEP') {
      if (!payload.DebtorAccount) errors.push('Missing DebtorAccount for TRF/DEP');
      else if (!is20Digits(payload.DebtorAccount)) errors.push('DebtorAccount must be 20 digits');

      if (!payload.DebtorID) errors.push('Missing DebtorID for TRF/DEP');
      else if (!validDebtorId(payload.DebtorID)) errors.push('DebtorID invalid format (Ej: V012345678)');

      if (!payload.CreditorAccount) errors.push('Missing CreditorAccount for TRF/DEP');
      else if (!is20Digits(payload.CreditorAccount)) errors.push('CreditorAccount must be 20 digits');
    }

    if (errors.length) {
      console.error('Notification validation errors (post-ack):', errors, 'payload:', payload);
      return;
    }

    console.log('Notification processed (validated):', payload.PaymentType, payload.DestinyBankReference || payload.OriginBankReference);
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Notification server listening on ${port}`));

module.exports = app;
