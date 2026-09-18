/*
 * 8A8 Seasonal Theme Engine
 * --------------------------
 * Tự động chọn không khí theo ngày:
 * - 02/09: Quốc Khánh Việt Nam
 * - Rằm Trung Thu: vùng ngày âm lịch xấp xỉ theo tháng 8 âm lịch
 * - Tết: khoảng Jan-Feb theo cửa sổ ngày dương phổ biến
 * - 20/11: Nhà giáo Việt Nam
 * - 08/03 + 20/10: ngày dành cho phụ nữ
 * - 31/10: Halloween
 * - 24-25/12: Noel
 * - còn lại: school / normal
 *
 * Engine không dùng icon rơi chung chung.
 * Canvas chỉ vẽ hình ảnh đặc trưng của từng mùa/lễ.
 */

(() => {
  "use strict";

  const CONFIG = {
    titleMap: {
      normal: "8A8 • SCHOOL MODE",
      national: "Vinh Quang Việt Nam",
      "mid-autumn": "Đêm Trăng 8A8",
      tet: "Tết Nguyên Đán • 8A8",
      teachers: "Tri ân Thầy Cô • 20/11",
      women: "Rực rỡ tháng dành cho phụ nữ",
      halloween: "Halloween Night • 8A8",
      christmas: "Merry Christmas • 8A8"
    },
    classes: {
      scene: "seasonal-scene"
    }
  };

  const state = {
    season: "normal",
    canvas: null,
    ctx: null,
    raf: 0,
    width: 0,
    height: 0,
    dpr: 1,
    particles: [],
    last: 0,
    dayKey: ""
  };

  const pad = n => String(n).padStart(2, "0");
  const localDayKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  function isBetweenMonthDay(date, month, day, before = 0, after = 0) {
    const x = new Date(date.getFullYear(), month - 1, day);
    const a = new Date(x); a.setDate(a.getDate() - before);
    const b = new Date(x); b.setDate(b.getDate() + after);
    return date >= a && date <= b;
  }

  function detectSeason(date = new Date()) {
    const m = date.getMonth() + 1;
    const d = date.getDate();

    // Exact/near-day holiday windows.
    if (m === 9 && d === 2) return "national";
    if (m === 11 && d === 20) return "teachers";
    if (m === 3 && d === 8) return "women";
    if (m === 10 && d === 20) return "women";
    if (m === 10 && d === 31) return "halloween";
    if (m === 12 && (d === 24 || d === 25)) return "christmas";

    // Tết visual window: January–February.
    // The exact lunar New Year changes every year; this broad window
    // intentionally gives the theme room around the holiday.
    if ((m === 1 && d >= 20) || (m === 2 && d <= 20)) return "tet";

    // Mid-Autumn is the 15th day of the 8th lunar month.
    // Without an astronomical lunar calendar dependency, use a compact
    // date-window table for the common school-year range 2026–2035.
    const midAutumn = {
      2026: "2026-09-25",
      2027: "2027-09-15",
      2028: "2028-10-03",
      2029: "2029-09-22",
      2030: "2030-09-12",
      2031: "2031-10-01",
      2032: "2032-09-20",
      2033: "2033-09-08",
      2034: "2034-09-27",
      2035: "2035-09-16"
    };
    const key = midAutumn[date.getFullYear()];
    if (key) {
      const target = new Date(`${key}T00:00:00`);
      const diff = Math.abs(date - target) / 86400000;
      if (diff <= 2) return "mid-autumn";
    }

    return "normal";
  }

  function ensureScene() {
    let scene = document.getElementById("seasonalScene");
    if (!scene) {
      scene = document.createElement("div");
      scene.id = "seasonalScene";
      scene.setAttribute("aria-hidden", "true");
      scene.innerHTML = `
        <div class="seasonal-sky-glow"></div>
        <canvas id="seasonalCanvas"></canvas>
        <div class="seasonal-title" id="seasonalTitle"></div>

        <div class="national-flag left"></div>
        <div class="national-flag right"></div>

        <div class="moon-disc"></div>
        <div class="lantern-rail left"><i class="lantern"></i><i class="lantern"></i><i class="lantern"></i></div>
        <div class="lantern-rail right"><i class="lantern"></i><i class="lantern"></i><i class="lantern"></i></div>

        <div class="couplet left">AN KHANG<br>THỊNH VƯỢNG</div>
        <div class="couplet right">VẠN SỰ<br>NHƯ Ý</div>
        <div class="blossom-branch left"></div>
        <div class="blossom-branch right"></div>

        <div class="tribute-ribbon">Biết ơn người gieo hạt • Kính chúc Thầy Cô</div>
        <div class="rose-corner left"></div>
        <div class="rose-corner right"></div>

        <div class="women-halo"></div>

        <div class="pumpkin"></div>
        <div class="bat one"></div>
        <div class="bat two"></div>

        <div class="xmas-tree"><div class="tree-trunk"></div></div>
      `;
      document.body.prepend(scene);
    }

    state.canvas = document.getElementById("seasonalCanvas");
    state.ctx = state.canvas.getContext("2d", { alpha: true });
    return scene;
  }

  function resize() {
    if (!state.canvas) return;
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    state.canvas.width = Math.floor(state.width * state.dpr);
    state.canvas.height = Math.floor(state.height * state.dpr);
    state.canvas.style.width = `${state.width}px`;
    state.canvas.style.height = `${state.height}px`;
    state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  function createParticles(season) {
    state.particles = [];
    const count = Math.min(90, Math.max(28, Math.floor(window.innerWidth / 18)));

    for (let i = 0; i < count; i++) {
      state.particles.push({
        x: rand(0, window.innerWidth),
        y: rand(0, window.innerHeight),
        r: rand(1, 3.4),
        speed: rand(.12, .55),
        phase: rand(0, Math.PI * 2),
        drift: rand(.2, 1.2),
        alpha: rand(.22, .72)
      });
    }

    if (season === "national") {
      // Firework launch points, not falling icons.
      state.particles.push(
        { type:"firework", x:rand(.15,.85)*innerWidth, y:rand(.15,.45)*innerHeight, r:1, life:0 },
        { type:"firework", x:rand(.15,.85)*innerWidth, y:rand(.2,.55)*innerHeight, r:1, life:70 }
      );
    }
  }

  function circle(ctx,x,y,r,fill,alpha=1){
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle=fill;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawStar(ctx, cx, cy, outer, inner, points, fill) {
    let rot = -Math.PI / 2;
    ctx.beginPath();
    for(let i=0;i<points*2;i++){
      const r = i % 2 ? inner : outer;
      const x = cx + Math.cos(rot) * r;
      const y = cy + Math.sin(rot) * r;
      i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
      rot += Math.PI / points;
    }
    ctx.closePath();
    ctx.fillStyle=fill;
    ctx.fill();
  }

  function drawFlagBackdrop(ctx) {
    const w = Math.min(330, state.width * .36);
    const h = w * .62;
    const y = Math.max(105, state.height * .18);
    const x = state.width/2 - w/2;
    ctx.save();
    ctx.globalAlpha=.055;
    ctx.fillStyle="#d71f2d";
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.lineTo(x+w,y+h);
    ctx.lineTo(x,y+h);
    ctx.closePath();
    ctx.fill();
    drawStar(ctx,state.width/2,y+h*.5,w*.18,w*.075,5,"#ffd72f");
    ctx.restore();
  }

  function drawMoonlight(ctx) {
    const x = state.width*.82, y=state.height*.23, r=Math.min(state.width,state.height)*.13;
    const g=ctx.createRadialGradient(x-r*.25,y-r*.3,r*.1,x,y,r);
    g.addColorStop(0,"rgba(255,250,215,.42)");
    g.addColorStop(.55,"rgba(255,215,107,.16)");
    g.addColorStop(1,"rgba(255,215,107,0)");
    ctx.fillStyle=g;ctx.fillRect(x-r*2,y-r*2,r*4,r*4);
  }

  function drawTetGlow(ctx) {
    ctx.save();
    ctx.globalAlpha=.10;
    for(let i=0;i<7;i++){
      const x=(i%2?0.93:0.07)*state.width;
      const y=(i*.14+.1)*state.height;
      circle(ctx,x,y,45+i*7,"#ffca55");
    }
    ctx.restore();
  }

  function drawTeachers(ctx) {
    // A subtle open-book / classroom motif.
    const cx=state.width*.5, cy=state.height*.76, w=Math.min(520,state.width*.5);
    ctx.save();
    ctx.globalAlpha=.075;
    ctx.strokeStyle="#b4e5a2";
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(cx,cy);ctx.quadraticCurveTo(cx-w*.55,cy-w*.12,cx-w,cy);
    ctx.quadraticCurveTo(cx-w*.55,cy+w*.12,cx,cy);
    ctx.quadraticCurveTo(cx+w*.55,cy-w*.12,cx+w,cy);
    ctx.quadraticCurveTo(cx+w*.55,cy+w*.12,cx,cy);
    ctx.stroke();
    ctx.restore();
  }

  function drawWomen(ctx) {
    ctx.save();
    ctx.globalAlpha=.09;
    const cx=state.width/2,cy=state.height*.22;
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      const x=cx+Math.cos(a)*130, y=cy+Math.sin(a)*90;
      ctx.strokeStyle="#ffb6dc";
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.arc(x,y,24,0,Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHalloween(ctx) {
    ctx.save();
    ctx.globalAlpha=.09;
    for(let i=0;i<5;i++){
      const x=state.width*(.1+i*.2), y=state.height*(.16+(i%2)*.12);
      ctx.fillStyle="#ff8b2e";
      ctx.beginPath();
      ctx.arc(x,y,55,0,Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawChristmas(ctx) {
    // Snow is rendered softly, with depth. No emoji/icon rain.
    ctx.save();
    for(const p of state.particles){
      p.y += p.speed * 5;
      p.x += Math.sin(performance.now()/1400+p.phase)*.25;
      if(p.y>state.height+10){p.y=-10;p.x=rand(0,state.width)}
      circle(ctx,p.x,p.y,p.r,"#eef8ff",p.alpha*.55);
    }
    ctx.restore();
  }

  function drawFireworks(ctx) {
    const t=performance.now()/1000;
    const positions=[
      [.18,.25],[.78,.28],[.54,.16],[.32,.48]
    ];
    positions.forEach((pos,idx)=>{
      const x=state.width*pos[0],y=state.height*pos[1];
      const pulse=(Math.sin(t*1.4+idx*1.7)+1)/2;
      const rays=18;
      ctx.save();
      ctx.globalAlpha=.08+.10*pulse;
      ctx.strokeStyle="#ffd63e";
      ctx.lineWidth=1.4;
      for(let i=0;i<rays;i++){
        const a=i*Math.PI*2/rays+t*.05;
        const rr=20+pulse*38;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*rr,y+Math.sin(a)*rr);ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawCanvas(now) {
    if(!state.ctx) return;
    const ctx=state.ctx;
    ctx.clearRect(0,0,state.width,state.height);

    const s=state.season;
    if(s==="national"){
      drawFlagBackdrop(ctx);drawFireworks(ctx);
    } else if(s==="mid-autumn"){
      drawMoonlight(ctx);
    } else if(s==="tet"){
      drawTetGlow(ctx);
    } else if(s==="teachers"){
      drawTeachers(ctx);
    } else if(s==="women"){
      drawWomen(ctx);
    } else if(s==="halloween"){
      drawHalloween(ctx);
    } else if(s==="christmas"){
      drawChristmas(ctx);
    } else {
      // Normal mode: restrained ambient depth, not falling icons.
      const g=ctx.createRadialGradient(state.width*.5,state.height*.2,0,state.width*.5,state.height*.2,state.width*.65);
      g.addColorStop(0,"rgba(101,230,207,.055)");
      g.addColorStop(1,"rgba(101,230,207,0)");
      ctx.fillStyle=g;ctx.fillRect(0,0,state.width,state.height);
    }

    state.raf=requestAnimationFrame(drawCanvas);
  }

  function setTitle(season) {
    const title=document.getElementById("seasonalTitle");
    if(!title) return;
    title.textContent=CONFIG.titleMap[season]||CONFIG.titleMap.normal;
    title.classList.toggle("show", season!=="normal");
  }

  function setSeason(season, date = new Date()) {
    ensureScene();
    if(state.season===season && state.dayKey===localDayKey(date)) return;
    state.season=season;
    state.dayKey=localDayKey(date);

    document.documentElement.dataset.season=season;
    document.body.classList.add("seasonal-active");
    document.body.dataset.season=season;
    setTitle(season);
    createParticles(season);
    resize();

    document.dispatchEvent(new CustomEvent("a8a8:season-change",{
      detail:{season,date}
    }));
  }

  function refresh() {
    setSeason(detectSeason(new Date()));
  }

  function init() {
    ensureScene();
    window.addEventListener("resize",resize,{passive:true});
    refresh();
    cancelAnimationFrame(state.raf);
    state.raf=requestAnimationFrame(drawCanvas);

    // Keeps the engine correct across midnight without reloading the page.
    setInterval(refresh,60*1000);

    // Optional manual API:
    window.A8A8Seasonal={
      refresh,
      detectSeason,
      setSeason,
      get season(){return state.season}
    };
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init,{once:true});
  } else {
    init();
  }
})();
