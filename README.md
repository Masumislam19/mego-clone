# MegoClone — Video Chat MVP (with Auth + Block/Report)

WebRTC + Socket.IO দিয়ে বানানো video chat app, এখন সাথে email/password login এবং block/report ফিচার।

## যা যা আছে
- **Email/password signup ও login** (bcrypt দিয়ে পাসওয়ার্ড হ্যাশ করা, session-based auth)
- Interest-tag ম্যাচিং (না দিলে random match)
- Real-time HD video call (peer-to-peer, WebRTC)
- সাথে টেক্সট চ্যাট
- Skip / Next বাটন
- **Block** — একবার ব্লক করলে সেই ইউজারের সাথে আর কখনো ম্যাচ হবে না
- **Report** — কারণ সহ রিপোর্ট সাবমিট হয়, ডাটাবেজে জমা থাকে

## যা যা এখনো নাই
- প্রোফাইল পিকচার, ভার্চুয়াল গিফট/কয়েন সিস্টেম
- কন্টেন্ট মডারেশন (নগ্নতা/হয়রানি অটো-ডিটেকশন)
- Admin panel (রিপোর্ট রিভিউ করার UI — এখন শুধু ডাটাবেজে জমা হয়)

## নতুন ফাইল স্ট্রাকচার

```
mego-clone/
├── db.js              ← SQLite ডাটাবেজ সেটআপ (users, blocks, reports টেবিল)
├── auth.js            ← signup/login/logout API রুট
├── server.js          ← মূল সার্ভার (আগেরটা replace হয়েছে)
├── package.json       ← নতুন dependency যোগ হয়েছে
├── README.md
└── public/
    ├── login.html      ← নতুন: লগইন/সাইনআপ পেজ
    ├── index.html      ← আপডেট: logout/block/report বাটন যোগ হয়েছে
    ├── client.js        ← আপডেট: auth check + block/report লজিক
    └── style.css        ← আপডেট: auth পেজ + নতুন বাটনের স্টাইল
```

## লোকালি রান করা

```bash
npm install
npm start
```

প্রথমবার `localhost:3000` খুললে লগইন পেজে (`/login.html`) রিডাইরেক্ট হবে। "Sign Up" ট্যাব থেকে একটা একাউন্ট বানান, তারপর লগইন হয়ে যাবে অটোমেটিক।

## গুরুত্বপূর্ণ টেকনিক্যাল নোট

### SQLite ডাটাবেজ ফাইল (data.db)
প্রথমবার সার্ভার চালু হলে `data.db` নামে একটা ফাইল অটো তৈরি হবে — এখানেই সব ইউজার/ব্লক/রিপোর্ট ডাটা থাকে। এই ফাইলটা `.gitignore`-এ রাখা ভালো (GitHub-এ আপলোড করার দরকার নেই)।

### ⚠️ Render Free Plan-এ ডাটা হারিয়ে যাওয়া (গুরুত্বপূর্ণ)
Render-এর ফ্রি টায়ারের ফাইল সিস্টেম **ephemeral** — মানে প্রতিবার নতুন deploy করলে বা সার্ভার sleep থেকে জাগলে `data.db` ফাইল **মুছে যেতে পারে**, সব ইউজার একাউন্ট হারিয়ে যাবে। টেস্টিং-এর জন্য ঠিক আছে, কিন্তু real user-দের জন্য চালু রাখতে চাইলে পরে Render-এর ফ্রি PostgreSQL অথবা persistent disk (paid) লাগবে।

### SESSION_SECRET Environment Variable
কোডে একটা ডিফল্ট session secret বসানো আছে (`dev-secret-change-this-in-production`)। Render-এ deploy করার সময় ভালো practice হলো একটা নিজের secret সেট করা:
- Render dashboard → আপনার service → **Environment** ট্যাব → **Add Environment Variable**
- Key: `SESSION_SECRET`, Value: যেকোনো লম্বা random string

এটা optional (না করলেও কাজ করবে), কিন্তু নিরাপত্তার জন্য ভালো।

### better-sqlite3 বিল্ড
এটা একটা native module (C++ code compile হয়)। Render-এ `npm install` এর সময় এটা অটো compile হওয়ার কথা। যদি deploy fail করে "better-sqlite3" নিয়ে এরর দেখায়, তাহলে জানাবেন — বিকল্প (pure JS) ডাটাবেজ প্যাকেজে সুইচ করা যাবে।

## GitHub-এ আপডেট করার নিয়ম (মোবাইল থেকে)
আগের মতোই — GitHub repo-তে গিয়ে **Add file → Upload files**, তারপর:
- **নতুন ফাইল** (`db.js`, `auth.js`, `public/login.html`): সরাসরি upload করুন, `public/` এর ভেতরেরটার জন্য filename-এ `public/` প্রিফিক্স দিন (আগের মতোই)
- **আগের ফাইল আপডেট** (`server.js`, `package.json`, `public/index.html`, `public/client.js`, `public/style.css`): একই নামে নতুন ফাইল upload করলে GitHub এটা অটো **overwrite** (রিপ্লেস) করে দেবে — আলাদা কিছু করা লাগবে না, শুধু commit করুন

আপলোড শেষে Render dashboard-এ গিয়ে **Manual Deploy → Deploy latest commit** ক্লিক করলে নতুন কোড লাইভ হবে (অথবা auto-deploy অন থাকলে এমনিই হয়ে যাবে GitHub push হওয়ার পর)।

## পরবর্তী ধাপ (Roadmap)
1. Persistent database (Render free PostgreSQL) যাতে redeploy-তে ডাটা না হারায়
2. Admin panel — রিপোর্ট হওয়া ইউজারদের রিভিউ করার UI
3. প্রোফাইল পিকচার আপলোড
4. Content moderation (Google Cloud Vision)
5. Virtual gift/coin economy
