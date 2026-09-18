// 1. Nhập các thư viện Firebase SDK bằng importScripts (tránh lỗi import ES Module)
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// 2. Khởi tạo Firebase App trong Service Worker
const firebaseConfig = {
  apiKey: "AIzaSyCWDybmAejsQX0f9lwd6c0X0f9lwd6cX0f9wd6cX0f9wd6cX0",
  authDomain: "a8thcscl2.firebaseapp.com",
  projectId: "a8thcscl2",
  storageBucket: "a8thcscl2.firebasestorage.app",
  messagingSenderId: "271886897885",
  appId: "1:271886897885:web:d8fc19828db5921d9bc134",
  measurementId: "G-KZP06LF2Z4"
};

firebase.initializeApp(firebaseConfig);

// 3. Khởi tạo Firebase Messaging
const messaging = firebase.messaging();

// 4. Xử lý nhận thông báo khi ứng dụng chạy ở nền (Background Notification)
messaging.onBackgroundMessage((payload) => {
  console.log('[service-worker.js] Nhận thông báo nền:', payload);

  const notificationTitle = payload.notification?.title || 'Thông báo mới từ 8A8';
  const notificationOptions = {
    body: payload.notification?.body || 'Bạn có thông báo mới.',
    icon: '/icon-192.png', // Đảm bảo đã upload icon này lên root
    badge: '/icon-192.png',
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 5. Cấu hình Cache Offline cho PWA (Tùy chọn)
const CACHE_NAME = '8a8-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/admin.html',
  '/manifest.webmanifest'
];

// Cài đặt Service Worker và lưu cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[service-worker.js] Đang lưu tĩnh tài nguyên vào Cache');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[service-worker.js] Một số file cache thất bại:', err);
      });
    })
  );
  self.skipWaiting();
});

// Kích hoạt Service Worker và dọn dẹp cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[service-worker.js] Xóa cache cũ:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Xử lý sự kiện click vào thông báo
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
