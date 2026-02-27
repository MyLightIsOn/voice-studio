'use client';

import { useState } from 'react';
import type { Voice } from '@/types';

interface VoiceCardProps {
  voice: Voice;
  isSelected: boolean;
  isInCast: boolean;
  onSelect: (voice: Voice) => void;
  onToggleCast: (voice: Voice) => void;
}

export default function VoiceCard({ voice, isSelected, isInCast, onSelect, onToggleCast }: VoiceCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(voice)}
      style={{
        position: 'relative', padding: '16px 18px', borderRadius: 14,
        cursor: 'pointer',
        border: isSelected ? `2px solid ${voice.color}` : '2px solid transparent',
        backgroundColor: isSelected ? `${voice.color}0D` : hovered ? '#1A1A2E' : '#13132B',
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      {isInCast && (
        <div style={{
          position: 'absolute', top: -6, right: -6, width: 22, height: 22,
          borderRadius: '50%', backgroundColor: voice.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: 'white', fontWeight: 700,
          boxShadow: `0 2px 8px ${voice.color}66`,
        }}>✓</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `linear-gradient(135deg, ${voice.color}44, ${voice.color}22)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 700, color: voice.color,
          border: `1px solid ${voice.color}33`,
        }}>
          {voice.name[0]}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#E2E8F0', letterSpacing: '-0.01em' }}>
            {voice.name}
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>{voice.persona}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {voice.tags.map(tag => (
          <span key={tag} style={{
            padding: '2px 8px', borderRadius: 6, fontSize: 10,
            backgroundColor: '#1E1E3F', color: '#818CF8',
            fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{tag}</span>
        ))}
      </div>

      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onToggleCast(voice); }}
          style={{
            position: 'absolute', bottom: 10, right: 12,
            padding: '4px 10px', borderRadius: 8, fontSize: 11,
            backgroundColor: isInCast ? '#EF444433' : `${voice.color}33`,
            color: isInCast ? '#EF4444' : voice.color,
            border: 'none', cursor: 'pointer', fontWeight: 600,
          }}
        >
          {isInCast ? 'Remove' : '+ Cast'}
        </button>
      )}
    </div>
  );
}
