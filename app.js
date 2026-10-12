(()=>{
  const app=document.getElementById('app');
  const video=document.getElementById('camera');
  const status=document.getElementById('camera-status');
  const message=document.getElementById('camera-message');
  const messageText=document.getElementById('camera-message-text');
  const retry=document.getElementById('retry-camera');
  const switchBtn=document.getElementById('switch-camera');
  const motionBtn=document.getElementById('motion-toggle');
  const motionHint=document.getElementById('motion-hint');
  const canvas=document.getElementById('fx-canvas');
  const ctx=canvas.getContext('2d');
  const cards=[...document.querySelectorAll('.card')];
  const dots=[...document.querySelectorAll('.dot')];
  const current=document.getElementById('current-number');
  const wrap=document.querySelector('.card-wrap');
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active=0,stream=null,front=false,touchX=null,motionEnabled=false,particles=[],raf=0,lastW=0,lastH=0;
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));

  function show(n){
    active=(n+cards.length)%cards.length;
    cards.forEach((c,i)=>c.classList.toggle('active',i===active));
    dots.forEach((d,i)=>d.classList.toggle('active',i===active));
    current.textContent=String(active+1).padStart(2,'0');
    runScan();
  }
  function runScan(){
    if(reduceMotion)return;
    app.classList.remove('scan-active');
    // Force a reflow so the reveal can replay on each card change.
    void app.offsetWidth;
    app.classList.add('scan-active');
    window.setTimeout(()=>app.classList.remove('scan-active'),1800);
  }
  document.getElementById('prev').addEventListener('click',()=>show(active-1));
  document.getElementById('next').addEventListener('click',()=>show(active+1));
  dots.forEach(d=>d.addEventListener('click',()=>show(+d.dataset.to)));
  wrap.addEventListener('touchstart',e=>{touchX=e.changedTouches[0].clientX},{passive:true});
  wrap.addEventListener('touchend',e=>{if(touchX===null)return;const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>50)show(active+(dx<0?1:-1));touchX=null},{passive:true});

  async function startCamera(){
    message.hidden=true;
    if(!window.isSecureContext){status.textContent='HTTPS REQUIRED';messageText.textContent='Live camera access requires HTTPS (or localhost). The animated card still works without it.';message.hidden=false;return}
    if(!navigator.mediaDevices?.getUserMedia){status.textContent='CAMERA UNSUPPORTED';messageText.textContent='This browser does not provide camera access. Try an updated mobile browser.';message.hidden=false;return}
    try{
      if(stream)stream.getTracks().forEach(t=>t.stop());
      status.textContent='REQUESTING CAMERA';
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:front?'user':{ideal:'environment'},width:{ideal:1280},height:{ideal:1920}}});
      video.srcObject=stream;await video.play();status.textContent='LIVE CAMERA';switchBtn.hidden=false;message.hidden=true;
    }catch(e){
      console.warn(e);status.textContent='CAMERA PERMISSION NEEDED';
      messageText.textContent=e?.name==='NotAllowedError'?'Allow camera access in browser/site settings, then tap Retry camera.':'Could not start camera. Open the page over HTTPS on a supported mobile browser and retry.';
      message.hidden=false;
    }
  }
  retry.addEventListener('click',startCamera);
  switchBtn.addEventListener('click',async()=>{front=!front;await startCamera()});

  function setTilt(x,y){
    const tx=clamp(x,-1,1),ty=clamp(y,-1,1);
    wrap.style.setProperty('--tilt-x',(tx*5).toFixed(2)+'deg');
    wrap.style.setProperty('--tilt-y',(-ty*4).toFixed(2)+'deg');
    const px=(50+tx*35).toFixed(1)+'%',py=(40+ty*30).toFixed(1)+'%';
    cards.forEach(card=>{card.style.setProperty('--pointer-x',px);card.style.setProperty('--pointer-y',py);card.style.setProperty('--shine-x',(tx*25-32).toFixed(1)+'%')});
  }
  function onOrientation(e){
    if(!motionEnabled)return;
    const gamma=Number.isFinite(e.gamma)?e.gamma:0;
    const beta=Number.isFinite(e.beta)?e.beta-35:0;
    setTilt(gamma/35,beta/45);
  }
  async function enableMotion(){
    if(motionEnabled){motionEnabled=false;window.removeEventListener('deviceorientation',onOrientation);motionBtn.setAttribute('aria-pressed','false');motionBtn.textContent='ENABLE MOTION';setTilt(0,0);motionHint.textContent='Motion response paused';motionHint.classList.remove('dismissed');return}
    try{
      if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){
        const permission=await DeviceOrientationEvent.requestPermission();
        if(permission!=='granted')throw new Error('Motion permission was not granted');
      }
      if(!('DeviceOrientationEvent' in window))throw new Error('Device orientation is not supported in this browser');
      motionEnabled=true;window.addEventListener('deviceorientation',onOrientation,{passive:true});
      motionBtn.setAttribute('aria-pressed','true');motionBtn.textContent='MOTION ON';
      motionHint.textContent='Move your phone gently to tilt the card';motionHint.classList.remove('dismissed');
      window.setTimeout(()=>motionHint.classList.add('dismissed'),3600);
    }catch(e){
      motionHint.textContent=e.message.includes('not supported')?'Motion tilt is not supported here; try pointer movement.':'Motion permission unavailable. You can still use touch and swipe.';
      motionHint.classList.remove('dismissed');window.setTimeout(()=>motionHint.classList.add('dismissed'),4500);
    }
  }
  motionBtn.addEventListener('click',enableMotion);
  // Desktop fallback and a graceful preview on devices that do not expose orientation data.
  app.addEventListener('pointermove',e=>{
    if(motionEnabled||e.pointerType==='touch')return;
    const r=app.getBoundingClientRect();setTilt(((e.clientX-r.left)/r.width-.5)*2,((e.clientY-r.top)/r.height-.5)*2);
  },{passive:true});
  app.addEventListener('pointerleave',()=>{if(!motionEnabled)setTilt(0,0)});

  function resizeCanvas(){
    const dpr=Math.min(window.devicePixelRatio||1,1.7),w=window.innerWidth,h=window.innerHeight;
    if(w===lastW&&h===lastH)return;lastW=w;lastH=h;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
    const count=reduceMotion?10:Math.min(38,Math.max(16,Math.round(w*h/26000)));
    particles=Array.from({length:count},()=>({x:Math.random()*w,y:Math.random()*h,r:.5+Math.random()*1.3,vx:(Math.random()-.5)*.18,vy:-.08-Math.random()*.22,a:.12+Math.random()*.42,phase:Math.random()*Math.PI*2}));
  }
  function drawParticles(t){
    resizeCanvas();const w=window.innerWidth,h=window.innerHeight;ctx.clearRect(0,0,w,h);
    for(const p of particles){
      p.x+=p.vx+Math.sin(t*.00035+p.phase)*.035;p.y+=p.vy;
      if(p.y<-5){p.y=h+5;p.x=Math.random()*w}if(p.x<-5)p.x=w+5;if(p.x>w+5)p.x=-5;
      const shimmer=.7+.3*Math.sin(t*.001+p.phase);ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(170,255,229,${p.a*shimmer})`;ctx.fill();
      if(p.r>1.25){ctx.beginPath();ctx.moveTo(p.x-3,p.y);ctx.lineTo(p.x+3,p.y);ctx.strokeStyle=`rgba(170,255,229,${p.a*.35})`;ctx.lineWidth=.5;ctx.stroke()}
    }
    if(!document.hidden)raf=requestAnimationFrame(drawParticles);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf)}else{cancelAnimationFrame(raf);raf=requestAnimationFrame(drawParticles)}});
  window.addEventListener('resize',resizeCanvas,{passive:true});
  window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());cancelAnimationFrame(raf)});
  show(0);resizeCanvas();if(!document.hidden)raf=requestAnimationFrame(drawParticles);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startCamera,{once:true});else startCamera();
})();
