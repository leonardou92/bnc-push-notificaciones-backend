const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const path = require('path');

const app = express();
app.use(express.json());
// Simple CORS middleware to allow frontend requests (including preflight)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-api-key, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
// Serve static UI files from /public
app.use(express.static(path.join(__dirname, '..', 'public')));

const pkg = require('../package.json');

const API_KEY = process.env.API_KEY || 'test-api-key';
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

const prisma = new PrismaClient();
let dbAvailable = false;

async function initDb() {
  try {
    await prisma.$connect();
    dbAvailable = true;
    console.log('Prisma connected to database');
  } catch (err) {
    dbAvailable = false;
    console.error('Prisma connection failed:', err.message);
  }
}

initDb();

async function writeLog(level, statusCode, message, details = null, endpoint = '/notifications') {
  // Do not persist successful 200 logs to the DB
  if (statusCode === 200) return;
  if (!dbAvailable) {
    if (level === 'ERROR') console.error('Log skipped (DB unavailable):', { level, statusCode, message, details, endpoint });
    else console.log('Log (skipped DB):', { level, statusCode, message, details, endpoint });
    return;
  }

  try {
    await prisma.log.create({
      data: {
        level,
        statusCode: statusCode || null,
        endpoint: endpoint || null,
        message: message || '',
        details: details || null
      }
    });
  } catch (e) {
    console.error('Failed to write log to DB:', e.message);
  }
}

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

app.get('/ping', (req, res) => res.sendStatus(200));

// Root page: show running version and basic runtime info
// Serve a static UI at root. The page will fetch /meta for dynamic info.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Provide runtime metadata for the UI to consume
app.get('/meta', (req, res) => {
  const version = (pkg && pkg.version) ? pkg.version : 'dev';
  const now = new Date();
  const uptimeSec = Math.floor(process.uptime());
  res.json({ name: 'NotificationPush', version, now: now.toISOString(), uptimeSec });
});

app.get('/health', (req, res) => {
  if (!dbAvailable) return res.status(503).json({ status: 'unavailable', db: false });
  return res.json({ status: 'ok', db: true });
});

app.post('/notifications', (req, res) => {
  // If DB is not available, respond 503 so the sender can retry
  if (!dbAvailable) {
    console.error('Service Unavailable: database connection not available');
    return res.status(503).json({ error: 'Service Unavailable: database connection not available' });
  }

  // Authentication must be validated BEFORE acknowledging
  if (!verifyApiKey(req) && !verifyJwt(req)) {
    writeLog('ERROR', 401, 'Unauthorized: invalid API key or token', { headers: req.headers }, '/notifications');
    return res.status(401).json({ error: 'Unauthorized: invalid API key or token' });
  }

  const payload = req.body || {};
  // normalize/generate a 10-digit reference and check duplicates before any insertion
  function normalizeTo10Digits(ref) {
    if (!ref) return null;
    const digits = String(ref).replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) return digits;
    if (digits.length > 10) return digits.slice(-10);
    return digits.padStart(10, '0');
  }

  // Use OriginBankReference as the primary key for duplicate detection (last 6 digits)
  const originRaw = payload.OriginBankReference || payload.DestinationBankReference || payload.DestinyBankReference || '';
  const originDigits = String(originRaw).replace(/\D/g, '');
  const last6 = originDigits.slice(-6).padStart(6, '0');

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
    writeLog('ERROR', 400, 'Missing required fields', { missing, payload }, '/notifications');
    return res.status(400).json({ error: 'Missing required fields', missing });
  }

  if (!/^\d{4}$/.test(String(payload.TxHour))) {
    writeLog('ERROR', 400, 'Invalid TxHour format', { TxHour: payload.TxHour, payload }, '/notifications');
    return res.status(400).json({ error: 'Invalid TxHour format (expected HHMM)' });
  }
  if (!/^\d{8}$/.test(String(payload.TxDate))) {
    writeLog('ERROR', 400, 'Invalid TxDate format', { TxDate: payload.TxDate, payload }, '/notifications');
    return res.status(400).json({ error: 'Invalid TxDate format (expected yyyyMMdd)' });
  }
  if (!/^\d{1,15}\.\d{2}$/.test(String(payload.Amount))) {
    writeLog('ERROR', 400, 'Invalid Amount format', { Amount: payload.Amount, payload }, '/notifications');
    return res.status(400).json({ error: 'Invalid Amount format (expected 15+2 with dot)'});
  }

  // Immediate acknowledgement per spec
  res.sendStatus(200);

  // Process asynchronously
  setImmediate(async () => {
    const errors = [];

    // build txTimestamp from TxDate (yyyyMMdd) + TxHour (HHMM)
    function parseTxTimestamp(dateStr, hourStr) {
      if (!dateStr || !hourStr) return null;
      if (!/^\d{8}$/.test(String(dateStr)) || !/^\d{4}$/.test(String(hourStr))) return null;
      const y = parseInt(String(dateStr).slice(0,4), 10);
      const m = parseInt(String(dateStr).slice(4,6), 10) - 1;
      const d = parseInt(String(dateStr).slice(6,8), 10);
      const hh = parseInt(String(hourStr).slice(0,2), 10);
      const mm = parseInt(String(hourStr).slice(2,4), 10);
      return new Date(Date.UTC(y, m, d, hh, mm, 0));
    }

    const txTimestamp = parseTxTimestamp(payload.TxDate, payload.TxHour);

    // robust duplicate check: normalize amount/txDate, fetch candidates, then compare last6 digits
    let duplicate = null;
    const normalizedAmount = String(payload.Amount || '').trim();
    let normalizedTxDate = String(payload.TxDate || '').trim();
    if (!normalizedTxDate && txTimestamp) {
      const y = txTimestamp.getUTCFullYear().toString().padStart(4,'0');
      const m = (txTimestamp.getUTCMonth()+1).toString().padStart(2,'0');
      const d = txTimestamp.getUTCDate().toString().padStart(2,'0');
      normalizedTxDate = `${y}${m}${d}`;
    }

    if (dbAvailable) {
      try {
        const candidates = await prisma.notification.findMany({
          where: {
            amount: normalizedAmount || null,
            txDate: normalizedTxDate || null
          }
        });

        if (!candidates || candidates.length === 0) {
          console.log('Duplicate check: no candidates for amount/txDate', { amount: normalizedAmount, txDate: normalizedTxDate });
        } else {
            for (const c of candidates) {
              const oRef = String(c.originBankReference || '').replace(/\D/g, '');
              const oLast6 = oRef.slice(-6).padStart(6, '0');
              if (oLast6 === last6) {
                duplicate = c;
                break;
              }
            }

          if (!duplicate) {
            // helpful debug: list candidate refs and their last6 for diagnosis
            try {
              const debugList = candidates.map((c) => ({ id: c.id, oRef: c.originBankReference, oLast6: String(c.originBankReference || '').replace(/\D/g, '').slice(-6) }));
              console.log('Duplicate check: candidates found but no origin last6 match', { last6, candidates: debugList });
            } catch (e) {
              console.log('Duplicate check: candidates found but failed to build debug list', e.message);
            }
          }
        }
      } catch (e) {
        console.error('Error checking duplicates:', e.message);
      }
    }

    if (duplicate) {
      await writeLog('ERROR', 409, 'Duplicate notification detected (amount+date+last6ref)', { duplicateId: duplicate.id, payload, originDigits }, '/notifications');
      console.log('Duplicate detected, skipping DB insert for ref last6=', last6, 'foundId=', duplicate && duplicate.id);
      return;
    }

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
      if (dbAvailable) {
        try {
          await prisma.notification.create({
            data: {
              paymentType: payload.PaymentType || null,
              originBankReference: payload.OriginBankReference || null,
              destinationBankReference: payload.DestinationBankReference || payload.DestinyBankReference || null,
              originBankCode: payload.OriginBankCode || null,
              txHour: payload.TxHour || null,
              currencyCode: payload.CurrencyCode || null,
              amount: payload.Amount || null,
              txDate: payload.TxDate || null,
              txTimestamp: txTimestamp || null,
              commerceId: payload.CommerceID || null,
              commercePhone: payload.CommercePhone || null,
              clientPhone: payload.ClientPhone || null,
              concept: payload.Concept || null,
              debtorAccount: payload.DebtorAccount || null,
              debtorId: payload.DebtorID || null,
              creditorAccount: payload.CreditorAccount || null,
              processed: false,
              validationErrors: JSON.stringify(errors),
              raw: payload
            }
          });
          await writeLog('ERROR', 422, 'Notification validation failed (post-ack)', { errors, payload }, '/notifications');
        } catch (e) {
          console.error('Failed to store invalid notification:', e.message);
          writeLog('ERROR', 500, 'Failed to store invalid notification', { error: e.message, payload }, '/notifications');
        }
      }
      // Stored invalid notification; stop processing to avoid duplicate insert
      return;
    }

    if (dbAvailable) {
      try {
        await prisma.notification.create({
          data: {
            paymentType: payload.PaymentType || null,
            originBankReference: payload.OriginBankReference || null,
            destinationBankReference: payload.DestinationBankReference || payload.DestinyBankReference || null,
            originBankCode: payload.OriginBankCode || null,
            txHour: payload.TxHour || null,
            currencyCode: payload.CurrencyCode || null,
            amount: payload.Amount || null,
            txDate: payload.TxDate || null,
            txTimestamp: txTimestamp || null,
            commerceId: payload.CommerceID || null,
            commercePhone: payload.CommercePhone || null,
            clientPhone: payload.ClientPhone || null,
            concept: payload.Concept || null,
            debtorAccount: payload.DebtorAccount || null,
            debtorId: payload.DebtorID || null,
            creditorAccount: payload.CreditorAccount || null,
            processed: true,
            raw: payload
          }
        });
        await writeLog('INFO', 200, 'Notification stored', { reference: payload.DestinationBankReference || payload.DestinyBankReference || payload.OriginBankReference }, '/notifications');
        console.log('Notification stored in DB:', payload.OriginBankReference || payload.DestinationBankReference || payload.DestinyBankReference);
      } catch (e) {
        console.error('Failed to store notification:', e.message);
        await writeLog('ERROR', 500, 'Failed to store notification', { error: e.message, payload }, '/notifications');
      }
    } else {
      console.log('DB not available at processing time; skipping storage for payload:', payload.OriginBankReference || payload.DestinyBankReference);
    }
  });
});

// Endpoint para consultar registros de notificaciones
app.get('/notifications', async (req, res) => {
  if (!dbAvailable) return res.status(503).json({ error: 'Service Unavailable: database connection not available' });

  if (!verifyApiKey(req) && !verifyJwt(req)) {
    await writeLog('ERROR', 401, 'Unauthorized: invalid API key or token', { headers: req.headers }, '/notifications');
    return res.status(401).json({ error: 'Unauthorized: invalid API key or token' });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 1000);
    const skip = Math.max(parseInt(req.query.offset || req.query.skip || '0', 10) || 0, 0);
    const where = {};
    if (req.query.processed !== undefined) where.processed = req.query.processed === 'true' || req.query.processed === '1';
    if (req.query.originBankReference) where.originBankReference = String(req.query.originBankReference);
    if (req.query.destinationBankReference) where.destinationBankReference = String(req.query.destinationBankReference);
    if (req.query.txDate) where.txDate = String(req.query.txDate);
    if (req.query.amount) where.amount = String(req.query.amount);
    if (req.query.id) where.id = parseInt(req.query.id, 10);

    const rows = await prisma.notification.findMany({ where, orderBy: { receivedAt: 'desc' }, take: limit, skip });
    return res.json({ count: rows.length, rows });
  } catch (e) {
    console.error('Failed to fetch notifications:', e.message);
    await writeLog('ERROR', 500, 'Failed to fetch notifications', { error: e.message }, '/notifications');
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Endpoint para consultar logs de notificaciones
app.get('/logs', async (req, res) => {
  if (!dbAvailable) return res.status(503).json({ error: 'Service Unavailable: database connection not available' });

  if (!verifyApiKey(req) && !verifyJwt(req)) {
    await writeLog('ERROR', 401, 'Unauthorized: invalid API key or token', { headers: req.headers }, '/logs');
    return res.status(401).json({ error: 'Unauthorized: invalid API key or token' });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 2000);
    const skip = Math.max(parseInt(req.query.offset || req.query.skip || '0', 10) || 0, 0);
    const where = {};
    if (req.query.level) where.level = String(req.query.level).toUpperCase();
    if (req.query.endpoint) where.endpoint = String(req.query.endpoint);
    if (req.query.statusCode) where.statusCode = parseInt(req.query.statusCode, 10);

    const rows = await prisma.log.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip });
    return res.json({ count: rows.length, rows });
  } catch (e) {
    console.error('Failed to fetch logs:', e.message);
    await writeLog('ERROR', 500, 'Failed to fetch logs', { error: e.message }, '/logs');
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await prisma.$disconnect();
  } catch (e) {
    /* ignore */
  }
  process.exit();
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Notification server listening on ${port}`));

module.exports = app;
