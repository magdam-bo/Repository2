// A short look-ahead scheduler uses AudioContext time, never UI timer time.
// All sources (including future scheduled sources) belong to one cancellable run.
export class AudioEngine {
  constructor({contextFactory, onPosition=()=>{}, onState=()=>{}}={}) {
    this.contextFactory = contextFactory || (()=>new (window.AudioContext || window.webkitAudioContext)({latencyHint:'interactive'}));
    this.onPosition=onPosition; this.onState=onState; this.sources=new Set(); this.events=[];
    this.generation=0; this.playing=false; this.volume=.65; this.bpm=120; this.loop=false;
  }
  async unlock() {
    if (!this.context) {
      this.context=this.contextFactory();
      this.master=this.context.createGain(); this.master.gain.value=this.volume*.7;
      const compressor=this.context.createDynamicsCompressor();
      this.master.connect(compressor);
      this.analyser=this.context.createAnalyser?.();
      if(this.analyser){this.analyser.fftSize=256;this.samples=new Float32Array(256);compressor.connect(this.analyser);this.analyser.connect(this.context.destination);}
      else compressor.connect(this.context.destination);
      this.context.onstatechange=()=>{
        if(this.playing && this.context.state!=='running') this.stop('音声が中断されました。再生ボタンで再開できます');
      };
    }
    if(this.context.state!=='running') await this.context.resume();
    if(this.context.state!=='running') throw new Error('音声を開始できません。再生ボタンをもう一度押してください');
  }
  setLoop(value) {
    this.loop=value;
    if(!this.playing) return;
    if(value && this.nextIndex===this.chords.length) {this.nextIndex=0;this.finishTime=Infinity;}
    if(!value && this.nextIndex===0) {this.nextIndex=this.chords.length;this.finishTime=this.nextTime;}
  }
  setVolume(value) {
    this.volume=Math.max(0,Math.min(1,value));
    if(this.master) this.master.gain.setTargetAtTime(this.volume*.7,this.context.currentTime,.015);
  }
  note(midi, time, duration, level) {
    const ctx=this.context, frequency=440*2**((midi-69)/12);
    // Bass compensation is capped below C2 and fades to zero at C4.
    // Extra upper partials keep low notes recognizable on small speakers.
    const bassWeight=Math.max(0,Math.min(1,(60-midi)/24));
    const bassGain=1+.8*bassWeight;
    const partials=[[1,bassGain],[2,bassGain*(.32+.24*bassWeight)],[3,bassGain*(.12+.14*bassWeight)]];
    for(const [ratio,amplitude] of partials) {
      const osc=ctx.createOscillator(), env=ctx.createGain();
      osc.type='sine'; osc.frequency.value=frequency*ratio;
      const end=time+duration;
      env.gain.setValueAtTime(0,time);
      env.gain.linearRampToValueAtTime(level*amplitude,time+.008);
      env.gain.exponentialRampToValueAtTime(Math.max(.0001,level*amplitude*.28),time+Math.max(.009,duration*.65));
      env.gain.linearRampToValueAtTime(0,end);
      osc.connect(env); env.connect(this.master);
      this.sources.add(osc);
      osc.onended=()=>{this.sources.delete(osc);osc.disconnect();env.disconnect();};
      osc.start(time); osc.stop(end);
    }
  }
  sound(notes,time,duration) {
    const level=.23/Math.sqrt(notes.length);
    notes.forEach(n=>this.note(n,time,Math.max(.04,duration),level));
  }
  async play(chords,{bpm=120,loop=false}={}) {
    this.stop(); const generation=this.generation;
    await this.unlock();
    if(generation!==this.generation) return;
    this.chords=structuredClone(chords); this.bpm=bpm;this.loop=loop;
    this.playing=true;this.nextIndex=0;this.nextTime=this.context.currentTime+.06;
    this.events=[];this.finishTime=Infinity;this.onState(true,'再生中');
    this.tick();this.timer=setInterval(()=>this.tick(),20);
  }
  tick() {
    if(!this.playing) return;
    const now=this.context.currentTime;
    // If a background tab was throttled, stop rather than burst overdue notes.
    if(this.nextTime<now-.25 && this.nextIndex<this.chords.length) {this.stop('タブの中断により停止しました');return;}
    while(this.nextTime<now+.12 && this.nextIndex<this.chords.length) {
      const index=this.nextIndex, chord=this.chords[index], start=this.nextTime, duration=chord.beats*60/this.bpm;
      this.sound(chord.notes,start,duration);
      this.events.push({index,start,end:start+duration});
      this.nextTime+=duration;this.nextIndex++;
      if(this.nextIndex===this.chords.length) {
        if(this.loop) this.nextIndex=0;
        else this.finishTime=this.nextTime;
      }
    }
    this.events=this.events.filter(e=>e.end>now);
    const event=this.events.find(e=>e.start<=now&&e.end>now);
    let rms=0;if(this.analyser){this.analyser.getFloatTimeDomainData(this.samples);rms=Math.sqrt(this.samples.reduce((a,x)=>a+x*x,0)/this.samples.length);}
    if(event) this.onPosition({level:rms,index:event.index,fraction:(now-event.start)/(event.end-event.start),beat:Math.floor((now-event.start)*this.bpm/60)%4});
    if(now>=this.finishTime) this.stop('再生が終了しました');
  }
  stop(message='停止中') {
    this.generation++;clearInterval(this.timer);this.timer=null;this.playing=false;
    // stop() replaces a scheduled future stop and cancels not-yet-started notes.
    for(const osc of this.sources) {try{osc.stop(this.context.currentTime);}catch{/* already ended */}}
    this.sources.clear();this.events=[];this.onPosition(null);this.onState(false,message);
  }
  async audition(notes) {
    this.stop(); const generation=this.generation; await this.unlock();
    if(generation!==this.generation) return;
    this.sound([...notes],this.context.currentTime+.02,.85);
  }
}
