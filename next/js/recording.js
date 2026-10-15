import {write, read, remove} from './store.js';
export class Recording {
  constructor({onText, onStatus, onStop}) { Object.assign(this, {onText,onStatus,onStop}); this.active = false; this.persist = Promise.resolve(); }
  async start(initial) {
    if (this.active || this.finishing) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Audio recording is unavailable. Use keyboard dictation or type your recap.');
    this.stream = await navigator.mediaDevices.getUserMedia({audio:true});
    try { await discardRecording(); } catch(error) { this.stream.getTracks().forEach(track=>track.stop()); throw error; }
    this.persist = Promise.resolve();
    this.parts = []; this.text = initial.trim(); this.interim = '';
    this.id = crypto.randomUUID();
    try { this.recorder = new MediaRecorder(this.stream); } catch(error) { this.stream.getTracks().forEach(track=>track.stop()); throw error; }
    this.active = true;
    this.recorder.ondataavailable = event => {
      if (event.data.size) {
        this.parts.push(event.data);
        // Store each chunk separately; do not repeatedly rewrite the entire recording.
        const count = this.parts.length;
        const key = `audio-${this.id}-${count - 1}`;
        this.persist = this.persist.then(() => write(key, event.data)).then(() => write('recording', {id:this.id,count,type:this.recorder.mimeType}));
        this.persist.catch(() => this.onStatus('Audio backup could not be saved on this device. Keep the page open and download the recording when finished.'));
      }
    };
    this.recorder.onerror = () => { this.onStatus('Audio recording was interrupted. Review the captured transcript and recording.'); this.stop(); };
    this.recorder.onstop = async () => {
      this.active = false; this.stream.getTracks().forEach(track => track.stop());
      try { this.recognition?.abort(); } catch {}
      try { await this.persist; } catch {}
      this.finishing = false;
      this.onStop(new Blob(this.parts, {type:this.recorder.mimeType}));
    };
    try { this.recorder.start(2000); } catch(error) { this.active=false; this.stream.getTracks().forEach(track=>track.stop()); throw error; }
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) { this.onStatus('Recording audio. Live transcription is unavailable here; use keyboard dictation or type your recap before organizing.'); return; }
    this.recognition = new Speech();
    this.recognition.lang = 'en-US'; this.recognition.continuous = true; this.recognition.interimResults = true;
    this.recognition.onresult = event => {
      let interim = '';
      for (let i=event.resultIndex;i<event.results.length;i++) {
        if (event.results[i].isFinal) this.text += (this.text ? ' ' : '') + event.results[i][0].transcript.trim();
        else interim += event.results[i][0].transcript;
      }
      this.interim = interim;
      this.onText(this.text + (interim ? ' ' + interim : ''));
    };
    this.recognition.onerror = event => {
      if (['not-allowed','service-not-allowed','audio-capture'].includes(event.error)) {
        this.speechBlocked = true;
        this.onStatus('Live transcription stopped. Audio is still recording; you can download it and enter your recap manually.');
      }
    };
    this.recognition.onend = () => {
      // Preserve the last provisional words before iOS starts a fresh recognition session.
      if (this.interim) { this.text += ' ' + this.interim; this.interim = ''; this.onText(this.text); }
      if (this.active && !this.speechBlocked) {
        clearTimeout(this.restart); this.restart = setTimeout(() => {
          if (this.active) try { this.recognition.start(); } catch { this.onStatus('Live transcription paused. Audio is still recording.'); }
        }, 300);
      }
    };
    this.speechBlocked = false;
    try { this.recognition.start(); this.onStatus('Recording. Pause whenever you need; tap Stop when finished.'); }
    catch { this.speechBlocked = true; this.onStatus('Recording audio only. Live transcription did not start.'); }
  }
  stop() {
    if (!this.active) return;
    this.active = false; this.finishing = true; clearTimeout(this.restart);
    try { this.recognition?.stop(); } catch {}
    if (this.recorder?.state !== 'inactive') this.recorder.stop();
    this.stream?.getTracks().forEach(track => track.stop());
  }
}
export async function restoredRecording() {
  const metadata = await read('recording');
  if (!metadata) return null;
  const chunks = [];
  for (let i=0;i<metadata.count;i++) { const chunk = await read(`audio-${metadata.id}-${i}`); if (chunk) chunks.push(chunk); }
  return chunks.length ? new Blob(chunks, {type:metadata.type}) : null;
}

export async function discardRecording() {
 const previous=await read('recording');
 if(previous){for(let i=0;i<previous.count;i++)await remove(`audio-${previous.id}-${i}`);await remove('recording');}
}
