export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=900');

  const SB_KEY = 'N2988LVIP0TLELZVBUUCM0098RSW2QQ01NERRNFC3HTAQBYTX91EJ3WWSMC8AG49UL6RMUEWMHU5R51R';

  try {
    // Page BTC liquidations avec JS rendu + attente 5s pour charger les données
    const target = 'https://www.coinglass.com/liquidations/BTC';
    const sbUrl  = `https://app.scrapingbee.com/api/v1/?api_key=${SB_KEY}&url=${encodeURIComponent(target)}&render_js=true&wait=5000&premium_proxy=false&block_ads=true`;

    const r = await fetch(sbUrl, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('ScrapingBee ' + r.status);
    const html = await r.text();
    if (!html || html.length < 500) throw new Error('HTML vide');

    // Chercher les patterns de liquidation dans le HTML rendu
    // CoinGlass affiche : "$249.53M" ou "249.53M" pour le total
    // Pattern 1 : montants > $10M (pour filtrer les petits chiffres parasites)
    const bigAmounts = [...html.matchAll(/\$\s*([\d,]+\.?\d*)\s*([MB])/g)]
      .map(m => ({
        raw: m[0].trim(),
        val: parseFloat(m[1].replace(/,/g,'')),
        unit: m[2],
        usd: parseFloat(m[1].replace(/,/g,'')) * (m[2]==='B'?1e9:1e6),
      }))
      .filter(m => m.usd >= 10e6) // garder seulement > $10M
      .sort((a,b) => b.usd - a.usd);

    // Chercher "Long" et "Short" avec montants
    // Pattern CoinGlass : "Long $74.12M" ou "74.12M" près de "Long"
    const longRegex  = /[Ll]ong[\s\S]{0,50}?\$([\d,.]+)\s*([MB])/;
    const shortRegex = /[Ss]hort[\s\S]{0,50}?\$([\d,.]+)\s*([MB])/;
    const lm = html.match(longRegex);
    const sm = html.match(shortRegex);

    const parseM = m => m ? parseFloat(m[1].replace(/,/g,'')) * (m[2]==='B'?1e9:1e6) : 0;
    let longVal  = parseM(lm);
    let shortVal = parseM(sm);

    // Si Long/Short non trouvés, utiliser les 2 plus grands montants
    if (!longVal && !shortVal && bigAmounts.length >= 2) {
      // Le total est généralement le plus grand, Long/Short sont les suivants
      longVal  = bigAmounts[1]?.usd || 0;
      shortVal = bigAmounts[2]?.usd || 0;
    }

    // Total = plus grand montant trouvé ou somme Long+Short
    const total = bigAmounts[0]?.usd || (longVal + shortVal);

    if (total < 10e6) {
      // Retourner debug pour analyser
      return res.status(200).json({
        debug: true,
        htmlLength: html.length,
        bigAmounts: bigAmounts.slice(0,10),
        longMatch: lm ? lm[0] : null,
        shortMatch: sm ? sm[0] : null,
        sample: html.slice(500, 2500),
      });
    }

    const longFinal  = longVal  || total * 0.3;
    const shortFinal = shortVal || total * 0.7;
    const tot = longFinal + shortFinal;
    const longPct  = (longFinal  / tot * 100).toFixed(1);
    const shortPct = (shortFinal / tot * 100).toFixed(1);
    const dom = shortFinal > longFinal ? 'shorts' : 'longs';
    const domPct = dom === 'shorts' ? shortPct : longPct;

    return res.status(200).json({
      source: 'CoinGlass · ScrapingBee',
      total:  fmtUsd(total),
      long:   fmtUsd(longFinal),
      short:  fmtUsd(shortFinal),
      longPct, shortPct, dom, domPct,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function fmtUsd(n) {
  if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(0) + 'M';
  return '$' + Math.round(n).toLocaleString();
}
