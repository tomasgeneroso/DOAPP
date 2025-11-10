/**
 * Firebase Configuration for DOAPP
 * Handles push notifications (FCM) only
 *
 * Note: We use Google Analytics (client/utils/analytics.ts) for analytics tracking,
 * so Firebase Analytics is not needed.
 */

import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";

// Firebase configuration from Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyCwqJITo8rB26m8id2RZeK7yVq00cWPCiU",
  authDomain: "doapp-f7506.firebaseapp.com",
  projectId: "doapp-f7506",
  storageBucket: "doapp-f7506.firebasestorage.app",
  messagingSenderId: "464269120979",
  appId: "1:464269120979:web:4b8db1890e27ad53cbcb26",
  measurementId: "G-PKXWQFPCN0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging
let messaging: Messaging | null = null;

// Only initialize messaging if supported (not in SSR)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.error('Error initializing Firebase Messaging:', error);
  }
}

/**
 * Request permission for notifications and get FCM token
 * @returns FCM token or null if permission denied
 */
export const requestNotificationPermission = async (): Promise<string | null> => {
  if (!messaging) {
    console.warn('Firebase Messaging not initialized');
    return null;
  }

  try {
    // Request notification permission
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      console.log('✅ Notification permission granted');

      // Get FCM token
      // VAPID key from Firebase Console: Settings → Cloud Messaging → Web Push certificates
      const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

      if (!vapidKey) {
        console.error('❌ VAPID key not configured. Set VITE_FIREBASE_VAPID_KEY in .env');
        return null;
      }

      const token = await getToken(messaging, { vapidKey });

      if (token) {
        console.log('📱 FCM Token:', token);
        return token;
      } else {
        console.log('⚠️ No registration token available');
        return null;
      }
    } else if (permission === 'denied') {
      console.log('❌ Notification permission denied');
      // Save permanent denial
      localStorage.setItem('fcm_permission_denied', 'true');
      return null;
    } else {
      console.log('⏸️ Notification permission dismissed');
      return null;
    }
  } catch (error) {
    console.error('Error getting notification permission:', error);
    return null;
  }
};

/**
 * Register FCM token with backend
 * @param token FCM token
 */
export const registerFCMToken = async (token: string): Promise<boolean> => {
  try {
    const response = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ fcmToken: token }),
    });

    const data = await response.json();

    if (data.success) {
      console.log('✅ FCM token registered with backend');
      return true;
    } else {
      console.error('❌ Failed to register FCM token:', data.message);
      return false;
    }
  } catch (error) {
    console.error('Error registering FCM token:', error);
    return false;
  }
};

/**
 * Setup foreground message handler
 * This handles notifications when the app is open
 */
export const setupForegroundMessageHandler = () => {
  if (!messaging) {
    return;
  }

  onMessage(messaging, (payload) => {
    console.log('📬 Foreground notification received:', payload);

    // Show notification
    const { title, body, icon } = payload.notification || {};

    if (title) {
      // You can use a toast notification library here
      // or create a custom in-app notification
      console.log('Notification:', title, body);

      // Example: Show browser notification even when app is open
      if (Notification.permission === 'granted') {
        new Notification(title, {
          body: body || '',
          icon: icon || '/logo.png',
          badge: '/logo.png',
          tag: payload.messageId,
        });
      }
    }
  });
};

/**
 * Check if we should show notification permission modal
 * @returns true if we should show the modal
 */
export const shouldShowNotificationModal = (): boolean => {
  // Check if browser supports notifications
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return false;
  }

  // Check if already granted
  if (Notification.permission === 'granted') {
    return false;
  }

  // Check if permanently denied
  if (localStorage.getItem('fcm_permission_denied') === 'true') {
    return false;
  }

  // Check if already asked recently
  const lastAsked = localStorage.getItem('fcm_last_asked');
  if (lastAsked) {
    const timeSinceLastAsk = Date.now() - parseInt(lastAsked, 10);
    // Don't ask again if less than 24 hours have passed
    if (timeSinceLastAsk < 24 * 60 * 60 * 1000) {
      return false;
    }
  }

  return true;
};

/**
 * Mark that we asked for permission
 */
export const markNotificationAsked = (): void => {
  localStorage.setItem('fcm_last_asked', Date.now().toString());
};

/**
 * Initialize Firebase notifications with modal flow
 * This should be triggered by the modal accept button
 */
export const initializeNotifications = async (): Promise<boolean> => {
  console.log('🔔 Initializing push notifications...');

  // Check if browser supports notifications
  if (!('Notification' in window)) {
    console.warn('⚠️ This browser does not support notifications');
    return false;
  }

  // Check if service workers are supported
  if (!('serviceWorker' in navigator)) {
    console.warn('⚠️ This browser does not support service workers');
    return false;
  }

  try {
    // Request permission and get token
    const token = await requestNotificationPermission();

    if (token) {
      // Register token with backend
      await registerFCMToken(token);

      // Setup foreground message handler
      setupForegroundMessageHandler();

      console.log('✅ Push notifications initialized successfully');
      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ Error initializing notifications:', error);
    return false;
  }
};

export { app, messaging };
