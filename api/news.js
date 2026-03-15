export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { keyword, mode, date } = req.query;
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const claudeApiKey = process.env.ANTHROPIC_API_KEY;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Naver API keys not configured' });
  }

  const NOISE_KEYWORDS = [
    '합격', '불합격', '시험일정', '시험공고', '접수기간', '원서접수',
    '자격증', '취득후기', '공부법', '공부방법', '강의추천', '인강',
    '노무사 시험', '노무사 합격', '공인노무사 합격',
    '입사지원', '지원하기', '모집공고', '채용공고',
    '이직후기', '취업후기', '면접후기', '연봉협상 후기',
    '주식', '코스피', '코스닥', '펀드', '투자',
  ];

  function getKST(d) {
    return new Date(d.getTime() + 9 * 60 * 60 * 1000);
  }

  const now = new Date();
  const kstNow = getKST(now);
  const todayStr = kstNow.toISOString().split('T')[0];

  let startDate, endDate, periodLabel;

  if (mode === 'week') {
    const day = kstNow.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(kstNow);
    monday.setDate(kstNow.getDate() - diff);
    startDate = monday.toISOString().split('T')[0];
    endDate = todayStr;
    periodLabel = `${startDate.slice(5).replace('-','/')} ~ ${endDate.slice(5).replace('-','/')}`;
  } else if (mode === 'month') {
    startDate = `${kstNow.getFullYear()}-${String(kstNow.getMonth()+1).padStart(2,'0')}-01`;
    endDate = todayStr;
    periodLabel = `${kstNow.getFullYear()}년 ${kstNow.getMonth()+1}월`;
  } else {
    const targetDate = date || todayStr;
    startDate = targetDate;
    endDate = targetDate;
    periodLabel = targetDate === todayStr ? '오늘' : targetDate.slice(5).replace('-','/');
  }

  try {
    const query = encodeURIComponent(keyword);
    const response = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${query}&display=100&sort=date`,
      {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      }
    );
    const data = await response.json();
    if (!data.items || data.items.length === 0) {
      return res.status(200).json({ items: [], period: periodLabel, mode });
    }

    // 날짜 필터
    const dateFiltered = data.items.filter(item => {
      try {
        const d = new Date(item.pubDate);
        const kst = getKST(d);
        const itemDate = kst.toISOString().split('T')[0];
        return itemDate >= startDate && itemDate <= endDate;
      } catch { return false; }
    }).map(item => ({
      title: item.title.replace(/<[^>]+>/g, ''),
      description: item.description.replace(/<[^>]+>/g, ''),
      link: item.originallink || item.link,
      pubDate: item.pubDate,
    }));

    if (dateFiltered.length === 0) {
      return res.status(200).json({ items: [], period: periodLabel, mode });
    }

    // 노이즈 필터
    const noiseFiltered = dateFiltered.filter(item => {
      const text = item.title + ' ' + item.description;
      return !NOISE_KEYWORDS.some(kw => text.includes(kw));
    });

    // 중복 제거
    const deduped = [];
    const seenTokens = [];
    for (const item of noiseFiltered) {
      const tokens = item.title
        .replace(/[^\w가-힣\s]/g, '')
        .split(/\s+/)
        .filter(t => t.length >= 2)
        .slice(0, 8);
      const isDuplicate = seenTokens.some(seen => {
        const overlap = tokens.filter(t => seen.includes(t)).length;
        return overlap / Math.max(tokens.length, seen.length) >= 0.5;
      });
      if (!isDuplicate) {
        deduped.push(item);
        seenTokens.push(tokens);
      }
    }

    if (!claudeApiKey || deduped.length <= 5) {
      return res.status(200).json({ items: deduped.slice(0, 5), period: periodLabel, mode, aiUsed: false });
    }

    // AI TOP 5 선별
    const articleList = deduped.slice(0, 40).map((a, i) =>
      `[${i}] 제목: ${a.title}\n내용: ${a.description}`
    ).join('\n\n');

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `너는 대형 서비스/음료 프랜차이즈 기업(스타벅스)의 인사팀 담당자야. 동료들과 공유할 가치 있는 뉴스 TOP 5를 골라줘.

선별 우선순위:
1순위: 최저임금/임금/퇴직금/퇴직연금/4대보험/연차/근태 관련 법 개정 또는 입법예정
2순위: 근로계약/해고/성과급/임금 관련 대법원·헌재 판결
3순위: 고용노동부 주요 정책 발표, 서비스업/유통업 인사 이슈
4순위: 채용트렌드/조직문화/성과관리/인재개발 사례
5순위: 고용지표/노동시장/소비경기 동향

제외: 개인후기, 광고성, 단순인사발령, 중복내용

반드시 JSON 배열로만 응답. 예: [0,3,5,7,12]

${articleList}`
        }]
      })
    });

    const aiData = await aiRes.json();
    const aiText = aiData.content?.[0]?.text || '';

    let top5 = deduped.slice(0, 5);
    try {
      const match = aiText.match(/\[[\d,\s]+\]/);
      if (match) {
        const indices = JSON.parse(match[0]);
        const picked = indices.slice(0, 5).map(i => deduped[i]).filter(Boolean);
        if (picked.length > 0) top5 = picked;
      }
    } catch { /* fallback */ }

    return res.status(200).json({ items: top5, period: periodLabel, mode, aiUsed: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
