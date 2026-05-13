(() => {
  const player = document.getElementById('soundcloud-player');
  if (!player) return;
  if (player.dataset.soundcloudInitialized === 'true') return;
  player.dataset.soundcloudInitialized = 'true';

  const configuredApiBase = player.dataset.apiBase?.replace(/\/$/, '');
  const localApiBase = 'http://127.0.0.1:8787/api/soundcloud';
  const isLocalSite = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const apiBase = isLocalSite && window.location.port !== '8787' ? localApiBase : configuredApiBase;
  const userId = player.dataset.userId;
  const audio = document.getElementById('soundcloud-audio');
  const artwork = document.getElementById('soundcloud-artwork');
  const artworkFallback = document.getElementById('soundcloud-art-fallback');
  const title = document.getElementById('soundcloud-title');
  const artist = document.getElementById('soundcloud-artist');
  const openLink = document.getElementById('soundcloud-open');
  const playButton = document.getElementById('soundcloud-play');
  const shuffleButton = document.getElementById('soundcloud-shuffle');
  const prevButton = document.getElementById('soundcloud-prev');
  const nextButton = document.getElementById('soundcloud-next');
  const repeatButton = document.getElementById('soundcloud-repeat');
  const progress = document.getElementById('soundcloud-progress');
  const elapsed = document.getElementById('soundcloud-elapsed');
  const duration = document.getElementById('soundcloud-duration');
  const trackList = document.getElementById('soundcloud-tracks');
  const spectrum = document.getElementById('soundcloud-spectrum');
  const spectrumContext = spectrum?.getContext('2d');
  const spectrumBuffer = document.createElement('canvas');
  const spectrumBufferContext = spectrumBuffer.getContext('2d');

  const spectrumSettings = {
    fftSize: 2048,
    minIntensity: 0.025,
    smoothingTimeConstant: 0,
    scrollPixelsPerSecond: 120,
    visibleBinRatio: 0.7,
  };

  const spectrumColors = {
    light: [
      [0.86, '118, 50, 0', 1],
      [0.66, '163, 76, 0', 1],
      [0.48, '190, 118, 34', 1],
      [0.24, '211, 161, 83', 1],
      [0, '238, 214, 169', 0.72],
    ],
    dark: [
      [0.86, '255, 214, 44', 1],
      [0.66, '255, 124, 0', 1],
      [0.48, '218, 28, 217', 1],
      [0.24, '138, 30, 255', 1],
      [0, '95, 18, 204', 0.64],
    ],
  };

  audio.crossOrigin = 'anonymous';

  let tracks = [];
  let activeIndex = 0;
  let hls = null;
  let loadedTrackId = null;
  let loadRequestId = 0;
  let seeking = false;
  let shuffleEnabled = false;
  let repeatMode = 'all';
  const visualizer = {
    analyser: null,
    audioContext: null,
    audioSource: null,
    data: null,
    frame: null,
    lastFrameTime: null,
    scrollRemainder: 0,
  };

  const logStatus = (message) => {
    console.info(`[SoundCloud] ${message}`);
  };

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${rest}`;
  };

  const formatDuration = (milliseconds) => formatTime(milliseconds / 1000);

  const formatDateParts = (year, month, day) => {
    if (!year) return '';

    const date = new Date(Date.UTC(year, month ? month - 1 : 0, day || 1));
    if (!Number.isFinite(date.getTime())) return String(year);

    if (month && day) {
      return date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
      });
    }

    if (month) {
      return date.toLocaleDateString(undefined, {
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
      });
    }

    return String(year);
  };

  const formatDateString = (value) => {
    const parts = String(value || '').match(/^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?/);
    if (!parts) return '';

    return formatDateParts(Number(parts[1]), Number(parts[2] || 0), Number(parts[3] || 0));
  };

  const formatTrackDate = (track) => {
    const releaseYear = Number(track.release_year || track.releaseYear || 0);
    const releaseMonth = Number(track.release_month || track.releaseMonth || 0);
    const releaseDay = Number(track.release_day || track.releaseDay || 0);
    const releaseDate = formatDateParts(releaseYear, releaseMonth, releaseDay);

    if (releaseDate) return releaseDate;

    return formatDateString(track.release || track.releaseDate) || formatDateString(track.created_at || track.createdAt);
  };

  const upgradeArtwork = (url) => {
    if (!url) return '';
    return url.replace(/-(large|t\d+x\d+|crop)\./, '-t500x500.');
  };

  const resizeSpectrum = () => {
    if (!spectrum || !spectrumContext || !spectrumBufferContext) return null;

    const dpr = window.devicePixelRatio || 1;
    const rect = spectrum.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (spectrum.width !== width || spectrum.height !== height) {
      spectrum.width = width;
      spectrum.height = height;
      spectrumBuffer.width = width;
      spectrumBuffer.height = height;
    }

    spectrumContext.setTransform(1, 0, 0, 1, 0, 0);
    return { height, width };
  };

  const getSpectrumPalette = () => (
    document.documentElement.classList.contains('light') ? spectrumColors.light : spectrumColors.dark
  );

  const getSpectrumColor = (palette, value, alpha) => {
    for (const [threshold, color, alphaScale] of palette) {
      if (value > threshold) return `rgba(${color}, ${alpha * alphaScale})`;
    }
    return `rgba(${palette[palette.length - 1][1]}, ${alpha})`;
  };

  const clearSpectrum = () => {
    const rect = resizeSpectrum();
    if (!rect || !spectrumContext) return;

    spectrumContext.clearRect(0, 0, rect.width, rect.height);
    visualizer.lastFrameTime = null;
    visualizer.scrollRemainder = 0;
  };

  const initAudioAnalyzer = () => {
    if (!spectrumContext) return false;
    if (visualizer.analyser) return true;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;

    try {
      visualizer.audioContext = visualizer.audioContext || new AudioContext();
      visualizer.audioSource = visualizer.audioSource || visualizer.audioContext.createMediaElementSource(audio);
      visualizer.analyser = visualizer.audioContext.createAnalyser();
      visualizer.analyser.fftSize = spectrumSettings.fftSize;
      visualizer.analyser.smoothingTimeConstant = spectrumSettings.smoothingTimeConstant;
      visualizer.data = new Uint8Array(visualizer.analyser.frequencyBinCount);
      visualizer.audioSource.connect(visualizer.analyser);
      visualizer.analyser.connect(visualizer.audioContext.destination);
      return true;
    } catch (error) {
      console.warn('[SoundCloud] Audio analyzer is unavailable.', error);
      visualizer.analyser = null;
      visualizer.data = null;
      return false;
    }
  };

  const resumeAudioAnalyzer = async () => {
    if (!initAudioAnalyzer()) return;
    if (visualizer.audioContext?.state === 'suspended') await visualizer.audioContext.resume();
  };

  const drawLiveSpectrum = (timestamp) => {
    const { analyser, data } = visualizer;
    if (!analyser || !data) {
      clearSpectrum();
      return;
    }

    const rect = resizeSpectrum();
    if (!rect || !spectrumContext) return;

    const width = rect.width;
    const height = rect.height;
    const frameSeconds = Math.min(0.25, Math.max(0, timestamp - visualizer.lastFrameTime) / 1000);
    visualizer.scrollRemainder += frameSeconds * spectrumSettings.scrollPixelsPerSecond * (window.devicePixelRatio || 1);
    const columnWidth = Math.min(width, Math.floor(visualizer.scrollRemainder));
    visualizer.scrollRemainder -= columnWidth;
    visualizer.lastFrameTime = timestamp;
    const scrollWidth = width - columnWidth;
    const { minIntensity, visibleBinRatio } = spectrumSettings;

    if (!columnWidth) {
      visualizer.frame = requestAnimationFrame(drawLiveSpectrum);
      return;
    }

    analyser.getByteFrequencyData(data);

    spectrumBufferContext.drawImage(spectrum, 0, 0, width, height);
    spectrumContext.clearRect(0, 0, width, height);

    if (scrollWidth > 0) {
      spectrumContext.drawImage(
        spectrumBuffer,
        columnWidth,
        0,
        scrollWidth,
        height,
        0,
        0,
        scrollWidth,
        height,
      );
    }

    const palette = getSpectrumPalette();
    const maxBin = Math.max(1, Math.floor(data.length * visibleBinRatio));
    const bucketHeight = Math.max(1, Math.ceil(height / maxBin));

    for (let index = 0; index < maxBin; index += 1) {
      const sourceIndex = maxBin - 1 - index;
      const raw = data[sourceIndex] / 255;
      if (!raw) continue;

      const intensity = raw ** 0.58;
      if (intensity < minIntensity) continue;

      const y = Math.floor((index / maxBin) * height);
      spectrumContext.fillStyle = getSpectrumColor(palette, intensity, Math.min(1, 0.34 + intensity * 0.9));
      spectrumContext.fillRect(width - columnWidth, y, columnWidth, bucketHeight + 1);
    }

    visualizer.frame = requestAnimationFrame(drawLiveSpectrum);
  };

  const startSpectrum = () => {
    if (visualizer.frame) return;
    visualizer.lastFrameTime = performance.now();
    visualizer.frame = requestAnimationFrame(drawLiveSpectrum);
  };

  const stopSpectrum = () => {
    if (visualizer.frame) {
      cancelAnimationFrame(visualizer.frame);
      visualizer.frame = null;
    }
    visualizer.lastFrameTime = null;
    visualizer.scrollRemainder = 0;
  };

  const normalizeTracks = (payload) => {
    const collection = Array.isArray(payload) ? payload : payload.tracks || payload.collection || [];
    return collection
      .filter((track) => track && track.id)
      .map((track) => ({
        id: track.id,
        title: track.title || 'Untitled',
        dateLabel: formatTrackDate(track),
        duration: Number(track.duration) || 0,
        artworkUrl: upgradeArtwork(track.artwork_url || track.artworkUrl || track.user?.avatar_url),
        permalinkUrl: track.permalink_url || track.permalinkUrl || '',
        userUrl: track.user?.permalink_url || track.userUrl || '',
      }));
  };

  const renderTrackList = () => {
    trackList.replaceChildren();
    tracks.forEach((track, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'soundcloud-track';
      button.dataset.index = String(index);
      button.setAttribute('aria-current', index === activeIndex ? 'true' : 'false');
      button.classList.toggle('is-active', index === activeIndex);
      button.innerHTML = `
        <span class="soundcloud-track-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="soundcloud-track-title"></span>
        <span class="soundcloud-track-duration">${formatDuration(track.duration)}</span>
      `;
      button.querySelector('.soundcloud-track-title').textContent = track.title;
      button.addEventListener('click', () => selectTrack(index, true));
      trackList.append(button);
    });
  };

  const renderActiveTrack = () => {
    const track = tracks[activeIndex];
    if (!track) return;

    title.textContent = track.title;
    artist.textContent = track.dateLabel || '';
    duration.textContent = formatDuration(track.duration);
    openLink.href = track.permalinkUrl || track.userUrl || 'https://soundcloud.com/';

    if (track.artworkUrl) {
      artwork.src = track.artworkUrl;
      artwork.classList.remove('hidden');
      artworkFallback.classList.add('hidden');
    } else {
      artwork.removeAttribute('src');
      artwork.classList.add('hidden');
      artworkFallback.classList.remove('hidden');
    }

    [...trackList.children].forEach((item, index) => {
      item.classList.toggle('is-active', index === activeIndex);
      item.setAttribute('aria-current', index === activeIndex ? 'true' : 'false');
    });
  };

  const updatePlaybackModeControls = () => {
    shuffleButton.classList.toggle('is-active', shuffleEnabled);
    shuffleButton.setAttribute('aria-pressed', String(shuffleEnabled));
    shuffleButton.setAttribute('aria-label', shuffleEnabled ? 'Shuffle on' : 'Shuffle off');

    repeatButton.classList.toggle('is-active', repeatMode !== 'off');
    repeatButton.setAttribute('aria-pressed', String(repeatMode !== 'off'));
    player.classList.toggle('repeat-one', repeatMode === 'one');

    const repeatLabels = {
      off: 'Repeat off',
      all: 'Repeat all',
      one: 'Repeat current track',
    };
    repeatButton.setAttribute('aria-label', repeatLabels[repeatMode]);
    repeatButton.title = repeatLabels[repeatMode];
  };

  const destroyHls = () => {
    if (hls) {
      hls.destroy();
      hls = null;
    }
  };

  const resolveStream = async (trackId) => {
    const response = await fetch(`${apiBase}/tracks/${trackId}/stream`, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Stream request failed with ${response.status}`);
    }

    const stream = await response.json();
    if (!stream.url) throw new Error('Stream response did not include a URL');
    return stream;
  };

  const playLoadedAudio = async () => {
    try {
      await resumeAudioAnalyzer();
      await audio.play();
    } catch (error) {
      console.warn('[SoundCloud] Playback was blocked by the browser.', error);
    }
  };

  const loadTrack = async (track, shouldPlay) => {
    if (loadedTrackId === track.id) {
      if (shouldPlay) await playLoadedAudio();
      return;
    }

    logStatus(`Loading stream for "${track.title}"`);
    const requestId = ++loadRequestId;
    destroyHls();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    clearSpectrum();

    const stream = await resolveStream(track.id);
    if (requestId !== loadRequestId) return;
    loadedTrackId = track.id;

    if (stream.protocol === 'hls' && window.Hls?.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(stream.url);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (requestId !== loadRequestId) return;
        if (shouldPlay) playLoadedAudio();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (requestId !== loadRequestId || !data.fatal) return;
        console.warn('[SoundCloud] Could not play this stream.', data);
      });
      return;
    }

    audio.src = stream.url;
    if (shouldPlay) await playLoadedAudio();
  };

  const selectTrack = async (index, shouldPlay) => {
    if (!tracks[index]) return;
    const selectedTrack = tracks[index];
    activeIndex = index;
    renderActiveTrack();
    progress.value = '0';
    elapsed.textContent = '0:00';

    try {
      await loadTrack(selectedTrack, shouldPlay);
    } catch (error) {
      console.warn('[SoundCloud] Could not load this track.', error);
    }
  };

  const getShuffledIndex = () => {
    if (tracks.length < 2) return activeIndex;
    let nextIndex = activeIndex;
    while (nextIndex === activeIndex) {
      nextIndex = Math.floor(Math.random() * tracks.length);
    }
    return nextIndex;
  };

  const getNextIndex = () => {
    if (shuffleEnabled) return getShuffledIndex();
    if (activeIndex < tracks.length - 1) return activeIndex + 1;
    return repeatMode === 'all' ? 0 : null;
  };

  const playNext = () => {
    if (!tracks.length) return;
    const nextIndex = getNextIndex();
    if (nextIndex === null) {
      audio.pause();
      audio.currentTime = 0;
      return;
    }
    selectTrack(nextIndex, true);
  };

  const playPrevious = () => {
    if (!tracks.length) return;
    selectTrack((activeIndex - 1 + tracks.length) % tracks.length, true);
  };

  const handleEnded = () => {
    if (repeatMode === 'one') {
      audio.currentTime = 0;
      playLoadedAudio();
      return;
    }

    playNext();
  };

  const togglePlayback = async () => {
    const track = tracks[activeIndex];
    if (!track) return;

    if (audio.paused) {
      try {
        await loadTrack(track, true);
      } catch (error) {
        console.warn('[SoundCloud] Could not start playback.', error);
      }
    } else {
      audio.pause();
    }
  };

  const loadTracks = async () => {
    if (!apiBase || !userId) {
      console.warn('[SoundCloud] API is not configured.');
      return;
    }

    const url = new URL(`${apiBase}/tracks`, window.location.origin);
    url.searchParams.set('user_id', userId);

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Track request failed with ${response.status}`);

    tracks = normalizeTracks(await response.json());
    if (!tracks.length) {
      title.textContent = 'No tracks found';
      artist.textContent = '';
      return;
    }

    renderTrackList();
    renderActiveTrack();
  };

  shuffleButton.addEventListener('click', () => {
    shuffleEnabled = !shuffleEnabled;
    updatePlaybackModeControls();
  });
  playButton.addEventListener('click', togglePlayback);
  prevButton.addEventListener('click', playPrevious);
  nextButton.addEventListener('click', playNext);
  repeatButton.addEventListener('click', () => {
    repeatMode = repeatMode === 'all' ? 'one' : repeatMode === 'one' ? 'off' : 'all';
    updatePlaybackModeControls();
  });

  audio.addEventListener('play', () => {
    player.classList.add('is-playing');
    playButton.setAttribute('aria-label', 'Pause');
    startSpectrum();
  });

  audio.addEventListener('pause', () => {
    player.classList.remove('is-playing');
    playButton.setAttribute('aria-label', 'Play');
    stopSpectrum();
  });

  audio.addEventListener('ended', handleEnded);

  audio.addEventListener('timeupdate', () => {
    if (seeking || !audio.duration) return;
    progress.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
    elapsed.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener('durationchange', () => {
    if (audio.duration) duration.textContent = formatTime(audio.duration);
  });

  progress.addEventListener('input', () => {
    seeking = true;
    const nextTime = (Number(progress.value) / 1000) * (audio.duration || 0);
    elapsed.textContent = formatTime(nextTime);
  });

  progress.addEventListener('change', () => {
    const nextTime = (Number(progress.value) / 1000) * (audio.duration || 0);
    if (Number.isFinite(nextTime)) audio.currentTime = nextTime;
    seeking = false;
  });

  updatePlaybackModeControls();
  clearSpectrum();

  loadTracks().catch(() => {
    title.textContent = 'SoundCloud unavailable';
    artist.textContent = '';
    console.warn('[SoundCloud] Could not load tracks from the SoundCloud API.');
  });
})();
