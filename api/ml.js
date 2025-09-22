export default async function handler(req, res) {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Missing query (?q=...)' });

  const out = (code, data) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    return res.status(code).json(data);
  };

  try {
    const url = "https://lista.mercadolivre.com.br/" + encodeURIComponent(q);
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml"
      }
    });
    if (!r.ok) return out(502, { error: "Falha ao abrir página de busca", status: r.status });
    const html = await r.text();

    const items = [];
    const pushItem = (it) => {
      if (!it) return;
      const title = (it.title || '').toString().trim();
      const price = Number(it.price || 0);
      if (!title || !price) return;
      const sold = Number(it.sold_quantity || 0);
      const perm = it.permalink || it.url || null;
      const rep = it.reputation || '';
      items.push({ title, price, sold_quantity: sold, permalink: perm, reputation: rep });
    };

    // 1) Tenta JSON interno (__NEXT_DATA__)
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
                const price = Number(it.price || it.prices?.[0]?.amount || it.prices?.prices?.[0]?.amount || 0);
                const title = it.title || it.name || it.short_title;
                const sold  = Number(it.sold_quantity ?? it.soldQuantity ?? 0);
                const link  = it.permalink || it.link || it.permaLink || (typeof it.url === 'string' ? it.url : null);
                const rep   = it.seller?.seller_reputation?.level_id || it.seller_reputation?.level_id || '';
                pushItem({ title, price, sold_quantity: sold, permalink: link, reputation: rep });
              }
            }
            for (const k of Object.keys(obj)) walk(obj[k]);
          }
        };
        walk(root);
      }
    } catch {}

    // 2) Fallback: parse HTML bruto (cartões de resultado)
    if (items.length < 3) {
      // divide em blocos por cada item
      const cardRe = /<li[^>]*class="ui-search-layout__item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
      let m;
      while ((m = cardRe.exec(html)) && items.length < 60) {
        const block = m[1];
        const titleMatch = block.match(/class="ui-search-item__title"[^>]*>([^<]+)/) || block.match(/title="([^"]+)"\s+class="ui-search-link/);
        const priceFrac  = block.match(/class="price-tag-fraction">([\d\.]+)/);
        const priceCents = block.match(/class="price-tag-cents">(\d+)/);
        const hrefMatch  = block.match(/<a[^>]+class="ui-search-link"[^>]+href="([^"]+)"/);
        const soldMatch  = block.match(/(\d[\d\.]*)\s+vendidos?/i);
        const repMatch   = block.match(/reputation|platinum|gold/i);
        let price = 0;
        if (priceFrac) {
          price = Number(priceFrac[1].replace(/\./g,''));
          if (priceCents) price += Number(priceCents[1]) / 100;
        }
        const title = titleMatch ? titleMatch[1] : null;
        const link  = hrefMatch ? hrefMatch[1] : null;
        const sold  = soldMatch ? Number(soldMatch[1].replace(/\./g,'')) : 0;
        const rep   = repMatch ? (repMatch[0].toLowerCase().includes('platinum') ? 'platinum' : 'gold') : '';
        pushItem({ title, price, sold_quantity: sold, permalink: link, reputation: rep });
      }
    }

    // 3) Limpeza e filtros
    const normalized = items
      .filter((x, i, arr) => x.title && x.price && arr.findIndex(y => y.title === x.title && Math.abs(y.price - x.price) < 0.5) === i)
      .sort((a,b)=>a.price-b.price);

    const filtered = normalized
      .filter(x => (x.sold_quantity ?? 0) >= 50)                 // vendidos >= 50
      .filter(x => !x.reputation || /gold|platinum/i.test(x.reputation)) // vendedor bom quando disponível
      .slice(0, 40);

    return out(200, { results: filtered, total: filtered.length, raw_count: normalized.length });
  } catch (e) {
    return out(500, { error: 'Erro interno no proxy (scrape-strong)', details: String(e) });
  }
}
