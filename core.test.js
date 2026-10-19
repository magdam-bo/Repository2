import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChord,validateProgression,noteName} from './theory.js';
import {AudioEngine} from './audio.js';
class Param {constructor(){this.ramps=[];}setValueAtTime(){}linearRampToValueAtTime(value,time){this.ramps.push({value,time});}exponentialRampToValueAtTime(){}setTargetAtTime(){}}
class Node {connect(){}disconnect(){}}
class Osc extends Node {constructor(){super();this.frequency={};this.stops=[];}start(t){this.started=t;}stop(t){this.stops.push(t);}}
function context(){return {currentTime:0,state:'running',destination:{},osc:[],gains:[],createGain(){const n=new Node();n.gain=new Param();this.gains.push(n);return n;},createDynamicsCompressor(){return new Node();},createOscillator(){const n=new Osc();this.osc.push(n);return n;},async resume(){this.state='running';}};}
const progression=['Cmaj7','Am7','Dm7','G7'].map(symbol=>({...parseChord(symbol),beats:4}));
test('default progression and supported symbols resolve to MIDI notes',()=>{
 assert.deepEqual(progression.map(c=>c.notes),[[48,52,55,59],[57,60,64,67],[50,53,57,60],[55,59,62,65]]);
 for(const symbol of ['C','Cm','C7','Cmaj7','Cm7','Cdim','Caug','Csus4','Cadd9','C/E','B♭m7','F#m7b5','Cdim7'])assert.ok(parseChord(symbol).notes.length>=3);
 assert.deepEqual(parseChord('C/E').notes,[40,48,52,55]);
 assert.equal(noteName(60),'C4');
 for(const s of ['','H7','Cbanana','C/','<script>'])assert.throws(()=>parseChord(s));
});
test('sound data is independent of symbol and validates explicit voicings',()=>{
 const c={symbol:'Cmaj7',notes:[48,55,59,64],beats:4};assert.deepEqual(validateProgression([c])[0].notes,c.notes);
 assert.throws(()=>validateProgression([{...c,notes:[NaN]}]));
});
test('sequence follows audio clock, finishes, and can restart',async()=>{
 const ctx=context();let last;const engine=new AudioEngine({contextFactory:()=>ctx,onPosition:p=>last=p});
 await engine.play(progression);assert.equal(ctx.osc.length,12);assert.equal(ctx.osc[0].started,.06);
 ctx.currentTime=.5;engine.tick();assert.equal(last.index,0);
 ctx.currentTime=1.96;engine.tick();assert.equal(ctx.osc.length,24);assert.equal(ctx.osc[12].started,2.06);
 ctx.currentTime=3.96;engine.tick();ctx.currentTime=5.96;engine.tick();ctx.currentTime=8.07;engine.tick();
 assert.equal(engine.playing,false);assert.equal(engine.sources.size,0);
 await engine.play(progression);assert.equal(engine.playing,true);engine.stop();
});
test('stop cancels scheduled sources and pending async unlock',async()=>{
 const ctx=context();const engine=new AudioEngine({contextFactory:()=>ctx});await engine.play(progression);
 const scheduled=ctx.osc.slice();engine.stop();assert.ok(scheduled.every(o=>o.stops.at(-1)===0));assert.equal(engine.timer,null);
 let resolve;ctx.state='suspended';ctx.resume=()=>new Promise(r=>{resolve=()=>{ctx.state='running';r();};});
 const pending=engine.play(progression);engine.stop();resolve();await pending;assert.equal(engine.playing,false);
});
test('BPM changes note length, loop wraps, switching clears old run',async()=>{
 const ctx=context();const engine=new AudioEngine({contextFactory:()=>ctx});
 await engine.play([progression[0]],{bpm:240,loop:true});assert.equal(engine.events[0].end,1.06);
 ctx.currentTime=.96;engine.tick();assert.equal(engine.events.length,2);assert.equal(engine.events[1].start,1.06);
 await engine.play([progression[1]],{bpm:60});assert.equal(engine.events[0].end,5.02);assert.equal(engine.chords[0].symbol,'Am7');engine.stop();
});
test('throttled scheduling stops without bursts',async()=>{
 const ctx=context();const engine=new AudioEngine({contextFactory:()=>ctx});await engine.play(progression);ctx.currentTime=6;engine.tick();assert.equal(engine.playing,false);assert.equal(ctx.osc.length,12);
});
test('loop can be disabled on last chord and enabled before natural end',async()=>{
 const ctx=context();const engine=new AudioEngine({contextFactory:()=>ctx});
 await engine.play([progression[0]],{bpm:240,loop:true});engine.setLoop(false);ctx.currentTime=1.07;engine.tick();assert.equal(engine.playing,false);
 await engine.play([progression[0]],{bpm:240});engine.setLoop(true);assert.equal(engine.finishTime,Infinity);ctx.currentTime=2.1;engine.tick();assert.equal(engine.playing,true);engine.stop();
});
import {transposeSymbol,transposeProgression,invertNotes} from './theory.js';
test('transposition preserves independent voicing and slash bass',()=>{
 assert.equal(transposeSymbol('C/E',1),'C#/F');assert.equal(transposeSymbol('Bbm7',-1),'Am7');
 const custom=[{symbol:'Cmaj7',notes:[48,55,59,64],beats:4}];assert.deepEqual(transposeProgression(custom,2)[0].notes,[50,57,61,66]);
 assert.deepEqual(invertNotes([48,52,55,59],1),[52,55,59,60]);assert.deepEqual(invertNotes([48,52,55,59],3),[59,60,64,67]);
 assert.throws(()=>transposeProgression([{symbol:'C',notes:[108],beats:4}],1));
});
import {degreeName} from './theory.js';
test('degree names follow tonic, chord quality, alterations and slash bass',()=>{
 assert.deepEqual(['Cmaj7','Am7','Dm7','G7'].map(s=>degreeName(s)),['Imaj7','VIm7','IIm7','V7']);
 assert.equal(degreeName('C/E'),'I/III');assert.equal(degreeName('Bb7'),'♭VII7');assert.equal(degreeName('F#dim'),'♯IVdim');
 assert.equal(degreeName('G7',7),'I7');assert.equal(degreeName('C/E',7),'IV/VI');
 assert.equal(degreeName('C#maj7',1),'Imaj7');
});

test('bass compensation raises low-note energy without changing pitch or timing',async()=>{
 const ctx=context();const engine=new AudioEngine({contextFactory:()=>ctx});await engine.unlock();
 engine.sound([36],1,1);engine.sound([48],2,1);engine.sound([60],3,1);
 const peaks=ctx.gains.slice(1).map(g=>g.gain.ramps[0].value);
 assert.ok(peaks[0]>peaks[3]&&peaks[3]>peaks[6]);assert.ok(peaks[0]<=peaks[6]*1.8+1e-12);
 assert.ok(peaks[1]/peaks[0]>peaks[7]/peaks[6]);
 assert.ok(Math.abs(ctx.osc[0].frequency.value-65.406391)<.001);
 assert.deepEqual(ctx.osc.map(o=>o.started),[1,1,1,2,2,2,3,3,3]);engine.stop();
});
