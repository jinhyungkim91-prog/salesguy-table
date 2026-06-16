/**
 * 비즈니스 다이닝 스코어 v2 계산기
 *
 * 4개 기둥 × 25점 = 100점 만점
 * ① 프라이버시 (룸 품질)
 * ② 공인 명성 (award)
 * ③ 특별경험·스토리 (story 태그)
 * ④ 격식·품격 (장르)
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../public/data/restaurants.json');

// ① 프라이버시 배점 (25점)
function scorePrivacy(room_type) {
  switch (room_type) {
    case '전석룸': return 25;
    case '룸있음': return 20;
    default:        return 20; // 룸 확인 완료된 식당만 있으므로 기본 20
  }
}

// ② 공인 명성 배점 (25점)
function scoreAward(award) {
  switch (award) {
    case '미슐랭':      return 25;
    case '블루리본2026': return 20;
    case '블루리본':    return 16;
    case '서울미식100': return 12;
    default:            return 5;  // 전수조사 전 기본값
  }
}

// ③ 특별경험·스토리 배점 (25점)
function scoreStory(story) {
  const count = Array.isArray(story) ? story.length : 0;
  if (count >= 3) return 25;
  if (count === 2) return 18;
  if (count === 1) return 10;
  return 0;
}

// ④ 격식·품격 배점 (25점)
const GENRE_SCORE = {
  // 파인다이닝·오마카세·한정식코스 — 25점
  '한정식': 25,
  '스시': 25,
  '스키야키·가이세키': 25,
  '프랑스': 25,

  // 프리미엄 코스·이탈리안 — 21점
  '이탈리아': 21,
  '양식': 21,

  // 프리미엄 고기·해산물 — 17점
  '고기구이': 17,
  '한우': 17,
  '해산물': 17,
  '생선회': 17,
  '대게': 17,
  '스테이크': 17,
  '양갈비': 17,
  '장어구이': 17,

  // 중식코스·일식 — 13점
  '중식': 13,
  '중식당': 13,
  '일식': 13,
  '일식당': 13,
  '이자카야': 13,
  '샤브샤브': 13,

  // 한식·기타 — 9점
  '한식': 9,
  '양대창': 9,
  '양고기': 9,
  '생선구이': 9,
  '소고기구이': 9,
  '냉면': 9,
  '평양냉면': 9,
  '안동국시': 9,
  '요리주점': 9,
};

function scoreGenre(genre) {
  return GENRE_SCORE[genre] ?? 9;
}

// 메인 실행
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

let changed = 0;

const updated = data.map(r => {
  // room_type 미설정 → 룸있음으로 정규화
  if (!r.room_type || r.room_type === '없음') {
    r.room_type = '룸있음';
  }

  // 신규 필드 초기화 (없는 경우만)
  if (!r.award) r.award = null;
  if (!r.story) r.story = [];

  const oldScore = r.score;
  const privacy  = scorePrivacy(r.room_type);
  const award    = scoreAward(r.award);
  const story    = scoreStory(r.story);
  const genre    = scoreGenre(r.genre);

  r.score = privacy + award + story + genre;

  if (r.score !== oldScore) changed++;
  return r;
});

fs.writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2), 'utf8');

console.log(`✅ 완료: ${updated.length}개 식당 점수 재계산`);
console.log(`📝 변경된 점수: ${changed}개`);

// 점수 분포 출력
const dist = {};
updated.forEach(r => {
  const k = Math.floor(r.score / 10) * 10;
  const label = `${k}~${k+9}점`;
  dist[label] = (dist[label] || 0) + 1;
});
console.log('\n📊 점수 분포:');
Object.keys(dist).sort().forEach(k => console.log(`  ${k}: ${dist[k]}개`));

// 상위 10개 출력
const top10 = [...updated].sort((a, b) => b.score - a.score).slice(0, 10);
console.log('\n🏆 상위 10개:');
top10.forEach(r => console.log(`  ${r.score}점 | ${r.name} (${r.genre}, ${r.room_type})`));
