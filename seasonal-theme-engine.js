/*
 * 8A8 Seasonal Theme Engine - Premium Edition
 * -------------------------------------------
 * Bổ sung hệ thống Particle thông minh cho Canvas. Mỗi ngày lễ
 * có một kiểu render riêng biệt: Pháo hoa, Hoa rơi, Tuyết bay, Trái tim...
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
    }
  };

  const state = {
    season: "normal", canvas: null, ctx: null, raf: 0,
    width: 0, height: 0, dpr: 1, particles: [],
    mouseX: window.innerWidth / 2, mouseY: window.innerHeight / 2,
    dayKey: ""
  };

  const pad = n => String(n).padStart(2, "0");
  const localDayKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const rand = (a, b) => a + Math.random() * (b - a);

  // Lắng nghe chuột để hạt tương tác nhẹ
  window.addEventListener('mousemove', e => {
    state.mouseX = e.clientX; state.mouseY = e.clientY;
  }, {passive: true});

  function detectSeason(date = new Date()) {
    const forced = new URLSearchParams(location.search).get("season") || (()=>{try{return localStorage.getItem("a8a8-force-season")||""}catch(e){return ""}})();
    if (forced && CONFIG.titleMap[forced]) return forced;
    const m = date.getMonth() + 1, d = date.getDate();

    if (m === 9 && d === 2) return "national";
    if (m === 11 && d === 20) return "teachers";
    if ((m === 3 && d === 8) || (m === 10 && d === 20)) return "women";
    if (m === 10 && d === 31) return "halloween";
    if (m === 12 && (d >= 24 && d <= 25)) return "christmas";
    if ((m === 1 && d >= 20) || (m === 2 && d <= 20)) return "tet";

    // Trung thu (15/8 Âm lịch) theo lịch xấp xỉ
    const midAutumn = {2026:"2026-09-25",2027:"2027-09-15",2028:"2028-10-03",2029:"2029-09-22",2030:"2030-09-12"};
    if (midAutumn[date.getFullYear()]) {
      const target = new Date(`${midAutumn[date.getFullYear()]}T00:00:00`);
      if (Math.abs(date - target) / 86400000 <= 2) return "mid-autumn";
    }
    return "normal";
  }

  function ensureScene() {
    let scene = document.getElementById("seasonalScene");
    if (!scene) {
      scene = document.createElement("div");
      scene.id = "seasonalScene";
      scene.innerHTML = `
        <canvas id="seasonalCanvas"></canvas>
        <div class="seasonal-title" id="seasonalTitle"></div>
        <div class="national-flag left"></div><div class="national-flag right"></div>
        <div class="moon-disc"></div>
        <div class="lantern-rail left"><i class="lantern"></i><i class="lantern"></i><i class="lantern"></i></div>
        <div class="lantern-rail right"><i class="lantern"></i><i class="lantern"></i><i class="lantern"></i></div>
        <div class="couplet left">AN KHANG<br>THỊNH VƯỢNG</div><div class="couplet right">VẠN SỰ<br>NHƯ Ý</div>
        <div class="blossom-branch left"></div><div class="blossom-branch right"></div>
        <div class="tribute-ribbon">Biết ơn người gieo hạt • Kính chúc Thầy Cô</div>
        <div class="rose-corner left"></div><div class="rose-corner right"></div>
        <div class="women-halo"></div>
        <div class="pumpkin"></div><div class="bat one"></div><div class="bat two"></div>
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
    state.canvas.width = state.width * state.dpr;
    state.canvas.height = state.height * state.dpr;
    state.ctx.scale(state.dpr, state.dpr);
    createParticles(state.season); // Re-init on resize
  }

  function spawnFirework() {
    const x = rand(state.width * 0.1, state.width * 0.9);
    const y = rand(state.height * 0.1, state.height * 0.5);
    const colors = ["#ffea33", "#da251d", "#ff8c00"];
    const color = colors[Math.floor(rand(0, colors.length))];
    for(let i=0; i<40; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(2, 8);
      state.particles.push({
        type: 'spark', x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
        life: 1, decay: rand(0.015, 0.03), color, size: rand(2, 4)
      });
    }
  }

  function createParticles(season) {
    state.particles = [];
    const count = Math.floor(state.width / 15);

    if (season === "tet") {
      // Hoa đào rơi
      for (let i = 0; i < count; i++) {
        state.particles.push({
          x: rand(0, state.width), y: rand(-state.height, state.height),
          size: rand(4, 10), speedY: rand(0.5, 1.5), speedX: rand(-0.5, 0.5),
          angle: rand(0, 360), spin: rand(-2, 2), type: rand(0,1) > 0.3 ? '#ff9eb1' : '#ffe16b'
        });
      }
    } else if (season === "christmas") {
      // Tuyết đa lớp (Parallax)
      for (let i = 0; i < count * 1.5; i++) {
        state.particles.push({
          x: rand(0, state.width), y: rand(-state.height, state.height),
          size: rand(1, 4), speedY: rand(1, 3), drift: rand(-0.5, 0.5), alpha: rand(0.3, 0.9)
        });
      }
    } else if (season === "women") {
      // Trái tim bay lên
      for (let i = 0; i < count/2; i++) {
        state.particles.push({
          x: rand(0, state.width), y: rand(state.height, state.height * 2),
          size: rand(10, 20), speedY: rand(-1, -2.5), alpha: rand(0.2, 0.6), offset: rand(0, Math.PI*2)
        });
      }
    } else if (season === "halloween") {
      // Hạt sương mù
      for (let i = 0; i < 20; i++) {
        state.particles.push({
          x: rand(0, state.width), y: rand(state.height*0.5, state.height),
          size: rand(100, 300), speedX: rand(-0.2, 0.2), alpha: rand(0.02, 0.08)
        });
      }
    } else if (season === "teachers") {
      // Bụi phấn rực rỡ
      for (let i = 0; i < count; i++) {
        state.particles.push({
          x: rand(0, state.width), y: rand(0, state.height),
          size: rand(1, 3), speedY: rand(0.2, 0.8), alpha: rand(0.1, 0.8), flicker: rand(0.01, 0.05)
        });
      }
    }
  }

  function drawHeart(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y + size / 4);
    ctx.quadraticCurveTo(x, y, x + size / 4, y);
    ctx.quadraticCurveTo(x + size / 2, y, x + size / 2, y + size / 4);
    ctx.quadraticCurveTo(x + size / 2, y, x + size * 3/4, y);
    ctx.quadraticCurveTo(x + size, y, x + size, y + size / 4);
    ctx.quadraticCurveTo(x + size, y + size / 2, x + size / 2, y + size * 3/4);
    ctx.quadraticCurveTo(x, y + size / 2, x, y + size / 4);
    ctx.fill();
  }

  function drawCanvas() {
    if (!state.ctx) return;
    const ctx = state.ctx;
    ctx.clearRect(0, 0, state.width, state.height);
    const s = state.season;

    if (s === "national") {
      if (Math.random() < 0.02) spawnFirework();
      for (let i = state.particles.length - 1; i >= 0; i--) {
        let p = state.particles[i];
        p.vy += 0.1; // Gravity
        p.x += p.vx; p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) { state.particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;

    } else if (s === "tet") {
      state.particles.forEach(p => {
        p.y += p.speedY; p.x += p.speedX + Math.sin(p.y * 0.01) * 0.5;
        p.angle += p.spin;
        if (p.y > state.height + 20) { p.y = -20; p.x = rand(0, state.width); }
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.angle * Math.PI / 180);
        ctx.fillStyle = p.type; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size/2, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      });

    } else if (s === "christmas") {
      const wind = (state.mouseX - state.width/2) * 0.002; // Tương tác gió nhẹ bằng chuột
      ctx.fillStyle = "#fff";
      state.particles.forEach(p => {
        p.y += p.speedY; p.x += p.drift + wind;
        if (p.y > state.height) { p.y = -10; p.x = rand(0, state.width); }
        ctx.globalAlpha = p.alpha;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
      });
      ctx.globalAlpha = 1;

    } else if (s === "women") {
      ctx.fillStyle = "#ffa1d1";
      state.particles.forEach(p => {
        p.y += p.speedY; p.x += Math.sin(p.y * 0.01 + p.offset) * 0.5;
        if (p.y < -50) { p.y = state.height + 50; p.x = rand(0, state.width); }
        ctx.globalAlpha = p.alpha;
        drawHeart(ctx, p.x, p.y, p.size);
      });
      ctx.globalAlpha = 1;

    } else if (s === "halloween") {
      state.particles.forEach(p => {
        p.x += p.speedX;
        if (p.x < -p.size) p.x = state.width + p.size;
        if (p.x > state.width + p.size) p.x = -p.size;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, `rgba(137,74,227,${p.alpha})`);
        grad.addColorStop(1, "rgba(137,74,227,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
      });
    } else if (s === "teachers") {
      ctx.fillStyle = "#ffd570";
      state.particles.forEach(p => {
        p.y -= p.speedY;
        p.alpha += Math.sin(Date.now() * p.flicker) * 0.05;
        if(p.alpha < 0) p.alpha = 0; if(p.alpha > 1) p.alpha = 1;
        if (p.y < 0) { p.y = state.height; }
        ctx.globalAlpha = p.alpha;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    state.raf = requestAnimationFrame(drawCanvas);
  }

  function setSeason(season, date = new Date()) {
    ensureScene();
    if(state.season === season && state.dayKey === localDayKey(date)) return;
    state.season = season; state.dayKey = localDayKey(date);

    document.documentElement.dataset.season = season;
    document.body.className = `seasonal-active season-${season}`;
    
    const title = document.getElementById("seasonalTitle");
    if(title) {
      title.textContent = CONFIG.titleMap[season] || CONFIG.titleMap.normal;
      title.classList.toggle("show", season !== "normal");
    }

    createParticles(season);
    resize();
  }

  function init() {
    ensureScene();
    window.addEventListener("resize", resize, {passive: true});
    setSeason(detectSeason(new Date()));
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(drawCanvas);
    setInterval(() => setSeason(detectSeason(new Date())), 60 * 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once: true});
  } else {
    init();
  }
})();
            
