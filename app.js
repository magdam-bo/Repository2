import {makeChord,parseChord,noteName,mod,validateProgression,transposeProgression,invertNotes} from './theory.js?v=3';
import {AudioEngine} from './audio.js?v=3';
const $ = selector => document.querySelector(selector);
const presets={jazz:['Cmaj7','Am7','Dm7','G7'],pop:['C','G','Am','F'],minor:['Am7','Dm7','G7','Cmaj7']};
let chords=presets.jazz.map(s=>makeChord(s));
let selected=0, active=-1;
const engine=new AudioEngine({onState:(playing,message)=>{
  $('#play').disabled=playing;$('#status').textContent=message;
  $('#status').classList.remove('error');
},onPosition:position=>{
  active=position?.index??-1;
  $('#audio-signal').textContent=position?.level>.00001?'音声出力中':'音声待機';
  $('#audio-signal').dataset.level=String(position?.level??0);
  document.querySelectorAll('.chord-card').forEach((card,i)=>{
    card.classList.toggle('playing',i===active);
    card.querySelector('.card-progress').style.width=(i===active?position.fraction*100:0)+'%';
  });
  const total=chords.reduce((n,c)=>n+c.beats,0);
  const elapsed=position?chords.slice(0,active).reduce((n,c)=>n+c.beats,0)+chords[active].beats*position.fraction:0;
  const percent=elapsed/total*100;
  $('#progress').style.width=percent+'%';$('.timeline').setAttribute('aria-valuenow',String(Math.round(percent)));
  $('#position').textContent=String((position?.index??0)+1).padStart(2,'0')+' / '+String(chords.length).padStart(2,'0');
  document.querySelectorAll('#beat-dots i').forEach((dot,i)=>dot.classList.toggle('active',position?.beat===i));
  showNotes(position?.index??selected);
}});
function error(err){$('#status').textContent=err.message;$('#status').classList.add('error');}
function showNotes(index){
  const chord=chords[index];if(!chord)return;
  $('#current-symbol').textContent=chord.symbol;
  $('#note-names').textContent=chord.notes.map(noteName).join(' · ');
  document.querySelectorAll('.key').forEach(key=>key.classList.toggle('on',chord.notes.includes(Number(key.dataset.midi))));
}
function render(){
  $('#cards').replaceChildren();
  chords.forEach((chord,index)=>{
    const card=document.createElement('article');card.className='chord-card';card.classList.toggle('selected',index===selected);
    card.innerHTML=`<div class="card-top"><span>CHORD ${String(index+1).padStart(2,'0')}</span><span class="playing-tag">● PLAYING</span></div><input class="chord-name" aria-label="コード ${index+1} の名前" maxlength="24" spellcheck="false"><div class="notes"></div><div class="card-bottom"><label><input class="beats" aria-label="コード ${index+1} の拍数" type="number" min="0.25" max="32" step="0.25">拍</label></div><div class="card-actions"><button class="audition" aria-label="コード ${index+1} を試聴">▶ 試聴</button><button class="edit" aria-label="コード ${index+1} の詳細">詳細</button><button class="duplicate" aria-label="コード ${index+1} を複製">複製</button><button class="move-left" aria-label="コード ${index+1} を前へ">←</button><button class="move-right" aria-label="コード ${index+1} を後へ">→</button><button class="delete" aria-label="コード ${index+1} を削除">削除</button></div><div class="card-progress"></div>`;
    const name=card.querySelector('.chord-name');name.value=chord.symbol;
    card.querySelector('.notes').textContent=chord.notes.map(noteName).join(' · ');
    const beats=card.querySelector('.beats');beats.value=chord.beats;
    name.onchange=()=>{engine.stop();try{
      const parsed=parseChord(name.value);Object.assign(chord,parsed);selected=index;render();
    }catch(err){name.setAttribute('aria-invalid','true');error(err);}};
    name.onfocus=()=>{selected=index;if(!engine.playing)showNotes(index);renderEditor();};
    beats.onchange=()=>{engine.stop();const value=Number(beats.value);
      if(!Number.isFinite(value)||value<.25||value>32||value*4%1!==0){beats.value=chord.beats;error(new Error('拍数は0.25〜32の範囲で0.25刻みにしてください'));return;}
      chord.beats=value;
    };
    card.querySelector('.audition').onclick=()=>preview(index);
    card.querySelector('.edit').onclick=()=>{selected=index;render();$('#voicing-panel').open=true;};
    card.querySelector('.duplicate').onclick=()=>change(()=>{if(chords.length>=64)throw new Error('コードは64個までです');chords.splice(index+1,0,{...structuredClone(chord),id:crypto.randomUUID()});selected=index+1;});
    card.querySelector('.delete').disabled=chords.length===1;
    card.querySelector('.delete').onclick=()=>change(()=>{chords.splice(index,1);selected=Math.min(selected,chords.length-1);});
    for(const [selector,offset] of [['.move-left',-1],['.move-right',1]]){const btn=card.querySelector(selector);btn.disabled=index+offset<0||index+offset>=chords.length;btn.onclick=()=>change(()=>{[chords[index],chords[index+offset]]=[chords[index+offset],chords[index]];selected=index+offset;});}
    card.onclick=event=>{if(!event.target.closest('input,button,label'))preview(index);};
    $('#cards').append(card);
  });showNotes(selected);renderEditor();
  $('#chord-count').textContent=chords.length+' CHORDS';
  $('#position').textContent='01 / '+String(chords.length).padStart(2,'0');
}
function buildKeyboard(){
  const white=[];for(let n=21;n<=108;n++)if(![1,3,6,8,10].includes(mod(n)))white.push(n);
  for(const n of white){const key=document.createElement('div');key.className='key';key.dataset.midi=n;key.textContent=noteName(n);$('#keyboard').append(key);}
  for(let n=21;n<=108;n++)if([1,3,6,8,10].includes(mod(n))){const key=document.createElement('div');key.className='key black';key.dataset.midi=n;key.style.left=(white.filter(w=>w<n).length/white.length*100)+'%';key.textContent=noteName(n);$('#keyboard').append(key);}
}
$('#play').onclick=async()=>{try{
  if(document.querySelector('[aria-invalid=true]'))throw new Error('コード名の入力エラーを修正してください');
  const bpm=Number($('#bpm').value);if(!Number.isInteger(bpm)||bpm<40||bpm>240)throw new Error('BPMは40〜240の整数で指定してください');
  await engine.play(chords,{bpm,loop:$('#loop').checked});
}catch(err){engine.stop();error(err);}};
$('#stop').onclick=()=>engine.stop();
$('#bpm').onchange=()=>{engine.stop();const bpm=Number($('#bpm').value);if(!Number.isInteger(bpm)||bpm<40||bpm>240){$('#bpm').value=engine.bpm;error(new Error('BPMは40〜240の整数で指定してください'));}};
$('#loop').onchange=()=>engine.setLoop($('#loop').checked);
$('#volume').oninput=()=>{engine.setVolume(Number($('#volume').value)/100);$('#volume-value').textContent=$('#volume').value+'%';};
$('#preset').onchange=()=>{engine.stop();chords=presets[$('#preset').value].map(s=>makeChord(s));selected=0;render();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)engine.stop('画面が非表示になったため停止しました');});
window.addEventListener('pagehide',()=>engine.stop());
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!['INPUT','SELECT','BUTTON','TEXTAREA','SUMMARY'].includes(event.target.tagName)){event.preventDefault();if(engine.playing)engine.stop();else $('#play').click();}});
function change(action){engine.stop();try{action();render();}catch(err){error(err);}}
async function preview(index=selected){selected=index;renderEditor();showNotes(index);try{await engine.audition(chords[index].notes);}catch(err){error(err);}}
function setNotes(notes){const next=[...new Set(notes)].sort((a,b)=>a-b);validateProgression([{...chords[selected],notes:next}]);chords[selected].notes=next;}
function noteSelect(current,min=21,max=108){const select=document.createElement('select');for(let midi=min;midi<=max;midi++){const opt=document.createElement('option');opt.value=midi;opt.textContent=noteName(midi);opt.selected=midi===current;select.append(opt);}return select;}
function renderEditor(){
 const chord=chords[selected];if(!chord)return;
 $('#edit-symbol').textContent=chord.symbol;
 $('#inversion').value='0';$('#inversion').querySelector('option[value="3"]').disabled=parseChord(chord.symbol).notes.length<4;
 const oldBass=$('#bass'),bass=noteSelect(chord.notes[0],21,(chord.notes[1]??109)-1);bass.id='bass';oldBass.replaceWith(bass);
 bass.onchange=()=>change(()=>setNotes([Number(bass.value),...chord.notes.slice(1)]));
 $('#note-editor').replaceChildren();
 chord.notes.forEach((midi,index)=>{const row=document.createElement('div');row.className='note-row';const label=document.createElement('label');label.textContent='構成音 '+(index+1);const select=noteSelect(midi);select.setAttribute('aria-label','構成音 '+(index+1)+' の音高');label.append(select);row.append(label);select.onchange=()=>change(()=>{const notes=[...chord.notes];notes[index]=Number(select.value);setNotes(notes);});const remove=document.createElement('button');remove.textContent='削除';remove.setAttribute('aria-label','構成音 '+(index+1)+' を削除');remove.disabled=chord.notes.length===1;remove.onclick=()=>change(()=>setNotes(chord.notes.filter((_,i)=>i!==index)));row.append(remove);$('#note-editor').append(row);});
 $('#piano-roll').replaceChildren();
 for(let midi=108;midi>=21;midi--){const row=document.createElement('button');const on=chord.notes.includes(midi);row.className='roll-row'+(on?' on':'')+([1,3,6,8,10].includes(mod(midi))?' accidental':'');row.setAttribute('aria-label',noteName(midi)+(on?' を削除':' を追加'));row.setAttribute('aria-pressed',String(on));const label=document.createElement('span');label.textContent=noteName(midi);const bar=document.createElement('i');row.append(label,bar);row.onclick=()=>change(()=>setNotes(on?chord.notes.filter(n=>n!==midi):[...chord.notes,midi]));$('#piano-roll').append(row);}
}
$('#add-chord').onclick=()=>change(()=>{if(chords.length>=64)throw new Error('コードは64個までです');chords.push(makeChord('C'));selected=chords.length-1;});
for(const [id,step] of [['#transpose-down',-1],['#transpose-up',1]])$(id).onclick=()=>change(()=>{chords=transposeProgression(chords,step);});
$('#inversion').onchange=event=>change(()=>setNotes(invertNotes(parseChord(chords[selected].symbol).notes,Number(event.target.value))));
for(const [id,step] of [['#octave-down',-12],['#octave-up',12]])$(id).onclick=()=>change(()=>setNotes(chords[selected].notes.map(n=>n+step)));
$('#closed').onclick=()=>change(()=>{const notes=chords[selected].notes,bass=notes[0];setNotes([bass,...notes.slice(1).map(n=>{let x=bass+mod(n-bass);return x===bass?x+12:x;})]);});
$('#open').onclick=()=>change(()=>setNotes(chords[selected].notes.map((n,i)=>n+(i%2===1?12:0))));
$('#reset-voice').onclick=()=>change(()=>setNotes(parseChord(chords[selected].symbol).notes));
$('#add-note').onclick=()=>change(()=>{const notes=chords[selected].notes;let midi=notes.at(-1)+3;if(midi>108){midi=21;while(notes.includes(midi))midi++;}setNotes([...notes,midi]);});
$('#preview-voice').onclick=()=>preview();
function project(){return {format:'chord-lab',version:1,bpm:Number($('#bpm').value),loop:$('#loop').checked,volume:Number($('#volume').value),chords};}
function loadProject(data){
 if(data?.format!=='chord-lab'||data.version!==1)throw new Error('Chord Lab v1のJSONを選択してください');
 const next=validateProgression(data.chords);
 if(!Number.isInteger(data.bpm)||data.bpm<40||data.bpm>240||typeof data.loop!=='boolean'||!Number.isFinite(data.volume)||data.volume<0||data.volume>100)throw new Error('演奏設定が不正です');
 chords=next;selected=0;$('#bpm').value=data.bpm;$('#loop').checked=data.loop;$('#volume').value=data.volume;$('#volume').dispatchEvent(new Event('input'));render();
}
$('#save').onclick=()=>{try{localStorage.setItem('chord-lab-project',JSON.stringify(project()));$('#status').textContent='このブラウザにボイシングを含めて保存しました';}catch{error(new Error('保存できません。JSON書出をご利用ください'));}};
$('#load').onclick=()=>change(()=>{const saved=localStorage.getItem('chord-lab-project');if(!saved)throw new Error('保存された進行がありません');loadProject(JSON.parse(saved));});
$('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(project(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='chord-lab-progression.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#import').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('JSONは1MB以下にしてください');const data=JSON.parse(await file.text());change(()=>loadProject(data));}catch(err){error(err);}event.target.value='';};
buildKeyboard();render();
