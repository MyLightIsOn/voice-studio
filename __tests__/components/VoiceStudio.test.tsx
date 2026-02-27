import { render, screen, fireEvent } from '@testing-library/react';
import VoiceStudio from '@/components/VoiceStudio';

// Mock useTTS
jest.mock('@/hooks/useTTS', () => ({
  useTTS: () => ({
    state: 'idle',
    isPlaying: false,
    isLoading: false,
    analyser: null,
    play: jest.fn(),
    stop: jest.fn(),
  }),
}));

describe('VoiceStudio', () => {
  it('renders header with Voice Studio title', () => {
    render(<VoiceStudio />);
    expect(screen.getByText('Voice Studio')).toBeInTheDocument();
  });

  it('renders all three tabs', () => {
    render(<VoiceStudio />);
    expect(screen.getByText(/Explore Voices/)).toBeInTheDocument();
    expect(screen.getByText(/Voice Casting/)).toBeInTheDocument();
    expect(screen.getByText(/API Code/)).toBeInTheDocument();
  });

  it('shows voice cards in Explore tab', () => {
    render(<VoiceStudio />);
    expect(screen.getByText('Hades')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.getByText('Ashley')).toBeInTheDocument();
  });

  it('synthesize button shows correct voice name', () => {
    render(<VoiceStudio />);
    expect(screen.getByText(/Synthesize with/)).toBeInTheDocument();
  });

  it('switches to Cast tab on click', () => {
    render(<VoiceStudio />);
    fireEvent.click(screen.getByText(/Voice Casting/));
    expect(screen.getByText(/Voice Casting Director/)).toBeInTheDocument();
  });

  it('switches to Code tab on click', () => {
    render(<VoiceStudio />);
    fireEvent.click(screen.getByText(/API Code/));
    expect(screen.getByText(/Ready-to-Use Code/)).toBeInTheDocument();
  });
});
