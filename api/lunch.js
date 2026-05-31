// Vercel 서버리스 함수: Neon PostgreSQL 점심 검색
const { Client } = require('pg');

const FOODCOURT_BLOCK = ['푸드코트','식당가','푸드홀','구내식당','학생식당','푸드빌리지','푸드스트리트'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q = '', offset = '0', limit = '50' } = req.query;

  if (!q || q.length < 2) {
    return res.status(200).json({ data: [], count: 0 });
  }

  const pageOffset = parseInt(offset, 10) || 0;
  const pageLimit  = parseInt(limit,  10) || 50;

  // FOODCOURT_BLOCK 제외 조건 (파라미터 인덱스 시작: $4~)
  const blockConditions = FOODCOURT_BLOCK.map((_, i) => `name NOT ILIKE $${i + 4}`).join(' AND ');
  const blockParams = FOODCOURT_BLOCK.map(kw => `%${kw}%`);

  const searchParam = `%${q}%`;
  const baseWhere = `(name ILIKE $1 OR address ILIKE $2 OR district ILIKE $3) AND ${blockConditions}`;

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    const [dataResult, countResult] = await Promise.all([
      client.query(
        `SELECT name, address, genre, phone, district
         FROM lunch_public
         WHERE ${baseWhere}
         LIMIT ${pageLimit} OFFSET ${pageOffset}`,
        [searchParam, searchParam, searchParam, ...blockParams]
      ),
      client.query(
        `SELECT COUNT(*) FROM lunch_public WHERE ${baseWhere}`,
        [searchParam, searchParam, searchParam, ...blockParams]
      ),
    ]);

    res.status(200).json({
      data: dataResult.rows,
      count: parseInt(countResult.rows[0].count, 10),
    });
  } catch (err) {
    console.error('[Neon 오류]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    await client.end();
  }
};
