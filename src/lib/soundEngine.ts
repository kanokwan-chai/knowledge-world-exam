// ============================================================================
// KNOWLEDGE WORLD — WEB AUDIO SYNTHESIZER (BGM & GAME SOUND EFFECTS)
// Pure Web Audio API — Zero external audio file dependencies, instant playback
// ============================================================================

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private bgmPlaying: boolean = false;
  private bgmInterval: number | null = null;
  private bgmMode: 'adventure' | 'quiz' | 'victory' = 'adventure';
  private stepIndex: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.isMuted = window.localStorage.getItem('kw_sound_muted') === 'true';
    }
  }

  private getContext(): AudioContext | null {
    if (this.isMuted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => null);
    }
    return this.ctx;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public isBgmActive(): boolean {
    return this.bgmPlaying && !this.isMuted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('kw_sound_muted', String(this.isMuted));
    }
    if (this.isMuted) {
      this.stopBGM();
    } else {
      this.playCoinSound();
    }
    return this.isMuted;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'triangle',
    volume: number = 0.18,
    delaySec: number = 0,
    slideToFreq?: number
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + durationSec);
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  // 1. Button Click / Block Pop
  public playClickSound() {
    this.playTone(520, 0.07, 'triangle', 0.15, 0, 680);
  }

  // 2. Platform Jump Sound
  public playJumpSound() {
    this.playTone(260, 0.18, 'square', 0.12, 0, 680);
  }

  // 3. Classic Golden Coin Chime (B5 -> E6)
  public playCoinSound() {
    this.playTone(987.77, 0.08, 'square', 0.14, 0);
    this.playTone(1318.51, 0.28, 'square', 0.14, 0.08);
  }

  // 4. Correct Answer Fanfare
  public playCorrectSound() {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((n, idx) => {
      this.playTone(n, 0.14, 'triangle', 0.2, idx * 0.07);
    });
  }

  // 5. Wrong Answer Cartoon Bonk
  public playWrongSound() {
    this.playTone(300, 0.18, 'sawtooth', 0.14, 0, 180);
    this.playTone(210, 0.28, 'sawtooth', 0.14, 0.16, 120);
  }

  // 6. RPG Power-Up Sprout & Activate
  public playPowerUpSound() {
    const arp = [330, 392, 659, 523, 587, 784, 659, 1046];
    arp.forEach((freq, idx) => {
      this.playTone(freq, 0.09, 'square', 0.12, idx * 0.055);
    });
  }

  // 7. Lucky Block (?) Chest Open Arpeggio
  public playLuckyBlockSound() {
    const melody = [440, 554.37, 659.25, 880, 659.25, 880, 1108.73, 1318.51];
    melody.forEach((freq, idx) => {
      this.playTone(freq, 0.12, 'triangle', 0.18, idx * 0.08);
    });
  }

  // 8. Countdown Final 5 Seconds Tick
  public playCountdownTick(urgent = false) {
    this.playTone(urgent ? 880 : 660, 0.06, 'sine', 0.15, 0);
  }

  // 9. Victory Podium Fanfare
  public playVictoryFanfare() {
    const seq = [
      { f: 523.25, d: 0.14, t: 0 },
      { f: 523.25, d: 0.14, t: 0.15 },
      { f: 523.25, d: 0.14, t: 0.3 },
      { f: 523.25, d: 0.35, t: 0.45 },
      { f: 415.3, d: 0.35, t: 0.82 },
      { f: 466.16, d: 0.35, t: 1.18 },
      { f: 523.25, d: 0.22, t: 1.55 },
      { f: 466.16, d: 0.12, t: 1.8 },
      { f: 523.25, d: 0.6, t: 1.95 },
    ];
    seq.forEach((n) => this.playTone(n.f, n.d, 'square', 0.14, n.t));
  }

  // 10. 3D Dash & Fireball Attack Impact Sound
  public playAttackHitSound() {
    // Whoosh dash
    this.playTone(620, 0.16, 'sawtooth', 0.22, 0, 140);
    // Explosion impact
    this.playTone(180, 0.28, 'square', 0.25, 0.14, 55);
    this.playTone(110, 0.35, 'sawtooth', 0.22, 0.18, 40);
  }

  // 11. 3D Magnet Steal Game EXP Sound
  public playStealExpSound() {
    const sweep = [320, 440, 587, 784, 1046];
    sweep.forEach((f, i) => {
      this.playTone(f, 0.09, 'sine', 0.18, i * 0.055, f * 1.25);
    });
  }

  // 12. Interactive Character Voice Synthesizer (Thai Voice Reactions)
  public speakCharacterVoice(text: string, isFemale: boolean = false) {
    if (this.isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'th-TH';
      utter.pitch = isFemale ? 1.35 : 1.05;
      utter.rate = 1.12;
      utter.volume = 0.9;
      window.speechSynthesis.speak(utter);
    } catch {
      // Fallback to tone if speechSynthesis is unavailable
    }
  }

  // 10. Cheerful Adventure Background Music Loop
  public startBGM(mode: 'adventure' | 'quiz' | 'victory' = 'adventure') {
    this.bgmMode = mode;
    if (this.isMuted) return;
    if (this.bgmInterval) {
      window.clearInterval(this.bgmInterval);
    }
    this.bgmPlaying = true;
    this.stepIndex = 0;

    // Original bouncy platformer bass & melody pattern
    const adventureNotes = [
      523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880.0, 698.46,
      523.25, 659.25, 783.99, 1046.5, 987.77, 783.99, 659.25, 587.33,
    ];
    const quizNotes = [
      440, 523.25, 659.25, 523.25, 493.88, 587.33, 698.46, 587.33,
      523.25, 659.25, 783.99, 659.25, 698.46, 659.25, 587.33, 493.88,
    ];

    const tempoMs = mode === 'quiz' ? 210 : 260;

    this.bgmInterval = window.setInterval(() => {
      if (this.isMuted || !this.bgmPlaying) return;
      const pattern = this.bgmMode === 'quiz' ? quizNotes : adventureNotes;
      const freq = pattern[this.stepIndex % pattern.length];
      this.playTone(freq, 0.14, 'triangle', 0.06, 0);
      if (this.stepIndex % 4 === 0) {
        this.playTone(freq / 2, 0.18, 'sine', 0.05, 0);
      }
      this.stepIndex++;
    }, tempoMs);
  }

  public stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmInterval) {
      window.clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }

  public toggleBGM(mode: 'adventure' | 'quiz' = 'adventure'): boolean {
    if (this.bgmPlaying) {
      this.stopBGM();
      return false;
    } else {
      if (this.isMuted) {
        this.isMuted = false;
        window.localStorage.setItem('kw_sound_muted', 'false');
      }
      this.startBGM(mode);
      return true;
    }
  }
}

export const soundEngine = new SoundEngine();
