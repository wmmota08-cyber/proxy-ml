export default async function handler(req, res) {
  const q = (req.query.q || '').toString().trim();
  if (!q) {
    res.status(400).json({ error: 'Missing query (?q=...)' });
    return;
  }

  try {
    const url = "https://lista.mercadolivre.com.br/" + encodeURIComponent(q);
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml"
      }
    });
    if (!r.ok) {
      res.status(502).json({ error: "Falha ao abrir página de busca", status: r.status });
      return;
    }
    const html = await r.text();

    // Extrai JSON do __NEXT_DATA__ (render inicial) para pegar os resultados de forma estável
    const m = html.match(/window\.__NEXT_DATA__\s*=\s*(\{.*?\})\s*<\/script>/s);
    let results = [];
    if (m) {
      const root = JSON.parse(m[1]);
      const found = (function findResults(obj) {
        if (!obj) return null;
        if (Array.isArray(obj)) {
          for (const v of obj) { const r = findResults(v); if (r) return r; }
        } else if (typeof obj === 'object') {
          if (Array.isArray(obj.results) && obj.results.length) return obj.results;
          for (const k of Object.keys(obj)) {
            const r = findResults(obj[k]);
            if (r) return r;
          }
        }
        return null;
      })(root);
      if (found) results = found;
    }

    // Fallback muito simples (caso m falhe): tenta encontrar preços e títulos no HTML
    if (!results.length) {
      const items = [];
      const reItem = /"title":"(.*?)".*?"price":(\d+(?:\.\d+)?)/gs;
      let mm;
      while ((mm = reItem.exec(html)) && items.length < 40) {
        items.push({ title: mm[1], price: Number(mm[2]) });
      }
      results = items;
    }

    // Normaliza saída
    const norm = (results || []).map((it) => {
      const title = it.title || it.name || it.short_title;
      const price = Number(it.price || it.prices?.[0]?.amount || it.prices?.prices?.[0]?.amount || it.installments?.amount || 0);
      const sold = Number(
        it.sold_quantity ?? it.soldQuantity ?? it.sold_total ?? it.sold_quantity_by_channel?.total ?? 0
      );
      const permalink = it.permalink || it.link || it.permaLink || (it.url && typeof it.url === "string" ? it.url : null);
      const rep = it.seller?.seller_reputation?.level_id || it.seller_reputation?.level_id || it.sellerLevel || "";
      return { title, price, sold_quantity: sold, permalink, reputation: rep };
    }).filter(x => x.title && x.price);

    // Filtros: vendidos >= 50 e vendedor bom (quando disponível)
    const filtered = norm.filter(x => (x.sold_quantity ?? 0) >= 50)
      .filter(x => !x.reputation || /gold|platinum/i.test(x.reputation))
      .sort((a,b)=>a.price-b.price)
      .slice(0, 30);

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    res.status(200).json({ results: filtered, total: filtered.length });
  } catch (e) {
    res.status(500).json({ error: 'Erro interno no proxy (scrape)', details: String(e) });
  }
}
