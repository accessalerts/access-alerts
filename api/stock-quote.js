// /api/stock-quote — Vercel Serverless Function
//
// This runs on Vercel's servers, never in the visitor's browser, so the
// Alpaca API keys never get exposed to anyone looking at the site.
//
// The actual key values live ONLY in Vercel's Environment Variables
// (Project Settings -> Environment Variables), never in this file and
// never in GitHub. This file just reads them from process.env at
// request time.
//
// Usage once deployed:
//   https://accessalertsapp.com/api/stock-quote?symbol=AAPL
//   https://accessalertsapp.com/api/stock-quote?symbols=AAPL,MSFT,GOOGL

const ALPACA_DATA_URL = "https://data.alpaca.markets/v2/stocks";

function isValidSymbol(s) {
  return /^[A-Z.]{1,10}$/.test(s);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const keyId = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;

  if (!keyId || !secretKey) {
    res.status(500).json({
      error:
        "Server is missing Alpaca credentials. Add ALPACA_KEY_ID and ALPACA_SECRET_KEY in Vercel's Environment Variables, then redeploy.",
    });
    return;
  }

  const rawSymbols = (req.query.symbols || req.query.symbol || "")
    .toString()
    .toUpperCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawSymbols.length === 0) {
    res.status(400).json({ error: "Pass ?symbol=AAPL or ?symbols=AAPL,MSFT" });
    return;
  }

  if (!rawSymbols.every(isValidSymbol)) {
    res.status(400).json({ error: "Invalid symbol format" });
    return;
  }

  const symbolList = rawSymbols.join(",");
  const headers = {
    "APCA-API-KEY-ID": keyId,
    "APCA-API-SECRET-KEY": secretKey,
  };

  try {
    const [quotesResp, tradesResp] = await Promise.all([
      fetch(
        `${ALPACA_DATA_URL}/quotes/latest?symbols=${encodeURIComponent(symbolList)}`,
        { headers }
      ),
      fetch(
        `${ALPACA_DATA_URL}/trades/latest?symbols=${encodeURIComponent(symbolList)}`,
        { headers }
      ),
    ]);

    if (!quotesResp.ok || !tradesResp.ok) {
      const status = !quotesResp.ok ? quotesResp.status : tradesResp.status;
      const body = await (!quotesResp.ok ? quotesResp.text() : tradesResp.text());
      res.status(502).json({
        error: "Alpaca API request failed",
        alpacaStatus: status,
        alpacaBody: body,
      });
      return;
    }

    const quotesData = await quotesResp.json();
    const tradesData = await tradesResp.json();

    const result = {};
    for (const symbol of rawSymbols) {
      const q = quotesData.quotes?.[symbol];
      const t = tradesData.trades?.[symbol];
      result[symbol] = {
        price: t?.p ?? null,
        bid: q?.bp ?? null,
        ask: q?.ap ?? null,
        timestamp: t?.t ?? q?.t ?? null,
      };
    }

    res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=15");
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: "Unexpected server error", detail: String(err) });
  }
}
