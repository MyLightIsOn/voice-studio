'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import VoiceCard from './VoiceCard';
import CastRow from './CastRow';
import Waveform from './Waveform';
import LatencyBadge from './LatencyBadge';
import { useTTS } from '@/hooks/useTTS';
import type { Voice, SampleScript, Markup, ModelId } from '@/types';

const VOICES: Voice[] = [
  { id: 'Hades', name: 'Hades', persona: 'Commanding villain', tags: ['deep', 'dramatic', 'male'], color: '#DC2626', accent: 'English', category: 'Character' },
  { id: 'Luna', name: 'Luna', persona: 'Calm meditation guide', tags: ['soft', 'soothing', 'female'], color: '#7C3AED', accent: 'English', category: 'Character' },
  { id: 'Blake', name: 'Blake', persona: 'Warm audiobook narrator', tags: ['rich', 'intimate', 'male'], color: '#D97706', accent: 'English', category: 'Narrator' },
  { id: 'Pixie', name: 'Pixie', persona: 'Playful fairy companion', tags: ['high-pitched', 'energetic', 'female'], color: '#EC4899', accent: 'English', category: 'Character' },
  { id: 'Elizabeth', name: 'Elizabeth', persona: 'Professional narrator', tags: ['polished', 'clear', 'female'], color: '#0891B2', accent: 'English', category: 'Narrator' },
  { id: 'Dennis', name: 'Dennis', persona: 'Friendly conversationalist', tags: ['warm', 'casual', 'male'], color: '#059669', accent: 'English', category: 'Conversational' },
  { id: 'Ashley', name: 'Ashley', persona: 'Upbeat & approachable', tags: ['bright', 'friendly', 'female'], color: '#F59E0B', accent: 'English', category: 'Conversational' },
  { id: 'Dominus', name: 'Dominus', persona: 'Menacing robotic villain', tags: ['dark', 'robotic', 'male'], color: '#6B21A8', accent: 'English', category: 'Character' },
  { id: 'Carter', name: 'Carter', persona: 'Radio announcer energy', tags: ['bold', 'dynamic', 'male'], color: '#B91C1C', accent: 'English', category: 'Narrator' },
  { id: 'Olivia', name: 'Olivia', persona: 'Warm British professional', tags: ['british', 'warm', 'female'], color: '#2563EB', accent: 'British', category: 'Conversational' },
  { id: 'Hana', name: 'Hana', persona: 'Gentle & expressive', tags: ['gentle', 'expressive', 'female'], color: '#DB2777', accent: 'English', category: 'Conversational' },
  { id: 'Mark', name: 'Mark', persona: 'Confident & clear', tags: ['confident', 'neutral', 'male'], color: '#4F46E5', accent: 'English', category: 'Narrator' },
];

const SAMPLE_SCRIPTS: SampleScript[] = [
  { label: 'Game NPC', icon: '🎮', text: "[excited] Welcome, brave adventurer! I've been waiting for someone like you. The dragon in the northern mountains has been terrorizing our village for weeks." },
  { label: 'Meditation', icon: '🧘', text: '[calm] Take a slow, deep breath in... hold it gently... and release. Let the tension in your shoulders melt away like snow in spring.' },
  { label: 'Audiobook', icon: '📖', text: 'The door creaked open, revealing a room bathed in amber light. She hesitated at the threshold, her fingers tracing the cold iron handle.' },
  { label: 'Voice Agent', icon: '🤖', text: "Hi there! I'd be happy to help you with your reservation. I can see you have a booking for two this Saturday at seven PM. Would you like to make any changes?" },
  { label: 'News', icon: '📰', text: 'Breaking developments tonight as the summit concludes with an unprecedented agreement. Sources confirm all parties have signed the accord.' },
  { label: 'Ad Copy', icon: '📢', text: '[happy] Introducing the all-new Horizon Pro. Faster. Smarter. Built for the way you actually work. Available everywhere starting today.' },
];

const MARKUPS: Markup[] = [
  { tag: '[happy]', label: 'Happy', emoji: '😊' },
  { tag: '[sad]', label: 'Sad', emoji: '😢' },
  { tag: '[excited]', label: 'Excited', emoji: '🤩' },
  { tag: '[calm]', label: 'Calm', emoji: '😌' },
  { tag: '[angry]', label: 'Angry', emoji: '😠' },
  { tag: '[whispering]', label: 'Whisper', emoji: '🤫' },
  { tag: '[laughing]', label: 'Laugh', emoji: '😂' },
  { tag: '[sigh]', label: 'Sigh', emoji: '😮‍💨' },
];

export default function VoiceStudio() {
  const [tab, setTab] = useState<'explore' | 'cast' | 'code'>('explore');
  const [selectedVoice, setSelectedVoice] = useState<Voice>(VOICES[0]);
  const [castList, setCastList] = useState<Voice[]>([VOICES[0], VOICES[1], VOICES[3]]);
  const [text, setText] = useState(SAMPLE_SCRIPTS[0].text);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>('max');
  const [temperature, setTemperature] = useState(0.8);
  const [rate, setRate] = useState(1.0);
  const [filterCategory, setFilterCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [copyLabel, setCopyLabel] = useState('📋 Copy');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const playingVoiceIdRef = useRef<string | null>(null);

  const { state: ttsState, isLoading, analyser, play, stop } = useTTS();

  const handlePlay = useCallback(async (voiceId: string) => {
    if (playingVoiceIdRef.current === voiceId && (ttsState === 'playing' || ttsState === 'loading')) {
      stop();
      playingVoiceIdRef.current = null;
      setPlayingVoiceId(null);
      return;
    }
    playingVoiceIdRef.current = voiceId;
    setPlayingVoiceId(voiceId);
    await play({ text, voiceId, model, temperature, speakingRate: rate });
    // Only clear if this specific invocation is still the active one
    if (playingVoiceIdRef.current === voiceId) {
      playingVoiceIdRef.current = null;
      setPlayingVoiceId(null);
    }
  }, [ttsState, text, model, temperature, rate, play, stop]);

  const toggleCast = (voice: Voice) => {
    setCastList(prev =>
      prev.find(v => v.id === voice.id)
        ? prev.filter(v => v.id !== voice.id)
        : prev.length < 5 ? [...prev, voice] : prev
    );
  };

  const insertMarkup = (tag: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const newText = text.slice(0, start) + tag + ' ' + text.slice(start);
    setText(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + tag.length + 1, start + tag.length + 1);
    }, 0);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeSnippet)
      .then(() => {
        setCopyLabel('✓ Copied!');
        setTimeout(() => setCopyLabel('📋 Copy'), 2000);
      })
      .catch(() => {
        setCopyLabel('Copy failed');
        setTimeout(() => setCopyLabel('📋 Copy'), 2000);
      });
  };

  const filteredVoices = VOICES.filter(v => {
    const matchCategory = filterCategory === 'All' || v.category === filterCategory;
    const matchSearch = !searchQuery ||
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.persona.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.tags.some(t => t.includes(searchQuery.toLowerCase()));
    return matchCategory && matchSearch;
  });

  const categories = ['All', ...Array.from(new Set(VOICES.map(v => v.category)))];

  const isVoicePlaying = (voiceId: string) => playingVoiceId === voiceId && ttsState === 'playing';
  const isVoiceLoading = (voiceId: string) => playingVoiceId === voiceId && ttsState === 'loading';
  const mainIsActive = playingVoiceId === selectedVoice.id && (ttsState === 'playing' || ttsState === 'loading');

  const codeSnippet = useMemo(() => `// Inworld TTS — ${selectedVoice.name}
// Docs: https://docs.inworld.ai/docs/quickstart-tts
const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
  method: "POST",
  headers: {
    "Authorization": "Basic YOUR_API_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: ${JSON.stringify(text.slice(0, 80))}${text.length > 80 ? '...' : ''},
    voice_id: "${selectedVoice.id}",
    model_id: "inworld-tts-1.5-${model}",
  }),
});

const { audioContent } = await response.json();
const audioBytes = atob(audioContent);
const byteArray = new Uint8Array(audioBytes.length);
for (let i = 0; i < audioBytes.length; i++) {
  byteArray[i] = audioBytes.charCodeAt(i);
}
const blob = new Blob([byteArray], { type: "audio/wav" });
new Audio(URL.createObjectURL(blob)).play();`, [selectedVoice, text, model]);

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0B0B1E', color: '#E2E8F0',
      fontFamily: "'DM Sans', 'SF Pro Display', -apple-system, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 20px rgba(99,102,241,0.15); } 50% { box-shadow: 0 0 30px rgba(99,102,241,0.3); } }
        textarea:focus, input:focus { outline: none; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333366; border-radius: 3px; }
        ::selection { background: #6366F155; }
      `}</style>

      {/* HEADER */}
      <header style={{
        padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #1E1E3F', backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 50, backgroundColor: '#0B0B1Eee',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: 'white',
          }}>▶</div>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>Voice Studio</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748B', marginRight: 8 }}>Model:</span>
          {(['mini', 'max'] as ModelId[]).map(m => (
            <button key={m} onClick={() => setModel(m)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              backgroundColor: model === m ? '#6366F1' : '#1E1E3F',
              color: model === m ? 'white' : '#94A3B8',
              border: 'none', cursor: 'pointer', textTransform: 'uppercase',
              letterSpacing: '0.04em', transition: 'all 0.2s ease',
            }}>
              TTS-1.5 {m}
            </button>
          ))}
          <LatencyBadge model={model} />
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div style={{ display: 'flex', height: 'calc(100vh - 69px)' }}>

        {/* LEFT PANEL */}
        <div style={{
          width: 420, flexShrink: 0, borderRight: '1px solid #1E1E3F',
          display: 'flex', flexDirection: 'column', backgroundColor: '#0E0E24',
        }}>
          {/* Quick Scripts */}
          <div style={{ padding: '16px 20px 8px', borderBottom: '1px solid #1E1E3F' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Quick Scripts
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SAMPLE_SCRIPTS.map(s => (
                <button key={s.label} onClick={() => setText(s.text)} style={{
                  padding: '5px 12px', borderRadius: 8, fontSize: 12,
                  backgroundColor: text === s.text ? '#6366F122' : '#13132B',
                  color: text === s.text ? '#818CF8' : '#94A3B8',
                  border: text === s.text ? '1px solid #6366F144' : '1px solid transparent',
                  cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s ease',
                }}>
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column' }}>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Type or paste text to synthesize..."
              style={{
                flex: 1, width: '100%', resize: 'none',
                backgroundColor: '#13132B', color: '#E2E8F0',
                border: '1px solid #2A2A4A', borderRadius: 12,
                padding: 16, fontSize: 14, lineHeight: 1.7,
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: '#64748B' }}>{text.length} chars</span>
              <span style={{ fontSize: 11, color: '#64748B' }}>
                ≈ ${(text.length / 1000 * (model === 'max' ? 0.01 : 0.005)).toFixed(4)}
              </span>
            </div>
          </div>

          {/* Markups */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid #1E1E3F' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Audio Markups
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {MARKUPS.map(m => (
                <button key={m.tag} onClick={() => insertMarkup(m.tag)} style={{
                  padding: '4px 10px', borderRadius: 7, fontSize: 12,
                  backgroundColor: '#1E1E3F', color: '#C4B5FD',
                  border: 'none', cursor: 'pointer', fontWeight: 500,
                }}>
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #1E1E3F' }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>Temperature</span>
                <span style={{ fontSize: 12, color: '#818CF8', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{temperature.toFixed(1)}</span>
              </div>
              <input type="range" min="0" max="1.5" step="0.1" value={temperature}
                onChange={e => setTemperature(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#6366F1' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 2 }}>
                <span>Consistent</span><span>Expressive</span>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>Speaking Rate</span>
                <span style={{ fontSize: 12, color: '#818CF8', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{rate.toFixed(1)}x</span>
              </div>
              <input type="range" min="0.5" max="2.0" step="0.1" value={rate}
                onChange={e => setRate(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#6366F1' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 2 }}>
                <span>Slow</span><span>Fast</span>
              </div>
            </div>
          </div>

          {/* Play Button */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #1E1E3F' }}>
            {ttsState === 'error' && (
              <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8, textAlign: 'center' }}>
                Synthesis failed. Check the console.
              </div>
            )}
            <button
              onClick={() => handlePlay(selectedVoice.id)}
              disabled={isLoading && playingVoiceId !== selectedVoice.id}
              aria-label={isVoiceLoading(selectedVoice.id) ? `Generating audio for ${selectedVoice.name}` : isVoicePlaying(selectedVoice.id) ? `Stop ${selectedVoice.name}` : `Synthesize with ${selectedVoice.name}`}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12,
                background: mainIsActive
                  ? `linear-gradient(135deg, ${selectedVoice.color}, ${selectedVoice.color}CC)`
                  : 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                color: 'white', border: 'none',
                cursor: (isLoading && playingVoiceId !== selectedVoice.id) ? 'not-allowed' : 'pointer',
                fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
                transition: 'all 0.2s ease',
                animation: isVoicePlaying(selectedVoice.id) ? 'pulseGlow 2s infinite' : 'none',
                opacity: (isLoading && playingVoiceId !== selectedVoice.id) ? 0.5 : 1,
              }}
            >
              {isVoiceLoading(selectedVoice.id) ? `⏳ Generating ${selectedVoice.name}...` :
               isVoicePlaying(selectedVoice.id) ? `⏸ Playing ${selectedVoice.name}...` :
               `▶ Synthesize with ${selectedVoice.name}`}
            </button>
          </div>
        </div>

        {/* RIGHT: Tabs */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Tab Bar */}
          <div style={{ display: 'flex', padding: '0 24px', borderBottom: '1px solid #1E1E3F' }}>
            {[
              { id: 'explore' as const, label: 'Explore Voices', icon: '🎤' },
              { id: 'cast' as const, label: `Voice Casting${castList.length ? ` (${castList.length})` : ''}`, icon: '🎭' },
              { id: 'code' as const, label: 'API Code', icon: '⌨️' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '14px 20px', fontSize: 13, fontWeight: 600,
                color: tab === t.id ? '#E2E8F0' : '#64748B',
                backgroundColor: 'transparent', border: 'none',
                borderBottom: tab === t.id ? '2px solid #6366F1' : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.15s ease', letterSpacing: '-0.01em',
              }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* EXPLORE TAB */}
          {tab === 'explore' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search voices..."
                  style={{
                    padding: '8px 14px', borderRadius: 10, fontSize: 13,
                    backgroundColor: '#13132B', color: '#E2E8F0',
                    border: '1px solid #2A2A4A', width: 200, fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  {categories.map(c => (
                    <button key={c} onClick={() => setFilterCategory(c)} style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12,
                      backgroundColor: filterCategory === c ? '#6366F1' : '#1E1E3F',
                      color: filterCategory === c ? 'white' : '#94A3B8',
                      border: 'none', cursor: 'pointer', fontWeight: 500,
                    }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {filteredVoices.map(voice => (
                  <VoiceCard key={voice.id} voice={voice}
                    isSelected={selectedVoice.id === voice.id}
                    isInCast={castList.some(v => v.id === voice.id)}
                    onSelect={setSelectedVoice}
                    onToggleCast={toggleCast}
                  />
                ))}
              </div>

              {filteredVoices.length === 0 && (
                <div style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                  No voices match your search.
                </div>
              )}
            </div>
          )}

          {/* CAST TAB */}
          {tab === 'cast' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.02em' }}>
                  🎭 Voice Casting Director
                </h3>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, lineHeight: 1.6 }}>
                  Compare up to 5 voices reading the same script. Click play on each to hear the differences.
                </p>
              </div>

              {castList.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', color: '#64748B', borderRadius: 16, border: '2px dashed #2A2A4A' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎤</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>No voices in your cast yet</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Go to Explore and click &quot;+ Cast&quot; on voices to compare them</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ padding: '14px 18px', borderRadius: 12, backgroundColor: '#1E1E3F', marginBottom: 8, fontSize: 13, color: '#C4B5FD', lineHeight: 1.6, fontStyle: 'italic' }}>
                    &ldquo;{text.slice(0, 160)}{text.length > 160 ? '...' : ''}&rdquo;
                  </div>

                  {castList.map((voice, i) => (
                    <CastRow key={voice.id} voice={voice} index={i} model={model}
                      isPlaying={isVoicePlaying(voice.id)}
                      isLoading={isVoiceLoading(voice.id)}
                      analyser={playingVoiceId === voice.id ? analyser : null}
                      onPlay={handlePlay}
                    />
                  ))}

                  <div style={{ marginTop: 16, padding: '16px 20px', borderRadius: 12, background: 'linear-gradient(135deg, #6366F108, #8B5CF608)', border: '1px solid #6366F122' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#818CF8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      💡 Casting Tip
                    </div>
                    <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
                      Try adjusting the <strong style={{ color: '#C4B5FD' }}>temperature</strong> slider — lower values give consistent reads (great for agents), while higher values add dramatic flair (perfect for game characters).
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CODE TAB */}
          {tab === 'code' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.02em' }}>
                  ⌨️ Ready-to-Use Code
                </h3>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, lineHeight: 1.6 }}>
                  Copy this snippet to integrate <strong style={{ color: '#C4B5FD' }}>{selectedVoice.name}</strong> into your app.
                </p>
              </div>

              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #2A2A4A' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', backgroundColor: '#13132B', borderBottom: '1px solid #2A2A4A' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['#EF4444', '#F59E0B', '#22C55E'].map(c => (
                      <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: c }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: '#64748B', fontFamily: "'JetBrains Mono', monospace" }}>synthesize.js</span>
                  <button onClick={handleCopyCode} style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 11,
                    backgroundColor: '#6366F122', color: '#818CF8',
                    border: 'none', cursor: 'pointer', fontWeight: 600,
                    transition: 'all 0.2s ease',
                  }}>
                    {copyLabel}
                  </button>
                </div>
                <pre style={{ padding: 20, margin: 0, overflow: 'auto', backgroundColor: '#0B0B1E', fontSize: 13, lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace", color: '#C4B5FD' }}>
                  <code>{codeSnippet}</code>
                </pre>
              </div>

              <div style={{ marginTop: 20, padding: '16px 20px', borderRadius: 12, backgroundColor: '#13132B', border: '1px solid #2A2A4A' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  Current Configuration
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Voice', value: selectedVoice.name },
                    { label: 'Model', value: `TTS-1.5 ${model.charAt(0).toUpperCase() + model.slice(1)}` },
                    { label: 'Temperature', value: temperature.toFixed(1) },
                    { label: 'Rate', value: `${rate.toFixed(1)}x` },
                    { label: 'Est. Latency', value: model === 'max' ? '~200ms' : '~100ms' },
                    { label: 'Est. Cost', value: `$${(text.length / 1000 * (model === 'max' ? 0.01 : 0.005)).toFixed(4)}` },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, backgroundColor: '#1E1E3F' }}>
                      <span style={{ fontSize: 12, color: '#94A3B8' }}>{item.label}</span>
                      <span style={{ fontSize: 12, color: '#E2E8F0', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
