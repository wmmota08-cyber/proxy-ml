export default async function handler(req, res) {
  const q = req.query.q;
  if (!q) {
    res.status(400).json({ error: "Missing query" });
    return;
  }

  try {
    const r = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=30`);
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "Erro ao buscar no Mercado Livre", details: e.message });
  }
}
