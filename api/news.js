export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { mode, date } = req.query;

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Naver API keys not configured' });
  }

  // ✅ 5개 그룹 키워드 세트 (API 5회 호출)
  const KEYWORD_GROUPS = [
    { id: 'labor',   label: '노동법·정책', keyword: '근로기준법 노동법개정 주52시간 포괄임금제 통상임금 최저임금 고용노동부' },
    { id: 'recruit', label: '채용·취업',   keyword: '채용시장 공채 경력채용 인재확보 채용트렌드 신입채용 구직시장' },
    { id: 'reward',  label: '보상·임금',   keyword: '임금인상 성과급 연봉협상 임금체계 보상제도 퇴직금 임금체불' },
    { id: 'labor_rel', label: '노사관계',  keyword: '노조 파업 단체협약 노사갈등 노동분쟁 쟁의 임금교섭' },
    { id: 'hr_trend', label: 'HR트렌드',   keyword: '조직문화 HR트렌드 인사전략 HR테크 재택근무 유연근무 인사제도' },
  ];

  // 🏷️ 태그 매핑 - 제목/본문 키워드 → 태그
  const TAG_RULES = [
    { tag: '노동법', keywords: ['근로기준법','노동법','주52시간','포괄임금','통상임금','최저임금','근로시간','고용노동부','입법예고','시행령','법 개정','판결','대법원','헌법재판소','행정해석','노동부','중대재해'] },
    { tag: '채용',   keywords: ['채용','공채','경력채용','신입채용','채용시장','구직','취업','인재확보','헤드헌팅','채용공고'] },
    { tag: '보상',   keywords: ['임금','성과급','연봉','퇴직금','보상','급여','수당','인상','임금체불','통상임금'] },
    { tag: '노사',   keywords: ['노조','파업','단체협약','노사갈등','쟁의','노동분쟁','교섭','노동위원회','부당해고','징계'] },
    { tag: 'HR트렌드', keywords: ['조직문화','HR트렌드','인사전략','HR테크','재택','유연근무','인사제도','MZ','직장문화','복지'] },
  ];

  // ❌ 노이즈 필터
  const NOISE_KEYWORDS = [
    '합격','불합격','시험일정','시험공고','접수기간','원서접수',
    '자격증','취득후기','공부법','공부방법','강의추천','인강',
    '노무사 시험','노무사 합격',
    '입사지원','지원하기','모집공고',
    '이직후기','취업후기','면접후기',
    '취임','임명','청장','인사발령','임원 선임','신임 대표','신임 청장',
    '부임','승진 인사',
    '러닝화','스니커즈','출근 복장',
    '무료법률상담','출범식','개소식',
    '수강신청','어깨동무','MOU 체결',
    '주식','코스피','코스닥','펀드',
    '화물연대','경윳값','건설현장 사고',
    '할인','이벤트','프로모션',
  ];

  // 🔔 알림 키워드
  const ALERT_KEYWORDS = [
    '입법예고','법률 개정','시행령 개정','근로기준법 개정',
    '대법원 판결','헌법재판소 결정',
    '최저임금','정년 연장','정년연장',
    '중대재해','특별감독','통상임금','퇴직금 산정',
  ];

  // 📊 HR 키워드 빈도 분석용 키워드 목록
  const FREQ_KEYWORDS = [
    '주52시간','최저임금','통상임금','퇴직금','성과급','임금인상','포괄임금',
    '노조','파업','단체교섭','노사갈등','부당해고','징계','근로시간',
    '채용','공채','경력채용','구직','취업','인재',
    '재택근무','유연근무','조직문화','HR트렌드',
    '중대재해','산업재해','고용노동부','노동법','근로기준법',
    '노란봉투법','정년연장','4대보험','육아휴직','출산',
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

  // 태그 분류 함수
  function classifyTag(title, description) {
    const text = title + ' ' + description;
    const scores = TAG_RULES.map(rule => ({
      tag: rule.tag,
      score: rule.keywords.filter(kw => text.includes(kw)).length,
    }));
    scores.sort((a, b) => b.score - a.score);
    return scores[0].score > 0 ? scores[0].tag : null;
  }

  // 키워드 빈도 분석 함수
  function analyzeKeywords(items) {
    const freq = {};
    for (const item of items) {
      const text = item.title + ' ' + item.description;
      for (const kw of FREQ_KEYWORDS) {
        if (text.includes(kw)) freq[kw] = (freq[kw] || 0) + 1;
      }
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([kw, count]) => ({ keyword: kw, count }));
  }

  try {
    // 5개 그룹 병렬 API 호출
    const groupResults = await Promise.all(
      KEYWORD_GROUPS.map(async group => {
        const query = encodeURIComponent(group.keyword);
        const res = await fetch(
          `https://openapi.naver.com/v1/search/news.json?query=${query}&display=100&sort=date`,
          { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret } }
        );
        const data = await res.json();
        return data.items || [];
      })
    );

    // 전체 기사 합치기 + 날짜 필터
    const allItems = [];
    const seenLinks = new Set();
    for (const items of groupResults) {
      for (const item of items) {
        if (seenLinks.has(item.link)) continue;
        try {
          const d = new Date(item.pubDate);
          const kst = getKST(d);
          const itemDate = kst.toISOString().split('T')[0];
          if (itemDate < startDate || itemDate > endDate) continue;
        } catch { continue; }
        seenLinks.add(item.link);
        allItems.push({
          title: item.title.replace(/<[^>]+>/g, ''),
          description: item.description.replace(/<[^>]+>/g, ''),
          link: item.originallink || item.link,
          pubDate: item.pubDate,
        });
      }
    }

    if (allItems.length === 0) {
      return res.status(200).json({ items: [], filtered: [], alerts: [], topKeywords: [], period: periodLabel, mode });
    }

    // 노이즈 필터
    const passed = [];
    const filtered = [];
    for (const item of allItems) {
      const text = item.title + ' ' + item.description;
      const noiseKw = NOISE_KEYWORDS.find(kw => text.includes(kw));
      if (noiseKw) {
        filtered.push({ ...item, filterReason: noiseKw });
      } else {
        // 태그 분류 + 우선순위 점수
        const tag = classifyTag(item.title, item.description);
        const PRIORITY_KWS = ['대법원','헌법재판소','판결','입법예고','시행령','개정안','임금체불','퇴직금','통상임금','최저임금','4대보험','중대재해','특별감독','기획감독','부당해고','노란봉투법','정년연장'];
        const score = PRIORITY_KWS.filter(kw => item.title.includes(kw)).length;
        passed.push({ ...item, tag, score });
      }
    }

    // 우선순위 정렬 후 중복 제거
    passed.sort((a, b) => b.score - a.score);
    const deduped = [];
    const seenTokens = [];
    for (const item of passed) {
      const tokens = item.title.replace(/[^\w가-힣\s]/g, '').split(/\s+/).filter(t => t.length >= 2).slice(0, 8);
      const isDuplicate = seenTokens.some(seen => {
        const overlap = tokens.filter(t => seen.includes(t)).length;
        return overlap / Math.max(tokens.length, seen.length) >= 0.5;
      });
      if (!isDuplicate) { deduped.push(item); seenTokens.push(tokens); }
      else filtered.push({ ...item, filterReason: '중복' });
    }

    // 키워드 빈도 분석
    const topKeywords = analyzeKeywords(deduped.slice(0, 20));

    // 알림 감지
    const alerts = [];
    const alertSeen = new Set();
    for (const item of deduped.slice(0, 10)) {
      for (const kw of ALERT_KEYWORDS) {
        if (item.title.includes(kw) && !alertSeen.has(kw)) {
          alerts.push({ keyword: kw, title: item.title, link: item.link });
          alertSeen.add(kw);
          break;
        }
      }
    }

    return res.status(200).json({
      items: deduped.slice(0, 5),
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
