/**
 * 비즈니스 다이닝 스코어 v2.1
 *
 * 4개 기둥 합산 100점 만점
 * 최저 75점 (룸있음 + 기타장르 + 미조사) 보장
 * 동화고옥급(룸있음+한식+미조사) = 82점
 *
 * ① 프라이버시    전석룸=25 / 룸있음=22
 * ② 공인 명성     미슐랭=25 / 블루리본2026=24 / 블루리본=23 / 서울미식100=22 / 없음=20
 * ③ 특별경험      태그3개+=25 / 2개=22 / 1개=20 / 없음=18
 * ④ 격식·품격     장르별 15~25점
 */

const fs   = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../public/data/restaurants.json');

function scorePrivacy(room_type) {
  return room_type === '전석룸' ? 25 : 22;
}

function scoreAward(award) {
  switch (award) {
    case '미슐랭':       return 25;
    case '블루리본2026': return 24;
    case '블루리본':     return 23;
    case '서울미식100':  return 22;
    default:             return 20;
  }
}

function scoreStory(story) {
  const n = Array.isArray(story) ? story.length : 0;
  if (n >= 3) return 25;
  if (n === 2) return 22;
  if (n === 1) return 20;
  return 18;
}

const GENRE_SCORE = {
  // 파인다이닝 · 오마카세 · 한정식코스 — 25점
  '한정식':          25,
  '스시':            25,
  '스키야키·가이세키': 25,
  '프랑스':          25,

  // 프리미엄 이탈리안·양식 — 23점
  '이탈리아':        23,
  '양식':            23,

  // 전통 한식 (동화고옥급) — 22점
  '한식':            22,

  // 프리미엄 고기·해산물 — 18점
  '고기구이':        18,
  '한우':            18,
  '해산물':          18,
  '생선회':          18,
  '대게':            18,
  '스테이크':        18,
  '양갈비':          18,
  '소고기구이':      18,
  '장어구이':        18,

  // 중식·일식 — 15점
  '중식':            15,
  '중식당':          15,
  '일식':            15,
  '일식당':          15,
  '이자카야':        15,
  '샤브샤브':        15,

  // 기타 — 15점 (최저선)
  '양대창':          15,
  '양고기':          15,
  '생선구이':        15,
  '냉면':            15,
  '평양냉면':        15,
  '안동국시':        15,
  '요리주점':        15,
};

function scoreGenre(genre) {
  return GENRE_SCORE[genre] ?? 15;
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
let changed = 0;

const updated = data.map(r => {
  if (!r.room_type || r.room_type === '없음') r.room_type = '룸있음';
  if (r.award === undefined) r.award = null;
  if (!r.story) r.story = [];

  const oldScore = r.score;
  r.score = scorePrivacy(r.room_type)
          + scoreAward(r.award)
          + scoreStory(r.story)
          + scoreGenre(r.genre);

  if (r.score !== oldScore) changed++;
  return r;
});

fs.writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2), 'utf8');

console.log(`✅ 완료: ${updated.length}개 식당 점수 재계산`);
console.log(`📝 변경된 점수: ${changed}개`);

const dist = {};
updated.forEach(r => {
  const k = Math.floor(r.score / 10) * 10;
  const label = `${k}~${k+9}점`;
  dist[label] = (dist[label] || 0) + 1;
});
console.log('\n📊 점수 분포:');
Object.keys(dist).sort().forEach(k => console.log(`  ${k}: ${dist[k]}개`));

const top10 = [...updated].sort((a, b) => b.score - a.score).slice(0, 10);
console.log('\n🏆 상위 10개:');
top10.forEach(r => console.log(`  ${r.score}점 | ${r.name} (${r.genre}, ${r.room_type})`));

const dongwha = updated.find(r => r.name.includes('동화고옥'));
if (dongwha) console.log(`\n🔍 동화고옥: ${dongwha.score}점 (프라이버시${scorePrivacy(dongwha.room_type)}+격식${scoreGenre(dongwha.genre)}+명성${scoreAward(dongwha.award)}+스토리${scoreStory(dongwha.story)})`);

console.log(`\n📉 최저점: ${Math.min(...updated.map(r=>r.score))}점 / 최고점: ${Math.max(...updated.map(r=>r.score))}점`);
