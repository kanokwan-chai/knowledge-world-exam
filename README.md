# Knowledge World — Real-time Gamified Quiz & RPG Learning Platform

แพลตฟอร์มเกมตอบคำถามเพื่อการเรียนรู้รูปแบบ **Colorful 3D-Style Platform Adventure Quiz & RPG** พัฒนาด้วย **React + TypeScript + Vite + Tailwind CSS + Framer Motion + Supabase (PostgreSQL, Auth, Realtime Broadcast & Presence, Storage, Server-side SECURITY DEFINER RPCs)** พร้อมใช้งานบน **Vercel**

---

## โครงสร้างโปรเจกต์ (Project Structure)

```text
Knowledge world/
├── supabase/
│   └── migrations/
│       ├── 001_schema.sql              # 25 ตารางหลัก, Foreign Keys, Constraints, Indexes
│       ├── 002_rpc_and_security.sql    # Row Level Security (RLS) ครบทุกตาราง + 9 Server RPCs
│       └── 003_seed_data.sql           # ข้อมูลเริ่มต้น Level 1-100, 6 RPG Powers, 20 Avatar Items, Missions
├── src/
│   ├── components/
│   │   ├── avatar/AvatarRenderer.tsx   # ระบบสร้างและแสดงผลตัวละคร Original 3D-Cartoon Avatar
│   │   ├── luckyblock/LuckyBlockModal.tsx # ระบบเปิดกล่องสุ่ม Lucky Block (?) ด้วย Server RPC
│   │   └── ui/WorldDecorations.tsx     # องค์ประกอบโลกเกม + ระบบแจ้งเตือน Auto-Reconnect
│   ├── context/AuthContext.tsx         # ระบบจัดการสิทธิ์ Teacher / Student / Guest Session
│   ├── lib/supabase.ts                 # การเชื่อมต่อ Supabase Client & Realtime Config
│   ├── pages/
│   │   ├── LandingPage.tsx             # หน้าแรก เข้าร่วมด้วย Game PIN / QR + เข้าสู่ระบบ
│   │   ├── TeacherDashboard.tsx        # ระบบจัดการห้องเรียน ชุดคำถาม กราฟวิเคราะห์ และรายงาน CSV
│   │   ├── TeacherGameHostPage.tsx     # หน้าจอควบคุมเกม Real-time, QR Code, กราฟคำตอบ, Podium
│   │   ├── StudentGamePlayPage.tsx     # หน้าจอผู้เล่น Real-time, กดใช้ RPG Power, แสดงคะแนนทันที
│   │   └── StudentDashboard.tsx        # หน้าโปรไฟล์นักเรียน, แต่ง Avatar, ร้านค้า, ภารกิจ, อันดับสะสม
│   ├── services/gameEngineService.ts   # บริการเชื่อมต่อฐานข้อมูล, Realtime Channels, RPCs, CSV Export
│   ├── types/database.ts               # TypeScript Interfaces สำหรับ 25 ตารางและเหตุการณ์เกม
│   └── __tests__/knowledgeWorld.test.ts # ชุดทดสอบอัตโนมัติ (Vitest)
├── .env.example                        # ตัวอย่างไฟล์ตั้งค่า Environment Variables
├── vercel.json                         # ตั้งค่า SPA Routing สำหรับ Vercel
└── package.json
```

---

## วิธีติดตั้งและใช้งาน (Installation & Setup)

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. ตั้งค่าฐานข้อมูล Supabase
1. สร้างโปรเจกต์ใหม่บน [Supabase](https://supabase.com)
2. เปิด **SQL Editor** และรันไฟล์ตามลำดับ:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_rpc_and_security.sql`
   - `supabase/migrations/003_seed_data.sql`
3. เปิดใช้งาน **Realtime** สำหรับตาราง `game_rooms`, `game_participants`, และ `game_answers` ในเมนู `Database -> Publications -> supabase_realtime`
4. (สำหรับคำถามรูปภาพ) สร้าง Public Storage Bucket ชื่อ `knowledge-world-assets`

### 3. ตั้งค่า Environment Variables
คัดลอกไฟล์ `.env.example` เป็น `.env`:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_APP_URL=http://localhost:5173
```
*(ห้ามใส่ `service_role` secret key ลงใน Frontend เด็ดขาด)*

### 4. รันระบบในเครื่อง (Local Development)
```bash
npm run dev
```

### 5. รันการทดสอบและตรวจสอบ Production Build
```bash
npm run test
npm run build
```
