export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=900'); // cache 15 min

  const SB_KEY = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';

  try {
    // CoinGlass page liquidations — on veut le total 24h + long/short
    const target = 'https://www.coinglass.com/LiquidationData';
    const sbUrl  = `https://app.scrapingbee.com/api/v1/?api_key=${SB_KEY}&url=${encodeURIComponent(target)}&render_js=true&wait=3000&premium_proxy=false`;

    const r = await fetch(sbUrl, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error('ScrapingBee ' + r.status);
    const html = await r.text();

    if (!html || html.length < 500) throw new Error('HTML vide');

    // CoinGlass affiche les données en texte — on cherche des patterns comme "$249.5M"
    // Pattern : total liquidations, long%, short%
    const debug = html.slice(0, 2000);

    // Chercher les montants en millions/milliards
    const amounts = [...html.matchAll(/\$\s*([\d,]+\.?\d*)\s*([MBK])/g)]
      .map(m => ({
        raw: m[0],
        val: parseFloat(m[1].replace(',','')),
        unit: m[2],
        usd: parseFloat(m[1].replace(',','')) * (m[2]==='B'?1e9:m[2]==='M'?1e6:1e3),
      }));

    // Chercher les pourcentages
    const pcts = [...html.matchAll(/([\d.]+)%/g)].map(m => parseFloat(m[1]));

    // Chercher "Long" et "Short" avec leurs valeurs proches
    const longMatch  = html.match(/[Ll]ong[^$]*\$([\d,.]+)\s*([MBK])/);
    const shortMatch = html.match(/[Ss]hort[^$]*\$([\d,.]+)\s*([MBK])/);

    const parseAmt = m => m ? parseFloat(m[1].replace(',','')) * (m[2]==='B'?1e9:m[2]==='M'?1e6:1e3) : 0;
    const longVal  = parseAmt(longMatch);
    const shortVal = parseAmt(shortMatch);
    const total    = longVal + shortVal;

    if (total > 0) {
      const longPct  = (longVal / total * 100).toFixed(1);
      const shortPct = (shortVal / total * 100).toFixed(1);
      const dom = shortVal > longVal ? 'shorts' : 'longs';

      return res.status(200).json({
        source: 'CoinGlass · ScrapingBee',
        total:  formatUsd(total),
        long:   formatUsd(longVal),
        short:  formatUsd(shortVal),
        longPct, shortPct, dom,
        reading: `${formatUsd(total)} liquidés — ${dom} dominants (${shortVal > longVal ? shortPct : longPct}%)`,
      });
    }

    // Fallback : retourner debug pour analyser le HTML
    return res.status(200).json({
      debug: true,
      htmlLength: html.length,
      amountsFound: amounts.slice(0, 10),
      pctFound: pcts.slice(0, 10),
      sample: debug,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function formatUsd(n) {
  if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(0) + 'M';
  return '$' + n.toLocaleString();
}
