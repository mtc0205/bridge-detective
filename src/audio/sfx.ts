/**
 * 合成音效占位(M3):WebAudio 实时合成,零外部资源、零网络请求。
 *
 * M3 后续如换 CC0 采样,只改本模块内部实现,调用点(Game)不变。
 * AudioContext 在首次用户手势后的播放调用中惰性创建并 resume;
 * M 键全局静音切换(master gain 置 0)。
 */

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  /** M 键切换静音;返回切换后的状态。 */
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.16;
    return this.muted;
  }

  /** 弹窗打开:轻点。 */
  open(): void {
    this.tone(520, 0, 0.07, 'triangle', 0.5);
  }

  /** 判定正确:上行双音。 */
  good(): void {
    this.tone(660, 0, 0.14, 'sine', 0.9);
    this.tone(990, 0.09, 0.22, 'sine', 0.7);
  }

  /** 误报 / 误判:低频下坠蜂鸣。 */
  bad(): void {
    this.tone(180, 0, 0.28, 'square', 0.45, 120);
  }

  /** 结算:三音上行小尾声。 */
  settle(): void {
    this.tone(392, 0, 0.3, 'sine', 0.8);
    this.tone(523, 0.14, 0.3, 'sine', 0.8);
    this.tone(659, 0.28, 0.5, 'sine', 0.8);
  }

  /** 环境风(检测现场氛围;低音量带通噪声循环)。 */
  startWind(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || ctx.state !== 'running') {
      // 尚无手势:挂一次性监听,首个手势后再起
      if (!ctx) {
        const resume = (): void => {
          window.removeEventListener('pointerdown', resume);
          window.removeEventListener('keydown', resume);
          this.startWind();
        };
        window.addEventListener('pointerdown', resume);
        window.addEventListener('keydown', resume);
      }
      return;
    }
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 320;
    band.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(band).connect(gain).connect(this.master);
    src.start();
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }

  // —————————————————————— 内部 ——————————————————————

  private ensure(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as WebkitWindow).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(
    freq: number,
    startSec: number,
    durSec: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + startSec;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + durSec);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.05);
  }
}
