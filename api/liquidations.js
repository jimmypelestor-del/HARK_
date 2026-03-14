export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=900');

  const SB_KEY = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';

  try {
    const target = 'https://www.coinglass.com/liquidations/BTC';
    const sbUrl  = `https://app.scrapingbee.com/api/v1/?api_key=${SB_KEY}&url=${encodeURIComponent(target)}&render_js=true&wait=5000&premium_proxy=false&block_ads=true`;

    const r = await fetch(sbUrl, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('ScrapingBee ' + r.status);
    const html = await r.text();
    if (!html || html.length < 500) throw new Error('HTML vide');

    // Cibler la section "24h Rekt" dans le HTML rendu
    const idx = html.indexOf('24h Rekt') !== -1 ? html.indexOf('24h Rekt')
              : html.indexOf('24 hour')  !== -1 ? html.indexOf('24 hour')
              : -1;

    let total = 0, longVal = 0, shortVal = 0;

    if (idx >= 0) {
      const zone = html.slice(idx, idx + 600);
      const amounts = [...zone.matchAll(/\$([\d,.]+)\s*([MBK]?)/g)].map(m => ({
        usd: parseFloat(m[1].replace(/,/g,'')) * (m[2]==='B'?1e9:m[2]==='M'?1e6:m[2]==='K'?1e3:1),
      })).filter(a => a.usd >= 1e4);

      if (amounts.length >= 3) {
        total    = amounts[0].usd;
        longVal  = amounts[1].usd;
        shortVal = amounts[2].usd;
      } else if (amounts.length === 2) {
        longVal  = amounts[0].usd;
        shortVal = amounts[1].usd;
        total    = longVal + shortVal;
      } else if (amounts.length === 1) {
        total = amounts[0].usd;
      }
    }

    // Fallback pattern direct
    if (total < 1e6) {
      const m = html.match(/24h?\s*[Rr]ekt[\s\S]{0,30}?\$([\d,.]+)([MBK]?)[\s\S]{0,100}?[Ll]ong[\s\S]{0,20}?\$([\d,.]+)([MBK]?)[\s\S]{0,100}?[Ss]hort[\s\S]{0,20}?\$([\d,.]+)([MBK]?)/s);
      if (m) {
        const p = (v, u) => parseFloat(v.replace(/,/g,'')) * (u==='B'?1e9:u==='M'?1e6:u==='K'?1e3:1);
        total    = p(m[1], m[2]);
        longVal  = p(m[3], m[4]);
        shortVal = p(m[5], m[6]);
      }
    }

    if (total < 1e6) {
      return res.status(200).json({
        debug: true,
        htmlLength: html.length,
        idx24h: idx,
        zone: idx >= 0 ? html.slice(idx, idx + 500) : 'not found',
        sample: html.slice(2000, 4000),
      });
    }

    // Recalculer total si incohérent
    if (longVal > 0 && shortVal > 0) total = longVal + shortVal;

    const tot      = total;
    const longPct  = tot > 0 && longVal  > 0 ? (longVal  / tot * 100).toFixed(1) : '0';
    const shortPct = tot > 0 && shortVal > 0 ? (shortVal / tot * 100).toFixed(1) : '0';
    const dom      = longVal > shortVal ? 'longs' : 'shorts';
    const domPct   = dom === 'longs' ? longPct : shortPct;

    return res.status(200).json({
      source: 'CoinGlass · ScrapingBee',
      total:  fmtUsd(tot),
      long:   fmtUsd(longVal),
      short:  fmtUsd(shortVal),
      longPct, shortPct, dom, domPct,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function fmtUsd(n) {
  if (!n || isNaN(n)) return '—';
  if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(0) + 'M';
  return '$' + Math.round(n/1e3) + 'K';
}
