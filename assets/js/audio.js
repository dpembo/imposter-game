// Audio System - Generates dynamic sound effects with Web Audio API
class AudioSystem {
    constructor() {
        this.audioContext = null;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            this.isInitialized = true;
        } catch (e) {
            console.log('Web Audio API not supported');
        }
    }

    playSound(type) {
        if (!this.isInitialized) this.init();
        if (!this.audioContext) return;

        const ctx = this.audioContext;

        switch (type) {
            case 'click':
                this.playClickSound();
                break;
            case 'join':
                this.playSuccessSound();
                break;
            case 'reveal':
                this.playRevealSound();
                break;
            case 'vote':
                this.playVoteSound();
                break;
            case 'caught':
                this.playCaughtSound();
                break;
            case 'notification':
                this.playNotificationSound();
                break;
        }
    }

    playClickSound() {
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    playSuccessSound() {
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const frequencies = [523.25, 659.25, 783.99]; // C, E, G

        frequencies.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.3, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.15);

            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.15);
        });
    }

    playRevealSound() {
        const ctx = this.audioContext;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.start(now);
        osc.stop(now + 0.3);
    }

    playVoteSound() {
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.frequency.setValueAtTime(400 + i * 100, now + i * 0.05);
            gain.gain.setValueAtTime(0.2, now + i * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.08);

            osc.start(now + i * 0.05);
            osc.stop(now + i * 0.05 + 0.08);
        }
    }

    playCaughtSound() {
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        // Sharp descending tone
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.3);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.start(now);
        osc.stop(now + 0.3);

        // Second tone
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();

        osc2.connect(gain2);
        gain2.connect(ctx.destination);

        osc2.frequency.setValueAtTime(800, now + 0.15);
        osc2.frequency.exponentialRampToValueAtTime(200, now + 0.45);
        gain2.gain.setValueAtTime(0.3, now + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

        osc2.start(now + 0.15);
        osc2.stop(now + 0.45);
    }

    playNotificationSound() {
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        const frequencies = [659.25, 783.99]; // E, G

        frequencies.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.frequency.setValueAtTime(freq, now + i * 0.1);
            gain.gain.setValueAtTime(0.2, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.12);

            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.12);
        });
    }
}

// Global instance
const audio = new AudioSystem();
