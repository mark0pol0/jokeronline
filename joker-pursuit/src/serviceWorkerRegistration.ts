const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
    )
);

const isSecureProtocol = window.location.protocol === 'https:' || isLocalhost;

export const registerServiceWorker = (): void => {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (!('serviceWorker' in navigator) || !isSecureProtocol) {
    return;
  }

  const publicUrl = process.env.PUBLIC_URL || '';
  const serviceWorkerUrl = `${publicUrl}/service-worker.js`;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(serviceWorkerUrl)
      .catch((error: unknown) => {
        console.error('Service worker registration failed:', error);
      });
  });
};

export const unregisterServiceWorker = (): void => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.ready
    .then((registration) => {
      registration.unregister();
    })
    .catch((error: unknown) => {
      console.error('Service worker unregistration failed:', error);
    });
};
