import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  await page.goto('https://127.0.0.1:15174/');
  const result = await page.evaluate<any>(`(async () => {
    const path = '/src/adapter/audio.ts';
    const { WebAudioPcmSink } = await import(path);
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.connect(context.destination);
    const sink = new WebAudioPcmSink({contextFactory:()=>context, destination:()=>analyser});
    const delay = (ms) => new Promise(r=>setTimeout(r,ms));
    const level = () => { const a=new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(a); return Math.max(...a.map(Math.abs)); };
    try {
      sink.configurePresentation({streamUnderrunSeconds:0.75,active:true});
      await sink.unlock();
      const pcm = new Int16Array(4410);
      for(let i=0;i<pcm.length;i++) pcm[i]=Math.sin(i/15)*16000;
      const bytes = new Uint8Array(pcm.buffer);
      sink.createBuffer('dynamic',bytes.length);
      sink.writeBuffer('dynamic',0,bytes); sink.play('dynamic',{loop:true});
      sink.writeBuffer('dynamic',0,bytes);
      for(let n=0;n<30 && level()<0.01;n++){sink.writeBuffer('dynamic',0,bytes);await delay(100);}
      const initial=level();
      await delay(1100); const stalled=level(); const stillPlaying=sink.getState('dynamic')?.playing;
      sink.writeBuffer('dynamic',0,bytes); await delay(150); const resumed=level();
      sink.configurePresentation({active:false}); await delay(100); const background=context.state;
      sink.configurePresentation({active:true}); await delay(150); const foreground=context.state;
      sink.releaseBuffer('dynamic');
      sink.createBuffer('static',bytes.length); sink.writeBuffer('static',0,bytes); sink.play('static',{loop:true});
      await delay(1100); const staticLevel=level();
      return {initial,stalled,stillPlaying,resumed,background,foreground,staticLevel};
    } finally { await sink.destroy(); }
  })()`);
  console.log(result);
  assert(result.initial > 0.01 && result.resumed > 0.01 && result.staticLevel > 0.01);
  assert(result.stalled < 0.001 && result.stillPlaying);
  assert.equal(result.background, 'suspended');
  assert.equal(result.foreground, 'running');
  console.log(
    'PASS actual AudioWorklet stale PCM silence, refill recovery, static looping and background/foreground',
    result,
  );
} finally {
  await browser.close();
}
