'use client';

import Waveform from './Waveform';
import LatencyBadge from './LatencyBadge';
import type { Voice, ModelId } from '@/types';

interface CastRowProps {
  voice: Voice;
  index: number;
  isPlaying: boolean;
  isLoading: boolean;
  model: ModelId;
  analyser: AnalyserNode | null;
  onPlay: (voiceId: string) => void;
}

export default function CastRow({ voice, index, isPlaying, isLoading, model, analyser, onPlay }: CastRowProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 18px', borderRadius: 12,
      backgroundColor: '#13132B',
      border: `1px solid ${voice.color}22`,
      animation: `fadeSlideIn 0.3s ease ${index * 0.08}s both`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: `linear-gradient(135deg, ${voice.color}55, ${voice.color}22)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700, color: voice.color, flexShrink: 0,
      }}>
        {voice.name[0]}
      </div>

      <div style={{ flex: '0 0 100px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0' }}>{voice.name}</div>
        <div style={{ fontSize: 11, color: '#94A3B8' }}>{voice.persona}</div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <Waveform isPlaying={isPlaying} color={voice.color} height={36} analyser={isPlaying ? analyser : null} />
      </div>

      <button
        onClick={() => onPlay(voice.id)}
        disabled={isLoading}
        style={{
          width: 40, height: 40, borderRadius: 10,
          backgroundColor: isPlaying ? voice.color : `${voice.color}22`,
          color: isPlaying ? 'white' : voice.color,
          border: 'none', cursor: isLoading ? 'wait' : 'pointer',
          fontSize: isLoading ? 12 : 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s ease', flexShrink: 0,
        }}
      >
        {isLoading ? '…' : isPlaying ? '⏸' : '▶'}
      </button>

      <LatencyBadge model={model} />
    </div>
  );
}
