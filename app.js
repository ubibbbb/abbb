// app.js — full implementation: three.js scene, responsive, particle pool, mediapipe hands integration, UI bindings
(() => {
  // ---------- basic dom
  const canvas = document.getElementById('three-canvas');
  const statusEl = document.getElementById('status');
  const camVideo = document.getElementById('cam');
  const dots = document.getElementById('dots');
  const panel = document.getElementById('menu-panel');
  const applyBtn = document.getElementById('apply');
  const resetBtn = document.getElementById('reset');
  const particleTextInput = document.getElementById('particleText');
  const mappingSelect = document.getElementById('mapping');
  const densityInput = document.getElementById('density');

  dots.addEventListener('click', ()=> {
    panel.classList.toggle('hidden');
    panel.setAttribute('aria-hidden', panel.classList.contains('hidden') ? 'true' : 'false');
  });

  applyBtn.addEventListener('click', ()=>{
    const t = particleTextInput.value.trim() || 'abibkah';
    window.dispatchEvent(new CustomEvent('particleTextUpdate',{detail:{text:t}}));
    const m = mappingSelect.value;
    window.dispatchEvent(new CustomEvent('mappingUpdate',{detail:{value:m}}));
    const d = parseInt(densityInput.value,10) || 28;
    window.dispatchEvent(new CustomEvent('densityUpdate',{detail:{value:d}}));
    panel.classList.add('hidden');
  });

  resetBtn.addEventListener('click', ()=>{
    particleTextInput.value = 'abibkah';
    mappingSelect.value = 'text';
    densityInput.value = 28;
    applyBtn.click();
  });

  // ---------- three.js renderer + scene
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000010, 0.0025);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 3000);
  camera.position.set(0, 0, 140);

  // ambient glow
  const amb = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.3);
  dir.position.set(50,60,100);
  scene.add(dir);

  // background stars (instanced for perf)
  function makeStars(count=2000){
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count*3);
    for(let i=0;i<count;i++){
      pos[i*3] = (Math.random()-0.5)*2200;
      pos[i*3+1] = (Math.random()-0.5)*1200;
      pos[i*3+2] = -Math.random()*2600;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
    const mat = new THREE.PointsMaterial({size:1.2, color:0xffffff, transparent:true, opacity:0.9});
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
  }
  makeStars(4200);

  // soft planet in background
  const planetGeom = new THREE.SphereGeometry(26, 32, 32);
  const planetMat = new THREE.MeshBasicMaterial({color:0x2b1b6f, transparent:true, opacity:0.06});
  const planet = new THREE.Mesh(planetGeom, planetMat);
  planet.position.set(-70, 28, -220);
  scene.add(planet);

  // ---------- particle pooling system (recycle meshes)
  const MAX_PARTICLES = 420;
  const pool = [];
  const active = [];

  // base materials (shared)
  const loader = new THREE.TextureLoader();
  const spriteCache = {}; // for text sprite cache

  function makeTextSpriteMaterial(text){
    const key = `txt-${text}`;
    if(spriteCache[key]) return spriteCache[key].clone();
    const size = 512;
    const c = document.createElement('canvas'); c.width=c.height=size;
    const ctx = c.getContext('2d');
    // background transparent
    const g = ctx.createLinearGradient(0,0,size,size);
    g.addColorStop(0,'#7afcff'); g.addColorStop(1,'#7f3bff');
    ctx.font = 'bold 84px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.clearRect(0,0,size,size);
    // subtle stroke
    ctx.lineWidth = 18;
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.strokeText(text, size/2, size/2);
    ctx.fillStyle = g;
    ctx.fillText(text, size/2, size/2);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    const mat = new THREE.SpriteMaterial({map:tex, transparent:true});
    spriteCache[key] = mat;
    return mat.clone();
  }

  function makeSaturnMesh(){
    // sphere + ring (torus)
    const group = new THREE.Group();
    const sGeom = new THREE.SphereGeometry(10, 32, 24);
    const sMat = new THREE.MeshStandardMaterial({color:0xffd37a, metalness:0.1, roughness:0.6});
    const sphere = new THREE.Mesh(sGeom, sMat);
    group.add(sphere);
    const ringGeom = new THREE.TorusGeometry(16, 2.8, 8, 64);
    const ringMat = new THREE.MeshStandardMaterial({color:0xff9fb1, emissive:0x663366, emissiveIntensity:0.08, metalness:0.2});
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = 0.9;
    group.add(ring);
    return group;
  }

  function makeHeartMesh(){
    // heart shape extruded
    const x = 0, y = 0;
    const heartShape = new THREE.Shape();
    heartShape.moveTo(x, y + 5);
    heartShape.bezierCurveTo(x + 5, y + 12, x + 18, y + 12, x + 18, y + 3);
    heartShape.bezierCurveTo(x + 18, y - 6, x + 11, y - 12, x, y - 20);
    heartShape.bezierCurveTo(x - 11, y - 12, x - 18, y - 6, x - 18, y + 3);
    heartShape.bezierCurveTo(x - 18, y + 12, x - 5, y + 12, x, y + 5);
    const extrudeSettings = {depth:2, bevelEnabled:true, bevelThickness:0.8, bevelSize:0.6, bevelSegments:3};
    const geom = new THREE.ExtrudeGeometry(heartShape, extrudeSettings);
    geom.scale(0.6, 0.6, 0.6);
    const mat = new THREE.MeshStandardMaterial({color:0xff6b81, metalness:0.1, roughness:0.5});
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = Math.PI;
    return mesh;
  }

  function makeShardMesh(){
    const geom = new THREE.OctahedronGeometry(3.2, 0);
    const mat = new THREE.MeshStandardMaterial({color:0xb0c4de, metalness:0.9, roughness:0.15, emissive:0x111122});
    const mesh = new THREE.Mesh(geom, mat);
    return mesh;
  }

  function spawn(type, nx, ny, intensity=1){
    // nx,ny normalized screen [0..1] from gesture center
    // convert to world position on plane z=0
    const px = (nx*2 - 1);
    const py = - (ny*2 - 1);
    const vec = new THREE.Vector3(px, py, 0.5).unproject(camera);
    const dir = vec.sub(camera.position).normalize();
    const distance = (0 - camera.position.z) / dir.z;
    const pos = camera.position.clone().add(dir.multiplyScalar(distance));
    // choose geometry based on type
    let obj;
    if(pool.length > 0){
      obj = pool.pop();
      obj.visible = true;
    } else {
      obj = new THREE.Group(); // placeholder wrapper
      obj._meta = {}; // store meta
    }
    // clear children
    while(obj.children.length) obj.remove(obj.children[0]);

    if(type === 'saturn'){
      const g = makeSaturnMesh();
      obj.add(g);
      obj.scale.setScalar(0.9 + Math.random()*0.9);
    } else if(type === 'heart'){
      const g = makeHeartMesh();
      obj.add(g);
      obj.scale.setScalar(0.9 + Math.random()*0.8);
    } else if(type === 'metalshard'){
      const count = Math.max(3, Math.round(3 * intensity));
      for(let i=0;i<count;i++){
        const s = makeShardMesh();
        s.position.set((Math.random()-0.5)*8, (Math.random()-0.5)*8, (Math.random()-0.5)*8);
        s.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        s.scale.setScalar(0.6 + Math.random()*2.5);
        obj.add(s);
      }
      obj.scale.setScalar(0.8);
    } else if(type === 'burst'){
      // multiple small sprites and shards
      const count = Math.round(8 + Math.random()*28);
      for(let i=0;i<count;i++){
        if(Math.random() > 0.5){
          const spr = new THREE.Sprite(makeTextSpriteMaterial('✦'));
          spr.scale.setScalar(4 + Math.random()*6);
          spr.position.set((Math.random()-0.5)*32, (Math.random()-0.5)*32, (Math.random()-0.5)*32);
          obj.add(spr);
        } else {
          const s = makeShardMesh();
          s.scale.setScalar(0.7 + Math.random()*2.2);
          s.position.set((Math.random()-0.5)*28, (Math.random()-0.5)*28, (Math.random()-0.5)*28);
          obj.add(s);
        }
      }
      obj.scale.setScalar(0.6);
    } else {
      // default text sprite
      const txt = window.__particleText || 'abibkah';
      const spr = new THREE.Sprite(makeTextSpriteMaterial(txt));
      spr.scale.setScalar(8 + Math.random()*20);
      obj.add(spr);
    }

    obj.position.copy(pos);
    // velocity
    obj._meta.vel = new THREE.Vector3((Math.random()-0.5)*3, (Math.random()-0.5)*3, (Math.random()-0.5)*3);
    obj._meta.life = 120 + Math.floor(Math.random()*160);
    scene.add(obj);
    active.push(obj);
  }

  function makeTextSpriteMaterial(txt){
    return makeTextSpriteMaterial_cached(txt);
  }

  // caching helper wrapper to avoid hoisting mess
  const makeTextSpriteMaterial_cached = (function(){
    const cache = {};
    return function(text){
      if(cache[text]) return cache[text].clone();
      // create canvas
      const size = 512;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.clearRect(0,0,size,size);
      // galaxy gradient
      const g = ctx.createLinearGradient(0,0,size,size);
      g.addColorStop(0,'#7afcff'); g.addColorStop(0.6,'#b47fff'); g.addColorStop(1,'#ff9fa8');
      ctx.font = 'bold 84px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // glow
      ctx.shadowColor = 'rgba(0,0,0,0.32)';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 20;
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.strokeText(text, size/2, size/2);
      ctx.fillStyle = g;
      ctx.fillText(text, size/2, size/2);
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      const mat = new THREE.SpriteMaterial({map:tex, transparent:true});
      cache[text] = mat;
      return mat.clone();
    }
  })();

  // ---------- lifecycle animation
  function animate(){
    requestAnimationFrame(animate);
    // update active particles
    for(let i=active.length-1;i>=0;i--){
      const o = active[i];
      // movement physics
      o.position.add(o._meta.vel.clone().multiplyScalar(0.18));
      // slow down
      o._meta.vel.multiplyScalar(0.992);
      // rotate children
      o.children.forEach(c=>{
        c.rotation.x += 0.01*(0.5+Math.random());
        c.rotation.y += 0.012*(0.5+Math.random());
      });
      o._meta.life -= 1;
      const fade = Math.max(0, o._meta.life / 220);
      // fade out
      o.traverse(node=>{
        if(node.material){
          if(node.material.opacity !== undefined) node.material.opacity = fade;
        }
      });
      if(o._meta.life <= 0){
        // recycle
        scene.remove(o);
        active.splice(i,1);
        pool.push(o);
        o.visible = false;
      }
    }

    // gentle camera drift
    const t = Date.now()*0.00012;
    camera.position.x = Math.sin(t*0.9)*14;
    camera.position.y = Math.sin(t*0.7)*7;
    camera.lookAt(0,0,0);

    renderer.render(scene, camera);
  }
  animate();

  // responsive
  window.addEventListener('resize', ()=>{
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---------- mapping + UI events
  let currentMapping = { two:'text', metal:'saturn', fist:'heart', open:'burst', pinch:'metalshard' };
  window.addEventListener('mappingUpdate', e=>{
    const v = e.detail.value;
    // interpret selected mapping value: set all to default except two
    // allow user to choose main mapping slot for demonstration
    currentMapping.two = v;
  });

  window.addEventListener('particleTextUpdate', e=>{
    window.__particleText = e.detail.text || 'abibkah';
    // clear cache to regenerate
    // (simple approach: reset the makeTextSprite cache by replacing function)
    // but here we just let cached values remain and new ones will be created as needed
  });

  let globalDensity = 28;
  window.addEventListener('densityUpdate', e=>{
    globalDensity = e.detail.value || 28;
  });

  // ---------- mediapipe hands integration (load scripts dynamically)
  async function loadScript(src){
    return new Promise((res, rej) => {
      if(document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function initHands(){
    // load mediapipe hands + camera utils
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');

    const hands = new Hands({locateFile: (f)=> `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`});
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    hands.onResults(onResults);

    // start camera stream
    try{
      const stream = await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:'user'}, audio:false});
      camVideo.srcObject = stream;
    } catch(err){
      statusEl.textContent = 'camera error';
      console.error('camera',err);
      return;
    }

    // feed frames to mediapipe camera util
    const cam = new Camera(camVideo, {
      onFrame: async () => {
        await hands.send({image: camVideo});
      },
      width: 640,
      height: 480
    });
    cam.start();
  }

  // classify gestures from landmarks
  function isExtended(landmarks, tipIdx, pipIdx){
    return landmarks[tipIdx].y < landmarks[pipIdx].y;
  }
  function thumbExtended(landmarks){
    // better thumb test using x relative
    const tip = landmarks[4], ip = landmarks[3], mcp = landmarks[2];
    return Math.abs(tip.x - mcp.x) > 0.04 && ((tip.x < mcp.x) === (ip.x < mcp.x));
  }

  function classify(landmarks){
    if(!landmarks) return {type:'none'};
    const idx = isExtended(landmarks,8,6);
    const mid = isExtended(landmarks,12,10);
    const ring = isExtended(landmarks,16,14);
    const pink = isExtended(landmarks,20,18);
    const thb = thumbExtended(landmarks);

    // pinch distance
    const dx = landmarks[8].x - landmarks[4].x;
    const dy = landmarks[8].y - landmarks[4].y;
    const pinchDist = Math.sqrt(dx*dx + dy*dy);

    // fist
    if(!idx && !mid && !ring && !pink && !thb) return {type:'fist'};

    // open palm
    if(idx && mid && ring && pink && thb) return {type:'open'};

    // two-fingers index+middle
    if(idx && mid && !ring && !pink) return {type:'two'};

    // metal sign: index + pinky extended, middle/ring not
    if(idx && !mid && !ring && pink) return {type:'metal'};

    // pinch (thumb + index close)
    if(pinchDist < 0.055) return {type:'pinch'};

    // point (index only)
    if(idx && !mid && !ring && !pink) return {type:'point'};

    return {type:'other'};
  }

  let lastGesture = null;
  let lastTime = 0;

  function onResults(results){
    if(!results.multiHandLandmarks || results.multiHandLandmarks.length === 0){
      statusEl.textContent = 'deteksi: -';
      lastGesture = null;
      return;
    }
    const lm = results.multiHandLandmarks[0];
    const cls = classify(lm);
    statusEl.textContent = 'deteksi: ' + cls.type;
    // center
    let cx=0, cy=0;
    for(let i=0;i<lm.length;i++){cx+=lm[i].x; cy+=lm[i].y}
    cx/=lm.length; cy/=lm.length;
    const now = Date.now();
    // suppress too-frequent spawns: throttle per type
    if(lastGesture === cls.type && (now - lastTime < 140)) return;
    lastGesture = cls.type;
    lastTime = now;
    // decide mapping
    const mapType = currentMapping[cls.type] || (cls.type === 'two' ? window.__particleText ? 'text' : 'text' : (cls.type === 'metal' ? 'saturn' : (cls.type === 'fist' ? 'heart' : 'burst')));
    // spawn intensity from globalDensity
    const intensity = Math.max(1, Math.min(120, globalDensity)) / 28;
    // for gestures spawn multiple to look good
    const spawnCount = (cls.type === 'open') ? Math.round(6 * intensity) : (cls.type === 'burst' ? Math.round(8 * intensity) : 1);
    for(let i=0;i<spawnCount;i++){
      const jitterX = cx + (Math.random()-0.5)*0.12;
      const jitterY = cy + (Math.random()-0.5)*0.12;
      spawn(mapType, jitterX, jitterY, intensity);
    }
  }

  // ---------- init everything
  // prefill pool
  for(let i=0;i<MAX_PARTICLES;i++){
    const g = new THREE.Group();
    g.visible = false;
    pool.push(g);
  }

  // set initial particle text var
  window.__particleText = particleTextInput.value || 'abibkah';

  // start mediapipe
  initHands().catch(e=>console.error('init hands failed',e));

  // update mapping defaults from UI on load
  currentMapping.two = mappingSelect.value || 'text';
  window.dispatchEvent(new CustomEvent('densityUpdate',{detail:{value:parseInt(densityInput.value,10)||28}}));
  window.dispatchEvent(new CustomEvent('particleTextUpdate',{detail:{text:window.__particleText}}));

})();
