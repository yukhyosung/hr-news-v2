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
                     block.match(/<title>(.*?)<\/title>/))?.[1]?.trim().replace(/<[^>]+>/g, '');
      const link = (block.match(/<link>(.*?)<\/link>/) ||
                    block.match(/<link\s+href="(.*?)"/))?.[1]?.trim();
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim();
      const description = (block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                           block.match(/<description>(.*?)<\/description>/))?.[1]?.trim().replace(/<[^>]+>/g, '') || '';
      if (title && link) {
        items.push({ title, link, pubDate, description, sourceName: source.name });
      }
    }
    return items.slice(0, 30);
  } catch {
    return [];
  }
}

const NOISE_KEYWORDS = [
  '합격','불합격','시험일정','시험공고','접수기간','원서접수',
  '자격증','취득후기','공부법','공부방법','강의추천','인강',
  '노무사 시험','노무사 합격',
  '입사지원','지원하기','모집공고',
  '이직후기','취업후기','면접후기',
  '취임','임명','청장','인사발령','임원 선임','신임 대표','신임 청장','부임',
  '주식','코스피','코스닥','펀드',
  '화물연대','경윳값','할인','이벤트','프로모션',
];

const NOISE_EXCEPTION_KEYWORDS = ['고용노동부 장관','노동부 장관','노동위원회 위원장'];

const ALERT_KEYWORDS = [
  '입법예고','법률 개정','시행령 개정','근로기준법 개정',
  '대법원 판결','헌법재판소 결정',
  '최저임금','정년 연장','정년연장',
  '중대재해','특별감독','통상임금','퇴직금 산정',
  '노란봉투법','노조법 개정',
];

const FREQ_KEYWORDS = [
  '주52시간','최저임금','통상임금','퇴직금','성과급','임금인상','포괄임금',
  '노조','파업','단체교섭','노사갈등','부당해고','징계','근로시간',
  '채용','공채','경력채용','구직','취업',
  '재택근무','유연근무','조직문화','HR트렌드',
  '중대재해','고용노동부','노동법','근로기준법',
  '노란봉투법','정년연장','4대보험','육아휴직',
];

const HR_KEYWORDS = [
  '노동','근로','임금','고용','채용','퇴직','성과급','연봉','급여','4대보험',
  '고용보험','산재','건강보험','국민연금','노조','파업','단체협약','노사',
  '근로기준법','최저임금','통상임금','포괄임금','주52시간','재택근무',
  '유연근무','조직문화','인사','HR','부당해고','직장내괴롭힘','육아휴직',
  '출산휴가','정년','중대재해','노란봉투법','고용노동부','근로감독',
];

function isHRRelated(title, description) {
  const text = title + ' ' + description;
  return HR_KEYWORDS.some(kw => text.includes(kw));
}

function analyzeKeywords(items) {
  const freq = {};
  for (const item of items) {
    const text = item.title + ' ' + (item.description || '');
    for (const kw of FREQ_KEYWORDS) {
      if (text.includes(kw)) freq[kw] = (freq[kw] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([kw, count]) => ({ keyword: kw, count }));
}

// Claude API로 HR 기사 선별 + 태그 + 중요도 판단
async function claudeFilter(articles) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return null;

  const articleList = articles
    .map((a, i) => `${i + 1}. [${a.sourceName}] ${a.title}`)
    .join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `당신은 스타벅스 인사팀 담당자를 위한 HR 뉴스 큐레이터입니다.

아래 기사 목록에서 HR 담당자에게 중요한 기사를 모두 선별해주세요. 중요한 기사는 개수 제한 없이 전부 포함하세요.

선별 기준 (해당하면 포함):
- 노동법·근로기준법 개정, 판결, 행정해석
- 최저임금·임금·성과급·퇴직금·통상임금
- 4대보험·고용보험·산재보험·건강보험
- 채용·해고·노사관계·파업·단체협약
- HR트렌드·조직문화·재택근무·유연근무
- 정부 고용정책·보도자료·시행령
- 중대재해·직장내괴롭힘·육아휴직

importance 기준:
- high: 법령 개정, 대법원 판결, 최저임금, 정년, 즉시 업무 영향
- medium: 트렌드, 통계, 일반 HR 이슈

응답 형식 (JSON만, 다른 텍스트 없이):
{
  "articles": [
    {
      "index": 1,
      "title": "기사제목",
      "source": "언론사",
      "importance": "high 또는 medium",
      "tag": "노동법/보상/채용/노사/HR트렌드/4대보험 중 하나",
      "action": "즉시확인필요 또는 참고",
      "issueKey": "관련 이슈명 (없으면 null)"
    }
  ]
}

HR과 무관한 기사는 제외. 중요한 기사는 빠짐없이 포함.

기사 목록:
${articleList}`,
      }],
    }),
  });

  const data = await response.json();
  if (!data.content || !data.content[0]) return null;
  const raw = data.content[0].text;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

function getKST(d) {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { mode } = req.query;
  const now = new Date();
  const kstNow = getKST(now);
  const todayStr = kstNow.toISOString().split('T')[0];

  let startTs, endTs, periodLabel;

  if (mode === 'recent') {
    startTs = now.getTime() - 48 * 60 * 60 * 1000;
    endTs = now.getTime();
    periodLabel = '최근 48시간';
  } else if (mode === 'week') {
    const day = kstNow.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(kstNow);
    monday.setDate(kstNow.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    startTs = monday.getTime() - 9 * 60 * 60 * 1000;
    endTs = now.getTime();
    const startStr = monday.toISOString().split('T')[0];
    periodLabel = `${startStr.slice(5).replace('-','/')} ~ ${todayStr.slice(5).replace('-','/')}`;
  } else if (mode === 'month') {
    const y = kstNow.getFullYear();
    const m = kstNow.getMonth();
    const firstDay = new Date(y, m, 1, 0, 0, 0);
    startTs = firstDay.getTime() - 9 * 60 * 60 * 1000;
    endTs = now.getTime();
    periodLabel = `${y}년 ${kstNow.getMonth()+1}월`;
  } else {
    startTs = now.getTime() - 48 * 60 * 60 * 1000;
    endTs = now.getTime();
    periodLabel = '최근 48시간';
  }

  try {
    // 1. RSS 병렬 수집
    const results = await Promise.allSettled(RSS_SOURCES.map(fetchRSS));
    const rawItems = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    // 2. 날짜 필터 + HR 1차 필터 + 중복 제거
    const seenLinks = new Set();
    const seenTitles = [];
    const allItems = [];
    const filtered = [];

    for (const item of rawItems) {
      if (seenLinks.has(item.link)) continue;
      try {
        const pubTs = new Date(item.pubDate).getTime();
        if (isNaN(pubTs) || pubTs < startTs || pubTs > endTs) continue;
      } catch { continue; }

      // 노이즈 필터
      const text = item.title + ' ' + item.description;
      const hasException = NOISE_EXCEPTION_KEYWORDS.some(kw => text.includes(kw));
      const noiseKw = !hasException && NOISE_KEYWORDS.find(kw => text.includes(kw));
      if (noiseKw) { filtered.push({ ...item, filterReason: noiseKw }); continue; }

      // HR 관련 1차 필터
      if (!isHRRelated(item.title, item.description)) continue;

      // 중복 제거
      const tokens = item.title.replace(/[^\w가-힣\s]/g, '').split(/\s+/).filter(t => t.length >= 2).slice(0, 8);
      let isDup = false;
      for (const seenTokens of seenTitles) {
        const overlap = tokens.filter(t => seenTokens.includes(t)).length;
        if (overlap / Math.max(tokens.length, seenTokens.length) >= 0.7) { isDup = true; break; }
      }
      if (isDup) { filtered.push({ ...item, filterReason: '중복' }); continue; }
      seenTitles.push(tokens);
      seenLinks.add(item.link);
      allItems.push(item);
    }

    if (allItems.length === 0) {
      return res.status(200).json({ issues: [], filtered: [], alerts: [], topKeywords: [], period: periodLabel, mode, total: 0 });
    }

    // 3. Claude API로 2차 선별
    let issues = [];
    try {
      const claudeResult = await claudeFilter(allItems);
      if (claudeResult && claudeResult.articles) {
        // Claude 선별 결과를 기사 원본과 매핑
        issues = claudeResult.articles.map(ca => {
          const original = allItems[ca.index - 1] || allItems.find(a => a.title === ca.title);
          if (!original) return null;
          return {
            issueKey: ca.issueKey || null,
            mainArticle: { ...original, tag: ca.tag, importance: ca.importance },
            relatedArticles: [],
            tag: ca.tag,
            issueScore: ca.importance === 'high' ? 10 : 5,
            isMajorPolicy: ca.importance === 'high',
          };
        }).filter(Boolean);

        // high 먼저 정렬
        issues.sort((a, b) => b.issueScore - a.issueScore);
      }
    } catch (e) {
      // Claude 실패시 룰 기반으로 폴백
      issues = allItems.slice(0, 20).map(item => ({
        issueKey: null,
        mainArticle: { ...item, tag: null, importance: 'medium' },
        relatedArticles: [],
        tag: null,
        issueScore: 5,
        isMajorPolicy: false,
      }));
    }

    const topKeywords = analyzeKeywords(allItems);

    // 알림
    const alerts = [];
    const alertSeen = new Set();
    for (const issue of issues) {
      for (const kw of ALERT_KEYWORDS) {
        if (issue.mainArticle.title.includes(kw) && !alertSeen.has(kw)) {
          alerts.push({ keyword: kw, title: issue.mainArticle.title, link: issue.mainArticle.link });
          alertSeen.add(kw);
          break;
        }
      }
    }

    return res.status(200).json({
      issues,
      filtered: filtered.slice(0, 30),
      alerts,
      topKeywords,
      period: periodLabel,
      mode,
      total: allItems.length,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
