const MODEL = process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it';

function cleanNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeString(value, max = 2000) {
  return String(value ?? '').slice(0, max);
}

function buildPrompt(data) {
  const stock = {
    market: safeString(data.market, 50),
    riskProfile: safeString(data.riskProfile, 50),
    stockName: safeString(data.stockName, 100),
    ticker: safeString(data.ticker, 40),
    price: cleanNumber(data.price),
    high52: cleanNumber(data.high52),
    low52: cleanNumber(data.low52),
    per: cleanNumber(data.per),
    pbr: cleanNumber(data.pbr),
    roe: cleanNumber(data.roe),
    opGrowth: cleanNumber(data.opGrowth),
    debtRatio: cleanNumber(data.debtRatio),
    dividendYield: cleanNumber(data.dividendYield),
    notes: safeString(data.notes, 2500)
  };

  return `
당신은 한국어로 답하는 주식 분석 보조 AI입니다. 투자자문사가 아니므로 직접적인 매수/매도 지시 대신 "관심 우선", "관찰", "보류", "주의" 같은 보조 의견만 제공합니다.
실시간 시세, 최신 뉴스, 재무제표를 직접 조회했다고 말하지 마세요. 사용자가 제공한 정보만 근거로 분석하세요. 정보가 부족하면 부족하다고 명확히 말하세요.

아래 종목 데이터를 바탕으로 JSON만 반환하세요. 마크다운 코드블록 금지.

데이터:
${JSON.stringify(stock, null, 2)}

반환 JSON 스키마:
{
  "totalScore": 0부터 100 사이 정수,
  "valueScore": 0부터 100 사이 정수,
  "growthScore": 0부터 100 사이 정수,
  "safetyScore": 0부터 100 사이 정수,
  "verdict": "관심 우선" | "관찰" | "보류" | "주의",
  "summary": "한 문단 요약",
  "strengths": ["강점 3개 이내"],
  "risks": ["리스크 3개 이내"],
  "strategy": ["투자 접근법 3개 이내. 분할 접근, 손절/비중관리, 확인해야 할 조건 포함"],
  "checklist": ["추가 확인사항 4개 이내"]
}

평가 기준:
- 안정형은 부채비율, 배당, 변동성 리스크를 더 중요하게 봅니다.
- 공격형은 성장률, ROE, 산업 모멘텀을 더 중요하게 봅니다.
- PER/PBR은 업종 차이가 있으므로 과도하게 단정하지 마세요.
- 점수가 높아도 "무조건 매수"라고 쓰지 마세요.
`;
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Empty model response');
  const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('Model response was not valid JSON');
}

function normalizeResult(obj) {
  const n = (v, fallback = 50) => Math.max(0, Math.min(100, Math.round(Number.isFinite(Number(v)) ? Number(v) : fallback)));
  const arr = (v) => Array.isArray(v) ? v.map(x => String(x).slice(0, 250)).slice(0, 4) : [];
  const allowed = new Set(['관심 우선', '관찰', '보류', '주의']);
  return {
    totalScore: n(obj.totalScore),
    valueScore: n(obj.valueScore),
    growthScore: n(obj.growthScore),
    safetyScore: n(obj.safetyScore),
    verdict: allowed.has(obj.verdict) ? obj.verdict : '관찰',
    summary: String(obj.summary || '입력된 정보를 바탕으로 분석했습니다.').slice(0, 500),
    strengths: arr(obj.strengths),
    risks: arr(obj.risks),
    strategy: arr(obj.strategy),
    checklist: arr(obj.checklist)
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ready: Boolean(process.env.GEMINI_API_KEY), model: MODEL });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'POST only' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ ok: false, error: 'GEMINI_API_KEY is not configured' });
  }

  try {
    const prompt = buildPrompt(req.body || {});
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          topP: 0.9,
          maxOutputTokens: 1200,
          responseMimeType: 'application/json'
        }
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || 'Gemma API request failed';
      return res.status(response.status).json({ ok: false, error: message });
    }

    const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
    const parsed = normalizeResult(extractJson(text));
    return res.status(200).json({ ok: true, result: parsed, model: MODEL });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Unexpected error' });
  }
}
