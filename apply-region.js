// 지역 오류 수정 적용
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./public/data/restaurants.json','utf8'));

// mapQuery 기준 명확한 수정값 (audit-region.csv 결과)
const FIXES = [
  // id:354 "오프레" — mapQuery에 청담 포함, 청담은 서초구
  { id: 354,  region: '서초', area: '청담' },
  // id:425 "알레즈" — mapQuery "알레즈 한남", 한남은 용산구
  { id: 425,  region: '용산', area: '한남' },
  // id:435 "로바" — mapQuery "압구정 로바", 압구정은 서초구
  { id: 435,  region: '서초', area: '압구정' },
  // id:556 "카밀로 라자네리아" — mapQuery "합정", 합정은 마포구
  { id: 556,  region: '마포', area: '합정' },
  // id:762 "쥬에" — mapQuery "쥬에 한남 맛집", 한남은 용산구
  { id: 762,  region: '용산', area: '한남' },
  // id:959 "유원 코엑스" — mapQuery "유원 논현 맛집", 논현은 강남구 (region 유지, area만 수정)
  { id: 959,  region: '강남', area: '논현' },
  // id:1018 "소와나" — mapQuery "소와나 한남 맛집", 한남은 용산구
  { id: 1018, region: '용산', area: '한남' },
  // id:1046 "소와나" (중복 항목) — 동일
  { id: 1046, region: '용산', area: '한남' },
  // id:1088 "산다이" — mapQuery "산다이 청담 맛집", 청담은 서초구
  { id: 1088, region: '서초', area: '청담' },
];

const fixMap = new Map(FIXES.map(f => [f.id, f]));
let changed = 0;

data.forEach(r => {
  const fix = fixMap.get(r.id);
  if (!fix) return;
  console.log(`id:${r.id} "${r.name}" region: ${r.region}→${fix.region}, area: ${r.area}→${fix.area}`);
  r.region = fix.region;
  r.area   = fix.area;
  changed++;
});

fs.writeFileSync('./public/data/restaurants.json', JSON.stringify(data, null, 2), 'utf8');
console.log(`\n✅ ${changed}개 지역 수정 완료`);
