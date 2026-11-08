// ==========================================================================
// R&R Water Refilling Station - Vercel Serverless Edge API
// Native Node.js zero-dependency handler for Vercel deployment
// ==========================================================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://osllqnumtgtcvkpojhlc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_9bIn_zoVA66HQq-kTueGuw_B_hFa6uP';

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-manager-pin');
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-manager-pin');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.end();
  }

  const url = req.url || '';
  const pathname = url.split('?')[0];

  // 1. Supabase Cloud Configuration endpoint
  if (pathname === '/api/config/supabase' || pathname === '/api/config') {
    return sendJson(res, 200, {
      success: true,
      configured: true,
      url: SUPABASE_URL,
      anonKey: SUPABASE_KEY,
      provider: 'Supabase Cloud (PostgreSQL)',
      status: 'active'
    });
  }

  // 2. Server Status & Health Check
  if (pathname === '/api/status' || pathname === '/api/health') {
    return sendJson(res, 200, {
      success: true,
      status: 'online',
      platform: 'Vercel Serverless Edge',
      storage: 'Supabase Cloud (Persistent PostgreSQL)',
      carboysOnLoan: 0,
      timestamp: Date.now()
    });
  }

  // 3. Station Settings endpoint
  if (pathname === '/api/settings') {
    return sendJson(res, 200, {
      success: true,
      settings: {
        stationName: 'R&R Water Refilling Station',
        stationBranch: 'Counter #1 (Main Terminal)',
        stationPhone: '0917-829-4102',
        stationAddress: 'Purok 1, Main Road',
        pricePurified: 35,
        priceNewJug: 250,
        minBatch: 10,
        wholesalePrice: 30
      }
    });
  }

  // 4. Universal Fallback for sync/telemetry/orders/customers on Vercel
  if (pathname.startsWith('/api/')) {
    return sendJson(res, 200, {
      success: true,
      acknowledged: true,
      mode: 'cloud-first',
      note: 'Persistent data is synchronized directly through Supabase Cloud PostgreSQL & Realtime.',
      timestamp: Date.now()
    });
  }

  return sendJson(res, 404, { error: 'Not Found' });
};
