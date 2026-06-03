// Vercel 서버리스 함수: 카카오 좌표→주소 변환 프록시
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { x, y } = req.query;
  if (!x || !y) return res.status(400).json({ error: 'x, y 파라미터가 필요해요' });

  const KAKAO_REST_KEY = process.env.KAKAO_REST_KEY;
  if (!KAKAO_REST_KEY) return res.status(500).json({ error: 'KAKAO_REST_KEY 없음' });

  try {
    const kakaoRes = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${x}&y=${y}`,
      { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
    );
    const data = await kakaoRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
