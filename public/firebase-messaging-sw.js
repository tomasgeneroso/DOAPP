/**
 * Firebase Cloud Messaging Service Worker
 * Handles push notifications when the app is in the background or closed
 */

// Give the service worker access to Firebase Messaging
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyCwqJITo8rB26m8id2RZeK7yVq00cWPCiU",
  authDomain: "doapp-f7506.firebaseapp.com",
  projectId: "doapp-f7506",
  storageBucket: "doapp-f7506.firebasestorage.app",
  messagingSenderId: "464269120979",
  appId: "1:464269120979:web:4b8db1890e27ad53cbcb26",
  measurementId: "G-PKXWQFPCN0"
});

// Retrieve Firebase Messaging instance
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('📬 Background notification received:', payload);

  const notificationTitle = payload.notification?.title || 'DOAPP Notification';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: payload.notification?.icon || '/logo.png',
    badge: '/logo.png',
    tag: payload.messageId,
    data: payload.data || {},
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  // Show notification
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Notification clicked:', event.notification.tag);

  event.notification.close();

  // Get the URL from notification data
  const urlToOpen = event.notification.data?.url || '/';

  // Open the app or focus existing window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window open
        for (let client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            client.navigate(urlToOpen);
            return;
          }
        }

        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
