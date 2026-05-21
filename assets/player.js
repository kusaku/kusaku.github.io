(() => {
  const initSoundCloudPlayer = () => {
    const player = document.getElementById('soundcloud-player');
    if (!player) return;
    if (player.dataset.soundcloudInitialized === 'true') return;
    player.dataset.soundcloudInitialized = 'true';

    const byId = (id) => document.getElementById(id);
    const apiBase = player.dataset.apiBase;
    const audio = byId('soundcloud-audio');
    const artwork = byId('soundcloud-artwork');
    const artworkFallback = byId('soundcloud-art-fallback');
    const meta = player.querySelector('.soundcloud-meta');
    const title = byId('soundcloud-title');
    const artist = byId('soundcloud-artist');
    const openLink = byId('soundcloud-open');
    const playButton = byId('soundcloud-play');
    const shuffleButton = byId('soundcloud-shuffle');
    const previousButton = byId('soundcloud-prev');
    const nextButton = byId('soundcloud-next');
    const repeatButton = byId('soundcloud-repeat');
    const progress = byId('soundcloud-progress');
    const elapsed = byId('soundcloud-elapsed');
    const duration = byId('soundcloud-duration');
    const trackList = byId('soundcloud-tracks');
    const spectrum = byId('soundcloud-spectrum');

    if ([
      audio, artwork, artworkFallback, meta, title, artist, openLink, playButton, shuffleButton,
      previousButton, nextButton, repeatButton, progress, elapsed, duration, trackList, spectrum,
    ].some((element) => !element)) {
      console.warn('[SoundCloud] Player markup is incomplete.');
      return;
    }

    const spectrumContext = spectrum.getContext('2d');
    const mediaSession = window.navigator?.mediaSession;
    const storageKey = 'kusaku.soundcloud.player.v1';
    const widgetStorageKey = `${storageKey}.widget`;
    const spectrumSettings = {
      fftSize: 2048,
      smoothingTimeConstant: 0,
      scrollPixelsPerSecond: 120,
      visibleBinRatio: 0.666,
      intensityCurve: 0.666,
      colorLookupSize: 256,
      colorStops: {
        light: [
          [0, 255, 255, 255, 0],
          [0.12, 255, 226, 82, 0.5],
          [0.24, 255, 190, 32, 1],
          [0.48, 255, 143, 24, 1],
          [0.66, 255, 98, 18, 1],
          [0.86, 153, 29, 0, 1],
        ],
        dark: [
          [0, 22, 27, 34, 0],
          [0.12, 120, 0, 255, 0.5],
          [0.24, 184, 0, 255, 1],
          [0.48, 255, 0, 255, 1],
          [0.66, 255, 111, 0, 1],
          [0.86, 255, 232, 0, 1],
        ],
      },
    };

    audio.crossOrigin = 'anonymous';

    let tracks = [];
    let activeTrackIndex = 0;
    let isShuffleEnabled = false;
    let repeatMode = 'all';

    let hlsInstance = null;
    let loadedTrackId = null;
    let trackLoadRequestId = 0;

    let isSeeking = false;
    let isRestoringState = false;
    let stateSaveTimerId = null;

    let miniElements = null;
    let spectrumColorLookup = null;
    const visualizer = {
      analyser: null,
      audioContext: null,
      audioSource: null,
      frame: null,
      frequencyData: null,
      lastFrameTime: null,
      scrollRemainder: 0,
    };

    const formatTime = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
      if (!hours) return `${minutes}:${rest}`;

      return `${hours}:${minutes.toString().padStart(2, '0')}:${rest}`;
    };

    const formatDuration = (milliseconds) => formatTime(milliseconds / 1000);

    const setButtonLabel = (button, label) => {
      button.setAttribute('aria-label', label);
      button.title = label;
    };

    const setProgressTime = (seconds, totalSeconds = audio.duration) => {
      const time = Number.isFinite(seconds) ? seconds : 0;
      progress.value = totalSeconds ? String(Math.round((time / totalSeconds) * 1000)) : '0';
      elapsed.textContent = formatTime(time);
    };

    const resetProgress = () => {
      setProgressTime(0, 0);
    };

    const resizeSpectrum = (() => {
      let previousSpectrum = null;
      let previousSpectrumContext = null;

      const resizeSpectrumCanvas = (width, height) => {
        const previousWidth = spectrum.width;
        const previousHeight = spectrum.height;

        if (!previousWidth || !previousHeight) {
          spectrum.width = width;
          spectrum.height = height;
          return;
        }

        previousSpectrum ||= document.createElement('canvas');
        previousSpectrumContext ||= previousSpectrum.getContext('2d');
        if (!previousSpectrumContext) {
          spectrum.width = width;
          spectrum.height = height;
          return;
        }

        previousSpectrum.width = previousWidth;
        previousSpectrum.height = previousHeight;
        previousSpectrumContext.drawImage(spectrum, 0, 0);

        spectrum.width = width;
        spectrum.height = height;

        const copyWidth = Math.min(previousWidth, width);
        spectrumContext.drawImage(
          previousSpectrum,
          previousWidth - copyWidth,
          0,
          copyWidth,
          previousHeight,
          width - copyWidth,
          0,
          copyWidth,
          height,
        );
      };

      return () => {
        if (!spectrum || !spectrumContext) return null;

        const dpr = window.devicePixelRatio || 1;
        const rect = spectrum.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        const width = Math.round(rect.width * dpr);
        const height = Math.round(rect.height * dpr);

        if (spectrum.width !== width || spectrum.height !== height) {
          resizeSpectrumCanvas(width, height);
        }

        spectrumContext.setTransform(1, 0, 0, 1, 0, 0);
        return { height, width };
      };
    })();

    const buildSpectrumColorLookup = (colorStops) => {
      const spectrumColorToRgba = (red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${alpha})`;
      let fromColor = colorStops[0];
      let toColor = colorStops[1];

      const interpolateSpectrumColor = (amount) => {
        const red = Math.round(fromColor[1] + (toColor[1] - fromColor[1]) * amount);
        const green = Math.round(fromColor[2] + (toColor[2] - fromColor[2]) * amount);
        const blue = Math.round(fromColor[3] + (toColor[3] - fromColor[3]) * amount);
        const alpha = fromColor[4] + (toColor[4] - fromColor[4]) * amount;

        return spectrumColorToRgba(red, green, blue, alpha);
      };
      let stopIndex = 1;
      const lastColor = colorStops[colorStops.length - 1];
      const { colorLookupSize } = spectrumSettings;

      return Array.from({ length: colorLookupSize }, (_, value) => {
        const intensity = (value / (colorLookupSize - 1)) ** spectrumSettings.intensityCurve;

        while (stopIndex < colorStops.length && intensity > colorStops[stopIndex][0]) {
          stopIndex += 1;
        }

        if (stopIndex >= colorStops.length) return spectrumColorToRgba(...lastColor.slice(1));

        fromColor = colorStops[stopIndex - 1];
        if (intensity <= fromColor[0]) return spectrumColorToRgba(...fromColor.slice(1));

        toColor = colorStops[stopIndex];
        const range = toColor[0] - fromColor[0];
        const amount = range ? (intensity - fromColor[0]) / range : 0;
        return interpolateSpectrumColor(amount);
      });
    };

    const resumeAudioAnalyzer = (() => {
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
          visualizer.frequencyData = new Uint8Array(visualizer.analyser.frequencyBinCount);
          visualizer.audioSource.connect(visualizer.analyser);
          visualizer.analyser.connect(visualizer.audioContext.destination);
          return true;
        } catch (error) {
          console.warn('[SoundCloud] Audio analyzer is unavailable.', error);
          visualizer.analyser = null;
          visualizer.frequencyData = null;
          return false;
        }
      };

      return async () => {
        if (!initAudioAnalyzer()) return;
        if (visualizer.audioContext?.state === 'suspended') await visualizer.audioContext.resume();
      };
    })();

    const drawLiveSpectrum = (() => {
      let frameHeight = 0;
      let frameWidth = 0;
      let columnWidth = 0;

      const getSpectrumColorLookup = () => {
        const theme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
        spectrumColorLookup ||= {};
        return spectrumColorLookup[theme] ||= buildSpectrumColorLookup(spectrumSettings.colorStops[theme]);
      };

      const getSpectrumColumnWidth = (timestamp) => {
        const dpr = window.devicePixelRatio || 1;
        const frameSeconds = Math.min(0.25, Math.max(0, timestamp - visualizer.lastFrameTime) / 1000);
        visualizer.scrollRemainder += frameSeconds * spectrumSettings.scrollPixelsPerSecond * dpr;

        const nextColumnWidth = Math.min(frameWidth, Math.floor(visualizer.scrollRemainder));
        visualizer.scrollRemainder -= nextColumnWidth;
        visualizer.lastFrameTime = timestamp;
        return nextColumnWidth;
      };

      const scrollSpectrumCanvas = () => {
        const scrollWidth = frameWidth - columnWidth;
        if (scrollWidth <= 0) return;

        spectrumContext.save();
        spectrumContext.globalCompositeOperation = 'copy';
        spectrumContext.drawImage(
          spectrum,
          columnWidth,
          0,
          scrollWidth,
          frameHeight,
          0,
          0,
          scrollWidth,
          frameHeight,
        );
        spectrumContext.restore();
      };

      const drawSpectrumColumn = () => {
        const { frequencyData } = visualizer;
        const colorLookup = getSpectrumColorLookup();
        const maxBin = Math.max(1, Math.floor(frequencyData.length * spectrumSettings.visibleBinRatio));
        const bucketHeight = Math.max(1, Math.ceil(frameHeight / maxBin));
        const x = frameWidth - columnWidth;

        spectrumContext.clearRect(x, 0, columnWidth, frameHeight);

        for (let index = 0; index < maxBin; index += 1) {
          const sourceIndex = maxBin - 1 - index;
          const raw = frequencyData[sourceIndex];
          if (!raw) continue;

          const y = Math.floor((index / maxBin) * frameHeight);
          spectrumContext.fillStyle = colorLookup[raw];
          spectrumContext.fillRect(x, y, columnWidth, bucketHeight + 1);
        }
      };

      const requestSpectrumFrame = () => {
        visualizer.frame = requestAnimationFrame(drawLiveSpectrum);
      };

      const drawLiveSpectrum = (timestamp) => {
        const rect = resizeSpectrum();
        const { analyser, frequencyData } = visualizer;
        if (!rect || !spectrumContext || !analyser || !frequencyData) {
          visualizer.frame = null;
          return;
        }

        frameHeight = rect.height;
        frameWidth = rect.width;
        columnWidth = getSpectrumColumnWidth(timestamp);
        if (!columnWidth) {
          requestSpectrumFrame();
          return;
        }

        analyser.getByteFrequencyData(frequencyData);
        scrollSpectrumCanvas();
        drawSpectrumColumn();
        requestSpectrumFrame();
      };

      return drawLiveSpectrum;
    })();

    const startSpectrum = () => {
      if (!visualizer.analyser) return;
      if (visualizer.frame) return;
      visualizer.lastFrameTime = performance.now();
      visualizer.frame = requestAnimationFrame(drawLiveSpectrum);
    };

    const resumeSpectrum = () => {
      requestAnimationFrame(() => {
        resizeSpectrum();
        if (!audio.paused) startSpectrum();
      });
    };

    const showArtworkFallback = () => {
      artwork.removeAttribute('src');
      artwork.hidden = true;
      artworkFallback.removeAttribute('hidden');
    };

    const emitTrackMeta = () => {
      const { artist, id, title } = tracks[activeTrackIndex] || {};
      if (!id) return;

      player.dispatchEvent(new CustomEvent('soundcloud:track-meta', {
        detail: { artist, id, title },
      }));
    };

    const updateMediaSessionMetadata = () => {
      if (!mediaSession || !window.MediaMetadata) return;

      const track = tracks[activeTrackIndex];
      if (!track) return;

      try {
        mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          artwork: track.artworkUrl ? [{
            src: track.artworkUrl,
            sizes: '500x500',
            type: 'image/jpeg',
          }] : [],
        });
      } catch (error) {
        console.warn('[SoundCloud] Could not update Media Session metadata.', error);
      }
    };

    const updateMediaSessionPlaybackState = () => {
      if (!mediaSession) return;

      try {
        mediaSession.playbackState = audio.paused || audio.ended ? 'paused' : 'playing';
      } catch (error) {
        console.warn('[SoundCloud] Could not update Media Session playback state.', error);
      }
    };

    const renderActiveTrack = () => {
      const track = tracks[activeTrackIndex];
      if (!track) return;

      title.textContent = track.title;
      artist.textContent = track.artist;
      meta.dataset.soundcloudPopupTrack = String(track.id);
      duration.textContent = formatDuration(track.duration);
      openLink.href = track.permalinkUrl;

      if (track.artworkUrl) {
        artworkFallback.setAttribute('hidden', '');
        artwork.hidden = true;
        artwork.src = track.artworkUrl;
        if (artwork.complete && artwork.naturalWidth) artwork.hidden = false;
      } else {
        showArtworkFallback();
      }

      [...trackList.children].forEach((trackButton, trackIndex) => {
        trackButton.classList.toggle('is-active', trackIndex === activeTrackIndex);
        trackButton.setAttribute('aria-current', trackIndex === activeTrackIndex ? 'true' : 'false');
      });
      updateMiniControls();
      updateMediaSessionMetadata();
      emitTrackMeta();
    };

    const bindTrackPopups = () => {
      const trackPopupRows = [
        ['Artist', 'artist'],
        ['Title', 'title'],
        ['Artist name', 'artistName'],
        ['City', 'artistCity'],
        ['Country', 'artistCountry'],
        ['Label', 'labelName'],
        ['Released', 'releaseLabel'],
        ['Release', 'release'],
        ['Published', 'publishedLabel'],
        ['Genre', 'genre'],
        ['BPM', 'bpm'],
        ['Key', 'keySignature'],
        ['License', 'license'],
        ['Tags', 'tags'],
        ['Description', 'description'],
      ];
      let trackPopup = null;
      let trackPopupTarget = null;
      let trackPopupPoint = null;

      const renderTrackPopup = () => {
        const track = tracks.find((item) => String(item.id) === trackPopupTarget.dataset.soundcloudPopupTrack);
        if (!track) return null;

        const wrapper = document.createElement('div');
        wrapper.className = 'soundcloud-popup-content';

        if (track.artistAvatarUrl) {
          const avatar = document.createElement('img');
          avatar.className = 'soundcloud-popup-avatar';
          avatar.src = track.artistAvatarUrl;
          avatar.alt = '';
          wrapper.append(avatar);
        }

        const content = document.createElement('dl');
        content.className = 'soundcloud-popup-list';

        for (const [label, key] of trackPopupRows) {
          const value = track[key];
          const displayValue = typeof value === 'string' ? value.trim() : value;
          if (!displayValue) continue;
          const term = document.createElement('dt');
          const description = document.createElement('dd');
          term.textContent = label;
          description.textContent = displayValue;
          content.append(term, description);
        }
        wrapper.append(content);
        return wrapper;
      };

      const positionTrackPopup = () => {
        if (!trackPopup || !trackPopupTarget) return;

        const gap = 14;
        const edge = 12;
        const popupRect = trackPopup.getBoundingClientRect();
        const targetRect = trackPopupTarget.getBoundingClientRect();
        const anchorX = trackPopupPoint?.x ?? targetRect.right;
        const anchorY = trackPopupPoint?.y ?? targetRect.top + targetRect.height / 2;
        const rightLeft = anchorX + gap;
        const leftLeft = anchorX - popupRect.width - gap;
        const left = rightLeft + popupRect.width + edge <= window.innerWidth
          ? rightLeft
          : Math.max(edge, leftLeft);
        const top = Math.min(
          window.innerHeight - popupRect.height - edge,
          Math.max(edge, anchorY - popupRect.height / 2),
        );

        trackPopup.style.left = `${left}px`;
        trackPopup.style.top = `${top}px`;
      };

      const showTrackPopup = (target, point = null) => {
        trackPopupTarget = target;
        trackPopupPoint = point;
        const popupContent = renderTrackPopup();
        if (!popupContent) {
          hideTrackPopup();
          return;
        }

        if (!trackPopup) {
          trackPopup = document.createElement('div');
          trackPopup.className = 'soundcloud-popup';
          trackPopup.hidden = true;
        }
        if (!trackPopup.isConnected) document.body.append(trackPopup);
        trackPopup.replaceChildren(popupContent);
        trackPopup.hidden = false;
        positionTrackPopup();
      };

      const hideTrackPopup = () => {
        trackPopupTarget = null;
        trackPopupPoint = null;
        if (trackPopup) trackPopup.hidden = true;
      };

      const popupTargetFor = (target) => (
        target instanceof Element ? target.closest('[data-soundcloud-popup-track]') : null
      );

      const updateTrackPopup = (event) => {
        const target = popupTargetFor(event.target);
        if (!target) return;

        const point = { x: event.clientX, y: event.clientY };
        if (target !== trackPopupTarget) {
          showTrackPopup(target, point);
        } else {
          trackPopupPoint = point;
          positionTrackPopup();
        }
      };

      player.addEventListener('pointerover', updateTrackPopup);
      player.addEventListener('pointermove', updateTrackPopup);
      player.addEventListener('pointerout', (event) => {
        const target = popupTargetFor(event.target);
        const related = event.relatedTarget;
        if (!target || (related instanceof Node && target.contains(related))) return;
        hideTrackPopup();
      });

      player.addEventListener('focusin', (event) => {
        const target = popupTargetFor(event.target);
        if (target) showTrackPopup(target);
      });

      player.addEventListener('focusout', (event) => {
        if (popupTargetFor(event.target)) hideTrackPopup();
      });

      document.addEventListener('scroll', hideTrackPopup, true);
      window.addEventListener('resize', hideTrackPopup);
      document.addEventListener('turbo:before-render', hideTrackPopup);
    };

    const getMiniElements = () => {
      if (miniElements?.widget.isConnected) return miniElements;

      const widget = byId('soundcloud-widget');
      if (!widget) {
        miniElements = null;
        return null;
      }

      const elements = {
        artist: byId('soundcloud-mini-artist'),
        artLink: byId('soundcloud-mini-open'),
        artwork: byId('soundcloud-mini-artwork'),
        next: byId('soundcloud-mini-next'),
        minimize: byId('soundcloud-widget-minimize'),
        panel: byId('soundcloud-widget-panel'),
        panelToggle: byId('soundcloud-mini-panel-toggle'),
        play: byId('soundcloud-mini-play'),
        previous: byId('soundcloud-mini-prev'),
        title: byId('soundcloud-mini-title'),
        widget,
      };

      miniElements = Object.values(elements).every(Boolean) ? elements : null;
      return miniElements;
    };

    const updateMiniControls = () => {
      const mini = getMiniElements();
      if (!mini) return;

      const track = tracks[activeTrackIndex];
      mini.widget.classList.toggle('is-playing', !audio.paused);

      const label = audio.paused ? 'Play' : 'Pause';
      setButtonLabel(mini.play, label);

      mini.title.textContent = track ? track.title : title.textContent;
      mini.artist.textContent = track ? track.artist : artist.textContent;
      mini.artLink.href = track ? track.permalinkUrl : openLink.href;

      if (track?.artworkUrl) {
        mini.artwork.src = track.artworkUrl;
        mini.artwork.hidden = false;
      } else {
        mini.artwork.removeAttribute('src');
        mini.artwork.hidden = true;
      }
    };

    const setWidgetOpen = (isOpen, { persist = true } = {}) => {
      const mini = getMiniElements();
      if (!mini) return;

      if (persist) {
        try {
          sessionStorage.setItem(widgetStorageKey, isOpen ? 'open' : 'closed');
        } catch (error) {
          console.warn('[SoundCloud] Could not save widget state.', error);
        }
      }

      mini.panel.hidden = !isOpen;
      mini.widget.classList.toggle('is-open', isOpen);
      mini.panelToggle.setAttribute('aria-expanded', String(isOpen));
      setButtonLabel(mini.panelToggle, 'Show player');
      mini.minimize.setAttribute('aria-expanded', String(isOpen));
      setButtonLabel(mini.minimize, 'Minimize player');

      if (isOpen) resumeSpectrum();
    };

    const updatePlaybackModeControls = () => {
      const shuffleLabel = isShuffleEnabled ? 'Shuffle on' : 'Shuffle off';
      shuffleButton.classList.toggle('is-active', isShuffleEnabled);
      shuffleButton.setAttribute('aria-pressed', String(isShuffleEnabled));
      setButtonLabel(shuffleButton, shuffleLabel);

      repeatButton.classList.toggle('is-active', repeatMode !== 'off');
      repeatButton.setAttribute('aria-pressed', String(repeatMode !== 'off'));
      player.classList.toggle('repeat-one', repeatMode === 'one');

      const repeatLabel = repeatMode === 'one'
        ? 'Repeat current track'
        : repeatMode === 'all' ? 'Repeat all' : 'Repeat off';
      setButtonLabel(repeatButton, repeatLabel);
    };

    const writeSavedState = () => {
      if (player.dataset.skipState === 'true' || isRestoringState || !tracks.length) return;

      const track = tracks[activeTrackIndex];
      if (!track) return;
      const currentTime = String(loadedTrackId) === String(track.id) && Number.isFinite(audio.currentTime)
        ? audio.currentTime
        : 0;

      try {
        localStorage.setItem(storageKey, JSON.stringify({
          isPlaying: !audio.paused && !audio.ended,
          positionSeconds: currentTime,
          repeatMode,
          shuffleEnabled: isShuffleEnabled,
          trackId: track.id,
          updatedAt: Date.now(),
        }));
      } catch (error) {
        console.warn('[SoundCloud] Could not save player state.', error);
      }
    };

    const resolveTrackStream = async (trackId) => {
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

    const loadTrack = async (track, shouldPlay) => {
      if (loadedTrackId === track.id && audio.currentSrc && !audio.error) {
        if (shouldPlay) await playLoadedAudio();
        return;
      }

      const requestId = ++trackLoadRequestId;
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      loadedTrackId = null;

      const stream = await resolveTrackStream(track.id);
      if (requestId !== trackLoadRequestId) return;
      loadedTrackId = track.id;

      if (stream.protocol === 'hls' && window.Hls?.isSupported()) {
        hlsInstance = new Hls({ enableWorker: true });
        hlsInstance.loadSource(stream.url);
        hlsInstance.attachMedia(audio);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          if (requestId !== trackLoadRequestId) return;
          if (shouldPlay) playLoadedAudio();
        });
        hlsInstance.on(Hls.Events.ERROR, (_event, errorData) => {
          if (requestId !== trackLoadRequestId || !errorData.fatal) return;
          console.warn('[SoundCloud] Could not play this stream.', errorData);
          loadedTrackId = null;
        });
        return;
      }

      audio.src = stream.url;
      if (shouldPlay) await playLoadedAudio();
    };

    const selectTrack = async (trackIndex, shouldPlay) => {
      if (!tracks[trackIndex]) return;

      const selectedTrack = tracks[trackIndex];
      activeTrackIndex = trackIndex;
      renderActiveTrack();
      resetProgress();
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

    const getNextTrackIndex = () => {
      if (isShuffleEnabled) {
        if (tracks.length < 2) return repeatMode === 'off' ? null : activeTrackIndex;
        const offset = 1 + Math.floor(Math.random() * (tracks.length - 1));
        return (activeTrackIndex + offset) % tracks.length;
      }
      if (activeTrackIndex < tracks.length - 1) return activeTrackIndex + 1;
      return repeatMode === 'all' ? 0 : null;
    };

    const playCurrentTrack = async () => {
      const track = tracks[activeTrackIndex];
      if (!track) return;

      try {
        await loadTrack(track, true);
      } catch (error) {
        console.warn('[SoundCloud] Could not start playback.', error);
      }
    };

    const pauseCurrentTrack = () => {
      audio.pause();
    };

    const playNextTrack = () => {
      if (!tracks.length) return;
      const nextTrackIndex = getNextTrackIndex();
      if (nextTrackIndex === null) {
        pauseCurrentTrack();
        audio.currentTime = 0;
        resetProgress();
        writeSavedState();
        return;
      }
      selectTrack(nextTrackIndex, true);
    };

    const playPreviousTrack = () => {
      if (!tracks.length) return;
      const previousTrackIndex = (activeTrackIndex - 1 + tracks.length) % tracks.length;
      selectTrack(previousTrackIndex, true);
    };

    const togglePlayback = async () => {
      if (audio.paused) {
        await playCurrentTrack();
      } else {
        pauseCurrentTrack();
      }
    };

    const loadTracks = async () => {
      if (!apiBase) {
        console.warn('[SoundCloud] API is not configured.');
        return;
      }

      const response = await fetch(new URL(`${apiBase}/tracks`, window.location.origin), {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`Track request failed with ${response.status}`);

      const formatDate = (date) => date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
      });
      const formatTrackDate = (createdAt) => {
        const parts = String(createdAt).match(/^(\d{4})\/(\d{2})\/(\d{2})/);
        return parts ? formatDate(new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])))) : '';
      };
      const formatReleaseDate = (releaseYear, releaseMonth, releaseDay) => {
        const year = Number(releaseYear);
        const month = Number(releaseMonth);
        const day = Number(releaseDay);
        return year && month && day ? formatDate(new Date(Date.UTC(year, month - 1, day))) : '';
      };

      tracks = (await response.json()).tracks.map((track) => {
        const user = track.user || {};

        return {
          id: track.id,
          title: track.title,
          artist: track.metadata_artist || user.username || '',
          artistAvatarUrl: user.avatar_url,
          artistCity: user.city,
          artistCountry: user.country,
          artistName: user.full_name,
          labelName: track.label_name,
          publishedLabel: formatTrackDate(track.created_at),
          releaseLabel: formatReleaseDate(track.release_year, track.release_month, track.release_day),
          release: track.release,
          genre: track.genre,
          bpm: track.bpm,
          keySignature: track.key_signature,
          tags: track.tag_list,
          description: track.description,
          license: track.license?.replaceAll('-', ' ').toUpperCase(),
          duration: Number(track.duration),
          artworkUrl: track.artwork_url?.replace('-large.jpg', '-t500x500.jpg') || '',
          permalinkUrl: track.permalink_url,
        };
      });

      const restorePlayerState = async () => {
        const readSavedState = () => {
          if (player.dataset.skipState === 'true') return null;

          try {
            const state = JSON.parse(localStorage.getItem(storageKey) || 'null');
            return state && typeof state === 'object' ? state : null;
          } catch (error) {
            console.warn('[SoundCloud] Could not read player state.', error);
            return null;
          }
        };

        const waitForAudioMetadata = () => {
          if (audio.readyState >= 1) return Promise.resolve();

          return new Promise((resolve) => {
            let timeoutId = 0;
            const cleanup = () => {
              window.clearTimeout(timeoutId);
              audio.removeEventListener('loadedmetadata', handleAudioReady);
              audio.removeEventListener('canplay', handleAudioReady);
            };
            const handleAudioReady = () => {
              cleanup();
              resolve();
            };

            timeoutId = window.setTimeout(handleAudioReady, 3000);
            audio.addEventListener('loadedmetadata', handleAudioReady, { once: true });
            audio.addEventListener('canplay', handleAudioReady, { once: true });
          });
        };

        const savedState = readSavedState();

        if (savedState) {
          const restoredTrackIndex = tracks.findIndex((track) => String(track.id) === String(savedState.trackId));
          if (restoredTrackIndex >= 0) activeTrackIndex = restoredTrackIndex;
          isShuffleEnabled = Boolean(savedState.shuffleEnabled ?? savedState.isShuffleEnabled);
          repeatMode = ['all', 'one', 'off'].includes(savedState.repeatMode) ? savedState.repeatMode : 'all';
        }

        renderActiveTrack();
        updatePlaybackModeControls();

        if (!savedState) return;

        const savedPosition = Number(savedState.positionSeconds) || 0;
        const shouldRestoreAudio = savedPosition > 0 || savedState.isPlaying;
        if (!shouldRestoreAudio) return;

        isRestoringState = true;
        try {
          const track = tracks[activeTrackIndex];
          if (!track) return;

          await loadTrack(track, false);
          await waitForAudioMetadata();

          const nextTime = Math.max(0, Math.min(savedPosition, audio.duration || Infinity));
          if (Number.isFinite(nextTime)) {
            audio.currentTime = nextTime;
            setProgressTime(nextTime, audio.duration);
          }
        } catch (error) {
          console.warn('[SoundCloud] Could not restore the saved player state.', error);
        } finally {
          isRestoringState = false;
        }

        if (savedState.isPlaying) await playLoadedAudio({ resumeAnalyzer: false });
      };

      if (!tracks.length) {
        title.textContent = 'No tracks found';
        artist.textContent = '';
        showArtworkFallback();
        return;
      }

      const htmlEscapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => htmlEscapes[char]);
      trackList.innerHTML = tracks.map((track, trackIndex) => {
        const isActive = trackIndex === activeTrackIndex;
        return `
          <button type="button" class="soundcloud-track${isActive ? ' is-active' : ''}" data-index="${trackIndex}" aria-current="${isActive ? 'true' : 'false'}">
            <span class="soundcloud-track-index">${String(trackIndex + 1).padStart(2, '0')}</span>
            <span class="soundcloud-track-meta">
              <span class="soundcloud-track-title">${escapeHtml(track.title)}</span>
              <span class="soundcloud-track-artist">${escapeHtml(track.artist)}</span>
            </span>
            <span class="soundcloud-track-duration">${formatDuration(track.duration)}</span>
          </button>
        `;
      }).join('');
      await restorePlayerState();
      player.dataset.tracksReady = 'true';
      player.dispatchEvent(new CustomEvent('soundcloud:tracks-ready'));
    };

    const bindSoundCloudWidget = (() => {
      const bindWidgetScrollGuard = (widget) => {
        if (widget.dataset.soundcloudScrollReady === 'true') return;

        widget.dataset.soundcloudScrollReady = 'true';
        let lastTouchY = 0;

        const canScrollInDirection = (element, deltaY) => {
          if (element.scrollHeight <= element.clientHeight) return false;
          if (deltaY < 0) return element.scrollTop > 0;
          if (deltaY > 0) return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
          return false;
        };

        const findTrackScroller = (target) => (
          target instanceof Element ? target.closest('.soundcloud-tracks') : null
        );

        const guardScroll = (event, deltaY) => {
          const scroller = findTrackScroller(event.target);
          event.stopPropagation();
          if (!scroller || !canScrollInDirection(scroller, deltaY)) event.preventDefault();
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

      return () => {
        const mini = getMiniElements();
        if (!mini) return;

        const readWidgetOpen = () => {
          try {
            return sessionStorage.getItem(widgetStorageKey) === 'open';
          } catch (error) {
            console.warn('[SoundCloud] Could not read widget state.', error);
            return false;
          }
        };

        const bindMiniButton = (button, handler) => {
          if (button.dataset.soundcloudReady === 'true') return;
          button.dataset.soundcloudReady = 'true';
          button.addEventListener('click', handler);
        };

        bindMiniButton(mini.previous, playPreviousTrack);
        bindMiniButton(mini.play, togglePlayback);
        bindMiniButton(mini.next, playNextTrack);
        bindMiniButton(mini.panelToggle, () => setWidgetOpen(mini.panel.hidden));
        bindMiniButton(mini.minimize, () => setWidgetOpen(false));
        bindWidgetScrollGuard(mini.widget);
        setWidgetOpen(readWidgetOpen(), { persist: false });
        updateMiniControls();
      };
    })();

    const bindPlayerEvents = () => {
      const scheduleStateSave = () => {
        if (stateSaveTimerId) return;
        stateSaveTimerId = window.setTimeout(() => {
          stateSaveTimerId = null;
          writeSavedState();
        }, 750);
      };

      const bindMediaSessionHandlers = () => {
        if (!mediaSession) return;

        const setMediaSessionActionHandler = (action, handler) => {
          try {
            mediaSession.setActionHandler(action, handler);
          } catch (error) {
            console.warn(`[SoundCloud] Media Session action "${action}" is not available.`, error);
          }
        };

        setMediaSessionActionHandler('play', playCurrentTrack);
        setMediaSessionActionHandler('pause', pauseCurrentTrack);
        setMediaSessionActionHandler('previoustrack', playPreviousTrack);
        setMediaSessionActionHandler('nexttrack', playNextTrack);
        updateMediaSessionMetadata();
        updateMediaSessionPlaybackState();
      };

      const handleArtworkLoad = () => {
        artwork.hidden = false;
        artworkFallback.setAttribute('hidden', '');
      };

      const handleTrackSelectionRequest = (event) => {
        const id = event.detail?.id;
        if (!id) return;

        const requestedTrackIndex = tracks.findIndex((track) => String(track.id) === String(id));
        if (requestedTrackIndex >= 0) selectTrack(requestedTrackIndex, Boolean(event.detail?.play));
      };

      const handleTrackListClick = (event) => {
        const button = event.target instanceof Element ? event.target.closest('.soundcloud-track') : null;
        if (!button || !trackList.contains(button)) return;

        const trackIndex = Number(button.dataset.index);
        if (Number.isInteger(trackIndex)) selectTrack(trackIndex, true);
      };

      const handleShuffleButtonClick = () => {
        isShuffleEnabled = !isShuffleEnabled;
        updatePlaybackModeControls();
        writeSavedState();
      };

      const handleRepeatButtonClick = () => {
        repeatMode = repeatMode === 'all' ? 'one' : repeatMode === 'one' ? 'off' : 'all';
        updatePlaybackModeControls();
        writeSavedState();
      };

      const handleTrackEnded = () => {
        updateMediaSessionPlaybackState();

        if (repeatMode === 'one') {
          audio.currentTime = 0;
          playLoadedAudio();
          return;
        }

        playNextTrack();
      };

      const handleAudioPlay = () => {
        player.classList.add('is-playing');
        setButtonLabel(playButton, 'Pause');
        updateMiniControls();
        updateMediaSessionPlaybackState();
        startSpectrum();
        writeSavedState();
      };

      const stopSpectrum = () => {
        if (visualizer.frame) {
          cancelAnimationFrame(visualizer.frame);
          visualizer.frame = null;
        }
        visualizer.lastFrameTime = null;
        visualizer.scrollRemainder = 0;
      };

      const handleAudioPause = () => {
        player.classList.remove('is-playing');
        setButtonLabel(playButton, 'Play');
        updateMiniControls();
        updateMediaSessionPlaybackState();
        stopSpectrum();
        writeSavedState();
      };

      const handleAudioTimeUpdate = () => {
        if (isSeeking || !audio.duration) return;
        setProgressTime(audio.currentTime, audio.duration);
        scheduleStateSave();
      };

      const handleAudioError = () => {
        loadedTrackId = null;
        updateMediaSessionPlaybackState();
      };

      const handleAudioDurationChange = () => {
        if (audio.duration) duration.textContent = formatTime(audio.duration);
      };

      const handleProgressInput = () => {
        isSeeking = true;
        elapsed.textContent = formatTime((Number(progress.value) / 1000) * (audio.duration || 0));
      };

      const handleProgressChange = () => {
        const nextTime = (Number(progress.value) / 1000) * (audio.duration || 0);
        if (Number.isFinite(nextTime)) {
          audio.currentTime = nextTime;
        }
        isSeeking = false;
        writeSavedState();
      };

      const handleDocumentVisibilityChange = () => {
        if (document.visibilityState === 'hidden') writeSavedState();
      };

      const handlePageShow = (event) => {
        if (event.persisted) loadedTrackId = null;
      };

      const handleTurboLoad = () => {
        miniElements = null;
        bindSoundCloudWidget();
        resumeSpectrum();
        emitTrackMeta();
      };

      artwork.addEventListener('load', handleArtworkLoad);
      artwork.addEventListener('error', showArtworkFallback);

      player.addEventListener('soundcloud:request-track-meta', emitTrackMeta);
      player.addEventListener('soundcloud:select-track', handleTrackSelectionRequest);
      bindMediaSessionHandlers();

      shuffleButton.addEventListener('click', handleShuffleButtonClick);
      playButton.addEventListener('click', togglePlayback);
      previousButton.addEventListener('click', playPreviousTrack);
      nextButton.addEventListener('click', playNextTrack);
      repeatButton.addEventListener('click', handleRepeatButtonClick);
      trackList.addEventListener('click', handleTrackListClick);

      audio.addEventListener('play', handleAudioPlay);
      audio.addEventListener('pause', handleAudioPause);
      audio.addEventListener('ended', handleTrackEnded);
      audio.addEventListener('timeupdate', handleAudioTimeUpdate);
      audio.addEventListener('durationchange', handleAudioDurationChange);
      audio.addEventListener('error', handleAudioError);

      progress.addEventListener('input', handleProgressInput);
      progress.addEventListener('change', handleProgressChange);

      window.addEventListener('pageshow', handlePageShow);
      window.addEventListener('pagehide', writeSavedState);
      document.addEventListener('visibilitychange', handleDocumentVisibilityChange);
      document.addEventListener('turbo:load', handleTurboLoad);
    };

    updatePlaybackModeControls();
    {
      const rect = resizeSpectrum();
      if (rect && spectrumContext) {
        spectrumContext.clearRect(0, 0, rect.width, rect.height);
        visualizer.lastFrameTime = null;
        visualizer.scrollRemainder = 0;
      }
    }
    bindTrackPopups();
    bindSoundCloudWidget();
    bindPlayerEvents();

    loadTracks().catch(() => {
      title.textContent = 'SoundCloud unavailable';
      artist.textContent = '';
      showArtworkFallback();
      updateMiniControls();
      console.warn('[SoundCloud] Could not load tracks from the SoundCloud API.');
    });
  };

  initSoundCloudPlayer();
  document.addEventListener('turbo:load', initSoundCloudPlayer);
})();
