export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { keyword, mode, date } = req.query;
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Naver API keys not configured' });
  }

  // 노이즈 키워드 - 제목/본문에 포함시 제외
  const NOISE_KEYWORDS = [
    // 자격증/시험
    '합격', '불합격', '시험일정', '시험공고', '접수기간', '원서접수',
    '자격증', '취득후기', '공부법', '공부방법', '강의추천', '인강',
    '노무사 시험', '노무사 합격', '공인노무사 합격',
    // 채용공고
    '입사지원', '지원하기', '모집공고', '채용공고', '채용 중',
    // 개인 후기
    '이직후기', '취업후기', '면접후기', '연봉협상 후기', '취업 성공',
    // 인사발령
    '취임', '임명', '청장', '장관 교체', '인사발령', '임원 선임',
    '대표이사 취임', '신임 대표', '신임 원장', '신임 청장',
    // 투자/주식
    '주식', '코스피', '코스닥', '펀드', '투자',
    // 광고성
    '할인', '이벤트', '프로모션', '신청하세요',
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
      return res.status(200).json({ items: [], filtered: [], period: periodLabel, mode });
    }

    // 1단계: 날짜 필터
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
      return res.status(200).json({ items: [], filtered: [], period: periodLabel, mode });
    }

    // 2단계: 노이즈 필터 (통과 / 걸러짐 분리)
    const passed = [];
    const filtered = [];
    for (const item of dateFiltered) {
      const text = item.title + ' ' + item.description;
      const isNoise = NOISE_KEYWORDS.some(kw => text.includes(kw));
      if (isNoise) filtered.push({ ...item, filterReason: NOISE_KEYWORDS.find(kw => text.includes(kw)) });
      else passed.push(item);
    }

    // 3단계: 중복 제거 (통과된 것만)
    const deduped = [];
    const seenTokens = [];
    for (const item of passed) {
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
      } else {
        filtered.push({ ...item, filterReason: '중복' });
      }
    }

    return res.status(200).json({
      items: deduped.slice(0, 10),       // 메인 TOP 10
      filtered: filtered.slice(0, 20),   // 검토함 (걸러진 기사)
      period: periodLabel,
      mode,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
