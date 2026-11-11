(() => {
  const initSoundCloudPlayer = () => {
    const player = document.getElementById('soundcloud-player');
    if (!player || player.dataset.soundcloudInitialized === 'true') return;
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

    const spectrumContext = spectrum.getContext('2d');
    const spectrumSnapshot = document.createElement('canvas');
    const spectrumColorLookups = {};
    const mediaSession = navigator.mediaSession;
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
    const visualizer = {
      analyser: null,
      audioContext: null,
      audioSource: null,
      frame: null,
      frequencyData: null,
      lastFrameTime: null,
      scrollRemainder: 0,
    };
    const boundWidgets = new WeakSet();

    audio.crossOrigin = 'anonymous';

    let tracks = [];
    let activeTrackIndex = 0;
    let isShuffleEnabled = false;
    let repeatMode = 'all';
    let hlsInstance = null;
    let loadedTrackId = null;
    let trackLoadRequestId = 0;
    let resumeTime = 0;
    let isSeeking = false;

    const closest = (target, selector) => (target instanceof Element ? target.closest(selector) : null);

    const readStored = (storageName, key) => {
      try {
        return JSON.parse(window[storageName].getItem(key));
      } catch (error) {
        console.warn('[SoundCloud] Could not read stored state.', error);
        return null;
      }
    };

    const writeStored = (storageName, key, value) => {
      try {
        window[storageName].setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn('[SoundCloud] Could not save state.', error);
      }
    };

    const formatTime = (seconds) => {
      if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const rest = Math.floor(seconds % 60).toString().padStart(2, '0');
      return hours ? `${hours}:${minutes.toString().padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
    };

    const formatDuration = (milliseconds) => formatTime(milliseconds / 1000);

    const setButtonLabel = (button, label) => {
      button.setAttribute('aria-label', label);
      button.title = label;
    };

    const setProgressTime = (seconds, totalSeconds) => {
      progress.value = totalSeconds ? String(Math.round((seconds / totalSeconds) * 1000)) : '0';
      elapsed.textContent = formatTime(seconds);
    };

    const resizeSpectrum = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = spectrum.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;

      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      const { width: previousWidth, height: previousHeight } = spectrum;
      if (previousWidth === width && previousHeight === height) return { height, width };

      const copyWidth = Math.min(previousWidth, width);
      spectrumSnapshot.width = previousWidth;
      spectrumSnapshot.height = previousHeight;
      spectrumSnapshot.getContext('2d').drawImage(spectrum, 0, 0);
      spectrum.width = width;
      spectrum.height = height;
      spectrumContext.drawImage(
        spectrumSnapshot,
        previousWidth - copyWidth, 0, copyWidth, previousHeight,
        width - copyWidth, 0, copyWidth, height,
      );
      return { height, width };
    };

    const buildSpectrumColorLookup = (colorStops) => {
      const { colorLookupSize, intensityCurve } = spectrumSettings;

      return Array.from({ length: colorLookupSize }, (_, value) => {
        const intensity = (value / (colorLookupSize - 1)) ** intensityCurve;
        const to = colorStops.find(([position]) => intensity <= position) || colorStops.at(-1);
        const from = colorStops[Math.max(0, colorStops.indexOf(to) - 1)];
        const amount = Math.min(1, (intensity - from[0]) / (to[0] - from[0] || 1));
        const [red, green, blue, alpha] = from.slice(1).map((channel, index) => (
          channel + (to[index + 1] - channel) * amount
        ));

        return `rgba(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)}, ${alpha})`;
      });
    };

    const resumeAudioAnalyzer = async () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!visualizer.analyser) {
        try {
          visualizer.audioContext ||= new AudioContext();
          visualizer.audioSource ||= visualizer.audioContext.createMediaElementSource(audio);
          const analyser = visualizer.audioContext.createAnalyser();
          analyser.fftSize = spectrumSettings.fftSize;
          analyser.smoothingTimeConstant = spectrumSettings.smoothingTimeConstant;
          visualizer.audioSource.connect(analyser);
          analyser.connect(visualizer.audioContext.destination);
          visualizer.analyser = analyser;
          visualizer.frequencyData = new Uint8Array(analyser.frequencyBinCount);
        } catch (error) {
          console.warn('[SoundCloud] Audio analyzer is unavailable.', error);
          return;
        }
      }

      if (visualizer.audioContext.state !== 'running') await visualizer.audioContext.resume();
    };

    const drawLiveSpectrum = (timestamp) => {
      const size = resizeSpectrum();
      const { analyser, frequencyData } = visualizer;
      if (!size || !analyser) {
        visualizer.frame = null;
        return;
      }
      visualizer.frame = requestAnimationFrame(drawLiveSpectrum);

      const { height, width } = size;
      const frameSeconds = Math.min(0.25, Math.max(0, timestamp - visualizer.lastFrameTime) / 1000);
      const dpr = window.devicePixelRatio || 1;
      visualizer.scrollRemainder += frameSeconds * spectrumSettings.scrollPixelsPerSecond * dpr;
      visualizer.lastFrameTime = timestamp;

      const columnWidth = Math.min(width, Math.floor(visualizer.scrollRemainder));
      if (!columnWidth) return;
      visualizer.scrollRemainder -= columnWidth;

      const x = width - columnWidth;
      if (x > 0) {
        spectrumContext.save();
        spectrumContext.globalCompositeOperation = 'copy';
        spectrumContext.drawImage(spectrum, columnWidth, 0, x, height, 0, 0, x, height);
        spectrumContext.restore();
      }
      spectrumContext.clearRect(x, 0, columnWidth, height);

      const theme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
      const colorLookup = spectrumColorLookups[theme] ||= buildSpectrumColorLookup(spectrumSettings.colorStops[theme]);
      const maxBin = Math.max(1, Math.floor(frequencyData.length * spectrumSettings.visibleBinRatio));
      const bucketHeight = Math.max(1, Math.ceil(height / maxBin));

      analyser.getByteFrequencyData(frequencyData);
      for (let index = 0; index < maxBin; index += 1) {
        const raw = frequencyData[maxBin - 1 - index];
        if (!raw) continue;

        spectrumContext.fillStyle = colorLookup[raw];
        spectrumContext.fillRect(x, Math.floor((index / maxBin) * height), columnWidth, bucketHeight + 1);
      }
    };

    const startSpectrum = () => {
      if (!visualizer.analyser || visualizer.frame) return;
      visualizer.lastFrameTime = performance.now();
      visualizer.frame = requestAnimationFrame(drawLiveSpectrum);
    };

    const stopSpectrum = () => {
      cancelAnimationFrame(visualizer.frame);
      visualizer.frame = null;
      visualizer.lastFrameTime = null;
      visualizer.scrollRemainder = 0;
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

    const getRequestedTrackIndex = () => {
      if (!document.querySelector('[data-soundcloud-page]')) return -1;
      const requestedId = new URLSearchParams(window.location.search).get('id');
      return tracks.findIndex((track) => String(track.id) === requestedId);
    };

    const syncMusicPage = () => {
      const page = document.querySelector('[data-soundcloud-page]');
      const track = tracks[activeTrackIndex];
      if (!page || !track) return;

      const url = new URL(window.location.href);
      if (url.searchParams.get('id') !== String(track.id)) {
        url.searchParams.set('id', track.id);
        window.history.replaceState(window.history.state, '', url);
      }
      const trackLabel = track.artist ? `${track.title} by ${track.artist}` : track.title;
      document.title = `${trackLabel} | ${page.dataset.soundcloudBaseTitle}`;
    };

    const updateMediaSessionMetadata = () => {
      const track = tracks[activeTrackIndex];
      if (!mediaSession || !track) return;

      mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        artwork: track.artworkUrl ? [{ src: track.artworkUrl, sizes: '500x500', type: 'image/jpeg' }] : [],
      });
    };

    const updateMediaSessionPlaybackState = () => {
      if (mediaSession) mediaSession.playbackState = audio.paused || audio.ended ? 'paused' : 'playing';
    };

    const getMiniElements = () => byId('soundcloud-widget') && {
      artist: byId('soundcloud-mini-artist'),
      artLink: byId('soundcloud-mini-open'),
      artwork: byId('soundcloud-mini-artwork'),
      minimize: byId('soundcloud-widget-minimize'),
      panel: byId('soundcloud-widget-panel'),
      panelToggle: byId('soundcloud-mini-panel-toggle'),
      play: byId('soundcloud-mini-play'),
      title: byId('soundcloud-mini-title'),
      widget: byId('soundcloud-widget'),
    };

    const updateMiniControls = () => {
      const mini = getMiniElements();
      if (!mini) return;

      const artworkUrl = tracks[activeTrackIndex]?.artworkUrl;
      mini.widget.classList.toggle('is-playing', !audio.paused);
      setButtonLabel(mini.play, audio.paused ? 'Play' : 'Pause');
      mini.title.textContent = title.textContent;
      mini.artist.textContent = artist.textContent;
      mini.artLink.href = openLink.href;
      mini.artwork.hidden = !artworkUrl;
      if (artworkUrl) {
        mini.artwork.src = artworkUrl;
      } else {
        mini.artwork.removeAttribute('src');
      }
    };

    const setWidgetOpen = (isOpen, { persist = true } = {}) => {
      const mini = getMiniElements();
      if (!mini) return;

      if (persist) writeStored('sessionStorage', widgetStorageKey, isOpen);
      mini.panel.hidden = !isOpen;
      mini.widget.classList.toggle('is-open', isOpen);
      mini.panelToggle.setAttribute('aria-expanded', String(isOpen));
      mini.minimize.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) resumeSpectrum();
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
        artwork.src = track.artworkUrl;
        artwork.hidden = !(artwork.complete && artwork.naturalWidth);
      } else {
        showArtworkFallback();
      }

      [...trackList.children].forEach((trackButton, trackIndex) => {
        const isActive = trackIndex === activeTrackIndex;
        trackButton.classList.toggle('is-active', isActive);
        trackButton.setAttribute('aria-current', String(isActive));
      });
      updateMiniControls();
      updateMediaSessionMetadata();
      syncMusicPage();
    };

    const updatePlaybackModeControls = () => {
      shuffleButton.classList.toggle('is-active', isShuffleEnabled);
      shuffleButton.setAttribute('aria-pressed', String(isShuffleEnabled));
      setButtonLabel(shuffleButton, isShuffleEnabled ? 'Shuffle on' : 'Shuffle off');

      repeatButton.classList.toggle('is-active', repeatMode !== 'off');
      repeatButton.setAttribute('aria-pressed', String(repeatMode !== 'off'));
      player.classList.toggle('repeat-one', repeatMode === 'one');
      setButtonLabel(repeatButton, {
        all: 'Repeat all',
        one: 'Repeat current track',
        off: 'Repeat off',
      }[repeatMode]);
    };

    const writeSavedState = () => {
      const track = tracks[activeTrackIndex];
      if (!track) return;

      writeStored('localStorage', storageKey, {
        positionSeconds: (loadedTrackId === track.id && audio.currentTime) || resumeTime,
        repeatMode,
        shuffleEnabled: isShuffleEnabled,
        trackId: track.id,
      });
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
      if (loadedTrackId === track.id && audio.currentSrc && !audio.error) {
        if (shouldPlay) await playLoadedAudio();
        return;
      }

      const requestId = ++trackLoadRequestId;
      hlsInstance?.destroy();
      hlsInstance = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      loadedTrackId = null;

      let stream;
      try {
        const response = await fetch(`${apiBase}/tracks/${track.id}/stream`, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`Stream request failed with ${response.status}`);
        stream = await response.json();
        if (!stream.url) throw new Error('Stream response did not include a URL');
      } catch (error) {
        console.warn('[SoundCloud] Could not load this track.', error);
        return;
      }
      if (requestId !== trackLoadRequestId) return;

      loadedTrackId = track.id;
      const resolvedAt = Date.now();

      if (stream.protocol === 'hls' && window.Hls?.isSupported()) {
        hlsInstance = new Hls({ enableWorker: true, startPosition: resumeTime || -1 });
        hlsInstance.loadSource(stream.url);
        hlsInstance.attachMedia(audio);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
          if (requestId === trackLoadRequestId && shouldPlay) playLoadedAudio();
        });
        hlsInstance.on(Hls.Events.ERROR, (_event, errorData) => {
          if (requestId !== trackLoadRequestId || !errorData.fatal) return;

          console.warn('[SoundCloud] Could not play this stream.', errorData);
          loadedTrackId = null;
          resumeTime = audio.currentTime || resumeTime;
          if (Date.now() - resolvedAt >= 60_000) loadTrack(track, !audio.paused);
        });
        return;
      }

      audio.src = stream.url;
      if (resumeTime) audio.currentTime = resumeTime;
      if (shouldPlay) await playLoadedAudio();
    };

    const selectTrack = (trackIndex, shouldPlay) => {
      const track = tracks[trackIndex];
      if (!track) return;

      activeTrackIndex = trackIndex;
      resumeTime = 0;
      renderActiveTrack();
      setProgressTime(0, 0);
      writeSavedState();
      loadTrack(track, shouldPlay);
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

    const playCurrentTrack = () => {
      const track = tracks[activeTrackIndex];
      if (track) loadTrack(track, true);
    };

    const playNextTrack = () => {
      if (!tracks.length) return;

      const nextTrackIndex = getNextTrackIndex();
      if (nextTrackIndex !== null) {
        selectTrack(nextTrackIndex, true);
        return;
      }

      audio.pause();
      audio.currentTime = 0;
      resumeTime = 0;
      setProgressTime(0, 0);
      writeSavedState();
    };

    const playPreviousTrack = () => {
      if (tracks.length) selectTrack((activeTrackIndex - 1 + tracks.length) % tracks.length, true);
    };

    const togglePlayback = () => {
      if (audio.paused) {
        playCurrentTrack();
      } else {
        audio.pause();
      }
    };

    const restorePlayerState = () => {
      const savedState = readStored('localStorage', storageKey);
      const savedTrackIndex = tracks.findIndex((track) => String(track.id) === String(savedState?.trackId));
      const requestedTrackIndex = getRequestedTrackIndex();

      if (savedState) {
        isShuffleEnabled = Boolean(savedState.shuffleEnabled);
        repeatMode = ['all', 'one', 'off'].includes(savedState.repeatMode) ? savedState.repeatMode : 'all';
      }
      if (requestedTrackIndex >= 0 && requestedTrackIndex !== savedTrackIndex) {
        activeTrackIndex = requestedTrackIndex;
      } else if (savedTrackIndex >= 0) {
        activeTrackIndex = savedTrackIndex;
        resumeTime = Number(savedState.positionSeconds) || 0;
      }

      renderActiveTrack();
      updatePlaybackModeControls();
      setProgressTime(resumeTime, tracks[activeTrackIndex].duration / 1000);
    };

    const loadTracks = async () => {
      const response = await fetch(`${apiBase}/tracks`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Track request failed with ${response.status}`);

      const formatDate = (year, month, day) => (
        new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
          year: 'numeric',
        })
      );
      const formatTrackDate = (createdAt) => {
        const parts = String(createdAt).match(/^(\d{4})\/(\d{2})\/(\d{2})/);
        return parts ? formatDate(...parts.slice(1).map(Number)) : '';
      };
      const formatReleaseDate = (...parts) => {
        const [year, month, day] = parts.map(Number);
        return year && month && day ? formatDate(year, month, day) : '';
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

      if (!tracks.length) {
        title.textContent = 'No tracks found';
        artist.textContent = '';
        showArtworkFallback();
        return;
      }

      const htmlEscapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => htmlEscapes[char]);
      trackList.innerHTML = tracks.map((track, trackIndex) => `
        <button type="button" class="soundcloud-track" data-index="${trackIndex}">
          <span class="soundcloud-track-index">${String(trackIndex + 1).padStart(2, '0')}</span>
          <span class="soundcloud-track-meta">
            <span class="soundcloud-track-title">${escapeHtml(track.title)}</span>
            <span class="soundcloud-track-artist">${escapeHtml(track.artist)}</span>
          </span>
          <span class="soundcloud-track-duration">${formatDuration(track.duration)}</span>
        </button>
      `).join('');

      restorePlayerState();
    };

    const bindTrackPopups = () => {
      const popupRows = [
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
      const popup = document.createElement('div');
      popup.className = 'soundcloud-popup';
      popup.hidden = true;
      let popupTarget = null;

      const hidePopup = () => {
        popupTarget = null;
        popup.hidden = true;
      };

      const positionPopup = (point) => {
        const gap = 14;
        const edge = 12;
        const popupRect = popup.getBoundingClientRect();
        const targetRect = popupTarget.getBoundingClientRect();
        const anchorX = point?.x ?? targetRect.right;
        const anchorY = point?.y ?? targetRect.top + targetRect.height / 2;
        const left = anchorX + gap + popupRect.width + edge <= window.innerWidth
          ? anchorX + gap
          : Math.max(edge, anchorX - popupRect.width - gap);
        const top = Math.min(
          window.innerHeight - popupRect.height - edge,
          Math.max(edge, anchorY - popupRect.height / 2),
        );

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
      };

      const showPopup = (target, point) => {
        const track = tracks.find((item) => String(item.id) === target.dataset.soundcloudPopupTrack);
        if (!track) {
          hidePopup();
          return;
        }

        const content = document.createElement('div');
        const list = document.createElement('dl');
        content.className = 'soundcloud-popup-content';
        list.className = 'soundcloud-popup-list';

        if (track.artistAvatarUrl) {
          const avatar = document.createElement('img');
          avatar.className = 'soundcloud-popup-avatar';
          avatar.src = track.artistAvatarUrl;
          avatar.alt = '';
          content.append(avatar);
        }

        for (const [label, key] of popupRows) {
          const value = typeof track[key] === 'string' ? track[key].trim() : track[key];
          if (!value) continue;

          const term = document.createElement('dt');
          const description = document.createElement('dd');
          term.textContent = label;
          description.textContent = value;
          list.append(term, description);
        }
        content.append(list);

        popupTarget = target;
        popup.replaceChildren(content);
        if (!popup.isConnected) document.body.append(popup);
        popup.hidden = false;
        positionPopup(point);
      };

      const followPointer = (event) => {
        const target = closest(event.target, '[data-soundcloud-popup-track]');
        if (!target) return;

        const point = { x: event.clientX, y: event.clientY };
        if (target === popupTarget) {
          positionPopup(point);
        } else {
          showPopup(target, point);
        }
      };

      player.addEventListener('pointerover', followPointer);
      player.addEventListener('pointermove', followPointer);
      player.addEventListener('pointerout', (event) => {
        const target = closest(event.target, '[data-soundcloud-popup-track]');
        if (target && !target.contains(event.relatedTarget)) hidePopup();
      });
      player.addEventListener('focusin', (event) => {
        const target = closest(event.target, '[data-soundcloud-popup-track]');
        if (target) showPopup(target);
      });
      player.addEventListener('focusout', (event) => {
        if (closest(event.target, '[data-soundcloud-popup-track]')) hidePopup();
      });

      document.addEventListener('scroll', hidePopup, true);
      window.addEventListener('resize', hidePopup);
      document.addEventListener('turbo:before-render', hidePopup);
    };

    const bindSoundCloudWidget = () => {
      const mini = getMiniElements();
      if (!mini) return;

      if (!boundWidgets.has(mini.widget)) {
        boundWidgets.add(mini.widget);

        const actions = {
          'soundcloud-mini-prev': playPreviousTrack,
          'soundcloud-mini-play': togglePlayback,
          'soundcloud-mini-next': playNextTrack,
          'soundcloud-mini-panel-toggle': () => setWidgetOpen(byId('soundcloud-widget-panel').hidden),
          'soundcloud-widget-minimize': () => setWidgetOpen(false),
        };

        const blockPageScroll = (event) => {
          if (!closest(event.target, '.soundcloud-tracks')) event.preventDefault();
        };

        mini.widget.addEventListener('click', (event) => actions[closest(event.target, 'button')?.id]?.());
        mini.widget.addEventListener('wheel', blockPageScroll, { passive: false });
        mini.widget.addEventListener('touchmove', blockPageScroll, { passive: false });
      }

      setWidgetOpen(readStored('sessionStorage', widgetStorageKey) === true, { persist: false });
      updateMiniControls();
    };

    const handlePlaybackChange = () => {
      const isPlaying = !audio.paused;

      player.classList.toggle('is-playing', isPlaying);
      setButtonLabel(playButton, isPlaying ? 'Pause' : 'Play');
      updateMiniControls();
      updateMediaSessionPlaybackState();
      if (isPlaying) {
        startSpectrum();
      } else {
        stopSpectrum();
      }
      writeSavedState();
    };

    const getSeekTime = () => {
      const totalSeconds = audio.duration || tracks[activeTrackIndex]?.duration / 1000 || 0;
      return (Number(progress.value) / 1000) * totalSeconds;
    };

    updatePlaybackModeControls();
    updateMediaSessionPlaybackState();
    bindTrackPopups();
    bindSoundCloudWidget();

    if (mediaSession) {
      Object.entries({
        play: playCurrentTrack,
        pause: () => audio.pause(),
        previoustrack: playPreviousTrack,
        nexttrack: playNextTrack,
      }).forEach(([action, handler]) => {
        try {
          mediaSession.setActionHandler(action, handler);
        } catch (error) {
          console.warn(`[SoundCloud] Media Session action "${action}" is not available.`, error);
        }
      });
    }

    artwork.addEventListener('load', () => {
      artwork.hidden = false;
      artworkFallback.setAttribute('hidden', '');
    });
    artwork.addEventListener('error', showArtworkFallback);

    playButton.addEventListener('click', togglePlayback);
    previousButton.addEventListener('click', playPreviousTrack);
    nextButton.addEventListener('click', playNextTrack);
    shuffleButton.addEventListener('click', () => {
      isShuffleEnabled = !isShuffleEnabled;
      updatePlaybackModeControls();
      writeSavedState();
    });
    repeatButton.addEventListener('click', () => {
      repeatMode = { all: 'one', one: 'off', off: 'all' }[repeatMode];
      updatePlaybackModeControls();
      writeSavedState();
    });
    trackList.addEventListener('click', (event) => {
      const button = closest(event.target, '.soundcloud-track');
      if (button) selectTrack(Number(button.dataset.index), true);
    });

    audio.addEventListener('play', handlePlaybackChange);
    audio.addEventListener('pause', handlePlaybackChange);
    audio.addEventListener('ended', () => {
      updateMediaSessionPlaybackState();
      if (repeatMode !== 'one') {
        playNextTrack();
        return;
      }

      audio.currentTime = 0;
      resumeTime = 0;
      playLoadedAudio();
    });
    audio.addEventListener('timeupdate', () => {
      if (!isSeeking && audio.duration) setProgressTime(audio.currentTime, audio.duration);
    });
    audio.addEventListener('durationchange', () => {
      if (audio.duration) duration.textContent = formatTime(audio.duration);
    });
    audio.addEventListener('error', () => {
      resumeTime = audio.currentTime || resumeTime;
      loadedTrackId = null;
      updateMediaSessionPlaybackState();
    });

    progress.addEventListener('input', () => {
      isSeeking = true;
      elapsed.textContent = formatTime(getSeekTime());
    });
    progress.addEventListener('change', () => {
      resumeTime = getSeekTime();
      isSeeking = false;
      if (audio.duration) audio.currentTime = resumeTime;
      writeSavedState();
    });

    window.addEventListener('pagehide', writeSavedState);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') writeSavedState();
    });
    document.addEventListener('turbo:load', () => {
      const requestedTrackIndex = getRequestedTrackIndex();

      bindSoundCloudWidget();
      resumeSpectrum();
      if (requestedTrackIndex >= 0 && requestedTrackIndex !== activeTrackIndex) {
        selectTrack(requestedTrackIndex, false);
      } else {
        syncMusicPage();
      }
    });

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
