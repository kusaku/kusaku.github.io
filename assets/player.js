(() => {
  const player = document.getElementById('soundcloud-player');
  if (!player) return;
  if (player.dataset.soundcloudInitialized === 'true') return;
  player.dataset.soundcloudInitialized = 'true';

  const apiBase = player.dataset.apiBase;
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
  const spectrumContext = spectrum.getContext('2d');
  const spectrumBuffer = document.createElement('canvas');
  const spectrumBufferContext = spectrumBuffer.getContext('2d');
  const storageKey = 'kusaku.soundcloud.player.v1';

  const spectrumSettings = {
    fftSize: 2048,
    minIntensity: 0.025,
    smoothingTimeConstant: 0,
    scrollPixelsPerSecond: 120,
    visibleBinRatio: 0.666,
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
  let restoringState = false;
  let stateSaveTimer = null;
  const visualizer = {
    analyser: null,
    audioContext: null,
    audioSource: null,
    data: null,
    frame: null,
    lastFrameTime: null,
    scrollRemainder: 0,
  };

  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${rest}`;
  };

  const formatDuration = (milliseconds) => formatTime(milliseconds / 1000);

  const readSavedState = () => {
    if (player.dataset.skipState === 'true') return null;

    try {
      const state = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return state && typeof state === 'object' ? state : null;
    } catch (_error) {
      return null;
    }
  };

  const writeSavedState = () => {
    if (player.dataset.skipState === 'true' || restoringState || !tracks.length) return;

    const track = tracks[activeIndex];
    if (!track) return;
    const currentTime = String(loadedTrackId) === String(track.id) && Number.isFinite(audio.currentTime)
      ? audio.currentTime
      : 0;

    const state = {
      isPlaying: !audio.paused && !audio.ended,
      positionSeconds: currentTime,
      repeatMode,
      shuffleEnabled,
      trackId: track.id,
      updatedAt: Date.now(),
    };

    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (_error) {
      // Browsers may reject storage in private contexts; playback should still work.
    }
  };

  const scheduleStateSave = () => {
    if (stateSaveTimer) return;
    stateSaveTimer = window.setTimeout(() => {
      stateSaveTimer = null;
      writeSavedState();
    }, 750);
  };

  const formatTrackDate = (createdAt) => {
    const parts = String(createdAt).match(/^(\d{4})\/(\d{2})\/(\d{2})/);
    if (!parts) return '';

    const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      year: 'numeric',
    });
  };

  const upgradeArtwork = (url) => (url ? url.replace('-large.jpg', '-t500x500.jpg') : '');

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
    if (!visualizer.analyser) return;
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
    return payload.tracks
      .filter((track) => track && track.id)
      .map(({ artwork_url, created_at, duration, id, permalink_url, title }) => ({
        id,
        title,
        dateLabel: formatTrackDate(created_at),
        duration: Number(duration),
        artworkUrl: upgradeArtwork(artwork_url),
        permalinkUrl: permalink_url,
      }));
  };

  const formatTrackTooltip = (track) => {
    return `"${track.title}" by kusaku${track.dateLabel ? `\nreleased on ${track.dateLabel}` : ''}`;
  };

  const selectTrackById = (id, shouldPlay) => {
    if (!id) return;

    const requestedIndex = tracks.findIndex((track) => String(track.id) === String(id));
    if (requestedIndex < 0) return;
    selectTrack(requestedIndex, shouldPlay);
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
        <span class="soundcloud-track-index">${String(tracks.length - index).padStart(2, '0')}</span>
        <span class="soundcloud-track-title"></span>
        <span class="soundcloud-track-duration">${formatDuration(track.duration)}</span>
      `;
      button.querySelector('.soundcloud-track-title').textContent = track.title;
      button.addEventListener('click', () => selectTrack(index, true));
      trackList.append(button);
    });
  };

  const showArtworkFallback = () => {
    artwork.removeAttribute('src');
    artwork.hidden = true;
    artworkFallback.removeAttribute('hidden');
  };

  const showArtwork = (artworkUrl) => {
    if (!artworkUrl) {
      showArtworkFallback();
      return;
    }

    artworkFallback.setAttribute('hidden', '');
    artwork.hidden = true;
    artwork.src = artworkUrl;
    if (artwork.complete && artwork.naturalWidth) {
      artwork.hidden = false;
    }
  };

  const renderActiveTrack = () => {
    const track = tracks[activeIndex];
    if (!track) return;

    const trackTooltip = formatTrackTooltip(track);
    title.textContent = track.title;
    title.title = trackTooltip;
    artist.textContent = track.dateLabel || '';
    artist.title = trackTooltip;
    duration.textContent = formatDuration(track.duration);
    openLink.href = track.permalinkUrl;

    showArtwork(track.artworkUrl);

    [...trackList.children].forEach((item, index) => {
      item.classList.toggle('is-active', index === activeIndex);
      item.setAttribute('aria-current', index === activeIndex ? 'true' : 'false');
    });
    updateMiniControls();
  };

  const getMiniElements = () => {
    const widget = document.getElementById('soundcloud-widget');
    if (!widget) return null;

    return {
      artist: document.getElementById('soundcloud-mini-artist'),
      artLink: document.getElementById('soundcloud-mini-open'),
      artwork: document.getElementById('soundcloud-mini-artwork'),
      next: document.getElementById('soundcloud-mini-next'),
      minimize: document.getElementById('soundcloud-widget-minimize'),
      panel: document.getElementById('soundcloud-widget-panel'),
      panelToggle: document.getElementById('soundcloud-mini-panel-toggle'),
      play: document.getElementById('soundcloud-mini-play'),
      previous: document.getElementById('soundcloud-mini-prev'),
      title: document.getElementById('soundcloud-mini-title'),
      widget,
    };
  };

  const updateMiniControls = () => {
    const mini = getMiniElements();
    if (!mini) return;

    const track = tracks[activeIndex];
    mini.widget.classList.toggle('is-playing', !audio.paused);

    const label = audio.paused ? 'Play' : 'Pause';
    mini.play.setAttribute('aria-label', label);
    mini.play.title = label;

    const tooltip = track ? formatTrackTooltip(track) : title.title;
    mini.title.textContent = track ? track.title : title.textContent;
    mini.title.title = tooltip;
    mini.artist.textContent = track ? track.dateLabel : artist.textContent;
    mini.artist.title = tooltip;
    mini.artLink.href = track ? track.permalinkUrl : openLink.href;

    if (track?.artworkUrl) {
      mini.artwork.src = track.artworkUrl;
      mini.artwork.hidden = false;
    } else {
      mini.artwork.removeAttribute('src');
      mini.artwork.hidden = true;
    }
  };

  const setWidgetOpen = (isOpen) => {
    const mini = getMiniElements();
    if (!mini) return;

    mini.panel.hidden = !isOpen;
    mini.widget.classList.toggle('is-open', isOpen);
    mini.panelToggle.setAttribute('aria-expanded', String(isOpen));
    mini.panelToggle.setAttribute('aria-label', 'Show player');
    mini.panelToggle.title = 'Show player';
    mini.minimize.setAttribute('aria-expanded', String(isOpen));
    mini.minimize.setAttribute('aria-label', 'Minimize player');
    mini.minimize.title = 'Minimize player';

    if (isOpen) requestAnimationFrame(resizeSpectrum);
  };

  const toggleWidget = () => {
    const mini = getMiniElements();
    if (!mini) return;
    setWidgetOpen(mini.panel.hidden);
  };

  const canScrollInDirection = (element, deltaY) => {
    if (element.scrollHeight <= element.clientHeight) return false;
    if (deltaY < 0) return element.scrollTop > 0;
    if (deltaY > 0) return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    return false;
  };

  const findTrackScroller = (target) => (
    target instanceof Element ? target.closest('.soundcloud-tracks') : null
  );

  const bindWidgetScrollGuard = (widget) => {
    if (widget.dataset.soundcloudScrollReady === 'true') return;

    widget.dataset.soundcloudScrollReady = 'true';
    let lastTouchY = 0;

    const guardScroll = (event, deltaY) => {
      const tracks = findTrackScroller(event.target);
      event.stopPropagation();
      if (!tracks || !canScrollInDirection(tracks, deltaY)) event.preventDefault();
    };

    widget.addEventListener('wheel', (event) => guardScroll(event, event.deltaY), { passive: false });

    widget.addEventListener('touchstart', (event) => {
      lastTouchY = event.touches[0]?.clientY || 0;
    }, { passive: true });

    widget.addEventListener('touchmove', (event) => {
      const touchY = event.touches[0]?.clientY || lastTouchY;
      const deltaY = lastTouchY - touchY;
      lastTouchY = touchY;
      guardScroll(event, deltaY);
    }, { passive: false });
  };

  const bindSoundCloudWidget = () => {
    const mini = getMiniElements();
    if (!mini) return;

    const bindMiniButton = (button, handler) => {
      if (button.dataset.soundcloudReady === 'true') return;
      button.dataset.soundcloudReady = 'true';
      button.addEventListener('click', handler);
    };

    bindMiniButton(mini.previous, playPrevious);
    bindMiniButton(mini.play, togglePlayback);
    bindMiniButton(mini.next, playNext);
    bindMiniButton(mini.panelToggle, toggleWidget);
    bindMiniButton(mini.minimize, () => setWidgetOpen(false));
    bindWidgetScrollGuard(mini.widget);
    updateMiniControls();
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

  const playLoadedAudio = async ({ resumeAnalyzer = true } = {}) => {
    try {
      if (resumeAnalyzer) await resumeAudioAnalyzer();
      await audio.play();
    } catch (error) {
      console.warn('[SoundCloud] Playback was blocked by the browser.', error);
    }
  };

  const waitForAudioMetadata = () => {
    if (audio.readyState >= 1) return Promise.resolve();

    return new Promise((resolve) => {
      let timeoutId = 0;
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        audio.removeEventListener('loadedmetadata', handleReady);
        audio.removeEventListener('canplay', handleReady);
      };
      const handleReady = () => {
        cleanup();
        resolve();
      };

      timeoutId = window.setTimeout(handleReady, 3000);
      audio.addEventListener('loadedmetadata', handleReady, { once: true });
      audio.addEventListener('canplay', handleReady, { once: true });
    });
  };

  const loadTrack = async (track, shouldPlay) => {
    if (loadedTrackId === track.id) {
      if (shouldPlay) await playLoadedAudio();
      return;
    }

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
    writeSavedState();
    player.dispatchEvent(new CustomEvent('soundcloud:track-change', {
      detail: { id: selectedTrack.id },
    }));

    try {
      await loadTrack(selectedTrack, shouldPlay);
    } catch (error) {
      console.warn('[SoundCloud] Could not load this track.', error);
    }
  };

  const handleTrackSelectionRequest = (event) => {
    selectTrackById(event.detail?.id, Boolean(event.detail?.play));
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
      progress.value = '0';
      elapsed.textContent = '0:00';
      writeSavedState();
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

  const restorePlayerState = async () => {
    const savedState = readSavedState();

    if (savedState) {
      const restoredIndex = tracks.findIndex((track) => String(track.id) === String(savedState.trackId));
      if (restoredIndex >= 0) activeIndex = restoredIndex;
      shuffleEnabled = Boolean(savedState.shuffleEnabled);
      repeatMode = ['all', 'one', 'off'].includes(savedState.repeatMode) ? savedState.repeatMode : 'all';
    }

    renderActiveTrack();
    updatePlaybackModeControls();

    if (!savedState) return;

    const savedPosition = Number(savedState.positionSeconds) || 0;
    const shouldRestoreAudio = savedPosition > 0 || savedState.isPlaying;
    if (!shouldRestoreAudio) return;

    restoringState = true;
    try {
      const track = tracks[activeIndex];
      if (!track) return;

      await loadTrack(track, false);
      await waitForAudioMetadata();

      const nextTime = Math.max(0, Math.min(savedPosition, audio.duration || Infinity));
      if (Number.isFinite(nextTime)) {
        audio.currentTime = nextTime;
        progress.value = audio.duration ? String(Math.round((nextTime / audio.duration) * 1000)) : '0';
        elapsed.textContent = formatTime(nextTime);
      }
    } catch (error) {
      console.warn('[SoundCloud] Could not restore the saved player state.', error);
    } finally {
      restoringState = false;
    }

    if (savedState.isPlaying) await playLoadedAudio({ resumeAnalyzer: false });
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
      title.title = 'No tracks found';
      artist.textContent = '';
      artist.title = '';
      showArtworkFallback();
      return;
    }

    renderTrackList();
    await restorePlayerState();
    player.dataset.tracksReady = 'true';
    player.dispatchEvent(new CustomEvent('soundcloud:tracks-ready', {
      detail: { count: tracks.length },
    }));
  };

  const bindPlayerEvents = () => {
    artwork.addEventListener('load', () => {
      artwork.hidden = false;
      artworkFallback.setAttribute('hidden', '');
    });
    artwork.addEventListener('error', showArtworkFallback);

    player.addEventListener('soundcloud:select-track', handleTrackSelectionRequest);

    shuffleButton.addEventListener('click', () => {
      shuffleEnabled = !shuffleEnabled;
      updatePlaybackModeControls();
      writeSavedState();
    });
    playButton.addEventListener('click', togglePlayback);
    prevButton.addEventListener('click', playPrevious);
    nextButton.addEventListener('click', playNext);
    repeatButton.addEventListener('click', () => {
      repeatMode = repeatMode === 'all' ? 'one' : repeatMode === 'one' ? 'off' : 'all';
      updatePlaybackModeControls();
      writeSavedState();
    });

    audio.addEventListener('play', () => {
      player.classList.add('is-playing');
      playButton.setAttribute('aria-label', 'Pause');
      updateMiniControls();
      startSpectrum();
      writeSavedState();
    });
    audio.addEventListener('pause', () => {
      player.classList.remove('is-playing');
      playButton.setAttribute('aria-label', 'Play');
      updateMiniControls();
      stopSpectrum();
      writeSavedState();
    });
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', () => {
      if (seeking || !audio.duration) return;
      progress.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
      elapsed.textContent = formatTime(audio.currentTime);
      scheduleStateSave();
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
      writeSavedState();
    });

    window.addEventListener('pagehide', writeSavedState);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') writeSavedState();
    });
    document.addEventListener('turbo:load', bindSoundCloudWidget);
  };

  updatePlaybackModeControls();
  clearSpectrum();
  bindSoundCloudWidget();
  bindPlayerEvents();

  loadTracks().catch(() => {
    title.textContent = 'SoundCloud unavailable';
    title.title = 'SoundCloud unavailable';
    artist.textContent = '';
    artist.title = '';
    showArtworkFallback();
    updateMiniControls();
    console.warn('[SoundCloud] Could not load tracks from the SoundCloud API.');
  });
})();
