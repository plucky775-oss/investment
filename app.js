const $ = (id) => document.getElementById(id);

const fields = [
  'market','riskProfile','stockName','ticker','price','high52','low52',
  'per','pbr','roe','opGrowth','debtRatio','dividendYield','notes'
];

let lastResult = null;
let lastPayload = null;

function num(id) {
  const value = $(id).value.trim();
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(id) { return $(id).value.trim(); }

function getPayload() {
  return {
    market: text('market'),
    riskProfile: text('riskProfile'),
    stockName: text('stockName'),
    ticker: text('ticker'),
    price: num('price'),
    high52: num('high52'),
    low52: num('low52'),
    per: num('per'),
    pbr: num('pbr'),
    roe: num('roe'),
    opGrowth: num('opGrowth'),
    debtRatio: num('debtRatio'),
    dividendYield: num('dividendYield'),
    notes: text('notes')
  };
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(clamp(value));
}

function calculateLocalScore(data) {
  const per = data.per;
  const pbr = data.pbr;
  const roe = data.roe;
  const op = data.opGrowth;
  const debt = data.debtRatio;
  const div = data.dividendYield;

  let value = 50;
  if (per !== null) value += per <= 10 ? 18 : per <= 18 ? 10 : per <= 28 ? 0 : -14;
  if (pbr !== null) value += pbr <= 1 ? 14 : pbr <= 2 ? 7 : pbr <= 4 ? -3 : -12;
  if (div !== null) value += div >= 4 ? 8 : div >= 2 ? 5 : div >= 1 ? 2 : 0;

  let growth = 50;
  if (op !== null) growth += op >= 30 ? 22 : op >= 15 ? 15 : op >= 5 ? 6 : op >= 0 ? 0 : -14;
  if (roe !== null) growth += roe >= 20 ? 16 : roe >= 12 ? 10 : roe >= 7 ? 4 : -8;

  let safety = 55;
  if (debt !== null) safety += debt <= 50 ? 18 : debt <= 100 ? 8 : debt <= 200 ? -5 : -18;
  if (data.price !== null && data.high52 !== null && data.low52 !== null && data.high52 > data.low52) {
    const position = (data.price - data.low52) / (data.high52 - data.low52);
    safety += position < 0.35 ? 10 : position < 0.7 ? 3 : -7;
  }

  value = round(value);
  growth = round(growth);
  safety = round(safety);

  const profileBias = data.riskProfile === '안정형' ? { v: .35, g: .25, s: .40 } :
    data.riskProfile === '공격형' ? { v: .25, g: .50, s: .25 } : { v: .34, g: .33, s: .33 };
  const total = round(value * profileBias.v + growth * profileBias.g + safety * profileBias.s);
  const verdict = total >= 78 ? '관심 우선' : total >= 62 ? '관찰' : total >= 45 ? '보류' : '주의';
  return { totalScore: total, valueScore: value, growthScore: growth, safetyScore: safety, verdict };
}

function localReport(data) {
  const score = calculateLocalScore(data);
  const strengths = [];
  const risks = [];
  if (data.roe !== null && data.roe >= 12) strengths.push('ROE가 양호하여 자기자본 수익성이 괜찮습니다.');
  if (data.opGrowth !== null && data.opGrowth >= 10) strengths.push('영업이익 성장률이 높아 실적 모멘텀이 있습니다.');
  if (data.per !== null && data.per <= 15) strengths.push('PER 기준으로 과도한 고평가 구간은 아닐 가능성이 있습니다.');
  if (data.debtRatio !== null && data.debtRatio <= 100) strengths.push('부채비율이 비교적 안정적인 편입니다.');

  if (data.per !== null && data.per >= 30) risks.push('PER이 높아 성장 기대가 꺾이면 주가 변동성이 커질 수 있습니다.');
  if (data.debtRatio !== null && data.debtRatio >= 200) risks.push('부채비율이 높아 금리·업황 악화 시 부담이 커질 수 있습니다.');
  if (data.opGrowth !== null && data.opGrowth < 0) risks.push('영업이익 성장률이 마이너스라 실적 회복 여부 확인이 필요합니다.');
  if (data.price !== null && data.high52 !== null && data.high52 > 0 && data.price / data.high52 > .88) risks.push('52주 고가에 가까워 단기 추격매수 리스크가 있습니다.');

  return {
    ...score,
    summary: `${data.stockName || '해당 종목'}은 입력된 수치 기준 ${score.verdict} 단계로 분류됩니다. Gemma 4 API가 설정되지 않아 앱 내부 점수화 방식으로 임시 분석했습니다.`,
    strengths: strengths.length ? strengths : ['입력된 정보만으로는 뚜렷한 강점을 단정하기 어렵습니다.'],
    risks: risks.length ? risks : ['큰 위험 신호는 제한적이지만, 최신 실적·뉴스 확인이 필요합니다.'],
    strategy: [
      '관심종목에 넣고 실적 발표, 업황, 수급 변화를 함께 확인하세요.',
      '한 번에 전액 매수하기보다 분할 접근이 더 안전합니다.',
      '입력하지 않은 지표가 많을수록 분석 신뢰도는 낮아집니다.'
    ],
    checklist: ['최근 분기 매출·영업이익 추세', '업종 평균 PER/PBR 대비 수준', '대주주·기관·외국인 수급', '환율·금리·원자재 등 외부 변수'],
    source: 'local'
  };
}

function drawScore(score = 0) {
  const canvas = $('scoreCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = 88;
  const start = Math.PI * 0.78;
  const end = Math.PI * 2.22;
  const pct = clamp(score) / 100;
  ctx.clearRect(0, 0, w, h);

  ctx.lineWidth = 19;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#e6ecf5';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, end);
  ctx.stroke();

  const grad = ctx.createLinearGradient(30, 180, 190, 30);
  grad.addColorStop(0, '#b42318');
  grad.addColorStop(.55, '#b45309');
  grad.addColorStop(1, '#047857');
  ctx.strokeStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, start + (end - start) * pct);
  ctx.stroke();
}

function badgeClass(verdict) {
  if (['관심 우선', '긍정', '매력 높음'].includes(verdict)) return 'good';
  if (['주의', '리스크 높음'].includes(verdict)) return 'danger';
  return 'warn';
}

function renderReport(result) {
  const safe = (v) => String(v ?? '').replace(/[&<>"]/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const list = (items) => `<ul>${(items || []).map(item => `<li>${safe(item)}</li>`).join('')}</ul>`;
  $('report').innerHTML = `
    <h3><span class="badge ${badgeClass(result.verdict)}">${safe(result.verdict)}</span>${safe(result.summary || '분석 결과')}</h3>
    <h4>강점</h4>${list(result.strengths)}
    <h4>주의할 점</h4>${list(result.risks)}
    <h4>접근 전략</h4>${list(result.strategy)}
    <h4>추가 확인 체크리스트</h4>${list(result.checklist)}
    <p class="muted">분석 방식: ${result.source === 'gemma4' ? 'Gemma 4 AI 리포트' : '내장 기본 점수화'}</p>
  `;
}

function renderScores(result) {
  $('scoreText').textContent = Number.isFinite(result.totalScore) ? String(result.totalScore) : '--';
  $('verdictText').textContent = result.verdict || '분석 완료';
  $('valueScore').textContent = Number.isFinite(result.valueScore) ? result.valueScore : '--';
  $('growthScore').textContent = Number.isFinite(result.growthScore) ? result.growthScore : '--';
  $('safetyScore').textContent = Number.isFinite(result.safetyScore) ? result.safetyScore : '--';
  drawScore(result.totalScore || 0);
}

function toast(message) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast';
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.classList.add('show');
  setTimeout(() => node.classList.remove('show'), 2200);
}

async function checkApi() {
  try {
    const res = await fetch('/api/analyze', { method: 'OPTIONS' });
    const data = await res.json().catch(() => ({}));
    const dot = $('apiStatusDot');
    if (data.ready) {
      dot.className = 'status-dot ready';
      $('apiStatusText').textContent = 'Gemma 4 연결 준비됨';
    } else {
      dot.className = 'status-dot error';
      $('apiStatusText').textContent = 'API 키 미설정';
    }
  } catch {
    $('apiStatusDot').className = 'status-dot error';
    $('apiStatusText').textContent = 'API 확인 실패';
  }
}

async function analyze() {
  const data = getPayload();
  if (!data.stockName && !data.ticker) {
    toast('종목명 또는 티커를 입력해주세요.');
    $('stockName').focus();
    return;
  }
  lastPayload = data;
  const buttons = [$('analyzeBtn'), $('analyzeBtnBottom')];
  buttons.forEach(btn => btn.classList.add('loading'));
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || 'Gemma 4 분석 실패');
    lastResult = { ...json.result, source: 'gemma4' };
  } catch (err) {
    console.warn(err);
    lastResult = localReport(data);
    toast('Gemma 4 연결이 안 되어 기본 분석으로 표시합니다.');
  } finally {
    buttons.forEach(btn => btn.classList.remove('loading'));
  }
  renderScores(lastResult);
  renderReport(lastResult);
  $('saveBtn').disabled = false;
  $('copyBtn').disabled = false;
}

function setSample() {
  const sample = {
    market: 'KOSPI/KOSDAQ', riskProfile: '중립형', stockName: '삼성전자', ticker: '005930',
    price: '82000', high52: '92000', low52: '65000', per: '18', pbr: '1.4', roe: '10.5',
    opGrowth: '28', debtRatio: '26', dividendYield: '1.8',
    notes: '반도체 업황 회복 기대, HBM 및 AI 서버 수요 증가 가능성. 다만 메모리 가격 사이클과 환율, 글로벌 경쟁 심화는 리스크.'
  };
  Object.entries(sample).forEach(([k,v]) => $(k).value = v);
  toast('예시 데이터가 입력되었습니다.');
}

function reset() {
  fields.forEach(id => {
    if (id === 'market') $(id).value = 'KOSPI/KOSDAQ';
    else if (id === 'riskProfile') $(id).value = '중립형';
    else $(id).value = '';
  });
  lastResult = null;
  lastPayload = null;
  $('saveBtn').disabled = true;
  $('copyBtn').disabled = true;
  renderScores({ totalScore: 0 });
  $('scoreText').textContent = '--';
  $('verdictText').textContent = '분석 전';
  $('report').innerHTML = '<h3>아직 분석 전입니다</h3><p>종목 정보를 입력한 뒤 분석 버튼을 누르세요.</p>';
}

function storageKey() { return 'gemma4-stock-watchlist-v1'; }
function getWatchList() {
  try { return JSON.parse(localStorage.getItem(storageKey())) || []; } catch { return []; }
}
function setWatchList(items) { localStorage.setItem(storageKey(), JSON.stringify(items)); }

function saveWatch() {
  if (!lastResult || !lastPayload) return;
  const items = getWatchList();
  const item = {
    id: Date.now(),
    name: lastPayload.stockName || lastPayload.ticker,
    ticker: lastPayload.ticker,
    score: lastResult.totalScore,
    verdict: lastResult.verdict,
    createdAt: new Date().toLocaleString('ko-KR')
  };
  setWatchList([item, ...items].slice(0, 24));
  renderWatchList();
  toast('관심종목에 저장했습니다.');
}

function deleteWatch(id) {
  setWatchList(getWatchList().filter(item => item.id !== id));
  renderWatchList();
}

function renderWatchList() {
  const wrap = $('watchList');
  const items = getWatchList();
  if (!items.length) {
    wrap.className = 'watch-list empty';
    wrap.textContent = '저장된 관심종목이 없습니다.';
    return;
  }
  wrap.className = 'watch-list';
  wrap.innerHTML = items.map(item => `
    <div class="watch-card">
      <header>
        <div>
          <h3>${item.name} ${item.ticker ? `<small>(${item.ticker})</small>` : ''}</h3>
          <p>점수 ${item.score} · ${item.verdict}<br>${item.createdAt}</p>
        </div>
        <button class="ghost" data-delete="${item.id}">삭제</button>
      </header>
    </div>
  `).join('');
  wrap.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteWatch(Number(btn.dataset.delete)));
  });
}

async function copyReport() {
  if (!lastResult || !lastPayload) return;
  const text = [
    `[${lastPayload.stockName || lastPayload.ticker} 분석 리포트]`,
    `종합점수: ${lastResult.totalScore}`,
    `판정: ${lastResult.verdict}`,
    `요약: ${lastResult.summary}`,
    `강점: ${(lastResult.strengths || []).join(' / ')}`,
    `리스크: ${(lastResult.risks || []).join(' / ')}`,
    `전략: ${(lastResult.strategy || []).join(' / ')}`
  ].join('\n');
  await navigator.clipboard.writeText(text);
  toast('리포트를 복사했습니다.');
}

$('analyzeBtn').addEventListener('click', analyze);
$('analyzeBtnBottom').addEventListener('click', analyze);
$('sampleBtn').addEventListener('click', setSample);
$('resetBtn').addEventListener('click', reset);
$('saveBtn').addEventListener('click', saveWatch);
$('copyBtn').addEventListener('click', copyReport);

renderScores({ totalScore: 0 });
renderWatchList();
checkApi();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
