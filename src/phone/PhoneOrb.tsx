import React, { useEffect, useRef } from 'react';

interface PhoneOrbProps {
  type?: 'sphere' | 'fluid-wave' | 'ribbon-waveform';
  size?: 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
  isListening?: boolean;
}

export const PhoneOrb: React.FC<PhoneOrbProps> = ({
  type = 'fluid-wave',
  size = 'hero',
  className = '',
  isListening = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-36 h-36',
    hero: 'w-52 h-52 sm:w-60 sm:h-60',
  };

  // 1. Fluid Wave Animated Orb (Canvas-based dynamic 60fps organic liquid sphere)
  useEffect(() => {
    if (type !== 'fluid-wave') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    // Retina / High-DPI support
    const dpr = window.devicePixelRatio || 1;
    const sizePx = 240;
    canvas.width = sizePx * dpr;
    canvas.height = sizePx * dpr;
    ctx.scale(dpr, dpr);

    const centerX = sizePx / 2;
    const centerY = sizePx / 2;
    const baseRadius = 68;

    const render = () => {
      time += 0.028;
      ctx.clearRect(0, 0, sizePx, sizePx);

      // Deep core ambient radial glow
      const bgGlow = ctx.createRadialGradient(
        centerX,
        centerY,
        10,
        centerX,
        centerY,
        baseRadius * 1.5
      );
      bgGlow.addColorStop(0, 'rgba(168, 85, 247, 0.25)');
      bgGlow.addColorStop(0.5, 'rgba(236, 72, 153, 0.15)');
      bgGlow.addColorStop(1, 'rgba(7, 8, 14, 0)');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, sizePx, sizePx);

      // Number of twisting ribbon strands
      const numStrands = 36;

      for (let i = 0; i < numStrands; i++) {
        const baseAngle = (i * Math.PI * 2) / numStrands;
        const phaseOffset = i * 0.22 + time;

        // Harmonic organic wave modulation
        const wave1 = Math.sin(phaseOffset * 1.8) * 14;
        const wave2 = Math.cos(phaseOffset * 2.4 + i * 0.1) * 10;
        const wave3 = Math.sin(time * 0.8 + i * 0.5) * 6;

        const currentRadius = baseRadius + wave1 + wave2 + wave3;
        const angle = baseAngle + Math.sin(time * 0.5 + i * 0.1) * 0.35;

        const startX = centerX + Math.cos(angle) * (baseRadius * 0.45);
        const startY = centerY + Math.sin(angle) * (baseRadius * 0.45);

        const endX = centerX + Math.cos(angle + 0.4) * currentRadius;
        const endY = centerY + Math.sin(angle + 0.4) * currentRadius;

        const cpX = centerX + Math.cos(angle + 0.2) * (currentRadius * 1.15 + Math.sin(time + i) * 8);
        const cpY = centerY + Math.sin(angle + 0.2) * (currentRadius * 1.15 + Math.cos(time + i) * 8);

        // Color gradient interpolation based on angle and strand index
        const grad = ctx.createLinearGradient(startX, startY, endX, endY);
        const hueShift = (i / numStrands + time * 0.05) % 1;

        if (hueShift < 0.25) {
          grad.addColorStop(0, '#fb923c'); // Warm Orange
          grad.addColorStop(0.5, '#f43f5e'); // Rose
          grad.addColorStop(1, '#a855f7'); // Purple
        } else if (hueShift < 0.5) {
          grad.addColorStop(0, '#f43f5e'); // Rose
          grad.addColorStop(0.5, '#d946ef'); // Fuchsia
          grad.addColorStop(1, '#38bdf8'); // Sky Blue
        } else if (hueShift < 0.75) {
          grad.addColorStop(0, '#c084fc'); // Lavender
          grad.addColorStop(0.5, '#60a5fa'); // Blue
          grad.addColorStop(1, '#34d399'); // Emerald
        } else {
          grad.addColorStop(0, '#38bdf8'); // Cyan
          grad.addColorStop(0.5, '#a855f7'); // Purple
          grad.addColorStop(1, '#f97316'); // Orange
        }

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Inner pulsating void core
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.48 + Math.sin(time * 2) * 3, 0, Math.PI * 2);
      ctx.fillStyle = '#080911';
      ctx.fill();

      // Subtle inner core glint
      const coreGrad = ctx.createRadialGradient(
        centerX - 4,
        centerY - 4,
        1,
        centerX,
        centerY,
        baseRadius * 0.35
      );
      coreGrad.addColorStop(0, 'rgba(236, 72, 153, 0.45)');
      coreGrad.addColorStop(0.6, 'rgba(168, 85, 247, 0.2)');
      coreGrad.addColorStop(1, 'rgba(8, 9, 17, 0)');
      ctx.fillStyle = coreGrad;
      ctx.fill();

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [type]);

  // 2. Ribbon Waveform for Live Voice Screen
  if (type === 'ribbon-waveform') {
    return (
      <div className={`relative flex items-center justify-center w-full h-32 overflow-hidden ${className}`}>
        <div className="absolute inset-0 bg-purple-600/20 blur-3xl pointer-events-none" />
        <svg
          viewBox="0 0 400 120"
          className="w-full h-full text-purple-400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#f43f5e" />
            </linearGradient>
          </defs>
          {Array.from({ length: 14 }).map((_, i) => (
            <path
              key={i}
              d={`M 0 ${60 + i * 2} Q 100 ${15 + i * 5}, 200 ${60 - i * 3} T 400 ${60 + i * 2}`}
              stroke="url(#waveGrad)"
              strokeWidth="1.2"
              strokeOpacity={0.8 - i * 0.04}
              className="animate-pulse"
              style={{ animationDuration: `${1.2 + i * 0.1}s` }}
            />
          ))}
        </svg>
      </div>
    );
  }

  // 3. Fluid Wave (Dynamic Canvas Render)
  if (type === 'fluid-wave') {
    return (
      <div className={`relative flex items-center justify-center ${sizeClasses[size]} ${className}`}>
        {/* Soft background aura glow */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-fuchsia-600/30 via-purple-600/25 to-orange-500/20 blur-3xl animate-pulse" />
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%' }}
          className="relative z-10 select-none pointer-events-none"
        />
      </div>
    );
  }

  // 4. Login 3D Iridescent Orb
  return (
    <div className={`relative flex items-center justify-center ${sizeClasses[size]} ${className}`}>
      {/* Deep Neon Backlight */}
      <div className="absolute inset-0 rounded-full bg-fuchsia-600/35 blur-3xl animate-pulse" />
      <div className="absolute -inset-4 rounded-full bg-indigo-600/25 blur-2xl" />

      {/* 3D Iridescent Glossy Orb */}
      <div className="relative h-full w-full rounded-full overflow-hidden shadow-[0_0_60px_rgba(217,70,239,0.4)] ring-1 ring-white/20 transition-transform duration-700 hover:scale-105">
        <svg viewBox="0 0 140 140" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="orbBase" cx="42%" cy="38%" r="65%" fx="35%" fy="30%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="25%" stopColor="#818cf8" />
              <stop offset="55%" stopColor="#c026d3" />
              <stop offset="80%" stopColor="#e11d48" />
              <stop offset="100%" stopColor="#0f051d" />
            </radialGradient>

            <radialGradient id="cyanHighlight" cx="35%" cy="30%" r="35%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="40%" stopColor="#67e8f9" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </radialGradient>

            <linearGradient id="magentaRim" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
              <stop offset="70%" stopColor="#d946ef" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          <circle cx="70" cy="70" r="68" fill="url(#orbBase)" />
          <ellipse cx="50" cy="45" rx="30" ry="18" transform="rotate(-20 50 45)" fill="url(#cyanHighlight)" />
          <path
            d="M 25 80 C 35 120, 115 120, 125 75 C 115 130, 25 125, 25 80 Z"
            fill="url(#magentaRim)"
          />
          <circle cx="42" cy="38" r="4.5" fill="#ffffff" opacity="0.95" />
          <circle cx="52" cy="32" r="2" fill="#ffffff" opacity="0.8" />
        </svg>
      </div>
    </div>
  );
};
