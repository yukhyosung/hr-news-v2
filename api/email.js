const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// 20개 뉴스 소스 RSS
const RSS_SOURCES = [
  { name: '연합뉴스', url: 'https://www.yna.co.kr/rss/news.xml' },
  { name: '뉴시스', url: 'https://www.newsis.com/RSS/Feed/?scd=10' },
  { name: '한국경제', url: 'https://rss.hankyung.com/economy.xml' },
  { name: '매일경제', url: 'https://file.mk.co.kr/news/rss/rss_30000001.xml' },
  { name: '조선일보', url: 'https://www.chosun.com/arc/outboundfeeds/rss/' },
  { name: '중앙일보', url: 'https://rss.joins.com/joins_news_list.xml' },
  { name: '동아일보', url: 'https://rss.donga.com/economy.xml' },
  { name: '한겨레', url: 'https://www.hani.co.kr/rss/' },
  { name: '경향신문', url: 'https://www.khan.co.kr/rss/rssdata/total_news.xml' },
  { name: '머니투데이', url: 'https://rss.mt.co.kr/rss/1000.xml' },
  { name: '헤럴드경제', url: 'https://biz.heraldm.com/rss/010000000000.xml' },
  { name: '파이낸셜뉴스', url: 'https://www.fnnews.com/rss/fn_realnews_all.xml' },
  { name: '서울경제', url: 'https://rss.hankooki.com/economy/sk_main.xml' },
  { name: '한국일보', url: 'https://rss.hankooki.com/news/hk_main.xml' },
  { name: '노컷뉴스', url: 'https://rss.nocutnews.co.kr/NocutEconomy.xml' },
  { name: 'MBC', url: 'https://imnews.imbc.com/rss/news/news_05.xml' },
  { name: '세계일보', url: 'https://rss.segye.com/segye_economy.xml' },
  { name: '고용노동부', url: 'https://www.moel.go.kr/rss/rss.do?menu_cd=A0002' },
];

// RSS 파싱
async function fetchRSS(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(text)) !== null) {
      const block = match[1];
      const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                     block.match(/<title>(.*?)<\/title>/))?.[1]?.trim();
      const link  = (block.match(/<link>(.*?)<\/link>/) ||
                     block.match(/<link\s+href="(.*?)"/))?.[1]?.trim();
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim();
      if (title && link) {
        items.push({ title, link, pubDate, source: source.name });
      }
    }
    return items.slice(0, 20); // 소스당 최대 20개
  } catch {
    return [];
  }
}

// Claude로 HR 관련 기사 판단 + 요약
async function filterAndSummarize(articles) {
  const articleList = articles
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}`)
    .join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `당신은 스타벅스 인사팀 담당자를 위한 HR 뉴스 큐레이터입니다.

아래 기사 목록에서 HR 담당자에게 중요한 기사를 골라 요약해주세요.

선별 기준:
- 노동법·근로기준법 개정, 판결
- 최저임금·임금·성과급·퇴직금
- 4대보험·고용보험·산재보험
- 채용·해고·노사관계·파업
- HR트렌드·조직문화·재택근무
- 정부 고용정책·보도자료

응답 형식 (JSON만, 다른 텍스트 없이):
{
  "articles": [
    {
      "rank": 1,
      "title": "기사제목",
      "source": "언론사",
      "summary": "2-3줄 핵심 요약",
      "importance": "high/medium",
      "tag": "노동법/보상/채용/노사/HR트렌드/4대보험 중 하나",
      "action": "즉시확인필요 또는 참고"
    }
  ]
}

최대 15개 선별. HR과 무관한 기사는 제외.

기사 목록:
${articleList}`,
      }],
    }),
  });

  const data = await response.json();
  if (!data.content || !data.content[0]) throw new Error('Claude 응답 없음: ' + JSON.stringify(data));
  const raw = data.content[0].text;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON 없음: ' + raw.slice(0, 300));
  return JSON.parse(match[0]);
}

// 이메일 HTML 생성
function buildEmailHtml(result, date) {
  const tagColors = {
    '노동법': '#ef4444', '보상': '#f59e0b', '채용': '#3b82f6',
    '노사': '#8b5cf6', 'HR트렌드': '#10b981', '4대보험': '#06b6d4',
  };

  const highArticles = result.articles.filter(a => a.importance === 'high');
  const medArticles  = result.articles.filter(a => a.importance === 'medium');

  const renderArticle = (a) => `
    <div style="margin-bottom:16px;padding:16px;background:#f9fafb;border-radius:8px;border-left:4px solid ${tagColors[a.tag] || '#6b7280'}">
      <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
        <span style="background:${tagColors[a.tag] || '#6b7280'};color:white;padding:2px 8px;border-radius:12px;font-size:12px">${a.tag}</span>
        ${a.action === '즉시확인필요' ? '<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:12px">🚨 즉시확인</span>' : ''}
        <span style="color:#9ca3af;font-size:12px">${a.source}</span>
      </div>
      <div style="font-weight:600;margin-bottom:6px;color:#111827">${a.title}</div>
      <div style="color:#4b5563;font-size:14px;line-height:1.6">${a.summary}</div>
    </div>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;padding:20px;background:#ffffff">

  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px;border-radius:12px;margin-bottom:24px">
    <div style="color:white;font-size:22px;font-weight:700">📋 HR 뉴스 브리핑</div>
    <div style="color:#bfdbfe;margin-top:4px">${date} | 오늘의 HR 핵심 뉴스</div>
  </div>

  ${highArticles.length > 0 ? `
  <div style="margin-bottom:24px">
    <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:12px">🚨 오늘의 주요 뉴스 (${highArticles.length}건)</div>
    ${highArticles.map(renderArticle).join('')}
  </div>` : ''}

  ${medArticles.length > 0 ? `
  <div style="margin-bottom:24px">
    <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:12px">📰 참고 뉴스 (${medArticles.length}건)</div>
    ${medArticles.map(renderArticle).join('')}
  </div>` : ''}

  <div style="border-top:1px solid #e5e7eb;padding-top:16px;color:#9ca3af;font-size:12px;text-align:center">
    HR 뉴스 브리핑 | 20개 언론사 자동 수집 · Claude AI 분석
  </div>
</body>
</html>`;
}

// 메인 핸들러
export default async function handler(req, res) {
  // GET 또는 Cron 요청만 허용
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. 모든 RSS 병렬 수집
    const results = await Promise.allSettled(RSS_SOURCES.map(fetchRSS));
    const allArticles = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    if (allArticles.length === 0) {
      return res.status(500).json({ error: '기사 수집 실패' });
    }

    // 2. Claude로 필터링 + 요약
    const filtered = await filterAndSummarize(allArticles);

    // 3. 이메일 발송
    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'HR뉴스 <onboarding@resend.dev>',
        to: [process.env.TO_EMAIL || 'yukhyosung@gmail.com'],
        subject: `[HR브리핑] ${today} - 주요뉴스 ${filtered.articles.length}건`,
        html: buildEmailHtml(filtered, today),
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      return res.status(500).json({ error: '이메일 발송 실패', detail: err });
    }

    return res.status(200).json({
      success: true,
      collected: allArticles.length,
      selected: filtered.articles.length,
      message: '이메일 발송 완료',
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
