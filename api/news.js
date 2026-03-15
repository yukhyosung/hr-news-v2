export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { mode, date } = req.query;

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Naver API keys not configured' });
  }

  const KEYWORD_GROUPS = [
    { keyword: '근로기준법 노동법개정 주52시간 포괄임금제 통상임금 최저임금 고용노동부' },
    { keyword: '채용시장 공채 경력채용 인재확보 채용트렌드 신입채용 구직시장' },
    { keyword: '임금인상 성과급 연봉협상 임금체계 보상제도 퇴직금 임금체불' },
    { keyword: '노조 파업 단체협약 노사갈등 노동분쟁 쟁의 임금교섭' },
    { keyword: '조직문화 HR트렌드 인사전략 HR테크 재택근무 유연근무 인사제도' },
  ];

  const TAG_RULES = [
    { tag: '노동법', keywords: ['근로기준법','노동법','주52시간','포괄임금','통상임금','최저임금','근로시간','고용노동부','입법예고','시행령','법 개정','판결','대법원','헌법재판소','행정해석','중대재해'] },
    { tag: '채용',   keywords: ['채용','공채','경력채용','신입채용','채용시장','구직','취업','인재확보','헤드헌팅'] },
    { tag: '보상',   keywords: ['임금','성과급','연봉','퇴직금','보상','급여','수당','임금체불','통상임금'] },
    { tag: '노사',   keywords: ['노조','파업','단체협약','노사갈등','쟁의','노동분쟁','교섭','노동위원회','부당해고','징계'] },
    { tag: 'HR트렌드', keywords: ['조직문화','HR트렌드','인사전략','HR테크','재택','유연근무','인사제도','복지'] },
  ];

  const NOISE_KEYWORDS = [
    '합격','불합격','시험일정','시험공고','접수기간','원서접수',
    '자격증','취득후기','공부법','공부방법','강의추천','인강',
    '노무사 시험','노무사 합격',
    '입사지원','지원하기','모집공고',
    '이직후기','취업후기','면접후기',
    '취임','임명','청장','인사발령','임원 선임','신임 대표','신임 청장','부임',
    '러닝화','스니커즈','출근 복장',
    '출범식','개소식','수강신청','어깨동무','MOU 체결',
    '주식','코스피','코스닥','펀드',
    '화물연대','경윳값','할인','이벤트','프로모션',
  ];

  const ALERT_KEYWORDS = [
    '입법예고','법률 개정','시행령 개정','근로기준법 개정',
    '대법원 판결','헌법재판소 결정',
    '최저임금','정년 연장','정년연장',
    '중대재해','특별감독','통상임금','퇴직금 산정',
  ];

  const FREQ_KEYWORDS = [
    '주52시간','최저임금','통상임금','퇴직금','성과급','임금인상','포괄임금',
    '노조','파업','단체교섭','노사갈등','부당해고','징계','근로시간',
    '채용','공채','경력채용','구직','취업',
    '재택근무','유연근무','조직문화','HR트렌드',
    '중대재해','고용노동부','노동법','근로기준법',
    '노란봉투법','정년연장','4대보험','육아휴직',
  ];

  // 이슈 클러스터링 키워드 (제목에서 추출할 핵심 이슈어)
  const ISSUE_KEYWORDS = [
    '노란봉투법','중대재해처벌법','최저임금','통상임금','퇴직금','주52시간','포괄임금',
    '정년연장','육아휴직','출산휴가','4대보험','고용보험','산재보험',
    '노조','파업','단체교섭','임금체불','부당해고',
    '채용','공채','경력채용','희망퇴직','구조조정',
    '성과급','연봉','임금인상','임금협상',
    '재택근무','유연근무','주4일','워라밸',
    '조직문화','직장내괴롭힘','성희롱',
    '고용노동부','근로감독','특별감독',
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

  function classifyTag(title, description) {
    const text = title + ' ' + description;
    const scores = TAG_RULES.map(rule => ({
      tag: rule.tag,
      score: rule.keywords.filter(kw => text.includes(kw)).length,
    }));
    scores.sort((a, b) => b.score - a.score);
    return scores[0].score > 0 ? scores[0].tag : null;
  }

  function extractIssueKeyword(title) {
    // 제목에서 가장 먼저 매칭되는 이슈 키워드 반환
    for (const kw of ISSUE_KEYWORDS) {
      if (title.includes(kw)) return kw;
    }
    // 없으면 제목 앞 10자 기준 (느슨한 그룹핑)
    return null;
  }

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

  const PRIORITY_KWS = ['대법원','헌법재판소','판결','입법예고','시행령','개정안','임금체불','퇴직금','통상임금','최저임금','4대보험','중대재해','특별감독','부당해고','노란봉투법','정년연장'];

  try {
    // 5개 그룹 병렬 API 호출
    const groupResults = await Promise.all(
      KEYWORD_GROUPS.map(async group => {
        const query = encodeURIComponent(group.keyword);
        const r = await fetch(
          `https://openapi.naver.com/v1/search/news.json?query=${query}&display=100&sort=date`,
          { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret } }
        );
        const d = await r.json();
        return d.items || [];
      })
    );

    // 합치기 + 날짜 필터
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
      return res.status(200).json({ issues: [], filtered: [], alerts: [], topKeywords: [], period: periodLabel, mode });
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
        const tag = classifyTag(item.title, item.description);
        const score = PRIORITY_KWS.filter(kw => item.title.includes(kw)).length;
        const issueKw = extractIssueKeyword(item.title);
        passed.push({ ...item, tag, score, issueKw });
      }
    }

    // 우선순위 정렬
    passed.sort((a, b) => b.score - a.score);

    // 이슈 클러스터링
    const issueMap = {}; // issueKw → { articles[] }
    const noIssueArticles = [];
    const seenTitles = new Set();

    for (const item of passed) {
      // 제목 중복 체크 (토큰 유사도)
      const tokens = item.title.replace(/[^\w가-힣\s]/g, '').split(/\s+/).filter(t => t.length >= 2).slice(0, 8);
      let isDup = false;
      for (const seen of seenTitles) {
        const seenTokens = seen.split('|');
        const overlap = tokens.filter(t => seenTokens.includes(t)).length;
        if (overlap / Math.max(tokens.length, seenTokens.length) >= 0.5) { isDup = true; break; }
      }
      if (isDup) { filtered.push({ ...item, filterReason: '중복' }); continue; }
      seenTitles.add(tokens.join('|'));

      if (item.issueKw) {
        if (!issueMap[item.issueKw]) {
          issueMap[item.issueKw] = { issueKw: item.issueKw, articles: [], tag: item.tag, maxScore: 0 };
        }
        issueMap[item.issueKw].articles.push(item);
        if (item.score > issueMap[item.issueKw].maxScore) {
          issueMap[item.issueKw].maxScore = item.score;
          issueMap[item.issueKw].tag = item.tag;
        }
      } else {
        noIssueArticles.push(item);
      }
    }

    // 이슈 점수 계산 및 정렬
    const issues = Object.values(issueMap).map(issue => {
      const mainArticle = issue.articles[0]; // 이미 score 기준 정렬됨
      const relatedArticles = issue.articles.slice(1);
      const issueScore = mainArticle.score + relatedArticles.length * 0.5;
      return { issueKw: issue.issueKw, mainArticle, relatedArticles, tag: issue.tag, issueScore };
    });
    issues.sort((a, b) => b.issueScore - a.issueScore);

    // 이슈 없는 기사도 단독 이슈로 추가
    for (const item of noIssueArticles) {
      issues.push({ issueKw: null, mainArticle: item, relatedArticles: [], tag: item.tag, issueScore: item.score });
    }

    const top5Issues = issues.slice(0, 5);

    // 키워드 빈도 분석
    const allPassedItems = passed.filter(p => !filtered.find(f => f.link === p.link));
    const topKeywords = analyzeKeywords(allPassedItems);

    // 알림 감지
    const alerts = [];
    const alertSeen = new Set();
    for (const issue of top5Issues) {
      for (const kw of ALERT_KEYWORDS) {
        if (issue.mainArticle.title.includes(kw) && !alertSeen.has(kw)) {
          alerts.push({ keyword: kw, title: issue.mainArticle.title, link: issue.mainArticle.link });
          alertSeen.add(kw);
          break;
        }
      }
    }

    return res.status(200).json({
      issues: top5Issues,
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
