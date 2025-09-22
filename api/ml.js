import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    const q = (req.query.q || '').toString().trim();
    const limit = Number(req.query.limit || 30);

    if (!q) {
      res.status(400).json({ error: 'Missing query (?q=...)' });
      return;
    }

    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=${limit}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) {
      res.status(502).json({ error: 'Mercado Livre respondeu com erro', status: r.status });
      return;
    }
    const data = await r.json();

    // CORS liberado para o seu HTML abrir a API direto
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro interno no proxy', details: String(e) });
  }
}
