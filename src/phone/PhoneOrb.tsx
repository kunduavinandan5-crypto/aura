import React, { forwardRef } from 'react';
import { LiquidOrb, LiquidOrbHandle, LiquidOrbProps } from '@/components/ui/liquid-orb';

export interface PhoneOrbProps {
  type?: 'sphere' | 'fluid-wave' | 'ribbon-waveform';
  size?: 'sm' | 'md' | 'lg' | 'hero' | string;
  className?: string;
  isListening?: boolean;
  state?: 'idle' | 'thinking';
  audioBands?: { low?: number; mid?: number; high?: number; all?: number };
}

export const PhoneOrb = forwardRef<LiquidOrbHandle, PhoneOrbProps>(function PhoneOrb(
  {
    type = 'fluid-wave',
    size = 'hero',
    className = '',
    isListening = false,
    state,
    audioBands,
  },
  ref
) {
  // 1. Ribbon Waveform for Live Voice Screen
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

  // 2. Liquid WebGPU Glass Orb (for 'fluid-wave' and 'sphere')
  return (
    <LiquidOrb
      ref={ref}
      size={size}
      className={className}
      isListening={isListening}
      state={state}
      audioBands={audioBands}
    />
  );
});

export { LiquidOrb };
export type { LiquidOrbHandle, LiquidOrbProps };
