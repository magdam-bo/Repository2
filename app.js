import {makeChord,parseChord,noteName,mod} from './theory.js?v=2';
import {AudioEngine} from './audio.js?v=2';
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
    const card=document.createElement('article');card.className='chord-card';
    card.innerHTML=`<div class="card-top"><span>CHORD ${String(index+1).padStart(2,'0')}</span><span class="playing-tag">● PLAYING</span></div><input class="chord-name" aria-label="コード ${index+1} の名前" maxlength="24" spellcheck="false"><div class="notes"></div><div class="card-bottom"><label><input class="beats" aria-label="コード ${index+1} の拍数" type="number" min="0.25" max="32" step="0.25">拍</label></div><div class="card-progress"></div>`;
    const name=card.querySelector('.chord-name');name.value=chord.symbol;
    card.querySelector('.notes').textContent=chord.notes.map(noteName).join(' · ');
    const beats=card.querySelector('.beats');beats.value=chord.beats;
    name.onchange=()=>{engine.stop();try{
      const parsed=parseChord(name.value);Object.assign(chord,parsed);selected=index;render();
    }catch(err){name.setAttribute('aria-invalid','true');error(err);}};
    name.onfocus=()=>{selected=index;if(!engine.playing)showNotes(index);};
    beats.onchange=()=>{engine.stop();const value=Number(beats.value);
      if(!Number.isFinite(value)||value<.25||value>32||value*4%1!==0){beats.value=chord.beats;error(new Error('拍数は0.25〜32の範囲で0.25刻みにしてください'));return;}
      chord.beats=value;
    };
    $('#cards').append(card);
  });showNotes(selected);
}
function buildKeyboard(){
  const white=[];for(let n=48;n<=83;n++)if(![1,3,6,8,10].includes(mod(n)))white.push(n);
  for(const n of white){const key=document.createElement('div');key.className='key';key.dataset.midi=n;key.textContent=noteName(n);$('#keyboard').append(key);}
  for(let n=48;n<=83;n++)if([1,3,6,8,10].includes(mod(n))){const key=document.createElement('div');key.className='key black';key.dataset.midi=n;key.style.left=(white.filter(w=>w<n).length/white.length*100)+'%';key.textContent=noteName(n);$('#keyboard').append(key);}
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
buildKeyboard();render();
