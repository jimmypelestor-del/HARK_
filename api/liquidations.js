export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=900');

  const SB_KEY = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';

  try {
    const target = 'https://www.coinglass.com/liquidations/BTC';
    const sbUrl  = `https://app.scrapingbee.com/api/v1/?api_key=${SB_KEY}&url=${encodeURIComponent(target)}&render_js=true&wait=8000&premium_proxy=false&block_ads=true`;

    const r = await fetch(sbUrl, { signal: AbortSignal.timeout(35000) });
    if (!r.ok) throw new Error('ScrapingBee ' + r.status);
    const html = await r.text();

    // ── 1. TOTAL 24h — depuis "24h Liquidation" (toutes cryptos)
    // Format : >24h Liquidation<...>$147,855,521</
    let total = 0;
    const totalMatch = html.match(/24h Liquidation[\s\S]{0,200}?\$([\d,]+)/);
    if (totalMatch) total = parseFloat(totalMatch[1].replace(/,/g,''));

    // ── 2. LONG/SHORT ratio — depuis "24h Long/Short"
    // Format : >24h Long/Short <...>49.75%/50.25%</
    let longPct = 0, shortPct = 0;
    const lsMatch = html.match(/24h Long\/Short[\s\S]{0,100}?([\d.]+)%\/([\d.]+)%/);
    if (lsMatch) {
      longPct  = parseFloat(lsMatch[1]);
      shortPct = parseFloat(lsMatch[2]);
    }

    // ── 3. LONG/SHORT en valeur depuis "24h Rekt" BTC
    // Format : aria-label="42,793,608.627">$42.79M (Long) et Short
    let longVal = 0, shortVal = 0;
    const rektIdx = html.indexOf('24h Rekt');
    if (rektIdx >= 0) {
      const zone = html.slice(rektIdx, rektIdx + 600);
      const ariaVals = [...zone.matchAll(/aria-label="([\d,.]+)"/g)]
        .map(m => parseFloat(m[1].replace(/,/g,'')));
      // 1er = total BTC, 2ème = Long BTC, 3ème = Short BTC
      if (ariaVals.length >= 3) {
        longVal  = ariaVals[1];
        shortVal = ariaVals[2];
      }
    }

    // Calculer long/short en USD à partir du total + ratio si disponibles
    if (total > 0 && longPct > 0) {
      longVal  = total * longPct  / 100;
      shortVal = total * shortPct / 100;
    }

    if (total < 1e6) throw new Error('Total trop faible: ' + total);

    const lPct = longPct  > 0 ? longPct.toFixed(1)  : longVal  > 0 ? (longVal  / total * 100).toFixed(1) : '—';
    const sPct = shortPct > 0 ? shortPct.toFixed(1) : shortVal > 0 ? (shortVal / total * 100).toFixed(1) : '—';
    const dom    = parseFloat(lPct) > parseFloat(sPct) ? 'longs' : 'shorts';
    const domPct = dom === 'longs' ? lPct : sPct;

    return res.status(200).json({
      source: 'CoinGlass · ScrapingBee',
      total:  fmtUsd(total),
      long:   longVal  > 0 ? fmtUsd(longVal)  : lPct + '%',
      short:  shortVal > 0 ? fmtUsd(shortVal) : sPct + '%',
      longPct: lPct, shortPct: sPct, dom, domPct,
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
