'use client';

import { useEffect, useRef } from 'react';

interface WaveformProps {
  isPlaying: boolean;
  color?: string;
  height?: number;
  analyser?: AnalyserNode | null;
}

export default function Waveform({ isPlaying, color = '#6366F1', height = 48, analyser }: WaveformProps) {
  const barsRef = useRef<HTMLDivElement[]>([]);
  const rafRef = useRef<number>(0);
  const BAR_COUNT = 40;

  useEffect(() => {
    if (!isPlaying || !analyser) {
      cancelAnimationFrame(rafRef.current);
      barsRef.current.forEach((bar, i) => {
        if (bar) {
          const baseH = 8 + Math.sin(i * 0.5) * 6;
          bar.style.height = `${baseH}px`;
          bar.style.opacity = '0.3';
        }
      });
      return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      analyser!.getByteFrequencyData(dataArray);
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const dataIndex = Math.floor((i / BAR_COUNT) * dataArray.length);
        const value = dataArray[dataIndex] / 255;
        const barHeight = 8 + value * (height - 16);
        bar.style.height = `${barHeight}px`;
        bar.style.opacity = `${0.4 + value * 0.6}`;
      });
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, analyser, height]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height, justifyContent: 'center' }}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const baseH = 8 + Math.sin(i * 0.5) * 6;
        return (
          <div
            key={i}
            ref={el => { if (el) barsRef.current[i] = el; }}
            style={{
              width: 3,
              borderRadius: 2,
              backgroundColor: color,
              opacity: 0.3,
              height: baseH,
              transition: isPlaying && !analyser ? 'height 0.1s ease' : 'height 0.6s ease, opacity 0.6s ease',
            }}
          />
        );
      })}
    </div>
  );
}
