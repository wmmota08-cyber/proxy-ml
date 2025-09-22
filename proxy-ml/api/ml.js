export default async function handler(req, res) {
  const q = (req.query.q || '').toString();
  const limit = Number(req.query.limit || 12);
  if (!q) {
    res.status(400).json({ error: 'Parâmetro q é obrigatório.' });
    return;
  }

  try {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=${limit}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`ML erro ${r.status}`);
    const data = await r.json();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    res.status(200).json(data);
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'Falha ao consultar o Mercado Livre.' });
  }
}
