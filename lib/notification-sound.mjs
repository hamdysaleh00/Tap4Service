// Web Audio is unlocked only by the explicit staff control. Synthetic tones
// avoid remote media, CSP changes, asset downloads, and codec dependencies.
export const soundNotes={order:[660,880],service:[880,880,1046],bill:[440,660,880],payment:[1046,1320],session:[520],cancel:[880,660,440]};
export function createSoundAlerts({createContext=()=>new globalThis.AudioContext()}={}){
 let context=null,enabled=false;
 function tone(category){
  if(!enabled||context?.state!=='running')return false;
  try{
   const start=context.currentTime;
   (soundNotes[category]||soundNotes.order).forEach((frequency,i)=>{
    const oscillator=context.createOscillator(),gain=context.createGain(),at=start+i*.16;
    oscillator.frequency.value=frequency;oscillator.connect(gain);gain.connect(context.destination);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.12,at+.015);gain.gain.exponentialRampToValueAtTime(.001,at+.13);
    oscillator.start(at);oscillator.stop(at+.15);
   });return true;
  }catch{return false;}
 }
 return {
  async enable(){try{context??=createContext();await context.resume();enabled=context.state==='running';return enabled;}catch{enabled=false;return false;}},
  mute(){enabled=false;},
  play:tone,
  async close(){enabled=false;try{await context?.close();}catch{}context=null;},
 };
}
