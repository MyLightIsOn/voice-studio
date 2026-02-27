export interface Voice {
  id: string;
  name: string;
  persona: string;
  tags: string[];
  color: string;
  accent: string;
  category: 'Character' | 'Narrator' | 'Conversational';
}

export interface SampleScript {
  label: string;
  icon: string;
  text: string;
}

export interface Markup {
  tag: string;
  label: string;
  emoji: string;
}

export type ModelId = 'mini' | 'max';

export interface TTSRequest {
  text: string;
  voiceId: string;
  model: ModelId;
  temperature: number;
  speakingRate: number;
}

export type PlayState = 'idle' | 'loading' | 'playing' | 'error';
