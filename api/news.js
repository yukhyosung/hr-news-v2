// RSS 기반 뉴스 수집 (네이버 API 대체)
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
  '출범식','개소식','수강신청','MOU 체결',
  '주식','코스피','코스닥','펀드',
  '화물연대','경윳값','할인','이벤트','프로모션',
];

// 노동정책 관련 취임은 유지
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

const MAJOR_POLICY_KEYWORDS = [
  '노란봉투법','근로기준법 개정','대법원 판결','대법원판결',
  '최저임금','정년연장','정년 연장','중대재해처벌법',
  '헌법재판소','헌재 결정','입법예고','통상임금',
  '노조법','노동조합법','원청 교섭','손해배상 노조',
];

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

const MAJOR_SOURCES = [
  '연합뉴스','뉴시스','중앙일보','조선일보','한겨레','경향신문',
  '동아일보','한국경제','매일경제','서울경제','고용노동부',
];

// HR 관련 키워드 (RSS는 전체 기사 수집이므로 HR 필터 필요)
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
    if (group.keywords.some(kw => title.includes(kw))) return group.issueKey;
  }
  return null;
}

function checkMajorPolicy(title) {
  return MAJOR_POLICY_KEYWORDS.some(kw => title.includes(kw));
}

function getSourceScore(sourceName) {
  const idx = MAJOR_SOURCES.indexOf(sourceName);
  if (idx === -1) return 0;
  return Math.max(0, 5 - idx);
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
    // RSS 병렬 수집
    const results = await Promise.allSettled(RSS_SOURCES.map(fetchRSS));
    const rawItems = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    // 날짜 필터 + HR 관련 필터 + 중복 제거
    const seenLinks = new Set();
    const allItems = [];

    for (const item of rawItems) {
      if (seenLinks.has(item.link)) continue;
      try {
        const pubTs = new Date(item.pubDate).getTime();
        if (isNaN(pubTs) || pubTs < startTs || pubTs > endTs) continue;
      } catch { continue; }
      if (!isHRRelated(item.title, item.description)) continue;
      seenLinks.add(item.link);
      allItems.push(item);
    }

    if (allItems.length === 0) {
      return res.status(200).json({ issues: [], filtered: [], alerts: [], topKeywords: [], period: periodLabel, mode, total: 0 });
    }

    // 노이즈 필터
    const passed = [];
    const filtered = [];
    for (const item of allItems) {
      const text = item.title + ' ' + item.description;
      const hasException = NOISE_EXCEPTION_KEYWORDS.some(kw => text.includes(kw));
      const noiseKw = !hasException && NOISE_KEYWORDS.find(kw => text.includes(kw));
      if (noiseKw) {
        filtered.push({ ...item, filterReason: noiseKw });
      } else {
        const tag = classifyTag(item.title, item.description);
        const issueKey = extractIssueKey(item.title);
        const majorPolicy = checkMajorPolicy(item.title);
        const sourceScore = getSourceScore(item.sourceName);
        let score = PRIORITY_KWS.filter(kw => item.title.includes(kw)).length;
        if (majorPolicy) score += 3;
        score += sourceScore;
        passed.push({ ...item, tag, score, issueKey, majorPolicy });
      }
    }

    passed.sort((a, b) => b.score - a.score);

    // 중복 제거 + 클러스터링
    const issueMap = {};
    const noIssueArticles = [];
    const seenTitles = [];

    for (const item of passed) {
      const tokens = item.title.replace(/[^\w가-힣\s]/g, '').split(/\s+/).filter(t => t.length >= 2).slice(0, 8);
      let isDup = false;
      for (const seenTokens of seenTitles) {
        const overlap = tokens.filter(t => seenTokens.includes(t)).length;
        if (overlap / Math.max(tokens.length, seenTokens.length) >= 0.7) { isDup = true; break; }
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
      const sorted = [...issue.articles].sort((a, b) => {
        const aSource = getSourceScore(a.sourceName);
        const bSource = getSourceScore(b.sourceName);
        if (bSource !== aSource) return bSource - aSource;
        return b.score - a.score;
      });
      const mainArticle = sorted[0];
      const relatedArticles = sorted.slice(1);
      let issueScore = mainArticle.score + relatedArticles.length * 0.5;
      if (issue.hasMajorPolicy) issueScore += 5;
      return { issueKey: issue.issueKey, mainArticle, relatedArticles, tag: issue.tag, issueScore, isMajorPolicy: issue.hasMajorPolicy };
    });

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
