/**
 * 신규 3개 골프장 식당 수집 → 필터링 → 주행시간 계산 → golf.json 병합
 * 실행: node scripts/fetch_new_courses.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const REST_KEY = envContent.match(/KAKAO_REST_KEY=(.+)/)?.[1]?.trim();
if (!REST_KEY) { console.error('❌ KAKAO_REST_KEY not found'); process.exit(1); }

const golfPath = path.join(__dirname, '..', 'public', 'data', 'golf.json');
const golf = JSON.parse(fs.readFileSync(golfPath, 'utf8'));

const TARGET_COURSES = ['샴발라','해비치 서울','프리스틴밸리','푸른솔 포천','티클라우드','썬힐','베뉴지','몽베르','마이다스밸리 청평','노스팜','크리스밸리','웰링턴','여주클래식','소피아그린','블루헤런','ROUTE52','렉스필드','더스타휴','화성상록','아시아나','플라자CC 용인'];
const existingNames = new Set(golf.restaurants.map(r => r.name));

function kakaoGet(url, hostname) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: hostname || urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: { Authorization: `KakaoAK ${REST_KEY}` }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getCoords(name, address) {
  // 주소가 있으면 먼저 주소 geocoding 시도
  if (address) {
    const q = encodeURIComponent(address);
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${q}&size=1`;
    const res = await kakaoGet(url);
    if (res.documents?.length > 0) {
      const d = res.documents[0];
      const x = d.road_address?.x || d.address?.x;
      const y = d.road_address?.y || d.address?.y;
      if (x && y) return { x, y, place_name: name };
    }
  }
  const q = encodeURIComponent(name + ' 골프장');
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}&size=1&category_group_code=GP2`;
  let res = await kakaoGet(url);
  if (res.documents?.length > 0) {
    const d = res.documents[0];
    return { x: d.x, y: d.y, place_name: d.place_name };
  }
  const url2 = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}&size=1`;
  res = await kakaoGet(url2);
  if (res.documents?.length > 0) {
    const d = res.documents[0];
    return { x: d.x, y: d.y, place_name: d.place_name };
  }
  return null;
}

async function getNearbyRestaurants(x, y) {
  const results = [];
  for (let page = 1; page <= 3; page++) {
    const url = `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=FD6&x=${x}&y=${y}&radius=10000&sort=accuracy&size=15&page=${page}`;
    const res = await kakaoGet(url);
    if (!res.documents?.length) break;
    results.push(...res.documents);
    if (res.meta?.is_end) break;
    await sleep(200);
  }
  return results;
}

async function getDrivingMinutes(ox, oy, dx, dy) {
  const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${ox},${oy}&destination=${dx},${dy}&priority=RECOMMEND`;
  try {
    const res = await kakaoGet(url, 'apis-navi.kakaomobility.com');
    if (res.routes?.[0]?.result_code === 0) {
      return Math.round(res.routes[0].summary.duration / 60);
    }
  } catch(e) {}
  return null;
}

async function getRestCoords(name, address) {
  if (address) {
    const q = encodeURIComponent(address);
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${q}&size=1`;
    const res = await kakaoGet(url);
    if (res.documents?.length > 0) {
      const d = res.documents[0];
      const x = d.road_address?.x || d.address?.x;
      const y = d.road_address?.y || d.address?.y;
      if (x && y) return { x, y };
    }
  }
  const q = encodeURIComponent(name);
  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${q}&category_group_code=FD6&size=3`;
  const res = await kakaoGet(url);
  if (res.documents?.length > 0) {
    const norm = s => s.replace(/\s/g,'').toLowerCase();
    const match = res.documents.find(d => norm(d.place_name).includes(norm(name)) || norm(name).includes(norm(d.place_name)));
    const d = match || res.documents[0];
    return { x: d.x, y: d.y };
  }
  return null;
}

function toDistLabel(m) {
  if (m <= 3) return '3분';
  if (m <= 5) return '5분';
  if (m <= 8) return '8분';
  if (m <= 12) return '12분';
  if (m <= 15) return '15분';
  if (m <= 20) return '20분';
  return `${m}분`;
}

function toGenre(cat) {
  const c = cat || '';
  const last = c.split(' > ').pop();
  const map = {
    '육류,고기': '고기', '한식': '한식', '음식점': '한식',
    '오리': '오리구이', '닭요리': '닭요리', '삼계탕': '삼계탕',
    '갈비': '갈비', '한정식': '한정식', '두부전문점': '두부전골',
    '국수': '국수', '냉면': '냉면', '막국수': '막국수',
    '장어': '장어구이', '해물,생선': '해물', '게,대게': '게장',
    '초밥,롤': '스시', '일식집': '일식', '돈까스,우동': '돈까스',
    '스테이크,립': '스테이크', '이탈리안': '양식',
    '국밥': '국밥', '해장국': '해장국', '쌈밥': '쌈밥',
    '곰탕': '곰탕', '설렁탕': '설렁탕', '족발,보쌈': '족발·보쌈',
    '불고기,두루치기': '불고기', '중국요리': '중식',
    '칼국수': '칼국수', '찌개,전골': '찌개',
  };
  return map[last] || last;
}

function toEmoji(cat) {
  const c = cat || '';
  if (c.includes('한우') || c.includes('갈비') || c.includes('삼겹') || c.includes('불고기') || c.includes('스테이크')) return '🥩';
  if (c.includes('오리') || c.includes('닭') || c.includes('삼계탕')) return '🍗';
  if (c.includes('장어') || c.includes('게') || c.includes('해물') || c.includes('해산물') || c.includes('생선') || c.includes('회')) return '🐟';
  if (c.includes('한정식') || c.includes('한식') || c.includes('쌈밥') || c.includes('두부')) return '🏮';
  if (c.includes('국수') || c.includes('냉면') || c.includes('막국수') || c.includes('칼국수')) return '🍜';
  if (c.includes('국밥') || c.includes('해장국') || c.includes('설렁탕') || c.includes('곰탕') || c.includes('찌개')) return '🍲';
  if (c.includes('이탈리안') || c.includes('양식')) return '🍝';
  if (c.includes('초밥') || c.includes('일식')) return '🍱';
  if (c.includes('중식') || c.includes('중국')) return '🥢';
  if (c.includes('족발') || c.includes('보쌈')) return '🐷';
  return '🍽️';
}

const EXCLUDE_NAME = ['클럽하우스', '골프장', 'GC점', 'CC점', '골프텔', '마트', '편의점', '주유소'];
const EXCLUDE_CAT = ['구내식당', '푸드코트', '편의점', '패스트푸드', '도넛', '아이스크림'];
const EXCLUDE_FRANCHISE = ['BBQ', '교촌치킨', '맥도날드', '버거킹', '롯데리아', '파파이스', '맘스터치',
  '이삭토스트', '파리바게뜨', '뚜레쥬르', '도미노', '피자헛', '스타벅스', '이디야', '메가커피', '컴포즈커피'];

function isExcluded(name, cat) {
  if (EXCLUDE_NAME.some(k => name.includes(k))) return true;
  if (EXCLUDE_CAT.some(k => (cat||'').includes(k))) return true;
  if (EXCLUDE_FRANCHISE.some(k => name.includes(k))) return true;
  return false;
}

function catScore(cat) {
  const c = cat || '';
  if (c.includes('한우') || c.includes('육회')) return 10;
  if (c.includes('한정식') || c.includes('갈비')) return 9;
  if (c.includes('장어')) return 8;
  if (c.includes('오리') || c.includes('삼계탕') || c.includes('닭요리')) return 7;
  if (c.includes('해산물') || c.includes('해물') || c.includes('생선')) return 6;
  if (c.includes('냉면') || c.includes('막국수') || c.includes('두부') || c.includes('쌈밥')) return 5;
  if (c.includes('국밥') || c.includes('족발') || c.includes('스테이크') || c.includes('일식')) return 4;
  if (c.includes('한식') || c.includes('중식')) return 3;
  return 1;
}

async function main() {
  const targetCourses = golf.courses.filter(c => TARGET_COURSES.includes(c.name));
  let nextId = Math.max(...golf.restaurants.map(r => r.id)) + 1;
  const toAdd = [];

  for (const course of targetCourses) {
    console.log(`\n⛳ ${course.name}`);

    const coords = await getCoords(course.name, course.address);
    await sleep(300);
    if (!coords) { console.log('  ❌ 좌표 없음'); continue; }
    console.log(`  📍 ${coords.place_name}`);

    const rests = await getNearbyRestaurants(coords.x, coords.y);
    await sleep(300);

    // 필터링 + 점수
    const candidates = rests
      .filter(r => !existingNames.has(r.place_name) && !isExcluded(r.place_name, r.category_name))
      .map(r => ({
        name: r.place_name,
        category: r.category_name || '',
        address: r.road_address_name || r.address_name,
        distance_m: parseInt(r.distance),
        score: catScore(r.category_name) * 3 + Math.max(0, 10 - parseInt(r.distance)/1000*1.2),
      }))
      .sort((a, b) => b.score - a.score);

    // 상위 10개 주행시간 계산 → 20분 이하만 최대 5개
    console.log(`  🔍 후보 ${candidates.length}개 → 주행시간 계산 중...`);
    const kept = [];
    for (const r of candidates) {
      if (kept.length >= 5) break;
      const restCoords = await getRestCoords(r.name, r.address);
      await sleep(200);
      if (!restCoords) { console.log(`    ⚠️ 좌표없음: ${r.name}`); continue; }

      const mins = await getDrivingMinutes(coords.x, coords.y, restCoords.x, restCoords.y);
      await sleep(250);

      if (mins === null) { console.log(`    ⚠️ 경로없음: ${r.name}`); continue; }
      if (mins > 20) { console.log(`    ❌ ${mins}분 (제거): ${r.name}`); continue; }

      console.log(`    ✅ ${mins}분: ${r.name} (${toGenre(r.category)})`);
      kept.push({
        id: nextId++,
        golf: course.name,
        name: r.name,
        genre: toGenre(r.category),
        distance: toDistLabel(mins),
        room: '단체가능',
        emoji: toEmoji(r.category),
        tip: `${course.name} 근처 ${toDistLabel(mins)} · ${toGenre(r.category)}`,
      });
      existingNames.add(r.name);
    }

    toAdd.push(...kept);
    console.log(`  → ${kept.length}개 선정`);
  }

  // golf.json에 추가
  golf.restaurants.push(...toAdd);
  fs.writeFileSync(golfPath, JSON.stringify(golf, null, 2), 'utf8');

  console.log('\n' + '='.repeat(60));
  console.log(`✅ 총 ${toAdd.length}개 추가 완료`);
  toAdd.forEach(r => console.log(`   ${r.emoji} [${r.golf}] ${r.name} ${r.distance}`));
}

main().catch(console.error);
