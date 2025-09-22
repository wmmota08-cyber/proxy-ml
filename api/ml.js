export default async function handler(req, res) {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Missing query (?q=...)' });

  const cors = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };
  cors();
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const url = "https://lista.mercadolivre.com.br/" + encodeURIComponent(q);
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml"
      }
    });
    if (!r.ok) return res.status(502).json({ error: "Falha ao abrir página de busca", status: r.status });
    const html = await r.text();

    const items = [];

    // (A) Tenta JSON interno (__NEXT_DATA__)
    try {
      const m = html.match(/window\.__NEXT_DATA__\s*=\s*(\{.*?\})\s*<\/script>/s);
      if (m) {
        const root = JSON.parse(m[1]);
        const walk = (obj) => {
          if (!obj) return;
          if (Array.isArray(obj)) { for (const v of obj) walk(v); return; }
          if (typeof obj === 'object') {
            if (Array.isArray(obj.results)) {
              for (const it of obj.results) {
                const title = it.title || it.name || it.short_title;
                const price = Number(it.price || it.prices?.[0]?.amount || it.prices?.prices?.[0]?.amount || 0);
                const sold  = Number(it.sold_quantity ?? it.soldQuantity ?? 0);
                const link  = it.permalink || it.link || it.permaLink || (typeof it.url === 'string' ? it.url : null);
                items.push({ title, price, sold_quantity: sold, permalink: link, source: "next_data" });
              }
            }
            for (const k of Object.keys(obj)) walk(obj[k]);
          }
        };
        walk(root);
      }
    } catch {}

    // (B) Fallback: HTML bruto - estrutura UI Search nova
    if (items.length < 1) {
      const cardRe = /<li[^>]*class="ui-search-layout__item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
      let m;
      while ((m = cardRe.exec(html)) && items.length < 80) {
        const block = m[1];
        const titleMatch = block.match(/class="ui-search-item__title"[^>]*>([^<]+)/) || block.match(/<h2[^>]*>([^<]+)<\/h2>/);
        const priceFrac  = block.match(/class="price-tag-fraction">([\d\.]+)/);
        const priceCents = block.match(/class="price-tag-cents">(\d+)/);
        const hrefMatch  = block.match(/<a[^>]+class="ui-search-link"[^>]+href="([^"]+)"/);
        let price = 0;
        if (priceFrac) {
          price = Number(priceFrac[1].replace(/\./g,''));
          if (priceCents) price += Number(priceCents[1]) / 100;
        }
        const title = titleMatch ? titleMatch[1] : null;
        const link  = hrefMatch ? hrefMatch[1] : null;
        if (title && price) items.push({ title, price, permalink: link, source: "html_ui_search" });
      }
    }

    // (C) Fallback simples por JSONs inline com "price"/"title"
    if (items.length < 1) {
      const simple = [];
      const re = /"title"\s*:\s*"([^"]+)"[\s\S]*?"price"\s*:\s*(\d+(?:\.\d+)?)/g;
      let m;
      while ((m = re.exec(html)) && simple.length < 80) {
        simple.push({ title: m[1], price: Number(m[2]), source: "inline_json" });
      }
      items.push(...simple);
    }

    // Limpeza básica e ordenação
    const normalized = items
      .filter((x) => x && x.title && x.price)
      .filter((x, i, arr) => arr.findIndex(y => y.title === x.title && Math.abs(y.price - x.price) < 0.5) === i)
      .sort((a,b)=>a.price-b.price);

    res.status(200).json({ results: normalized, total: normalized.length });
  } catch (e) {
    res.status(500).json({ error: 'Erro interno (scrape-any)', details: String(e) });
  }
}
