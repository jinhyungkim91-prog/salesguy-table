/**
 * 비즈니스 스코어 정규분포 정규화
 *
 * - 청기와타운 전 지점 → 75점 (최저 고정)
 * - 나머지 877개 → 공식 점수 기반 순위를 정규분포로 76~98점 매핑
 * - 동점 내 sub-정렬: rating DESC → id ASC
 */

const fs   = require('fs');
const path = require('path');
const DATA_PATH = path.join(__dirname, '../public/data/restaurants.json');

// 정규분포 역함수 (probit) 근사 — Beasley-Springer-Moro 알고리즘
function probit(p) {
  p = Math.max(0.0001, Math.min(0.9999, p));
  const a = [2.515517, 0.802853, 0.010328];
  const b = [1.432788, 0.189269, 0.001308];
  const pp = p < 0.5 ? p : 1 - p;
  const t  = Math.sqrt(-2 * Math.log(pp));
  const z  = t - (a[0] + a[1]*t + a[2]*t*t) / (1 + b[0]*t + b[1]*t*t + b[2]*t*t*t);
  return p < 0.5 ? -z : z;
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const CHEONG_NAME = '청기와타운';
const MIN_SCORE = 75;
const MAX_SCORE = 98;
const MID = (MIN_SCORE + 1 + MAX_SCORE) / 2;  // 76~98 중간 = 87
const SIGMA = (MAX_SCORE - (MIN_SCORE + 1)) / (2 * 3.1);  // 3σ로 범위 커버 ≈ 3.5

// 청기와타운 분리
const cheong  = data.filter(r => r.name.includes(CHEONG_NAME));
const others  = data.filter(r => !r.name.includes(CHEONG_NAME));

// 공식 점수 기반 정렬 (높을수록 좋음 → 낮은 rank index)
const sorted = [...others].sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  const ra = typeof a.rating === 'number' ? a.rating : parseFloat(a.rating) || 0;
  const rb = typeof b.rating === 'number' ? b.rating : parseFloat(b.rating) || 0;
  if (rb !== ra) return rb - ra;
  return a.id - b.id;
});

const N = sorted.length;

// 각 식당에 정규분포 점수 할당
const scoreMap = new Map();
sorted.forEach((r, idx) => {
  // 순위 1위(idx=0) → 높은 percentile, 꼴찌(idx=N-1) → 낮은 percentile
  const p = 1 - (idx + 0.5) / N;
  const z = probit(p);
  const raw = MID + z * SIGMA;
  const score = Math.round(Math.max(MIN_SCORE + 1, Math.min(MAX_SCORE, raw)));
  scoreMap.set(r.id, score);
});

// 점수 적용
const updated = data.map(r => {
  if (r.name.includes(CHEONG_NAME)) {
    r.score = MIN_SCORE;
  } else {
    r.score = scoreMap.get(r.id) ?? r.score;
  }
  return r;
});

fs.writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2), 'utf8');

// 결과 출력
console.log(`✅ 완료: ${updated.length}개 점수 정규화`);
console.log(`\n청기와타운 ${cheong.length}개 → ${MIN_SCORE}점`);

const dist = {};
updated.forEach(r => {
  dist[r.score] = (dist[r.score] || 0) + 1;
});
console.log('\n📊 점수 분포 (1점 단위):');
Object.keys(dist).sort((a,b)=>+a-+b).forEach(k => {
  const bar = '█'.repeat(Math.round(dist[k]/5));
  console.log(`  ${k}점: ${String(dist[k]).padStart(3)}개 ${bar}`);
});

const scores = updated.map(r=>r.score).sort((a,b)=>a-b);
const mean = scores.reduce((s,v)=>s+v,0)/scores.length;
const std  = Math.sqrt(scores.reduce((s,v)=>s+(v-mean)**2,0)/scores.length);
console.log(`\n평균: ${mean.toFixed(1)}점 / 표준편차: ${std.toFixed(1)}점`);
console.log(`최저: ${scores[0]}점 / 최고: ${scores[scores.length-1]}점`);

const top10 = [...updated].sort((a,b)=>b.score-a.score).slice(0,10);
console.log('\n🏆 상위 10개:');
top10.forEach(r => console.log(`  ${r.score}점 | ${r.name}`));
