let audioCtx: AudioContext | null = null;

function getContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(
  freqStart: number,
  freqEnd: number,
  duration: number,
  volume = 0.15
) {
  try {
    const ctx = getContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(freqStart, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // Sound is a nice-to-have — never break the chat over an audio error.
  }
}

export function playSentSound() {
  playTone(600, 900, 0.12, 0.12);
}

export function playReceivedSound() {
  playTone(500, 350, 0.15, 0.15);
}