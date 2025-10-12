// FIRE PARTICLES BACKGROUND ANIMATION WITH ARROW TRANSFORMATION

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
        const maxLife = Math.random() * 100 + 100;
        return {
            x: Math.random() * this.canvas.width,
            y: this.canvas.height + Math.random() * 100,
            size: Math.random() * 3 + 1,
            speedY: Math.random() * 1.5 + 0.5,
            speedX: (Math.random() - 0.5) * 0.5,
            opacity: Math.random() * 0.5 + 0.3,
            hue: Math.random() * 30 + 10, // Start orange/yellow
            life: maxLife,
            maxLife: maxLife,
            phase: 'ember', // 'ember' or 'arrow'
            transformThreshold: maxLife * 0.3, // Transform at 30% life remaining
        };
    }
    
    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.y -= p.speedY;
            p.x += p.speedX;
            p.life--;
            p.opacity = (p.life / p.maxLife) * 0.6;
            
            // Check if particle should transform to arrow
            if (p.life <= p.transformThreshold && p.phase === 'ember') {
                p.phase = 'arrow';
            }
            
            // Gradually transition color from orange to green during arrow phase
            if (p.phase === 'arrow') {
                const transitionProgress = 1 - (p.life / p.transformThreshold);
                p.hue = 20 + (120 - 20) * transitionProgress; // 20 (orange) to 120 (green)
                p.speedX *= 0.95; // Stabilize horizontal movement
                p.speedY *= 1.02; // Speed up slightly
            } else {
                p.speedX += (Math.random() - 0.5) * 0.1;
                p.speedX *= 0.98;
            }
            
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
            
            if (p.phase === 'ember') {
                // Draw ember particle
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
            } else {
                // Draw arrow
                this.drawArrow(p);
            }
            
            this.ctx.restore();
        }
    }
    
    drawArrow(p) {
        const size = p.size * 3;
        
        // Arrow glow
        const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2);
        gradient.addColorStop(0, `hsla(${p.hue}, 100%, 60%, ${p.opacity * 0.4})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, size * 2, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Arrow shape (upward pointing)
        this.ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${p.opacity})`;
        this.ctx.beginPath();
        // Arrow head (triangle)
        this.ctx.moveTo(p.x, p.y - size * 1.5); // Top point
        this.ctx.lineTo(p.x - size, p.y); // Left point
        this.ctx.lineTo(p.x + size, p.y); // Right point
        this.ctx.closePath();
        this.ctx.fill();
        
        // Arrow shaft (rectangle)
        const shaftWidth = size * 0.5;
        const shaftHeight = size * 1.2;
        this.ctx.fillRect(
            p.x - shaftWidth / 2,
            p.y,
            shaftWidth,
            shaftHeight
        );
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
        console.log('🔥➡️ Particle system initialized with arrow transformation');
    }
});