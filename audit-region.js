// 지역 오류 탐지 CSV 생성
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./public/data/restaurants.json','utf8'));

// area → region 매핑
const AREA_TO_REGION = {
  '청담': '서초', '압구정': '서초', '신사': '서초', '반포': '서초', '잠원': '서초',
  '한남': '용산', '이태원': '용산', '삼각지': '용산', '신용산': '용산', '후암': '용산',
  '홍대': '마포', '합정': '마포', '연남': '마포', '상수': '마포',
  '광화문': '종로', '인사동': '종로', '경복궁': '종로', '북촌': '종로', '동묘': '종로',
  '여의도': '영등포', '당산': '영등포',
  '잠실': '송파', '문정': '송파',
  '성수': '성동', '왕십리': '성동',
  '강남역': '강남', '역삼': '강남', '논현': '강남', '삼성동': '강남', '대치': '강남',
  '신라호텔': '중구', '을지로': '중구', '명동': '중구',
};

// mapQuery에서 지역 힌트 추출
function detectAreaFromQuery(mapQuery) {
  if (!mapQuery) return null;
  for (const [area, region] of Object.entries(AREA_TO_REGION)) {
    if (mapQuery.includes(area)) return { area, region };
  }
  return null;
}

const suspects = [];
data.forEach(r => {
  if (!r.mapQuery) return;
  const hint = detectAreaFromQuery(r.mapQuery);
  if (!hint) return;

  // 현재 area/region과 불일치 시
  const areaMismatch = r.area !== hint.area && !r.area.includes(hint.area);
  const regionMismatch = r.region !== hint.region;

  if (areaMismatch || regionMismatch) {
    suspects.push({
      id: r.id, name: r.name,
      cur_region: r.region, cur_area: r.area,
      hint_area: hint.area, hint_region: hint.region,
      mapQuery: r.mapQuery
    });
  }
});

console.log(`지역 불일치 의심: ${suspects.length}개\n`);

const header = 'id,name,현재region,현재area,추정area,추정region,mapQuery,수정region,수정area\n';
const rows = suspects.map(r =>
  [r.id, `"${r.name}"`, r.cur_region, r.cur_area,
   r.hint_area, r.hint_region, `"${r.mapQuery}"`, '', ''].join(',')
).join('\n');

fs.writeFileSync('./audit-region.csv', '﻿' + header + rows, 'utf8');
console.log('✅ audit-region.csv 생성 완료');
console.log('수정region/수정area 열에 올바른 값 입력 후 저장하세요');
