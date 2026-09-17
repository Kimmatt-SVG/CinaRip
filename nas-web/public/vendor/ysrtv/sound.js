/* ysrtv/sound: the set's audio, all synthesized with the Web Audio API.
   no asset files ship with this module; every sound is built from
   oscillators and one reused second of white noise. if you want real
   recordings, hand loadSamples() a manifest and each listed key upgrades
   from synth to sample. unlisted keys keep the synth. */

let ctx = null, master = null, noiseBuf = null, unlocked = false;
let volume = 1;                        // 0..1

/* per-sound playback tuning for samples: slice position, loop, level.
   these are starting points; override any of them in your manifest */
const sampleCfg = {
  surf:     { randomTo: 14, duration: 0.28, gain: 0.50 },   // random slice of a long static take
  hiss:     { loop: true, gain: 0.45 },                     // no-signal bed
  ambient:  { loop: true, gain: 0.08 },                     // faint room tone (sample only, no synth)
  paper:    { duration: 0.90, gain: 0.80 },
  click:    { duration: 0.50, gain: 0.90 },
  powerOn:  { duration: 0.60, gain: 0.70 },
  powerOff: { duration: 0.60, gain: 0.70 },
  degauss:  { offset: 0.10, duration: 1.80, gain: 0.70 },
  scribble: { randomTo: 44, duration: 0.32, gain: 0.70 },
  tuning:   { duration: 0.35, gain: 0.70 },
  errorBuzz:{ duration: 0.60, gain: 0.70 }
};
const buffers = {};

function build(){
  if(ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);   // 1s white noise, reused
  const d = noiseBuf.getChannelData(0);
  for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

/* call from any user gesture; browsers keep audio suspended until one */
export function unlock(){
  build();
  if(ctx && ctx.state === 'suspended') ctx.resume();
  unlocked = true;
}

/* or let ysrtv arm itself on the first click or keypress */
export function autoUnlock(){
  const once = () => unlock();
  window.addEventListener('pointerdown', once, {once: true, capture: true});
  window.addEventListener('keydown', once, {once: true, capture: true});
}

export function setVolume(v){
  volume = Math.max(0, Math.min(1, v));
  if(master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
}
export function getVolume(){ return volume; }
export function isRunning(){ return !!(ctx && ctx.state === 'running'); }

const live = () => unlocked && ctx && volume > 0;
const ready = () => unlocked && ctx;   // beds route through master, so muting still silences them

/* ---------- samples: optional real recordings ----------
   manifest is a url to a json file or a plain object. values are a file,
   an array of variant files (a random one plays each time), or an object:

     loadSamples({
       surf: 'static.mp3',
       click: ['click1.mp3', 'click2.mp3'],
       degauss: {src: 'thump.mp3', offset: 0.1, duration: 1.8, gain: 0.7}
     }, {base: '/sfx/'});                                                 */
let samplesLoading = null;
export function loadSamples(manifest, opts){
  build();
  if(!ctx) return Promise.resolve();
  opts = opts || {};
  const base = opts.base || '';
  samplesLoading = (async () => {
    let map = manifest;
    if(typeof manifest === 'string'){
      try{
        const r = await fetch(manifest, {cache: 'no-store'});
        if(!r.ok) return;
        map = await r.json();
      }catch(e){ return; }
    }
    const entries = {};
    for(const k in map){
      const v = map[k];
      if(typeof v === 'object' && !Array.isArray(v)){
        entries[k] = Array.isArray(v.src) ? v.src : [v.src];
        const {src, ...cfg} = v;
        sampleCfg[k] = Object.assign({}, sampleCfg[k], cfg);
      } else {
        entries[k] = Array.isArray(v) ? v : [v];
      }
    }
    const fileSet = new Set();                                 // decode each unique file once
    for(const k in entries) entries[k].forEach(f => fileSet.add(f));
    const decoded = {};
    await Promise.all([...fileSet].map(async file => {         // ...all in parallel
      try{
        const res = await fetch(base + file, {cache: 'force-cache'});
        if(res.ok) decoded[file] = await ctx.decodeAudioData(await res.arrayBuffer());
      }catch(e){ /* missing or undecodable file keeps its synth */ }
    }));
    for(const name in entries){
      const cfg = sampleCfg[name] || {};
      const trim = !cfg.loop && cfg.randomTo == null;          // play-from-start sounds: drop dead air
      const bufs = [];
      for(const file of entries[name]){
        if(!decoded[file]) continue;
        bufs.push(trim ? trimLead(decoded[file]) : decoded[file]);
      }
      if(bufs.length) buffers[name] = bufs;                    // always an array of variants
    }
  })();
  return samplesLoading;
}

function trimLead(buf){                                        // strip leading silence
  const d = buf.getChannelData(0), sr = buf.sampleRate, TH = 0.012;
  let start = 0;
  for(let i = 0; i < d.length; i++){
    if(Math.abs(d[i]) > TH){ start = Math.max(0, i - ((sr * 0.005) | 0)); break; }
  }
  if(start <= 0) return buf;
  const len = buf.length - start, nb = ctx.createBuffer(buf.numberOfChannels, len, sr);
  for(let c = 0; c < buf.numberOfChannels; c++){
    nb.getChannelData(c).set(buf.getChannelData(c).subarray(start));
  }
  return nb;
}

function playSample(name, opts){
  const arr = buffers[name];
  if(!arr || !arr.length || !live()) return null;
  const buf = arr[(Math.random() * arr.length) | 0];
  const cfg = Object.assign({}, sampleCfg[name], opts);
  const s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = buf; s.loop = !!cfg.loop;
  g.gain.value = cfg.gain != null ? cfg.gain : 0.85;
  s.connect(g); g.connect(master);
  let off = cfg.offset || 0;
  if(cfg.randomTo != null){                                    // random window inside a long clip
    const hi = Math.min(cfg.randomTo, buf.duration - (cfg.duration || 0.2));
    off = off + Math.random() * Math.max(0, hi - off);
  }
  off = Math.max(0, Math.min(off, buf.duration - 0.02));
  if(cfg.loop) s.start(0, off);
  else if(cfg.duration) s.start(0, off, cfg.duration);
  else s.start(0, off);
  return s;
}

/* ---------- synth building blocks ---------- */
function noise(){ const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
function env(g, peak, dur, attack){
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (attack || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(freq, type, peak, dur, attack){
  if(!live()) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  o.connect(g); g.connect(master);
  env(g, peak, dur, attack);
  o.start(); o.stop(ctx.currentTime + dur + 0.05);
}

/* ---------- static & tuning ---------- */
export function surf(durMs){           // channel-change static burst
  if(playSample('surf')) return;
  if(!live()) return;
  const dur = (durMs || 260) / 1000;
  const s = noise(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.5;
  s.connect(bp); bp.connect(g); g.connect(master);
  env(g, 0.18, dur, 0.004);
  s.start(); s.stop(ctx.currentTime + dur + 0.05);
}

let nsNode = null;
export function hiss(on){              // sustained no-signal snow, pairs with snow()
  if(on){
    if(!ready() || nsNode) return;
    const samp = playSample('hiss', {loop: true});
    if(samp){ nsNode = samp; return; }
    const s = noise(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.4;
    s.connect(bp); bp.connect(g); g.connect(master);
    g.gain.value = 0.09;
    s.start();
    nsNode = s;
  } else if(nsNode){
    try{ nsNode.stop(); }catch(e){}
    nsNode = null;
  }
}

export function tuning(){              // analog tuner warble
  if(playSample('tuning')) return;
  if(!live()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(400, t);
  o.frequency.linearRampToValueAtTime(1400, t + 0.25);
  o.frequency.linearRampToValueAtTime(700, t + 0.4);
  env(g, 0.05, 0.4, 0.01);
  o.connect(g); g.connect(master);
  const s = noise(), bp = ctx.createBiquadFilter(), sg = ctx.createGain();
  bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.5;
  s.connect(bp); bp.connect(sg); sg.connect(master);
  env(sg, 0.06, 0.4, 0.01);
  o.start(t); o.stop(t + 0.45); s.start(t); s.stop(t + 0.45);
}

let toneNode = null;
export function testTone(on){          // exact 1 kHz test-card tone
  if(on){
    if(!ready() || toneNode) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 1000; g.gain.value = 0.05;
    o.connect(g); g.connect(master);
    o.start();
    toneNode = o;
  } else if(toneNode){
    try{ toneNode.stop(); }catch(e){}
    toneNode = null;
  }
}

/* ---------- CRT & power physics ---------- */
export function thunk(){               // power-relay clunk
  if(!live()) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.08);
  o.connect(g); g.connect(master);
  env(g, 0.22, 0.12, 0.002);
  o.start(); o.stop(ctx.currentTime + 0.16);
  const s = noise(), hp = ctx.createBiquadFilter(), cg = ctx.createGain();
  hp.type = 'highpass'; hp.frequency.value = 2500;
  s.connect(hp); hp.connect(cg); cg.connect(master);
  env(cg, 0.10, 0.03, 0.001);
  s.start(); s.stop(ctx.currentTime + 0.05);
}

export function degauss(){             // the iconic CRT "bwomp" (pitch drop + wobble)
  if(playSample('degauss')) return;
  if(!live()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(185, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.9);
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(11, t);
  lfo.frequency.exponentialRampToValueAtTime(4, t + 0.9);
  lg.gain.value = 0.10; lfo.connect(lg); lg.connect(g.gain);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.20, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
  o.connect(g); g.connect(master);
  o.start(t); lfo.start(t); o.stop(t + 1.05); lfo.stop(t + 1.05);
}

export function powerOn(){
  if(playSample('powerOn')) return;
  thunk(); degauss();
}

export function powerOff(){            // shrink-to-a-dot whine + electrostatic fft
  if(playSample('powerOff')) return;
  if(!live()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.35);
  g.gain.setValueAtTime(0.16, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + 0.42);
  const s = noise(), hp = ctx.createBiquadFilter(), cg = ctx.createGain();
  hp.type = 'highpass'; hp.frequency.value = 4000;
  s.connect(hp); hp.connect(cg); cg.connect(master);
  cg.gain.setValueAtTime(0.0001, t + 0.34);
  cg.gain.exponentialRampToValueAtTime(0.12, t + 0.37);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  s.start(t + 0.34); s.stop(t + 0.52);
}

let humNodes = null;
export function hum(on){               // faint flyback whine + mains hum (ambient bed)
  if(on){
    if(!ready() || humNodes) return;
    const hi = ctx.createOscillator(), hg = ctx.createGain();
    hi.type = 'sine'; hi.frequency.value = 15700; hg.gain.value = 0.006;
    hi.connect(hg); hg.connect(master);
    const lo = ctx.createOscillator(), lgn = ctx.createGain();
    lo.type = 'sine'; lo.frequency.value = 60; lgn.gain.value = 0.014;
    lo.connect(lgn); lgn.connect(master);
    hi.start(); lo.start();
    humNodes = [hi, lo];
  } else if(humNodes){
    humNodes.forEach(n => { try{ n.stop(); }catch(e){} });
    humNodes = null;
  }
}

let ambientNode = null;
export function ambient(on){           // looped room-tone sample, swells in like a warming tube
  if(on){
    if(ambientNode || !buffers.ambient || !buffers.ambient.length || !live()) return;
    const tgt = (sampleCfg.ambient && sampleCfg.ambient.gain) || 0.08;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buffers.ambient[0]; s.loop = true;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(tgt, ctx.currentTime + 1.2);
    s.connect(g); g.connect(master); s.start();
    ambientNode = s;
  } else if(ambientNode){
    try{ ambientNode.stop(); }catch(e){}
    ambientNode = null;
  }
}

/* ---------- remote & UI feedback ---------- */
export function blip(){                // remote dial digit
  if(!live()) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.value = 720;
  o.connect(g); g.connect(master);
  env(g, 0.10, 0.07, 0.003);
  o.start(); o.stop(ctx.currentTime + 0.09);
}

export function paper(){               // page turn
  if(playSample('paper')) return;
  if(!live()) return;
  const s = noise(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
  hp.type = 'highpass'; hp.frequency.value = 1400;
  s.connect(hp); hp.connect(g); g.connect(master);
  env(g, 0.13, 0.20, 0.006);
  s.start(); s.stop(ctx.currentTime + 0.26);
}

export function click(){               // physical button thunk
  if(playSample('click')) return;
  if(!live()) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(180, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.05);
  o.connect(g); g.connect(master);
  env(g, 0.12, 0.06, 0.002);
  o.start(); o.stop(ctx.currentTime + 0.08);
}

export function tick(){                // light remote keypress
  if(!live()) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.value = 1500;
  o.connect(g); g.connect(master);
  env(g, 0.05, 0.03, 0.001);
  o.start(); o.stop(ctx.currentTime + 0.05);
}

export function errorBuzz(){           // invalid input
  if(playSample('errorBuzz')) return;
  if(!live()) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(220, ctx.currentTime);
  o.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.18);
  o.connect(g); g.connect(master);
  env(g, 0.11, 0.22, 0.004);
  o.start(); o.stop(ctx.currentTime + 0.26);
}

export function confirmUp(){
  tone(660, 'square', 0.08, 0.08, 0.003);
  setTimeout(() => tone(990, 'square', 0.08, 0.09, 0.003), 70);
}
export function confirmDown(){ tone(520, 'square', 0.08, 0.10, 0.003); }

export function scribble(){            // pencil scratch
  if(playSample('scribble')) return;
  if(!live()) return;
  const t = ctx.currentTime;
  const s = noise(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.8;
  s.connect(bp); bp.connect(g); g.connect(master);
  lfo.type = 'square'; lfo.frequency.value = 26; lg.gain.value = 0.06;
  lfo.connect(lg); lg.connect(g.gain);
  g.gain.setValueAtTime(0.06, t);
  g.gain.setValueAtTime(0.06, t + 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  s.start(t); lfo.start(t); s.stop(t + 0.24); lfo.stop(t + 0.24);
}

/* ---------- idents ---------- */
export function jingle(){              // station ident, a C-E-G-C arpeggio
  if(!live()) return;
  [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.38]].forEach(([f, d]) =>
    setTimeout(() => tone(f, 'triangle', 0.10, 0.16, 0.004), d * 1000));
}

export function emergency(){           // EAS attention tone, 853 + 960 Hz. use responsibly
  if(!live()) return;
  const t = ctx.currentTime, dur = 1.2;
  [853, 960].forEach(f => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0.07, t); g.gain.setValueAtTime(0.07, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    o.start(t); o.stop(t + dur + 0.1);
  });
}

export function bumper(){              // "we'll be right back" sting
  if(!live()) return;
  [[392, 0], [523, 0.14], [392, 0.30]].forEach(([f, d]) =>
    setTimeout(() => tone(f, 'triangle', 0.10, 0.18, 0.004), d * 1000));
}
