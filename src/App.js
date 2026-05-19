import { useState, useEffect, useRef } from "react";
import "./App.css";
import { supabase } from "./supabaseClient";

function openYoutubeShorts(name) {
  const clean = name.replace(/\s*\(.*?\)/g, "").trim();
  window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(clean) + "&sp=EgIYAQ", "_blank");
}

function openNaverSearch(name, area, mapQuery) {
  let query;
  if (mapQuery) {
    query = mapQuery;
  } else {
    let clean;
    if (/^[A-Za-z]/.test(name)) {
      const korean = name.match(/\(([^)]*[가-힣][^)]*)\)/);
      clean = korean ? korean[1].trim() : name.trim();
    } else {
      clean = name.replace(/\s*\(.*?\)/g, "").trim();
    }
    query = clean;
  }
  window.open("https://search.naver.com/search.naver?query=" + encodeURIComponent(query), "_blank");
}

function cleanPublicName(name) {
  return name
    .replace(/^주식회사\s+/,'').replace(/\s+주식회사$/,'').replace(/\(주\)/g,'')
    .replace(/^유한회사\s+/,'').replace(/\s+유한회사$/,'').replace(/\(유\)/g,'')
    .replace(/^합자회사\s+/,'').replace(/\s+합자회사$/,'')
    .trim();
}

function openNaverMap(name, address) {
  // 공공DB: 네이버 지도에서 식당명+주소로 검색 (지도 표시명과 매칭 정확도 향상)
  const query = address ? name + " " + address : name;
  window.open("https://map.naver.com/v5/search/" + encodeURIComponent(query), "_blank");
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

const BIZ_AREAS = ["전체","강남·역삼","청담·압구정","신사·논현","삼성·대치","서초·반포","광화문·종로","을지로·명동","용산·이태원","여의도","마포·홍대","잠실·송파","마곡","분당·판교"];
const GOLF_REGIONS = ["전체","경기북부","경기남부","경기서부"];
function getGolfRegionGroup(region = '') {
  if (region.includes('북부')) return '경기북부';
  if (region.includes('서부')) return '경기서부';
  return '경기남부';
}
const BIZ_GENRES  = ["전체","고기구이","한우","한정식","한식","중식","일식","해산물","양식"];
// 장르 필터: 버튼명 → 매칭 키워드
const GENRE_KEYWORDS = {
  '고기구이': ['고기구이','소고기구이','LA갈비','짝갈비','갈비','돼지고기구이','돼지갈비','곱창','양갈비','양고기구이','고깃집','소고기구이·양곱창'],
  '한우': ['한우','와규'],
  '한정식': ['한정식','한식파인다이닝','한식컨템포러리','궁중음식','채식파인다이닝','한식코스','사찰음식'],
  '한식': ['한식','냉면','평양냉면','샤브샤브','전골·한식','한식퓨전','요리주점','오리요리'],
  '중식': ['중식','딤섬','훠궈'],
  '일식': ['일식','스시','가이세키','이자카야','이자까야','오마카세'],
  '해산물': ['생선회','게요리','장어','해산물','해물','횟집','생선구이','참치'],
  '양식': ['이탈리안','프렌치','파스타','양식','파인다이닝','웨스턴','올데이다이닝'],
};

const LUNCH_PRICES  = ["전체","1만원이하","1만원대","2만원대"];
const LUNCH_GENRES  = ["전체","한식·백반","국밥·해장","면류","분식","중식·마라","일식·덮밥","고기","버거","치킨","샐러드","양식"];
const LUNCH_GENRE_MAP = {
  '한식·백반': ['한식백반','한식','비빔밥','삼계탕','도시락','한식정식','한식뷔페','쌈밥','낙지볶음','제육','닭볶음탕','된장찌개','순두부','찌개','백반','빈대떡','갈치','쭈꾸미','불백','돌솥밥','가정식','만두','쌀밥','한식·'],
  '국밥·해장': ['국밥','순대국','설렁탕','해장국','감자탕','뼈해장국','굴국밥','수육국밥','돼지국밥','육개장','어묵탕','부대찌개','닭한마리','전골','뼈'],
  '면류': ['라멘','칼국수','냉면','국수','쌀국수','우동','마제소바','탄탄멘','탄탄면','막국수','수제비','냉모밀','냉메밀','소바','베트남쌀국수','짬뽕'],
  '분식': ['분식','떡볶이','김밥','쫄면','비빔국수','충무김밥','순대','토스트·브런치'],
  '중식·마라': ['중식','마라탕','마라샹궈','딤섬','탕수육','볶음밥','중식·'],
  '일식·덮밥': ['돈가츠','돈가스','돈카츠','초밥','스시','덮밥','텐동','장어덮밥','참치','회전초밥','타코야끼','일식','돈부리','마제소바'],
  '고기': ['삼겹살','닭갈비','갈비','돼지갈비','돼지구이','곱창','닭발','족발','치킨','통닭'],
  '샐러드': ['샐러드','포케','건강식','비건','요거트'],
  '양식': ['파스타','피자','버거','브런치','베이글','샌드위치','스테이크','타코','케밥','카레','인도','태국','중동','오므라이스'],
  // 체인 전용 장르
  '버거': ['버거'],
  '치킨': ['치킨'],
};
// 카카오 카테고리 → 점심 장르 매핑
const KAKAO_GENRE_MAP = {
  '한식·백반': ['한식','비빔밥','삼계탕','보쌈','쌈밥','찌개'],
  '국밥·해장': ['국밥','해장국','설렁탕','순대국','감자탕','뼈해장국','부대찌개','닭한마리'],
  '면류':      ['라면','우동','냉면','국수','칼국수','쌀국수','소바','라멘'],
  '분식':      ['분식','떡볶이','김밥','쫄면'],
  '중식·마라': ['중국음식','중식','마라탕','딤섬'],
  '일식·덮밥': ['일식','초밥','스시','덮밥','돈까스','돈가스'],
  '고기':      ['고기','삼겹살','갈비','닭갈비','족발','곱창'],
  '버거':      ['햄버거','버거','패스트푸드'],
  '치킨':      ['치킨','닭강정','닭'],
  '샐러드':    ['샐러드','건강식','포케'],
  '양식':      ['양식','피자','파스타','브런치','스테이크'],
};

// 공공DB에서 제외할 커피·음료 체인
const COFFEE_CHAIN_BLOCK = ['할리스','커피빈','아티제','바나프레소','스타벅스','이디야','투썸플레이스','폴바셋','파스쿠찌','드롭탑','엔제리너스','탐앤탐스','카페베네','빽다방','메가커피','컴포즈커피','더벤티','공차','쥬씨','요거트월드'];

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

function GolfRestCard({ r, onClick }) {
  return (
    <div className="golf-card" onClick={() => onClick(r)} style={{cursor:"pointer"}}>
      <div className="golf-top">
        <span style={{fontSize:22}}>{r.emoji}</span>
        <div style={{flex:1}}>
          <div className="golf-rest-name">
            {r.name}
            {r.visited && <span style={{marginLeft:6,fontSize:"10px",background:"#E05A00",color:"white",borderRadius:4,padding:"1px 5px",fontWeight:600,verticalAlign:"middle"}}>직접방문</span>}
          </div>
          <div className="golf-rest-info">{r.genre}</div>
          <div style={{fontSize:"10px",color:"#A0896A",marginTop:1}}>⛳ {r.golf}{r.searchCity ? ` · ${r.searchCity}` : ''}</div>
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

function PublicLunchCard({ r, onClick }) {
  const displayName = cleanPublicName(r.name);
  return (
    <div className="rest-card" onClick={()=>onClick(r)} style={{cursor:"pointer"}}>
      <div className="rest-card-top">
        <div className="rest-emoji">🍴</div>
        <div className="rest-info">
          <div className="rest-name">{displayName}</div>
          <div className="rest-sub">{r.district} · {r.genre}</div>
        </div>
        <div style={{fontSize:"9px",color:"#A09080",flexShrink:0,background:"#F5F0E8",borderRadius:4,padding:"2px 6px"}}>공공DB</div>
      </div>
      <div className="rest-note" style={{fontSize:"10px",color:"#8A7A6A"}}>{r.address}</div>
    </div>
  );
}

function KakaoPlaceCard({ r, onClick }) {
  const genre = r.category_name.split(' > ').slice(1).join(' > ');
  const walkMin = Math.ceil(Number(r.distance) / 67);
  const addr = r.road_address_name || r.address_name || '';
  const shortAddr = addr.split(' ').slice(-2).join(' ');
  return (
    <div className="rest-card" onClick={()=>onClick(r)} style={{cursor:"pointer"}}>
      <div className="rest-card-top">
        <div className="rest-emoji">🍴</div>
        <div className="rest-info">
          <div className="rest-name">{r.place_name}</div>
          <div className="rest-sub">{shortAddr} · {genre}</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:15,fontWeight:900,color:"#00875A",fontFamily:"'DM Mono',monospace",lineHeight:1}}>{r.distance}m</div>
          <div style={{fontSize:9,color:"#8A7A6A",marginTop:3}}>🚶 {walkMin}분</div>
        </div>
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

  // ── 공공DB 모달 ──
  if (type === "public") {
    const cleanName = cleanPublicName(r.name);
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box" onClick={e=>e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>✕</button>
          <div className="modal-emoji">🍴</div>
          <div className="modal-name">{cleanName}</div>
          <div className="modal-area">{r.district}</div>
          <div className="modal-row">
            <div className="modal-item">
              <div className="modal-label">장르</div>
              <div className="modal-val">{r.genre || "-"}</div>
            </div>
            <div className="modal-item">
              <div className="modal-label">전화</div>
              <div className="modal-val" style={{fontSize:11}}>{r.phone || "-"}</div>
            </div>
            <div className="modal-item">
              <div className="modal-label">출처</div>
              <div className="modal-val" style={{fontSize:10,color:"#A09080"}}>공공DB</div>
            </div>
          </div>
          <div className="modal-note" style={{fontSize:11,color:"#8A7A6A"}}>{r.address}</div>
          <div className="modal-actions">
            <div style={{display:"flex",gap:8,width:"100%",marginBottom:8}}>
              <button className="btn-kakao" style={{flex:1}} onClick={()=>openNaverMap(cleanName, null)}>
                🗺️ 네이버지도
              </button>
              <button className="btn-youtube" style={{flex:1}} onClick={()=>openYoutubeShorts(cleanName)}>
                ▶ 유튜브 쇼츠
              </button>
            </div>
            <button className="btn-save" style={{width:"100%",background:"#FEE500",color:"#3C1E1E",border:"none"}}
              onClick={()=>window.open("https://map.kakao.com/link/search/"+encodeURIComponent(cleanName),"_blank")}>
              🗺️ 카카오맵에서 보기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 카카오 주변검색 모달 ──
  if (type === "kakao") {
    const genre = r.category_name ? r.category_name.split(' > ').slice(1).join(' > ') : '';
    const walkMin = Math.ceil(Number(r.distance) / 67);
    const addr = r.road_address_name || r.address_name || '';
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-box" onClick={e=>e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>✕</button>
          <div className="modal-emoji">🍴</div>
          <div className="modal-name">{r.place_name}</div>
          <div className="modal-area">{addr}</div>
          <div className="modal-row">
            <div className="modal-item">
              <div className="modal-label">장르</div>
              <div className="modal-val" style={{fontSize:10}}>{genre || "-"}</div>
            </div>
            <div className="modal-item">
              <div className="modal-label">거리</div>
              <div className="modal-val score-hi">{r.distance}m</div>
            </div>
            <div className="modal-item">
              <div className="modal-label">도보</div>
              <div className="modal-val">🚶 {walkMin}분</div>
            </div>
          </div>
          {r.phone && <div className="modal-note" style={{textAlign:"center",fontSize:12}}>📞 {r.phone}</div>}
          <div className="modal-actions">
            <div style={{display:"flex",gap:8,width:"100%",marginBottom:8}}>
              <button className="btn-kakao" style={{flex:1}} onClick={()=>openNaverSearch(r.place_name, null, null)}>
                🟢 네이버
              </button>
              <button className="btn-youtube" style={{flex:1}} onClick={()=>openYoutubeShorts(r.place_name)}>
                ▶ 유튜브 쇼츠
              </button>
            </div>
            {r.place_url && (
              <button className="btn-save" style={{width:"100%",background:"#FEE500",color:"#3C1E1E",border:"none"}}
                onClick={()=>window.open(r.place_url,"_blank")}>
                🗺️ 카카오맵에서 보기
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── 기존 biz / lunch / golf 모달 ──
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-emoji">{r.emoji || "🍽️"}</div>
        <div className="modal-name">{r.name}</div>
        <div className="modal-area">
          {type==="golf" ? `${r.golf} · 🚗 ${r.distance}` : `${r.region} · ${r.area}`}
        </div>
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
            <div className="modal-label">{type==="biz"?"비즈점수":type==="golf"?"소요시간":"가격대"}</div>
            <div className="modal-val score-hi">{type==="biz"?r.score+"점":type==="golf"?"🚗 "+r.distance:r.price}</div>
          </div>
        </div>
        {type==="biz" && null}
        {type==="lunch" && <div className="modal-room"><span className={r.solo==="✅ 혼밥"?"tag tag-room":"tag tag-maybe"}>{r.solo}</span></div>}
        {type==="golf" && <div className="modal-room"><span className={r.room&&r.room.includes("✅")?"tag tag-room":"tag tag-maybe"}>{r.room&&r.room.includes("✅")?"✅ 룸 있음":"단체가능"}</span></div>}
        <div className="modal-note">{type==="biz"?r.note:type==="golf"?r.tip:r.tip}</div>
        <div className="modal-actions">
          <div style={{display:"flex",gap:8,width:"100%",marginBottom:8}}>
            <button className="btn-kakao" style={{flex:1}} onClick={()=>
              type==="golf"
                ? (r.mapQuery ? openNaverSearch(r.name, null, r.mapQuery) : openNaverMap(r.name, r.searchCity||null))
                : openNaverSearch(r.name, r.area||null, r.mapQuery)
            }>
              {type==="golf" ? "🗺️ 네이버지도" : "🟢 네이버"}
            </button>
            <button className="btn-youtube" style={{flex:1}} onClick={()=>openYoutubeShorts(r.mapQuery||r.name)}>
              ▶ 유튜브 쇼츠
            </button>
          </div>
          <button className={`btn-save ${isFav?"btn-save-on":""}`} onClick={handleFav} style={{width:"100%"}}>
            {isFav ? "❤️ 찜 완료" : "🤍 찜하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

const KAKAO_REST_KEY = process.env.REACT_APP_KAKAO_REST_KEY;

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
      fetch('/data/restaurants.json?v=20260519c').then(r => r.json()),
      fetch('/data/lunch.json?v=20260515h').then(r => r.json()),
      fetch('/data/golf.json?v=20260518i').then(r => r.json()),
    ]).then(([rest, lunch, golf]) => {
      setRestaurants(rest);
      setLunchDB(lunch);
      setGolfCourses(golf.courses);
      setGolfRestaurants(golf.restaurants);
      setDataLoading(false);
    });
  }, []);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handler = e => {
      if (golfDropRef.current && !golfDropRef.current.contains(e.target)) {
        setGolfDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const [activeTab, setActiveTab] = useState("biz");
  const [selected, setSelected]   = useState(null);
  const [selType, setSelType]     = useState("biz");

  // 비즈니스 필터
  const [bizArea, setBizArea]     = useState("전체");
  const [bizGenre, setBizGenre]   = useState("전체");
  const [bizSearch, setBizSearch] = useState("");

  // 점심 필터
  const [lunchGenre, setLunchGenre]   = useState("전체");
  const [lunchPrice, setLunchPrice]   = useState("전체");
  const [lunchSearch, setLunchSearch] = useState("");
  const [cheapOnly, setCheapOnly]     = useState(false);
  // 주변 위치
  const [userLocation, setUserLocation] = useState(null); // {lat, lng, dong, gu}
  const [nearbyMode, setNearbyMode]     = useState(false);
  const [locating, setLocating]         = useState(false);
  const [nearbyRadius, setNearbyRadius] = useState(300);
  const [kakaoPlaces, setKakaoPlaces]   = useState([]);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [kakaoHasMore, setKakaoHasMore] = useState(false);
  const kakaoNextPageRef = useRef(1);

  // 공공 점심 DB (Supabase)
  const [publicResults, setPublicResults] = useState([]);
  const [publicTotal, setPublicTotal] = useState(0);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicOffset, setPublicOffset] = useState(0);
  const [publicHasMore, setPublicHasMore] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const debounceRef = useRef(null);
  const PAGE = 50;

  // 텍스트 검색 → 공공DB
  useEffect(() => {
    if (nearbyMode) return; // 주변 모드일 때는 별도 effect
    if (lunchSearch.length < 2) { setPublicResults([]); setPublicTotal(0); setPublicOffset(0); setPublicHasMore(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPublicLoading(true);
      setPublicOffset(0);
      const [{ data }, { count }] = await Promise.all([
        supabase.from('lunch_public').select('name, address, genre, phone, district').ilike('name', `%${lunchSearch}%`).range(0, PAGE - 1),
        supabase.from('lunch_public').select('*', { count: 'exact', head: true }).ilike('name', `%${lunchSearch}%`)
      ]);
      const results = data || [];
      setPublicResults(results);
      setPublicTotal(count || 0);
      setPublicHasMore(results.length === PAGE);
      setPublicLoading(false);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [lunchSearch, nearbyMode]);

  // 주변 모드 → 카카오 REST API 장소검색 (반경 기반)
  const fetchKakaoPlaces = async (lat, lng, radius, append = false) => {
    setKakaoLoading(true);
    if (!append) { setKakaoPlaces([]); kakaoNextPageRef.current = 1; }
    const page = append ? kakaoNextPageRef.current : 1;
    try {
      const params = new URLSearchParams({
        category_group_code: 'FD6',
        x: String(lng), y: String(lat),
        radius: String(radius),
        sort: 'distance', size: '15', page: String(page),
      });
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/category.json?${params}`,
        { headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` } }
      );
      const data = await res.json();
      const places = data.documents || [];
      if (append) {
        setKakaoPlaces(prev => [...prev, ...places]);
      } else {
        setKakaoPlaces(places);
      }
      const hasMore = !data.meta?.is_end && places.length > 0;
      setKakaoHasMore(hasMore);
      if (hasMore) kakaoNextPageRef.current = page + 1;
    } catch (err) {
      console.error('[Kakao REST]', err);
      if (!append) setKakaoPlaces([]);
      setKakaoHasMore(false);
    }
    setKakaoLoading(false);
    setMoreLoading(false);
  };

  useEffect(() => {
    if (!nearbyMode || !userLocation?.lat) return;
    fetchKakaoPlaces(userLocation.lat, userLocation.lng, nearbyRadius, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyMode, userLocation?.lat, userLocation?.lng, nearbyRadius]);

  const loadMore = async () => {
    if (nearbyMode) {
      if (!kakaoHasMore) return;
      setMoreLoading(true);
      await fetchKakaoPlaces(userLocation.lat, userLocation.lng, nearbyRadius, true);
      return;
    }
    // Supabase 더보기
    setMoreLoading(true);
    const nextOffset = publicOffset + PAGE;
    let q = supabase.from('lunch_public').select('name, address, genre, phone, district')
      .ilike('name', `%${lunchSearch}%`);
    const { data, error } = await q.range(nextOffset, nextOffset + PAGE - 1);
    if (error) console.error('[Supabase 오류]', error);
    const more = data || [];
    setPublicResults(prev => [...prev, ...more]);
    setPublicOffset(nextOffset);
    setPublicHasMore(more.length === PAGE);
    setMoreLoading(false);
  };

  // 골프 필터
  const [golfRegion, setGolfRegion] = useState("전체");
  const [selectedGolf, setSelectedGolf] = useState("");   // 특정 코스 선택
  const [golfSearch, setGolfSearch] = useState("");
  const [golfDropQuery, setGolfDropQuery] = useState(""); // 드롭다운 검색어
  const [golfDropOpen, setGolfDropOpen] = useState(false);
  const golfDropRef = useRef(null);

  const handleNearby = () => {
    if (nearbyMode) {
      setNearbyMode(false); setUserLocation(null);
      setKakaoPlaces([]); setKakaoHasMore(false);
      setPublicResults([]); setPublicTotal(0);
      return;
    }
    if (!navigator.geolocation) { alert('위치 서비스를 지원하지 않는 브라우저입니다.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLocation({ lat, lng, dong: '', gu: '' });
        setNearbyMode(true);
        setLunchSearch('');
        setLocating(false);
        // 카카오 REST API 역지오코딩으로 동/구 이름 가져오기
        fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`, {
          headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` }
        }).then(r => r.json()).then(data => {
          if (data.documents?.[0]) {
            const addr = data.documents[0].address;
            setUserLocation(prev => prev ? {
              ...prev,
              dong: addr.region_3depth_name || '',
              gu:   addr.region_2depth_name || '',
            } : null);
          }
        }).catch(() => {});
      },
      () => { setLocating(false); alert('위치 권한을 허용해주세요.'); },
      { timeout: 8000, maximumAge: 60000 }
    );
  };

  const openModal = (r, type) => { setSelected(r); setSelType(type); };

  const bizFiltered = restaurants.filter(r => {
    if (bizArea !== "전체" && r.area !== bizArea) return false;
    if (bizGenre !== "전체") {
      const kws = GENRE_KEYWORDS[bizGenre] || [bizGenre];
      if (!kws.some(k => r.genre.includes(k))) return false;
    }
    if (bizSearch && !r.name.includes(bizSearch) && !r.area.includes(bizSearch) && !r.genre.includes(bizSearch)) return false;
    return true;
  });

  const lunchFiltered = nearbyMode ? [] : lunchDB.filter(r => {
    if (lunchPrice!=="전체" && r.price!==lunchPrice) return false;
    if (cheapOnly && r.price!=="1만원이하") return false;
    if (lunchGenre!=="전체") {
      const kws = LUNCH_GENRE_MAP[lunchGenre] || [lunchGenre];
      if (!kws.some(k => r.genre.includes(k))) return false;
    }
    if (lunchSearch && !r.name.includes(lunchSearch) && !r.area.includes(lunchSearch)) return false;
    return true;
  });

  // 카카오 결과에 장르 필터 적용
  const filteredKakao = lunchGenre === '전체' ? kakaoPlaces :
    kakaoPlaces.filter(p => {
      const kws = KAKAO_GENRE_MAP[lunchGenre] || [];
      return kws.length === 0 || kws.some(k => p.category_name.includes(k));
    });

  const norm = s => s.replace(/\s/g, '').toLowerCase();
  const distMin = s => parseInt((s || '99분').replace(/[^0-9]/g, '')) || 99;
  const golfRests = (golfSearch
    ? golfRestaurants.filter(r =>
        norm(r.name).includes(norm(golfSearch)) ||
        norm(r.golf).includes(norm(golfSearch)) ||
        (r.genre && r.genre.includes(golfSearch))
      )
    : golfRestaurants.filter(r => {
        if (selectedGolf) return r.golf === selectedGolf;
        if (golfRegion === '전체') return true;
        const course = golfCourses.find(g => g.name === r.golf);
        return getGolfRegionGroup(course?.region) === golfRegion;
      })
  ).slice().sort((a, b) => {
    // 특정 골프장 선택 시: 거리순
    if (selectedGolf || golfSearch) return distMin(a.distance) - distMin(b.distance);
    // 전체 보기: 골프장 가나다순 → 거리순
    const golfCmp = a.golf.localeCompare(b.golf, 'ko');
    if (golfCmp !== 0) return golfCmp;
    return distMin(a.distance) - distMin(b.distance);
  });

  // 드롭다운 코스 목록 필터링 (입력어) + 가나다 정렬
  const golfDropCourses = golfCourses.filter(c => {
    const queryOk = !golfDropQuery || norm(c.name).includes(norm(golfDropQuery));
    return queryOk;
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (dataLoading) return <div className="loading">🍽️ 데이터 불러오는 중...</div>;


  return (
    <div className="app">
      <header className="header">
        <div className="header-logo">세일즈가이의 <span>식탁</span></div>
        <div className="header-sub">비즈니스 식사 · 직장인 점심 · 골프장 맛집</div>
        <div className="db-badge">📦 총 {(restaurants.length + lunchDB.length + PUBLIC_LUNCH_TOTAL + golfRestaurants.length).toLocaleString()}개 DB</div>
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
          <div className="filter-wrap">
            {BIZ_AREAS.map(a=>(
              <button key={a} className={`filter-chip ${bizArea===a?"on":""}`} onClick={()=>setBizArea(a)}>{a}</button>
            ))}
          </div>
          <div className="filter-wrap">
            {BIZ_GENRES.map(g=>(
              <button key={g} className={`filter-chip ${bizGenre===g?"on":""}`} onClick={()=>setBizGenre(g)}>{g}</button>
            ))}
          </div>
          <div className="info-banner">
            🔍 {bizArea!=="전체"?bizArea:"전체"}{bizGenre!=="전체"?" · "+bizGenre:""} · <b>{bizFiltered.length}곳</b> (전체 {restaurants.length}개)
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
          {/* 검색창 + 주변 버튼 */}
          <div style={{display:"flex",gap:8,alignItems:"center",padding:"10px 14px 0"}}>
            <div className="search-wrap" style={{flex:1,margin:0}}>
              <span className="search-icon">🔍</span>
              <input className="search-input" placeholder="식당명으로 검색"
                value={lunchSearch}
                onChange={e=>{ setLunchSearch(e.target.value); if(nearbyMode){setNearbyMode(false);setUserLocation(null);setKakaoPlaces([]);} }} />
            </div>
            <button onClick={handleNearby} style={{
              flexShrink:0, padding:"10px 11px", borderRadius:12,
              border:`1.5px solid ${nearbyMode?"#00875A":locating?"#C8A96E":"#EDE8E0"}`,
              background: nearbyMode?"#D5F5E3":locating?"#F5EDD8":"white",
              color: nearbyMode?"#00875A":locating?"#7A5C1E":"#8A7A6A",
              fontSize:12, fontWeight:800, cursor:locating?"default":"pointer",
              fontFamily:"'Noto Sans KR',sans-serif", whiteSpace:"nowrap", transition:"all 0.2s"
            }}>
              {locating?"⏳ 위치중":nearbyMode?"📍 주변 ON":"📍 주변"}
            </button>
          </div>

          {/* 주변 모드: 위치 배너 + 반경 선택 */}
          {nearbyMode && (
            <div style={{margin:"8px 14px 0",padding:"10px 12px",background:"#D5F5E3",borderRadius:10,border:"1px solid #00875A"}}>
              <div style={{display:"flex",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:800,color:"#00875A"}}>
                  📍 {userLocation?.dong && userLocation?.gu
                    ? `${userLocation.dong} (${userLocation.gu}) 주변`
                    : "현재 위치 주변"}
                </span>
                <button onClick={()=>{setNearbyMode(false);setUserLocation(null);setKakaoPlaces([]);}}
                  style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"#00875A",fontSize:15,lineHeight:1}}>✕</button>
              </div>
              {/* 반경 선택 버튼 */}
              <div style={{display:"flex",gap:6}}>
                {[100,200,300,500].map(r=>(
                  <button key={r} onClick={()=>setNearbyRadius(r)} style={{
                    flex:1, padding:"5px 0", borderRadius:8,
                    border:`1.5px solid ${nearbyRadius===r?"#00875A":"#A8D5B8"}`,
                    background: nearbyRadius===r?"#00875A":"white",
                    color: nearbyRadius===r?"white":"#00875A",
                    fontSize:11, fontWeight:800, cursor:"pointer",
                    fontFamily:"'Noto Sans KR',sans-serif"
                  }}>{r}m</button>
                ))}
              </div>
            </div>
          )}

          {/* 장르 필터 - 2줄 */}
          <div style={{display:"flex",flexWrap:"wrap",gap:5,padding:"8px 14px 4px"}}>
            {LUNCH_GENRES.map(g=>(
              <button key={g} className={`filter-chip ${lunchGenre===g?"on":""}`} onClick={()=>setLunchGenre(g)}
                style={{flex:"0 0 calc(16.66% - 5px)",minWidth:0,textAlign:"center",padding:"5px 2px"}}>
                {g}
              </button>
            ))}
          </div>

          {/* 인포 배너 */}
          <div className="info-banner" style={{background:"#F5EDD8",borderColor:"#C8A96E",color:"#7A5C1E"}}>
            {nearbyMode
              ? kakaoLoading
                ? <>📍 {nearbyRadius}m 반경 검색 중...</>
                : <>📍 반경 {nearbyRadius}m · <b>{filteredKakao.length}곳</b> 발견 (카카오맵)</>
              : publicLoading
                ? <>🔍 공공DB 검색 중...</>
                : <>🥢 <b>{lunchSearch.length>=2?(lunchFiltered.length+publicTotal).toLocaleString():(lunchDB.length+PUBLIC_LUNCH_TOTAL).toLocaleString()}곳</b></>
            }
          </div>

          <div className="rest-list">
            {nearbyMode ? (
              // ── 주변 모드: 카카오 장소 결과 ──
              kakaoLoading
                ? <div className="empty" style={{paddingTop:30}}>📍 주변 음식점 찾는 중...</div>
                : filteredKakao.length === 0
                  ? <div className="empty">반경 {nearbyRadius}m 내 음식점이 없어요 😢<br/><span style={{fontSize:12}}>반경을 늘려보세요</span></div>
                  : <>
                      {filteredKakao.map((r,i)=><KakaoPlaceCard key={r.id||i} r={r} onClick={r=>openModal(r,"kakao")}/>)}
                      {kakaoHasMore && (
                        <button onClick={loadMore} disabled={moreLoading}
                          style={{width:"100%",padding:"12px",margin:"8px 0",background:"#D5F5E3",border:"1px solid #00875A",borderRadius:10,color:"#00875A",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                          {moreLoading?"불러오는 중...":"더 보기"}
                        </button>
                      )}
                    </>
            ) : (
              // ── 일반 모드: 큐레이션 + 공공DB ──
              lunchFiltered.length===0 && publicResults.length===0 && !publicLoading
                ? <div className="empty">검색 결과가 없어요 😢</div>
                : <>
                    {lunchFiltered.map(r=><LunchCard key={r.id} r={r} onClick={r=>openModal(r,"lunch")}/>)}
                    {lunchSearch.length>=2 && !publicLoading &&
                      publicResults
                        .filter(p=>!lunchFiltered.some(c=>c.name===p.name) && !COFFEE_CHAIN_BLOCK.some(k=>p.name.includes(k)))
                        .map((r,i)=><PublicLunchCard key={`pub-${i}`} r={r} onClick={r=>openModal(r,"public")}/>)
                    }
                    {lunchSearch.length>=2 && !publicLoading && publicHasMore && (
                      <button onClick={loadMore} disabled={moreLoading}
                        style={{width:"100%",padding:"12px",margin:"8px 0",background:"#F5EDD8",border:"1px solid #C8A96E",borderRadius:10,color:"#7A5C1E",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                        {moreLoading?"불러오는 중...":"더 보기"}
                      </button>
                    )}
                  </>
            )}
          </div>
        </div>
      )}

      {/* ── 골프 귀경 탭 ── */}
      {activeTab==="golf" && (
        <div className="content">
          <div style={{background:"white",borderBottom:"1px solid #EDE8E0"}}>
              {/* 검색 가능한 코스 드롭다운 */}
              <div style={{padding:"8px 14px 10px"}} ref={golfDropRef}>
                <div style={{position:"relative"}}>
                  <input
                    className="golf-select"
                    style={{width:"100%",boxSizing:"border-box",cursor:"text",paddingRight:28}}
                    placeholder="⛳ 골프장 직접 선택 (검색 가능)"
                    value={golfDropOpen ? golfDropQuery : (selectedGolf || "")}
                    onFocus={()=>{ setGolfDropOpen(true); setGolfDropQuery(""); }}
                    onBlur={()=>setTimeout(()=>setGolfDropOpen(false), 150)}
                    onChange={e=>{ setGolfDropQuery(e.target.value); setGolfDropOpen(true); }}
                  />
                  {golfDropOpen && (
                    <div style={{position:"absolute",top:"100%",left:0,right:0,background:"white",border:"1px solid #E0D8CC",borderTop:"none",borderRadius:"0 0 8px 8px",maxHeight:240,overflowY:"auto",zIndex:100,boxShadow:"0 4px 12px rgba(0,0,0,0.1)"}}>
                      {/* 전체 보기 고정 항목 */}
                      {!golfDropQuery && (
                        <div
                          onMouseDown={e=>{ e.preventDefault(); setSelectedGolf(""); setGolfDropQuery(""); setGolfDropOpen(false); }}
                          style={{padding:"10px 14px",fontSize:13,cursor:"pointer",borderBottom:"2px solid #EDE8E0",display:"flex",alignItems:"center",gap:6,fontWeight:600,color:"#5A4A3A",background:"#FFF8F0"}}>
                          <span>⛳</span><span>전체 보기</span>
                        </div>
                      )}
                      {golfDropCourses.length === 0
                        ? <div style={{padding:"12px 14px",fontSize:13,color:"#8A7A6A"}}>검색 결과 없음</div>
                        : golfDropCourses.map(c=>(
                            <div key={c.id}
                              onMouseDown={e=>{ e.preventDefault(); setSelectedGolf(c.name); setGolfDropQuery(""); setGolfDropOpen(false); }}
                              style={{padding:"10px 14px",fontSize:13,cursor:"pointer",borderBottom:"1px solid #F5F0EA",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                              onMouseEnter={e=>e.currentTarget.style.background="#FFF8F0"}
                              onMouseLeave={e=>e.currentTarget.style.background="white"}>
                              <span>{c.name}</span>
                              <span style={{fontSize:11,color:"#A0896A"}}>{c.region}</span>
                            </div>
                          ))
                      }
                    </div>
                  )}
                </div>
              </div>
          </div>
          <div className="info-banner" style={{background:"#FFF0E8",borderColor:"#E05A00",color:"#7A3000"}}>

            {selectedGolf
                ? <>⛳ {selectedGolf} · <b>{golfRests.length}곳</b></>
                : <>⛳ 골프장 <b>{golfCourses.length}개</b> · 맛집 <b>{golfRests.length}곳</b></>
            }
          </div>
          <div style={{padding:"0 14px",display:"flex",flexDirection:"column",gap:10,paddingBottom:20}}>
            {golfRests.length===0
              ? <div className="empty">{selectedGolf ? `⛳ ${selectedGolf} 맛집 데이터를 준비 중이에요` : '해당 조건의 맛집이 없어요 😢'}</div>
              : golfRests.map(r=>{
                  const course = golfCourses.find(g=>g.name===r.golf);
                  const city = course?.region?.match(/\(([^)]+)\)/)?.[1] || course?.region || '';
                  return <GolfRestCard key={r.id} r={{...r, searchCity: city}} onClick={r=>openModal(r,"golf")}/>;
                })
            }
          </div>
        </div>
      )}

      <DetailModal r={selected} type={selType} onClose={()=>setSelected(null)} />
    </div>
  );
}