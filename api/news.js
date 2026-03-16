export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { mode, date } = req.query;

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Naver API keys not configured' });
  }

  // 6개 키워드 그룹 (정책 그룹 추가)
  const KEYWORD_GROUPS = [
    { keyword: '근로기준법 노동법개정 주52시간 포괄임금제 통상임금 최저임금 고용노동부' },
    { keyword: '채용시장 공채 경력채용 인재확보 채용트렌드 신입채용 구직시장' },
    { keyword: '임금인상 성과급 연봉협상 임금체계 보상제도 퇴직금 임금체불' },
    { keyword: '노조 파업 단체협약 노사갈등 노동분쟁 쟁의 임금교섭' },
    { keyword: '조직문화 HR트렌드 인사전략 HR테크 재택근무 유연근무 인사제도' },
    { keyword: 'AI 일자리 AI 대체 직업 소멸 자동화 일자리 미래직업 고용충격 AI 채용 디지털전환' },
    { keyword: '노란봉투법 노조법 단체교섭 원청교섭 하청노조 손해배상 노동부지침 근로기준법개정 대법원판결 헌재결정 통상임금 입법예고' },
  ];

  const TAG_RULES = [
    { tag: '노동법', keywords: ['근로기준법','노동법','주52시간','포괄임금','통상임금','최저임금','근로시간','고용노동부','입법예고','시행령','법 개정','판결','대법원','헌법재판소','행정해석','중대재해','노란봉투법','노조법'] },
    { tag: '채용',   keywords: ['채용','공채','경력채용','신입채용','채용시장','구직','취업','인재확보','헤드헌팅'] },
    { tag: '보상',   keywords: ['임금','성과급','연봉','퇴직금','보상','급여','수당','임금체불','통상임금'] },
    { tag: '노사',   keywords: ['노조','파업','단체협약','노사갈등','쟁의','노동분쟁','교섭','노동위원회','부당해고','징계','원청교섭','하청노조'] },
    { tag: 'HR트렌드', keywords: ['조직문화','HR트렌드','인사전략','HR테크','재택','유연근무','인사제도','복지','AI 일자리','AI 대체','직업 소멸','자동화','디지털전환'] },
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

  // 주요 정책 키워드 → 강제 TOP 노출 + 점수 +3
  const MAJOR_POLICY_KEYWORDS = [
    '노란봉투법','근로기준법 개정','대법원 판결','대법원판결',
    '최저임금','정년연장','정년 연장','중대재해처벌법',
    '헌법재판소','헌재 결정','입법예고','통상임금',
    '노조법','노동조합법','원청 교섭','손해배상 노조',
  ];

  // 이슈 클러스터 그룹 (같은 이슈로 묶을 키워드 세트)
  const ISSUE_CLUSTER_GROUPS = [
    { issueKey: '노란봉투법', keywords: ['노란봉투법','노조법 2조','노조법 3조','원청교섭','원청 교섭','하청노조','단체교섭 원청'] },
    { issueKey: '최저임금', keywords: ['최저임금'] },
    { issueKey: '통상임금', keywords: ['통상임금'] },
    { issueKey: '중대재해처벌법', keywords: ['중대재해처벌법','중대재해 처벌','중대재해법'] },
    { issueKey: '정년연장', keywords: ['정년연장','정년 연장','65세 정년','정년 60'] },
    { issueKey: '퇴직금', keywords: ['퇴직금','퇴직연금'] },
    { issueKey: '주52시간', keywords: ['주52시간','주 52시간','근로시간 단축','근로시간 개편'] },
    { issueKey: '포괄임금', keywords: ['포괄임금','포괄임금제'] },
    { issueKey: '육아휴직', keywords: ['육아휴직','출산휴가','아빠 휴가'] },
    { issueKey: '4대보험', keywords: ['4대보험','고용보험','산재보험','건강보험 직장'] },
    { issueKey: '노조·파업', keywords: ['파업','쟁의','노사갈등','단체협약','노사협상'] },
    { issueKey: '부당해고', keywords: ['부당해고','해고 무효','복직 명령'] },
    { issueKey: '채용', keywords: ['채용','공채','신입채용','경력채용'] },
    { issueKey: '성과급', keywords: ['성과급','경영성과급','인센티브'] },
    { issueKey: '임금체불', keywords: ['임금체불','체불','임금 미지급'] },
    { issueKey: '직장내괴롭힘', keywords: ['직장내괴롭힘','직장 내 괴롭힘','괴롭힘 금지'] },
    { issueKey: '조직문화', keywords: ['조직문화','HR트렌드','워라밸','재택근무','유연근무'] },
    { issueKey: '고용노동부', keywords: ['고용노동부','노동부 발표','근로감독','특별감독'] },
    { issueKey: 'AI·일자리', keywords: ['AI 일자리','AI 대체','직업 소멸','자동화 일자리','AI 채용','디지털전환 고용','미래 직업','일자리 위기'] },
  ];

  // 주요 언론사 (대표 기사 선정 우선순위)
  const MAJOR_SOURCES = [
    '연합뉴스','yonhapnews',
    '중앙일보','joongang',
    '조선일보','chosun',
    '한겨레','hani',
    '경향신문','khan',
    '동아일보','donga',
    '한국경제','hankyung',
    '매일경제','mk',
    '서울경제','sedaily',
    '뉴스1','news1',
  ];

  function getKST(d) {
    return new Date(d.getTime() + 9 * 60 * 60 * 1000);
  }

  const now = new Date();
  const kstNow = getKST(now);
  const todayStr = kstNow.toISOString().split('T')[0];

  const baseDateStr = date || todayStr;
  const baseDate = new Date(baseDateStr + 'T12:00:00+09:00');

  let startDate, endDate, periodLabel;
  if (mode === 'week') {
    const day = baseDate.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() - diff);
    startDate = monday.toISOString().split('T')[0];
    endDate = baseDateStr;
    periodLabel = `${startDate.slice(5).replace('-','/')} ~ ${endDate.slice(5).replace('-','/')}`;
  } else if (mode === 'month') {
    const y = baseDate.getFullYear();
    const m = baseDate.getMonth() + 1;
    startDate = `${y}-${String(m).padStart(2,'0')}-01`;
    endDate = baseDateStr;
    periodLabel = `${y}년 ${m}월`;
  } else {
    startDate = baseDateStr;
    endDate = baseDateStr;
    periodLabel = baseDateStr === todayStr ? '오늘' : baseDateStr.slice(5).replace('-','/');
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

  function extractIssueKey(title) {
    for (const group of ISSUE_CLUSTER_GROUPS) {
      if (group.keywords.some(kw => title.includes(kw))) {
        return group.issueKey;
      }
    }
    return null;
  }

  function checkMajorPolicy(title) {
    return MAJOR_POLICY_KEYWORDS.some(kw => title.includes(kw));
  }

  function getSourceScore(link) {
    const lowerLink = (link || '').toLowerCase();
    const idx = MAJOR_SOURCES.findIndex(s => lowerLink.includes(s.toLowerCase()));
    if (idx === -1) return 0;
    return Math.max(0, 5 - Math.floor(idx / 2));
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

  const PRIORITY_KWS = [
    '대법원','헌법재판소','판결','입법예고','시행령','개정안',
    '임금체불','퇴직금','통상임금','최저임금','4대보험',
    '중대재해','특별감독','부당해고','노란봉투법','정년연장',
  ];

  try {
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

    const passed = [];
    const filtered = [];
    for (const item of allItems) {
      const text = item.title + ' ' + item.description;
      const noiseKw = NOISE_KEYWORDS.find(kw => text.includes(kw));
      if (noiseKw) {
        filtered.push({ ...item, filterReason: noiseKw });
      } else {
        const tag = classifyTag(item.title, item.description);
        const issueKey = extractIssueKey(item.title);
        const majorPolicy = checkMajorPolicy(item.title);
        const sourceScore = getSourceScore(item.link);
        let score = PRIORITY_KWS.filter(kw => item.title.includes(kw)).length;
        if (majorPolicy) score += 3;
        score += sourceScore;
        passed.push({ ...item, tag, score, issueKey, majorPolicy });
      }
    }

    passed.sort((a, b) => b.score - a.score);

    const issueMap = {};
    const noIssueArticles = [];
    const seenTitles = [];

    for (const item of passed) {
      const tokens = item.title.replace(/[^\w가-힣\s]/g, '').split(/\s+/).filter(t => t.length >= 2).slice(0, 8);
      let isDup = false;
      for (const seenTokens of seenTitles) {
        const overlap = tokens.filter(t => seenTokens.includes(t)).length;
        if (overlap / Math.max(tokens.length, seenTokens.length) >= 0.5) { isDup = true; break; }
      }
      if (isDup) { filtered.push({ ...item, filterReason: '중복' }); continue; }
      seenTitles.push(tokens);

      if (item.issueKey) {
        if (!issueMap[item.issueKey]) {
          issueMap[item.issueKey] = { issueKey: item.issueKey, articles: [], tag: item.tag, maxScore: 0, hasMajorPolicy: false };
        }
        issueMap[item.issueKey].articles.push(item);
        if (item.score > issueMap[item.issueKey].maxScore) {
          issueMap[item.issueKey].maxScore = item.score;
          issueMap[item.issueKey].tag = item.tag;
        }
        if (item.majorPolicy) issueMap[item.issueKey].hasMajorPolicy = true;
      } else {
        noIssueArticles.push(item);
      }
    }

    const issues = Object.values(issueMap).map(issue => {
      // 언론사 우선순위로 대표 기사 선정
      const sorted = [...issue.articles].sort((a, b) => {
        const aSource = getSourceScore(a.link);
        const bSource = getSourceScore(b.link);
        if (bSource !== aSource) return bSource - aSource;
        return b.score - a.score;
      });
      const mainArticle = sorted[0];
      const relatedArticles = sorted.slice(1);
      let issueScore = mainArticle.score + relatedArticles.length * 0.5;
      if (issue.hasMajorPolicy) issueScore += 5;
      return { issueKey: issue.issueKey, mainArticle, relatedArticles, tag: issue.tag, issueScore, isMajorPolicy: issue.hasMajorPolicy };
    });

    // 정책 이슈 먼저, 그 다음 점수 순
    issues.sort((a, b) => {
      if (a.isMajorPolicy && !b.isMajorPolicy) return -1;
      if (!a.isMajorPolicy && b.isMajorPolicy) return 1;
      return b.issueScore - a.issueScore;
    });

    for (const item of noIssueArticles) {
      issues.push({ issueKey: null, mainArticle: item, relatedArticles: [], tag: item.tag, issueScore: item.score, isMajorPolicy: item.majorPolicy });
    }

    const top5Issues = issues.slice(0, 5);
    const topKeywords = analyzeKeywords(passed);

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

    return res.status(200).json({ issues: top5Issues, filtered: filtered.slice(0, 30), alerts, topKeywords, period: periodLabel, mode, total: allItems.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}