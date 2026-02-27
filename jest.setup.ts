import '@testing-library/jest-dom';

// Mock AudioContext for tests
class MockAudioContext {
  sampleRate = 24000;
  currentTime = 0;
  destination = {};
  createBuffer = jest.fn().mockReturnValue({
    getChannelData: jest.fn().mockReturnValue(new Float32Array(0)),
    duration: 0,
    numberOfChannels: 1,
    length: 0,
    sampleRate: 24000,
  });
  createBufferSource = jest.fn().mockReturnValue({
    buffer: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    onended: null,
  });
  createAnalyser = jest.fn().mockReturnValue({
    connect: jest.fn(),
    disconnect: jest.fn(),
    getByteFrequencyData: jest.fn(),
    frequencyBinCount: 128,
    fftSize: 256,
  });
  close = jest.fn().mockResolvedValue(undefined);
}

global.AudioContext = MockAudioContext as unknown as typeof AudioContext;
