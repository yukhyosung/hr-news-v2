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

  try {
    // 타겟 날짜 (KST 기준)
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

    // 해당 날짜 기사만 필터링 (KST)
    const filtered = data.items.filter(item => {
      try {
        const d = new Date(item.pubDate);
        const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        const itemDate = kst.toISOString().split('T')[0];
        return itemDate === targetDateStr;
      } catch { return false; }
    }).map(item => ({
      title: item.title.replace(/<[^>]+>/g, ''),
      description: item.description.replace(/<[^>]+>/g, ''),
      link: item.originallink || item.link,
      pubDate: item.pubDate,
    }));

    if (filtered.length === 0) {
      return res.status(200).json({ items: [], date: targetDateStr });
    }

    // 중복 제거 (제목 앞 20자 기준)
    const seen = new Set();
    const deduped = filtered.filter(item => {
      const key = item.title.slice(0, 20);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 5개 이하면 바로 반환
    if (!claudeApiKey || deduped.length <= 5) {
      return res.status(200).json({ items: deduped.slice(0, 5), date: targetDateStr });
    }

    // Claude AI로 영향력 top 5 선별
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
          content: `다음 뉴스 목록에서 HR 담당자 관점에서 가장 영향력 있는 기사 5개 인덱스를 JSON 배열로만 응답해. 예: [0,3,5,7,12]\n\n${articleList}`
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
        top5 = indices.slice(0, 5).map(i => deduped[i]).filter(Boolean);
        if (top5.length === 0) top5 = deduped.slice(0, 5);
      }
    } catch { /* fallback */ }

    return res.status(200).json({ items: top5, date: targetDateStr });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
