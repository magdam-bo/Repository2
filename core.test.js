import test from 'node:test';
import assert from 'node:assert/strict';
import {parseChord,validateProgression,noteName} from './theory.js';
import {AudioEngine} from './audio.js';
class Param {setValueAtTime(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}setTargetAtTime(){}}
class Node {connect(){}disconnect(){}}
class Osc extends Node {constructor(){super();this.frequency={};this.stops=[];}start(t){this.started=t;}stop(t){this.stops.push(t);}}
function context(){return {currentTime:0,state:'running',destination:{},osc:[],createGain(){const n=new Node();n.gain=new Param();return n;},createDynamicsCompressor(){return new Node();},createOscillator(){const n=new Osc();this.osc.push(n);return n;},async resume(){this.state='running';}};}
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
