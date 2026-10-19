// Chord symbols and sounding MIDI notes are intentionally separate values.
export const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const PITCH = {C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const QUALITIES = {'':[0,4,7],maj:[0,4,7],M:[0,4,7],m:[0,3,7],min:[0,3,7],
  '7':[0,4,7,10],maj7:[0,4,7,11],M7:[0,4,7,11],m7:[0,3,7,10],min7:[0,3,7,10],
  dim:[0,3,6],dim7:[0,3,6,9],m7b5:[0,3,6,10],aug:[0,4,8],'+':[0,4,8],
  sus4:[0,5,7],sus2:[0,2,7],add9:[0,4,7,14],madd9:[0,3,7,14],
  '6':[0,4,7,9],m6:[0,3,7,9],'9':[0,4,7,10,14],maj9:[0,4,7,11,14],m9:[0,3,7,10,14],'7sus4':[0,5,7,10]};
export const mod = n => (n % 12 + 12) % 12;
export const noteName = midi => NAMES[mod(midi)] + (Math.floor(midi / 12) - 1);
export function parseChord(input) {
  const symbol = input.trim().replaceAll('♯','#').replaceAll('♭','b').replaceAll('△','maj').replaceAll('Δ','maj').replaceAll('−','m');
  const match = /^([A-Ga-g])([#b]?)([^/]*)(?:\/([A-Ga-g])([#b]?))?$/.exec(symbol);
  if (!match || !Object.hasOwn(QUALITIES, match[3])) throw new Error('対応するコードを入力してください（例：Cmaj7、Am7、C/E）');
  const pitch = (letter, accidental) => mod(PITCH[letter.toUpperCase()] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0));
  const root = pitch(match[1], match[2]);
  const notes = QUALITIES[match[3]].map(interval => 48 + root + interval);
  if (match[4]) notes.unshift(36 + pitch(match[4], match[5]));
  return {symbol:match[1].toUpperCase()+match[2]+match[3]+(match[4]?'/'+match[4].toUpperCase()+match[5]:''), notes:[...new Set(notes)].sort((a,b)=>a-b)};
}
export function makeChord(symbol, beats=4) {
  const chord = parseChord(symbol);
  return {id:crypto.randomUUID(), ...chord, beats};
}
export function validateProgression(chords) {
  if (!Array.isArray(chords) || !chords.length || chords.length > 64) throw new Error('コード数は1〜64個にしてください');
  return chords.map(chord => {
    const {symbol} = parseChord(chord.symbol);
    if (!Number.isFinite(chord.beats) || chord.beats < .25 || chord.beats > 32 || chord.beats*4%1!==0) throw new Error('拍数は0.25〜32で指定してください');
    if (!Array.isArray(chord.notes) || !chord.notes.length || chord.notes.length>16 || chord.notes.some(n=>!Number.isInteger(n)||n<21||n>108)) throw new Error('音高はMIDI 21〜108、構成音は1〜16音で指定してください');
    return {id:crypto.randomUUID(), symbol, beats:chord.beats, notes:[...new Set(chord.notes)].sort((a,b)=>a-b)};
  });
}
export function transposeSymbol(symbol, semitones) {
  parseChord(symbol);
  const normalized=symbol.replaceAll('♯','#').replaceAll('♭','b');
  return normalized.replace(/(^|\/)([A-G])([#b]?)/g,(_,prefix,letter,acc)=>prefix+NAMES[mod(PITCH[letter]+(acc==='#'?1:acc==='b'?-1:0)+semitones)]);
}
export function transposeProgression(chords, semitones) {
  const next=chords.map(c=>({...c,symbol:transposeSymbol(c.symbol,semitones),notes:c.notes.map(n=>n+semitones)}));
  validateProgression(next); return next;
}
export function invertNotes(notes, inversion) {
  const result=[...notes].sort((a,b)=>a-b);
  for(let i=0;i<inversion;i++){let note=result.shift();while(note<=result.at(-1))note+=12;result.push(note);}
  if(result.some(n=>n>108))throw new Error('転回後の音高が上限を超えます');return result;
}
// Uppercase Roman degrees retain the chord quality (e.g. VIm7).
// Accidentals are measured against the selected major-key tonic.
export function degreeName(symbol, tonic=0) {
  const normalized=parseChord(symbol).symbol;
  const match=/^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/.exec(normalized);
  const degrees=['I','♭II','II','♭III','III','IV','♯IV','V','♭VI','VI','♭VII','VII'];
  const degree=(letter,accidental)=>degrees[mod(PITCH[letter]+(accidental==='#'?1:accidental==='b'?-1:0)-tonic)];
  return degree(match[1],match[2])+match[3]+(match[4]?'/'+degree(match[4],match[5]):'');
}
