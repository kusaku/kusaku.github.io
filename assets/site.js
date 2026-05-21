(() => {
  const getSystemPreference = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

  const applyTheme = () => {
    const theme = localStorage.theme ?? 'system';
    const isDark = theme === 'system' ? getSystemPreference() : theme === 'dark';
    document.documentElement.classList.toggle('light', !isDark);
    document.documentElement.classList.toggle('dark', isDark);
    ['system', 'light', 'dark'].forEach((key) => {
      const btn = document.getElementById(`theme-${key}`);
      if (btn) btn.classList.toggle('theme-active', key === theme);
    });
  };

  const setTheme = (theme) => {
    if (theme === 'system') {
      localStorage.removeItem('theme');
    } else {
      localStorage.theme = theme;
    }
    applyTheme();
  };

  const initMagnifiers = () => {
    document.querySelectorAll('[data-site-magnify]').forEach((container) => {
      const img = container.querySelector('[data-site-magnify-image]');
      const lens = container.querySelector('[data-site-magnify-lens]');
      if (!img || !lens || container.dataset.siteMagnifyReady === 'true') return;

      container.dataset.siteMagnifyReady = 'true';
      const setup = () => {
        const { naturalWidth, naturalHeight } = img;
        const { width: displayWidth } = img.getBoundingClientRect();
        if (!naturalWidth || !displayWidth) {
          window.setTimeout(setup, 50);
          return;
        }

        lens.replaceChildren();
        const zoomImg = img.cloneNode(true);
        zoomImg.className = 'site-magnify-lens-img';
        zoomImg.removeAttribute('data-site-magnify-image');
        Object.assign(zoomImg.style, {
          width: `${naturalWidth}px`,
          height: `${naturalHeight}px`,
        });
        lens.appendChild(zoomImg);

        const updateLens = (clientX, clientY) => {
          const bounds = img.getBoundingClientRect();
          lens.style.display = 'block';
          const lensBounds = lens.getBoundingClientRect();
          const half = lensBounds.width / 2 || 200;
          lens.style.left = `${clientX - half}px`;
          lens.style.top = `${clientY - half}px`;
          zoomImg.style.left = `${half - ((clientX - bounds.left) * naturalWidth / bounds.width)}px`;
          zoomImg.style.top = `${half - ((clientY - bounds.top) * naturalHeight / bounds.height)}px`;
        };

        const hideLens = () => {
          lens.style.display = 'none';
        };

        container.addEventListener('mousemove', ({ clientX, clientY }) => updateLens(clientX, clientY));
        container.addEventListener('mouseleave', hideLens);
        container.addEventListener('touchstart', (event) => {
          event.preventDefault();
          updateLens(event.touches[0].clientX, event.touches[0].clientY);
        }, { passive: false });
        container.addEventListener('touchmove', (event) => {
          event.preventDefault();
          updateLens(event.touches[0].clientX, event.touches[0].clientY);
        }, { passive: false });
        container.addEventListener('touchend', hideLens);
      };

      img.complete ? setup() : img.addEventListener('load', setup, { once: true });
    });
  };

  const openBio = () => {
    const modal = document.getElementById('bio-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  const closeBio = () => {
    document.getElementById('bio-modal')?.classList.add('hidden');
    document.body.style.overflow = '';
  };

  const initBio = () => {
    const modal = document.querySelector('[data-bio-modal]');
    const toggle = document.getElementById('bio-toggle');

    if (toggle && toggle.dataset.bioReady !== 'true') {
      toggle.dataset.bioReady = 'true';
      toggle.addEventListener('click', openBio);
    }

    if (modal && modal.dataset.bioReady !== 'true') {
      modal.dataset.bioReady = 'true';
      modal.addEventListener('click', (event) => {
        if (event.target === modal) closeBio();
      });
    }

    document.querySelectorAll('[data-bio-close]').forEach((button) => {
      if (button.dataset.bioReady === 'true') return;
      button.dataset.bioReady = 'true';
      button.addEventListener('click', closeBio);
    });
  };

  const init = () => {
    applyTheme();
    initBio();
    initMagnifiers();
    ['system', 'light', 'dark'].forEach((theme) => {
      const button = document.getElementById(`theme-${theme}`);
      if (!button || button.dataset.themeReady === 'true') return;
      button.dataset.themeReady = 'true';
      button.addEventListener('click', () => setTheme(theme));
    });
    if (!window.kusakuThemePreferenceListener) {
      window.kusakuThemePreferenceListener = () => {
        if (!localStorage.theme || localStorage.theme === 'system') applyTheme();
      };
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', window.kusakuThemePreferenceListener);
    }
    if (!window.kusakuBioEscapeListener) {
      window.kusakuBioEscapeListener = (event) => {
        if (event.key === 'Escape') closeBio();
      };
      document.addEventListener('keydown', window.kusakuBioEscapeListener);
    }
  };

  const resetReadyFlags = (element) => {
    delete element.dataset.themeReady;
    delete element.dataset.bioReady;
    delete element.dataset.siteMagnifyReady;
    delete element.dataset.soundcloudReady;
    delete element.dataset.soundcloudScrollReady;
  };

  const resetTurboCachedState = () => {
    document.querySelectorAll('[data-site-magnify-lens]').forEach((lens) => lens.replaceChildren());
    document
      .querySelectorAll('[data-theme-ready], [data-bio-ready], [data-site-magnify-ready], [data-soundcloud-ready], [data-soundcloud-scroll-ready]')
      .forEach(resetReadyFlags);
  };

  applyTheme();

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
  document.addEventListener('turbo:load', init);
  document.addEventListener('turbo:before-cache', resetTurboCachedState);
})();
