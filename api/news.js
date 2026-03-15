export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { keyword, date } = req.query;
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const claudeApiKey = process.env.ANTHROPIC_API_KEY;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Naver API keys not configured' });
  }

  // 노이즈 키워드 - 이런 단어 포함된 기사 제거
  const NOISE_KEYWORDS = [
    '합격', '불합격', '시험일정', '시험공고', '접수기간', '원서접수',
    '자격증', '취득후기', '공부법', '공부방법', '강의추천', '인강',
    '노무사 시험', '노무사 합격', '공인노무사 합격',
    '채용공고', '입사지원', '지원하기', '모집공고',
    '연봉협상 후기', '이직후기', '취업후기', '면접후기',
  ];

  try {
    // 타겟 날짜 (KST)
    let targetDateStr;
    if (date) {
      targetDateStr = date;
    } else {
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      targetDateStr = kst.toISOString().split('T')[0];
    }

    // 네이버 뉴스 100개 수집
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
      return res.status(200).json({ items: [], date: targetDateStr });
    }

    // 1단계: 날짜 필터링 (KST)
    const dateFiltered = data.items.filter(item => {
      try {
        const d = new Date(item.pubDate);
        const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        return kst.toISOString().split('T')[0] === targetDateStr;
      } catch { return false; }
    }).map(item => ({
      title: item.title.replace(/<[^>]+>/g, ''),
      description: item.description.replace(/<[^>]+>/g, ''),
      link: item.originallink || item.link,
      pubDate: item.pubDate,
    }));

    if (dateFiltered.length === 0) {
      return res.status(200).json({ items: [], date: targetDateStr });
    }

    // 2단계: 노이즈 필터링
    const noiseFiltered = dateFiltered.filter(item => {
      const text = item.title + item.description;
      return !NOISE_KEYWORDS.some(kw => text.includes(kw));
    });

    // 3단계: 강화된 중복 제거
    const deduped = [];
    const seenTokens = [];

    for (const item of noiseFiltered) {
      // 제목에서 핵심 토큰 추출 (2글자 이상 단어)
      const tokens = item.title
        .replace(/[^\w가-힣\s]/g, '')
        .split(/\s+/)
        .filter(t => t.length >= 2)
        .slice(0, 6); // 앞 6개 단어만

      // 기존 기사와 토큰 겹침 체크 (50% 이상 겹치면 중복)
      const isDuplicate = seenTokens.some(seen => {
        const overlap = tokens.filter(t => seen.includes(t)).length;
        const similarity = overlap / Math.max(tokens.length, seen.length);
        return similarity >= 0.5;
      });

      if (!isDuplicate) {
        deduped.push(item);
        seenTokens.push(tokens);
      }
    }

    // 5개 이하거나 API Key 없으면 그냥 반환
    if (!claudeApiKey || deduped.length <= 5) {
      return res.status(200).json({ items: deduped.slice(0, 5), date: targetDateStr, aiUsed: false });
    }

    // 4단계: Claude AI로 영향력 TOP 5 선별
    const articleList = deduped.slice(0, 30).map((a, i) =>
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
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `다음 뉴스 목록에서 HR 실무 담당자에게 가장 영향력 있는 기사 5개를 골라줘. 
조건: 실제 인사/노무/경영 실무에 영향을 주는 기사만, 개인 후기나 광고성 기사 제외.
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

    return res.status(200).json({ items: top5, date: targetDateStr, aiUsed: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}