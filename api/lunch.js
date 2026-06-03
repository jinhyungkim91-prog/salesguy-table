// Vercel 서버리스 함수: Neon PostgreSQL 점심 검색 (다중 토큰 AND 검색)
const { Client } = require('pg');

const FOODCOURT_BLOCK = ['푸드코트','식당가','푸드홀','구내식당','학생식당','푸드빌리지','푸드스트리트'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q = '', offset = '0', limit = '50' } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(200).json({ data: [], count: 0 });
  }

  const pageOffset = parseInt(offset, 10) || 0;
  const pageLimit  = parseInt(limit,  10) || 50;

  // 공백으로 토큰 분리 (예: "역삼 순대국" → ["역삼", "순대국"])
  const tokens = q.trim().split(/\s+/).filter(t => t.length >= 1);

  // name + address + district + genre 를 합친 텍스트에서 각 토큰 검색 (AND 조건)
  // 토큰당 파라미터 1개로 단순화
  const searchable = `CONCAT(name, ' ', COALESCE(address,''), ' ', COALESCE(district,''), ' ', COALESCE(genre,''))`;
  const tokenConditions = tokens.map((_, i) => `${searchable} ILIKE $${i + 1}`).join(' AND ');

  const blockStart = tokens.length + 1;
  const blockConditions = FOODCOURT_BLOCK.map((_, i) => `name NOT ILIKE $${blockStart + i}`).join(' AND ');

  const tokenParams = tokens.map(t => `%${t}%`);
  const blockParams = FOODCOURT_BLOCK.map(kw => `%${kw}%`);
  const allParams = [...tokenParams, ...blockParams];

  const baseWhere = `${tokenConditions} AND ${blockConditions}`;

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    const [dataResult, countResult] = await Promise.all([
      client.query(
        `SELECT name, address, genre, phone, district
         FROM lunch_public
         WHERE ${baseWhere}
         LIMIT ${pageLimit} OFFSET ${pageOffset}`,
        allParams
      ),
      client.query(
        `SELECT COUNT(*) FROM lunch_public WHERE ${baseWhere}`,
        allParams
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
