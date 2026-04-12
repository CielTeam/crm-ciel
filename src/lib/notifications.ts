// Notification sound & browser push notification utilities
// Uses DynamicsCompressor + boosted gain so alerts punch through music/media

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/** Ensure context is running (must await before scheduling nodes) */
async function ensureResumed(ctx: AudioContext) {
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}

/** Create a compressor node that ensures the notification cuts through other audio */
function createPunchThrough(ctx: AudioContext): DynamicsCompressorNode {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-20, ctx.currentTime);
  compressor.knee.setValueAtTime(10, ctx.currentTime);
  compressor.ratio.setValueAtTime(12, ctx.currentTime);
  compressor.attack.setValueAtTime(0.003, ctx.currentTime);
  compressor.release.setValueAtTime(0.1, ctx.currentTime);
  compressor.connect(ctx.destination);
  return compressor;
}

/** Play a short message received chime — two soft rising notes */
export async function playMessageSound() {
  try {
    const ctx = getAudioContext();
    await ensureResumed(ctx);
    const compressor = createPunchThrough(ctx);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(compressor);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523, ctx.currentTime);       // C5
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.12); // E5
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}

/** Play a task assignment alert — three staccato beeps */
export async function playTaskSound() {
  try {
    const ctx = getAudioContext();
    await ensureResumed(ctx);
    const compressor = createPunchThrough(ctx);

    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(compressor);

      osc.type = 'square';
      osc.frequency.setValueAtTime(784, ctx.currentTime + i * 0.15); // G5
      gain.gain.setValueAtTime(0.35, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.1);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.1);
    }
  } catch {
    // Audio not available
  }
}

/** Play a general notification chime — single mellow tone */
export async function playNotificationSound(urgent = false) {
  try {
    const ctx = getAudioContext();
    await ensureResumed(ctx);
    const compressor = createPunchThrough(ctx);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(compressor);

    if (urgent) {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch {
    // Audio not available
  }
}

/** Request browser notification permission */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** Show a browser push notification */
export function showBrowserNotification(title: string, options?: { body?: string; tag?: string; urgent?: boolean }) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(title, {
      body: options?.body || undefined,
      tag: options?.tag || 'task-notification',
      icon: '/favicon.ico',
      requireInteraction: options?.urgent || false,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    if (!options?.urgent) {
      setTimeout(() => notification.close(), 8000);
    }
  } catch {
    // Notification API not available
  }
}
