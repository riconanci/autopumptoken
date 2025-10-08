// FIRE PARTICLES BACKGROUND ANIMATION

class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.particleCount = 80;
        this.resize();
        this.init();
        this.animate();
        window.addEventListener('resize', () => this.resize());
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    init() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push(this.createParticle());
        }
    }
    
    createParticle() {
        return {
            x: Math.random() * this.canvas.width,
            y: this.canvas.height + Math.random() * 100,
            size: Math.random() * 3 + 1,
            speedY: Math.random() * 1.5 + 0.5,
            speedX: (Math.random() - 0.5) * 0.5,
            opacity: Math.random() * 0.5 + 0.3,
            hue: Math.random() * 30 + 10,
            life: Math.random() * 100 + 100,
            maxLife: Math.random() * 100 + 100,
        };
    }
    
    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.y -= p.speedY;
            p.x += p.speedX;
            p.life--;
            p.opacity = (p.life / p.maxLife) * 0.6;
            p.speedX += (Math.random() - 0.5) * 0.1;
            p.speedX *= 0.98;
            if (p.life <= 0 || p.y < -10) {
                this.particles.splice(i, 1);
                this.particles.push(this.createParticle());
            }
        }
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (const p of this.particles) {
            this.ctx.save();
            const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
            gradient.addColorStop(0, `hsla(${p.hue}, 100%, 60%, ${p.opacity})`);
            gradient.addColorStop(0.5, `hsla(${p.hue}, 100%, 50%, ${p.opacity * 0.5})`);
            gradient.addColorStop(1, `hsla(${p.hue}, 100%, 40%, 0)`);
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${p.opacity})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
    }
    
    animate() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('particleCanvas');
    if (canvas) {
        new ParticleSystem(canvas);
        console.log('🔥 Particle system initialized');
    }
});