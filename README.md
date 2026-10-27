# 🥛 Farm Fresh Chocolate Milk & Cold-Chain Admin Portal

> A luxury web experience and cold-chain order management system for Farm Fresh Chocolate Milk, featuring interactive high-speed canvas scroll storytelling, Firebase Authentication, Cloud Firestore real-time data persistence, and an Administrative Control Portal.

---

## 🌟 Key Features

### 1. Interactive 4K Canvas Scroll Experience
- Fluid, frame-by-frame scrubbing animation showcasing the pouring, rich velvety texture, and farm pasture origin of Farm Fresh Chocolate Milk.
- Responsive WebGL / HTML5 Canvas rendering optimized for 60fps across mobile and desktop.
- Rich cocoa dark mode aesthetic with amber gold accents and glassmorphic micro-interactions.

### 2. User Authentication & Member Portal
- **Email/Password & Google Sign-In**: Integrated with Firebase Authentication.
- **Fail-Safe Session Persistence**: LocalStorage caching guarantees instant load and offline resilience.
- **Member Order History**: View all past orders, delivery addresses, and real-time cold-chain fulfillment tracking.

### 3. Cold-Chain Checkout & Ordering
- Multi-flavor selection (*Chocolate Flavoured Milk, Pure Fresh Milk, Kurma Dates Milk, Cafe Latte*).
- Flexible packaging (*Single 200ml Bottle, Chill Pack of 6, Master Carton of 24*).
- Direct Firestore sync with 4°C chilled protection guarantee.

### 4. Dedicated Administrator Control Center (`admin.html`)
- **Restricted Access**: Exclusively authorized for `liro7569@gmail.com`.
- **Live Cold-Chain Metrics**: Total orders, pending approval counter, in-transit units, and gross revenue.
- **Order Management & One-Click Approval**:
  - Filter orders by status (*Pending, Approved, In Transit, Delivered, Cancelled*).
  - One-click **"✓ Approve"** action for instant packaging queueing.
  - Live search across Order IDs, customer names, emails, flavors, and delivery destinations.
  - Detailed cold-chain manifest viewer and order deletion.
- **Admin Order Entry**: Manually create and dispatch wholesale, depot walk-in, or phone orders directly from the admin panel.

---

## 🚀 Quick Start / Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/liro7569-del/Farm-Fresh-Milk.git
   cd Farm-Fresh-Milk
   ```

2. **Start the local server**:
   ```bash
   python server.py
   ```

3. **Open in browser**:
   - Customer Storefront: [http://localhost:3000](http://localhost:3000)
   - Admin Portal: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

---

## ☁️ Deploy to Vercel

This repository is pre-configured with `vercel.json` for zero-configuration, instant deployment on [Vercel](https://vercel.com):

1. Push this repository to your GitHub account.
2. Go to [vercel.com/new](https://vercel.com/new).
3. Import the `Farm-Fresh-Milk` repository.
4. Leave all build settings at default (Static site).
5. Click **Deploy**!

Vercel will automatically serve:
- `https://your-domain.vercel.app/` &rarr; Customer Storefront
- `https://your-domain.vercel.app/admin` &rarr; Admin Portal

---

## 🔐 Administrator Credentials

| Role | Email | Password |
| :--- | :--- | :--- |
| **Primary Administrator** | `liro7569@gmail.com` | `eblmj055557ab` |

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla CSS3 (Custom Glassmorphism Design System), JavaScript (ES Modules)
- **Animation**: HTML5 Canvas 2D/WebGL Scroll Story Engine
- **Backend / BaaS**: Google Firebase Authentication & Cloud Firestore
- **Deployment**: Vercel ready with custom route configurations (`vercel.json`)

---

&copy; 2026 Farm Fresh Dairy. Crafted with 100% fresh dairy and premium cocoa.
