import { useState, useEffect, useRef } from "react";
import "./App.css";
import { supabase } from "./supabaseClient";

function openNaverSearch(name, area, mapQuery) {
  let query;
  if (mapQuery) {
    query = mapQuery;
  } else {
    let clean;
    if (/^[A-Za-z]/.test(name)) {
      // 영문 시작: 괄호 안 한글 추출 → "Born and Bred (본앤브레드)" → "본앤브레드"
      const korean = name.match(/\(([^)]*[가-힣][^)]*)\)/);
      clean = korean ? korean[1].trim() : name.trim();
    } else {
      // 한글 시작: 괄호 안 영문 제거 → "가온 (Gaon)" → "가온"
      clean = name.replace(/\s*\(.*?\)/g, "").trim();
    }
    query = area ? clean + " " + area + " 맛집" : clean + " 맛집";
  }
  window.open("https://search.naver.com/search.naver?query=" + encodeURIComponent(query), "_blank");
}

function getFavorites() {
  try { return JSON.parse(localStorage.getItem("sgFavorites") || "[]"); }
  catch { return []; }
}

function toggleFavorite(id) {
  const favs = getFavorites();
  const next = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
  localStorage.setItem("sgFavorites", JSON.stringify(next));
  return next;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━
// 비즈니스 점수 자동계산 함수
// 룸(35) + 장르(25) + 평점(15) + 출처(15) + 보너스(10) = 최대 100점
// ━━━━━━━━━━━━━━━━━━━━━━━━
function calcBizScore(room, genre, rating, source, note) {
  const txt = genre + " " + note + " " + source;

  // ① 룸 상태 (최대 35)
  let rs = 0;
  if (note.includes("전석") || note.includes("전층")) rs = 35;
  else if (note.includes("개별룸") || note.includes("개인실") || note.includes("프라이빗룸")) rs = 28;
  else if (room.includes("✅")) rs = 25;
  else if (room.includes("🔶")) rs = 15;
  else if (note.includes("조건")) rs = 5;

  // ② 장르 격식 (최대 25)
  let gs = 5;
  if (/파인다이닝|오마카세|파인/.test(genre)) gs = 25;
  else if (/한정식|일식코스|코스|프렌치|이탈리안/.test(genre)) gs = 20;
  else if (/한우|해산물|회|BBQ|갈비|스테이크/.test(genre)) gs = 15;
  else if (/중식|양식|샤부|훠궈|딤섬/.test(genre)) gs = 10;

  // ③ 평점 (최대 15)
  let rts = 3;
  if (rating >= 4.7) rts = 15;
  else if (rating >= 4.5) rts = 12;
  else if (rating >= 4.3) rts = 9;
  else if (rating >= 4.0) rts = 6;

  // ④ 출처 신뢰도 (최대 15)
  let ss = 4;
  if (/미슐랭/.test(source)) ss = 15;
  else if (/블루리본2026|블루리본2025/.test(source)) ss = 13;
  else if (/블루리본/.test(source)) ss = 11;
  else if (/서울미식100|준성기/.test(source)) ss = 9;
  else if (/다이닝코드|google|구글|캐치테이블|식신|네이버/i.test(source)) ss = 7;

  // ⑤ 보너스 (최대 12) — 미슐랭 스타 특별 가산
  let bs = 2;
  if (/미슐랭3스타/.test(source) || (/미슐랭/.test(source) && /3스타/.test(note))) bs = 12;
  else if (/미슐랭2스타/.test(source) || (/미슐랭/.test(source) && /2스타/.test(note))) bs = 10;
  else if (/미슐랭/.test(source)) bs = 9;
  else if (/발렛/.test(txt) && /전담|VIP|소믈리에/.test(txt)) bs = 10;
  else if (/발렛|VIP룸/.test(txt)) bs = 8;
  else if (/상견례|코르카지|콜키지|1\+\+|BMS9/.test(txt)) bs = 8;
  else if (/프라이빗|미팅룸|비즈니스|접대/.test(txt)) bs = 6;
  else if (/전담|소믈리에|럭셔리/.test(txt)) bs = 5;
  else if (/룸|개인실/.test(txt)) bs = 4;

  return Math.min(100, rs + gs + rts + ss + bs);
}

const BIZ_REGIONS = ["전체","강남","서초","종로","영등포","용산","마포","중구","송파","성동","경기"];
const BIZ_GENRES  = ["전체","한정식","한우","일식","중식","파인다이닝"];
// 장르 필터: 버튼명 → 매칭 키워드 (미정의 시 버튼명 그대로 includes 검색)
const GENRE_KEYWORDS = {
  '한우': ['한우'],
  '일식': ['일식','스시','가이세키','이자카야','덴푸라','쿠시아게','야키니쿠','야키토리','라멘','스키야키','장어구이','복어'],
  '중식': ['중식','딤섬'],
  '파인다이닝': ['파인다이닝','파인'],
};

const LUNCH_REGIONS = ["전체","강남","종로","영등포","마포","서초","성동","중구","용산","송파","강동","강서","경기"];
const LUNCH_PRICES  = ["전체","1만원이하","1만원대","2만원대"];
const LUNCH_GENRES  = ["전체","한식","라멘","국밥","분식","중식","일식","샐러드","마라탕"];

const GOLF_DIRECTIONS = ["전체","강남","광화문","여의도","강북"];
const PUBLIC_LUNCH_TOTAL = 120705; // 서울시 공공 음식점 DB 총 건수

// ━━━━━━━━━━━━━━━━━━━━━━━━
// 공통 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━
function RestaurantCard({ r, onClick }) {
  return (
    <div className="rest-card" onClick={() => onClick(r)}>
      <div className="rest-card-top">
        <div className="rest-emoji">{r.emoji}</div>
        <div className="rest-info">
          <div className="rest-name">{r.name}</div>
          <div className="rest-sub">{r.area} · {r.genre}</div>
        </div>
        <div className="rest-score-wrap">
          <div className="rest-score">{r.score}</div>
          <div className="rest-score-label">비즈점수</div>
        </div>
      </div>
      <div className="rest-note">{r.note}</div>
      <div className="rest-tags">
        <span className={`tag ${r.room==="✅ 확인"?"tag-room":"tag-maybe"}`}>
          {r.room==="✅ 확인"?"룸 확인":"룸 추정"}
        </span>
        <span className="tag tag-rating">★ {r.rating}</span>
        <span className="tag tag-region">{r.region}</span>
      </div>
    </div>
  );
}

function LunchCard({ r, onClick }) {
  return (
    <div className="rest-card" onClick={() => onClick(r)}>
      <div className="rest-card-top">
        <div className="rest-emoji">{r.emoji}</div>
        <div className="rest-info">
          <div className="rest-name">{r.name}</div>
          <div className="rest-sub">{r.area} · {r.genre}</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div className={`price-badge ${r.price==="1만원이하"?"pb-cheap":r.price==="1만원대"?"pb-mid":"pb-pricey"}`}>{r.price}</div>
          <div style={{fontSize:"9px",color:"#8A7A6A",marginTop:2}}>★ {r.rating}</div>
        </div>
      </div>
      <div className="rest-note">{r.tip}</div>
      <div className="rest-tags">
        <span className={`tag ${r.solo==="✅ 혼밥"?"tag-room":"tag-maybe"}`}>{r.solo}</span>
        <span className={`tag ${r.wait==="적음"?"tag-room":r.wait==="많음"?"tag-maybe":"tag-rating"}`}>웨이팅 {r.wait}</span>
        <span className="tag tag-region">{r.region}</span>
      </div>
    </div>
  );
}

function GolfRestCard({ r }) {
  return (
    <div className="golf-card">
      <div className="golf-top">
        <span style={{fontSize:22}}>{r.emoji}</span>
        <div style={{flex:1}}>
          <div className="golf-rest-name">{r.name}</div>
          <div className="golf-rest-info">{r.genre} · {r.golf}</div>
        </div>
        <div className="golf-dist">🚗 {r.distance}</div>
      </div>
      <div className="golf-body">{r.tip}</div>
      <div className="golf-foot">
        <div className="rating"><span className="star">★</span> {r.rating}</div>
        <div className={`room-badge-sm ${r.room.includes("✅")?"rb-room":"rb-group"}`}>
          {r.room.includes("✅")?"룸 있음":"단체가능"}
        </div>
      </div>
    </div>
  );
}

function PublicLunchCard({ r }) {
  return (
    <div className="rest-card" onClick={() => openNaverSearch(r.name, r.district)}>
      <div className="rest-card-top">
        <div className="rest-emoji">🍴</div>
        <div className="rest-info">
          <div className="rest-name">{r.name}</div>
          <div className="rest-sub">{r.district} · {r.genre}</div>
        </div>
        <div style={{fontSize:"10px",color:"#7A6A5A",flexShrink:0,textAlign:"right"}}>
          공공DB<br/>🔍 검색
        </div>
      </div>
      <div className="rest-note" style={{fontSize:"11px",color:"#8A7A6A"}}>{r.address}</div>
      <div className="rest-tags">
        <span className="tag tag-region">{r.district}</span>
        <span className="tag tag-rating">{r.genre}</span>
        {r.phone && <span className="tag tag-region">{r.phone}</span>}
      </div>
    </div>
  );
}

function DetailModal({ r, type, onClose }) {
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    if (r) setIsFav(getFavorites().includes(r.id));
  }, [r]);

  if (!r) return null;

  const handleFav = () => {
    const next = toggleFavorite(r.id);
    setIsFav(next.includes(r.id));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-emoji">{r.emoji}</div>
        <div className="modal-name">{r.name}</div>
        <div className="modal-area">{r.region} · {r.area}</div>
        <div className="modal-row">
          <div className="modal-item">
            <div className="modal-label">장르</div>
            <div className="modal-val">{r.genre}</div>
          </div>
          <div className="modal-item">
            <div className="modal-label">평점</div>
            <div className="modal-val">★ {r.rating}</div>
          </div>
          <div className="modal-item">
            <div className="modal-label">{type==="biz"?"비즈점수":"가격대"}</div>
            <div className="modal-val score-hi">{type==="biz"?r.score+"점":r.price}</div>
          </div>
        </div>
        {type==="biz" && <div className="modal-room"><span className={r.room==="✅ 확인"?"tag tag-room":"tag tag-maybe"}>{r.room} 룸</span></div>}
        {type==="lunch" && <div className="modal-room"><span className={r.solo==="✅ 혼밥"?"tag tag-room":"tag tag-maybe"}>{r.solo}</span></div>}
        <div className="modal-note">{type==="biz"?r.note:r.tip}</div>
        <div className="modal-actions">
          <button className="btn-kakao" onClick={()=>openNaverSearch(r.name, r.area, r.mapQuery)}>
            네이버에서 찾기
          </button>
          <button className={`btn-save ${isFav?"btn-save-on":""}`} onClick={handleFav}>
            {isFav ? "❤️ 찜 완료" : "🤍 찜하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 앱
// ━━━━━━━━━━━━━━━━━━━━━━━━
export default function App() {
  // 데이터 상태
  const [restaurants, setRestaurants]       = useState([]);
  const [lunchDB, setLunchDB]               = useState([]);
  const [golfCourses, setGolfCourses]       = useState([]);
  const [golfRestaurants, setGolfRestaurants] = useState([]);
  const [dataLoading, setDataLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/data/restaurants.json?v=20260510').then(r => r.json()),
      fetch('/data/lunch.json?v=20260510').then(r => r.json()),
      fetch('/data/golf.json?v=20260510').then(r => r.json()),
    ]).then(([rest, lunch, golf]) => {
      setRestaurants(rest);
      setLunchDB(lunch);
      setGolfCourses(golf.courses);
      setGolfRestaurants(golf.restaurants);
      setDataLoading(false);
    });
  }, []);

  const [activeTab, setActiveTab] = useState("biz");
  const [selected, setSelected]   = useState(null);
  const [selType, setSelType]     = useState("biz");

  // 비즈니스 필터
  const [bizRegion, setBizRegion] = useState("전체");
  const [bizGenre, setBizGenre]   = useState("전체");
  const [bizSearch, setBizSearch] = useState("");

  // 점심 필터
  const [lunchRegion, setLunchRegion] = useState("전체");
  const [lunchPrice, setLunchPrice]   = useState("전체");
  const [lunchSearch, setLunchSearch] = useState("");
  const [cheapOnly, setCheapOnly]     = useState(false);

  // 공공 점심 DB (Supabase)
  const [publicResults, setPublicResults] = useState([]);
  const [publicTotal, setPublicTotal] = useState(0);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicOffset, setPublicOffset] = useState(0);
  const [publicHasMore, setPublicHasMore] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const debounceRef = useRef(null);
  const PAGE = 50;

  useEffect(() => {
    if (lunchSearch.length < 2) { setPublicResults([]); setPublicTotal(0); setPublicOffset(0); setPublicHasMore(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPublicLoading(true);
      setPublicOffset(0);
      const applyFilters = (q) => {
        q = q.ilike('name', `%${lunchSearch}%`);
        if (lunchRegion !== '전체') q = q.ilike('district', `${lunchRegion}%`);
        return q;
      };
      const [{ data }, { count }] = await Promise.all([
        applyFilters(supabase.from('lunch_public').select('name, address, genre, phone, district')).range(0, PAGE - 1),
        applyFilters(supabase.from('lunch_public').select('*', { count: 'exact', head: true }))
      ]);
      const results = data || [];
      setPublicResults(results);
      setPublicTotal(count || 0);
      setPublicHasMore(results.length === PAGE);
      setPublicLoading(false);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [lunchSearch, lunchRegion]);

  const loadMore = async () => {
    setMoreLoading(true);
    const nextOffset = publicOffset + PAGE;
    let q = supabase.from('lunch_public').select('name, address, genre, phone, district').ilike('name', `%${lunchSearch}%`);
    if (lunchRegion !== '전체') q = q.ilike('district', `${lunchRegion}%`);
    const { data, error } = await q.range(nextOffset, nextOffset + PAGE - 1);
    if (error) console.error('[Supabase 오류]', error);
    const more = data || [];
    setPublicResults(prev => [...prev, ...more]);
    setPublicOffset(nextOffset);
    setPublicHasMore(more.length === PAGE);
    setMoreLoading(false);
  };

  // 골프 필터
  const [selectedGolf, setSelectedGolf] = useState("베어크리크 CC");
  const [golfSearch, setGolfSearch] = useState("");
  const [golfDirection, setGolfDirection] = useState("전체");

  const openModal = (r, type) => { setSelected(r); setSelType(type); };

  const bizFiltered = restaurants.filter(r => {
    if (bizRegion!=="전체" && r.region!==bizRegion) return false;
    if (bizGenre!=="전체") {
      const kws = GENRE_KEYWORDS[bizGenre] || [bizGenre];
      if (!kws.some(k => r.genre.includes(k))) return false;
    }
    if (bizSearch && !r.name.includes(bizSearch) && !r.area.includes(bizSearch)) return false;
    return true;
  });

  const lunchFiltered = lunchDB.filter(r => {
    if (lunchRegion!=="전체" && r.region!==lunchRegion) return false;
    if (lunchPrice!=="전체" && r.price!==lunchPrice) return false;
    if (cheapOnly && r.price!=="1만원이하") return false;
    if (lunchSearch && !r.name.includes(lunchSearch) && !r.area.includes(lunchSearch)) return false;
    return true;
  });

  const dirFilteredCourses = golfDirection === "전체"
    ? golfCourses
    : golfCourses.filter(c => c.direction && c.direction.includes(golfDirection));

  const golfRests = golfSearch
    ? golfRestaurants.filter(r =>
        r.name.includes(golfSearch) || r.golf.includes(golfSearch) || (r.genre && r.genre.includes(golfSearch))
      )
    : golfDirection !== "전체"
      ? golfRestaurants.filter(r => dirFilteredCourses.some(c => c.name === r.golf))
      : golfRestaurants.filter(r => r.golf === selectedGolf);

  const currentGolf = golfCourses.find(g => g.name === selectedGolf) || golfCourses[0];
  if (dataLoading) return <div className="loading">🍽️ 데이터 불러오는 중...</div>;


  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">세일즈가이의 <span>식탁</span></div>
        <div className="header-sub">비즈니스 식사 · 직장인 점심 · 골프 귀경</div>
        <div className="db-badge">📦 총 {(509 + 421 + PUBLIC_LUNCH_TOTAL + 239).toLocaleString()}개 DB</div>
      </header>

      <nav className="tab-nav">
        <button className={`tab-btn ${activeTab==="biz"?"active":""}`} onClick={()=>setActiveTab("biz")}>🍽️ 비즈니스</button>
        <button className={`tab-btn ${activeTab==="lunch"?"active":""}`} onClick={()=>setActiveTab("lunch")}>🥢 점심 <span className="new-badge">NEW</span></button>
        <button className={`tab-btn ${activeTab==="golf"?"active":""}`} onClick={()=>setActiveTab("golf")}>⛳ 골프</button>
      </nav>

      {/* ── 비즈니스 탭 ── */}
      {activeTab==="biz" && (
        <div className="content">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="식당명 또는 지역으로 검색"
              value={bizSearch} onChange={e=>setBizSearch(e.target.value)} />
          </div>
          <div className="filter-scroll">
            {BIZ_REGIONS.map(r=>(
              <button key={r} className={`filter-chip ${bizRegion===r?"on":""}`} onClick={()=>setBizRegion(r)}>{r}</button>
            ))}
          </div>
          <div className="filter-scroll">
            {BIZ_GENRES.map(g=>(
              <button key={g} className={`filter-chip ${bizGenre===g?"on":""}`} onClick={()=>setBizGenre(g)}>{g}</button>
            ))}
          </div>
          <div className="info-banner">
            🔍 {bizRegion} · {bizGenre!=="전체"?bizGenre+" · ":""}<b>{bizFiltered.length}곳</b> 발견 (전체 509개)
          </div>
          <div className="rest-list">
            {bizFiltered.length===0
              ? <div className="empty">검색 결과가 없어요 😢</div>
              : bizFiltered.map(r=><RestaurantCard key={r.id} r={r} onClick={r=>openModal(r,"biz")}/>)
            }
          </div>
        </div>
      )}

      {/* ── 직장인 점심 탭 ── */}
      {activeTab==="lunch" && (
        <div className="content">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="식당명 또는 지역으로 검색"
              value={lunchSearch} onChange={e=>setLunchSearch(e.target.value)} />
          </div>
          <div className="filter-scroll">
            {LUNCH_REGIONS.map(r=>(
              <button key={r} className={`filter-chip ${lunchRegion===r?"on":""}`} onClick={()=>setLunchRegion(r)}>{r}</button>
            ))}
          </div>
          <div className="filter-scroll">
            {LUNCH_PRICES.map(p=>(
              <button key={p} className={`filter-chip ${lunchPrice===p?"on":""}`} onClick={()=>setLunchPrice(p)}>{p}</button>
            ))}
          </div>
          <div className="info-banner" style={{background:"#F5EDD8",borderColor:"#C8A96E",color:"#7A5C1E"}}>
            {publicLoading
              ? <>🔍 공공DB 검색 중...</>
              : <>🥢 {lunchRegion} · <b>{lunchSearch.length>=2 ? (lunchFiltered.length + publicTotal).toLocaleString() : (421 + PUBLIC_LUNCH_TOTAL).toLocaleString()}곳</b></>
            }
          </div>
          <div className="rest-list">
            {lunchFiltered.length===0 && publicResults.length===0 && !publicLoading
              ? <div className="empty">검색 결과가 없어요 😢</div>
              : <>
                  {lunchFiltered.map(r=><LunchCard key={r.id} r={r} onClick={r=>openModal(r,"lunch")}/>)}
                  {lunchSearch.length >= 2 && !publicLoading &&
                    publicResults
                      .filter(p => !lunchFiltered.some(c => c.name === p.name))
                      .map((r,i) => <PublicLunchCard key={`pub-${i}`} r={r}/>)
                  }
                  {lunchSearch.length >= 2 && !publicLoading && publicHasMore && (
                    <button
                      onClick={loadMore}
                      disabled={moreLoading}
                      style={{width:"100%",padding:"12px",margin:"8px 0",background:"#F5EDD8",border:"1px solid #C8A96E",borderRadius:10,color:"#7A5C1E",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                      {moreLoading ? "불러오는 중..." : `더 보기 (${Math.min(PAGE, publicTotal - publicOffset - PAGE).toLocaleString()}곳 더)`}
                    </button>
                  )}
                </>
            }
          </div>
        </div>
      )}

      {/* ── 골프 귀경 탭 ── */}
      {activeTab==="golf" && (
        <div className="content">
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="⛳ 골프장명 또는 🍽️ 식당명으로 검색"
              value={golfSearch} onChange={e=>{setGolfSearch(e.target.value); if(e.target.value) setGolfDirection("전체");}} />
            {golfSearch && (
              <button onClick={()=>setGolfSearch("")}
                style={{background:"none",border:"none",fontSize:16,cursor:"pointer",color:"#8A7A6A",padding:"0 4px",lineHeight:1}}>×</button>
            )}
          </div>
          <div className="filter-scroll">
            {GOLF_DIRECTIONS.map(d=>(
              <button key={d} className={`filter-chip ${golfDirection===d&&!golfSearch?"on":""}`}
                onClick={()=>{setGolfDirection(d); setGolfSearch("");}}>
                {d==="전체"?"전체":d+" 방향"}
              </button>
            ))}
          </div>
          {!golfSearch && golfDirection==="전체" && (
            <div style={{padding:"6px 14px 10px",background:"white",borderBottom:"1px solid #EDE8E0"}}>
              <div style={{fontSize:"9px",fontWeight:700,color:"#8A7A6A",marginBottom:5,fontFamily:"monospace"}}>⛳ 오늘 라운딩한 골프장</div>
              <select className="golf-select"
                value={selectedGolf}
                onChange={e=>setSelectedGolf(e.target.value)}>
                {golfCourses.map(g=>(
                  <option key={g.id} value={g.name}>{g.name} ({g.region})</option>
                ))}
              </select>
              {currentGolf && (
                <div style={{fontSize:10,color:"#8A7A6A",marginTop:5}}>
                  📍 {currentGolf.address} · 서울까지 {currentGolf.time} · {currentGolf.grade}
                </div>
              )}
            </div>
          )}
          {!golfSearch && golfDirection!=="전체" && (
            <div style={{padding:"6px 14px 10px",background:"#FFF8F0",borderBottom:"1px solid #EDE8E0",fontSize:11,color:"#7A3000"}}>
              ⛳ {golfDirection} 방향 귀경 · 골프장 {dirFilteredCourses.length}곳
            </div>
          )}
          <div className="info-banner" style={{background:"#FFF0E8",borderColor:"#E05A00",color:"#7A3000"}}>
            {golfSearch
              ? <>🔍 "{golfSearch}" 검색 결과 · <b>{golfRests.length}곳</b></>
              : golfDirection!=="전체"
                ? <>🍽️ {golfDirection} 방향 · <b>{golfRests.length}곳</b> 귀경 맛집</>
                : <>🍽️ {selectedGolf} · <b>{golfRests.length}곳</b> 귀경 맛집</>
            }
          </div>
          <div style={{padding:"0 14px",display:"flex",flexDirection:"column",gap:10,paddingBottom:20}}>
            {golfRests.length===0
              ? <div className="empty">해당 조건의 맛집이 없어요 😢</div>
              : golfRests.map(r=><GolfRestCard key={r.id} r={r}/>)
            }
          </div>
        </div>
      )}

      <DetailModal r={selected} type={selType} onClose={()=>setSelected(null)} />
    </div>
  );
}