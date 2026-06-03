// Vercel 서버리스 함수: 카카오 로컬 API 프록시 (주변 음식점 검색)
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { x, y, radius = '500', page = '1' } = req.query;

  if (!x || !y) {
    return res.status(400).json({ error: 'x(경도), y(위도) 파라미터가 필요해요' });
  }

  const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
  if (!KAKAO_REST_KEY) {
    return res.status(500).json({ error: 'KAKAO_REST_KEY 환경변수가 없어요' });
  }

  const params = new URLSearchParams({
    category_group_code: 'FD6',
    x, y,
    radius: String(Math.min(parseInt(radius, 10) || 500, 20000)),
    sort: 'distance',
    size: '45',
    page: String(page),
  });

  try {
    const kakaoRes = await fetch(
      `https://dapi.kakao.com/v2/local/search/category.json?${params}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
    );
    const data = await kakaoRes.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('[카카오 API 오류]', err.message);
    res.status(500).json({ error: err.message });
  }
};
