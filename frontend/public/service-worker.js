// TANBIH Service Worker for Push Notifications

self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activated');
    event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
    console.log('Push notification received:', event);

    let data = {
        title: 'TANBIH Notification',
        body: 'You have a new alert',
        icon: '/tanbih-mark.svg',
        badge: '/tanbih-mark.svg',
        vibrate: [200, 100, 200, 100, 200],
        tag: 'tanbih-notification',
        requireInteraction: true
    };

    try {
        if (event.data) {
            const payload = event.data.json();
            data = { ...data, ...payload };
        }
    } catch (e) {
        console.log('Push data parse error:', e);
        if (event.data) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/tanbih-mark.svg',
        badge: data.badge || '/tanbih-mark.svg',
        vibrate: data.vibrate || [200, 100, 200],
        tag: data.tag || 'tanbih',
        requireInteraction: data.requireInteraction !== false,
        data: data.data || {},
        actions: data.actions || [
            { action: 'view', title: 'View Details' },
            { action: 'dismiss', title: 'Dismiss' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('Notification clicked:', event);

    event.notification.close();

    const action = event.action;
    const data = event.notification.data || {};

    if (action === 'dismiss') {
        return;
    }

    // Open or focus the app
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // If there's already a window open, focus it
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Otherwise open a new window
                if (clients.openWindow) {
                    const url = data.url || '/dashboard';
                    return clients.openWindow(url);
                }
            })
    );
});

self.addEventListener('notificationclose', (event) => {
    console.log('Notification closed:', event);
});
