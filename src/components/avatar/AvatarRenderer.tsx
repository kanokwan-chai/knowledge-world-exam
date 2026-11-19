import React from 'react';
import { motion } from 'framer-motion';
import { AvatarConfig, AvatarItem } from '../../types/database';

export const BUILTIN_AVATAR_CATALOG: AvatarItem[] = [
  // ================= 1. GENDER (2) =================
  { id: 'g1', code: 'male', name: 'เด็กชายพิกเซล (Pixel Boy)', slot: 'gender', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#60A5FA', svg_key: 'gender_male', is_starter: true },
  { id: 'g2', code: 'female', name: 'เด็กหญิงพิกเซล (Pixel Girl)', slot: 'gender', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#F472B6', svg_key: 'gender_female', is_starter: true },

  // ================= 2. SKIN TONES (6) =================
  { id: 'b1', code: 'explorer_red', name: 'ผิวขาวอมชมพู (Porcelain)', slot: 'base_character', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FFEAE6', svg_key: 'base_red', is_starter: true },
  { id: 'b2', code: 'explorer_blue', name: 'ผิวละมุนอมส้ม (Soft Apricot)', slot: 'base_character', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FDE2C8', svg_key: 'base_blue', is_starter: true },
  { id: 'b3', code: 'explorer_green', name: 'ผิวน้ำผึ้งอุ่น (Warm Honey)', slot: 'base_character', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#E8BC96', svg_key: 'base_green', is_starter: true },
  { id: 'b5', code: 'skin_milk', name: 'ผิวขาวน้ำนม (Milky Snow)', slot: 'base_character', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FFF8F6', svg_key: 'base_milk', is_starter: true },
  { id: 'b6', code: 'skin_tan', name: 'ผิวแทนอบอุ่น (Warm Caramel)', slot: 'base_character', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#D4A078', svg_key: 'base_tan', is_starter: true },
  { id: 'b4', code: 'explorer_gold', name: 'ผิวออร่าสตาร์ไลท์ (Starlight)', slot: 'base_character', rarity: 'legendary', price_coins: 1200, required_level: 10, preview_color: '#FFF5D6', svg_key: 'base_gold', is_starter: true },

  // ================= 3. FACIAL EXPRESSIONS (10) =================
  { id: 'f1', code: 'face_happy', name: 'ตาโตใสวิ้ง (Sparkle Eyes)', slot: 'face', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#60A5FA', svg_key: 'face_happy', is_starter: true },
  { id: 'f2', code: 'face_wink', name: 'ขยิบตาคิวท์ (Cute Wink)', slot: 'face', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#F472B6', svg_key: 'face_wink', is_starter: true },
  { id: 'f3', code: 'face_kawaii', name: 'ตาดาวปากแมว (Star Kawaii)', slot: 'face', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#C084FC', svg_key: 'face_kawaii', is_starter: true },
  { id: 'f4', code: 'face_hero', name: 'ตาครึ่งหลับสุดชิค (Dreamy Chic)', slot: 'face', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#6366F1', svg_key: 'face_hero', is_starter: true },
  { id: 'f5', code: 'face_joy_laugh', name: 'ยิ้มตาหยีมีความสุข (Happy Smile)', slot: 'face', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#34D399', svg_key: 'face_joy_laugh', is_starter: true },
  { id: 'f6', code: 'face_cool_smirk', name: 'ยิ้มมุมปากสุดเท่ (Cool Smirk)', slot: 'face', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#475569', svg_key: 'face_cool_smirk', is_starter: true },
  { id: 'f7', code: 'face_shy', name: 'หน้าแดงเขินอาย (Blushing Shy)', slot: 'face', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FDA4AF', svg_key: 'face_shy', is_starter: true },
  { id: 'f8', code: 'face_cat', name: 'ตาแมวเหมียว (Kitty Face)', slot: 'face', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#F59E0B', svg_key: 'face_cat', is_starter: true },
  { id: 'f9', code: 'face_sleepy', name: 'ตาง่วงนอนน่ารัก (Sleepy Cute)', slot: 'face', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#93C5FD', svg_key: 'face_sleepy', is_starter: true },
  { id: 'f10', code: 'face_sparkle_blue', name: 'ตาสีฟ้าประกายเพชร (Diamond Blue)', slot: 'face', rarity: 'rare', price_coins: 0, required_level: 1, preview_color: '#38BDF8', svg_key: 'face_sparkle_blue', is_starter: true },

  // ================= 4. HAIRSTYLES — BOY & GIRL (14) =================
  { id: 'h0', code: 'wavy_crimson', name: 'หญิง: ผมลอนยาวสีแดงเชอร์รี่', slot: 'hair', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#B91C1C', svg_key: 'hair_wavy_crimson', is_starter: true },
  { id: 'h2', code: 'twin_gold', name: 'หญิง: ผมยาวลอนสีบลอนด์ครีม', slot: 'hair', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FEF3C7', svg_key: 'hair_twin_gold', is_starter: true },
  { id: 'h4', code: 'ponytail_sport', name: 'หญิง: ผมมัดแกละชมพูพาสเทล', slot: 'hair', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#F472B6', svg_key: 'hair_ponytail_sport', is_starter: true },
  { id: 'h3', code: 'bob_cute', name: 'หญิง: ผมบ็อบหน้าม้าดำ-เทา', slot: 'hair', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#334155', svg_key: 'hair_bob_cute', is_starter: true },
  { id: 'h7', code: 'hair_twin_braids', name: 'หญิง: ผมเปียสองข้างสีน้ำตาล', slot: 'hair', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#92400E', svg_key: 'hair_twin_braids', is_starter: true },
  { id: 'h8', code: 'hair_buns_pink', name: 'หญิง: ผมดังโงะซาลาเปาคู่', slot: 'hair', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FB7185', svg_key: 'hair_buns_pink', is_starter: true },
  { id: 'h5', code: 'cyber_blue', name: 'หญิง: ผมยาวลอนฟ้าพาสเทล', slot: 'hair', rarity: 'rare', price_coins: 0, required_level: 1, preview_color: '#7DD3FC', svg_key: 'hair_cyber_blue', is_starter: true },
  { id: 'h6', code: 'flame_orange', name: 'หญิง: ผมยาวม่วงลาเวนเดอร์', slot: 'hair', rarity: 'epic', price_coins: 0, required_level: 1, preview_color: '#C084FC', svg_key: 'hair_flame_orange', is_starter: true },
  { id: 'h1', code: 'spiky_brown', name: 'ชาย: ผมสั้นซอยสีน้ำตาลช็อกโก', slot: 'hair', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#78350F', svg_key: 'hair_spiky_brown', is_starter: true },
  { id: 'h9', code: 'hair_boy_black', name: 'ชาย: ผมสั้นหน้าม้าสีดำเกาหลี', slot: 'hair', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#1E293B', svg_key: 'hair_boy_black', is_starter: true },
  { id: 'h10', code: 'hair_boy_silver', name: 'ชาย: ผมสั้นซอยสีเงินสุดเท่', slot: 'hair', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#CBD5E1', svg_key: 'hair_boy_silver', is_starter: true },
  { id: 'h11', code: 'hair_boy_mint', name: 'ชาย: ผมสั้นฟูสีมิ้นต์พาสเทล', slot: 'hair', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#6EE7B7', svg_key: 'hair_boy_mint', is_starter: true },
  { id: 'h12', code: 'hair_boy_blonde', name: 'ชาย: ผมสั้นตั้งสีทองสว่าง', slot: 'hair', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FDE047', svg_key: 'hair_boy_blonde', is_starter: true },
  { id: 'h13', code: 'hair_boy_navy', name: 'ชาย: ผมแสกกลางสีกรมท่าสุดคูล', slot: 'hair', rarity: 'rare', price_coins: 0, required_level: 1, preview_color: '#1E3A8A', svg_key: 'hair_boy_navy', is_starter: true },

  // ================= 5. OUTFITS — BOY & GIRL (14) =================
  { id: 'o3', code: 'dress_princess', name: 'หญิง: เดรสครีมโบว์ชมพู', slot: 'outfit', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FEF3C7', svg_key: 'outfit_dress_princess', is_starter: true },
  { id: 'o2', code: 'school_uniform', name: 'หญิง: ชุดนักเรียนโบว์ชมพู', slot: 'outfit', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#F9A8D4', svg_key: 'outfit_school_uniform', is_starter: true },
  { id: 'o4', code: 'tunic_green', name: 'หญิง: แจ็คเก็ตพาสเทลชมพู', slot: 'outfit', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FBCFE8', svg_key: 'outfit_tunic_green', is_starter: true },
  { id: 'o7', code: 'outfit_maid_pastel', name: 'หญิง: เดรสลูกไม้สีฟ้าพาสเทล', slot: 'outfit', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#BAE6FD', svg_key: 'outfit_maid_pastel', is_starter: true },
  { id: 'o8', code: 'outfit_strawberry', name: 'หญิง: เดรสสตรอว์เบอร์รีแดงชมพู', slot: 'outfit', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FDA4AF', svg_key: 'outfit_strawberry', is_starter: true },
  { id: 'o5', code: 'armor_crimson', name: 'หญิง: ชุดกะลาสีแดง-ขาว', slot: 'outfit', rarity: 'rare', price_coins: 0, required_level: 1, preview_color: '#FB7185', svg_key: 'outfit_armor_crimson', is_starter: true },
  { id: 'o6', code: 'robe_starlight', name: 'หญิง: ชุดเจ้าหญิงดวงดาว', slot: 'outfit', rarity: 'legendary', price_coins: 0, required_level: 1, preview_color: '#C4B5FD', svg_key: 'outfit_robe_starlight', is_starter: true },
  { id: 'o1', code: 'overalls_blue', name: 'ชาย/รวม: สเวตเตอร์พาสเทลฟ้า-ม่วง', slot: 'outfit', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#A5B4FC', svg_key: 'outfit_overalls_blue', is_starter: true },
  { id: 'o9', code: 'outfit_boy_hoodie', name: 'ชาย: ฮู้ดดี้สตรีทสีดำ-ฟ้า', slot: 'outfit', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#1E293B', svg_key: 'outfit_boy_hoodie', is_starter: true },
  { id: 'o10', code: 'outfit_boy_uniform', name: 'ชาย: ชุดนักเรียนเนกไทกรมท่า', slot: 'outfit', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#1D4ED8', svg_key: 'outfit_boy_uniform', is_starter: true },
  { id: 'o11', code: 'outfit_boy_jersey', name: 'ชาย: เสื้อกีฬาบาสเกตบอลแดง-ขาว', slot: 'outfit', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#EF4444', svg_key: 'outfit_boy_jersey', is_starter: true },
  { id: 'o12', code: 'outfit_boy_denim', name: 'ชาย: แจ็คเก็ตยีนส์สุดเท่', slot: 'outfit', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#3B82F6', svg_key: 'outfit_boy_denim', is_starter: true },
  { id: 'o13', code: 'outfit_boy_prince', name: 'ชาย: ชุดเจ้าชายขาว-ทอง', slot: 'outfit', rarity: 'rare', price_coins: 0, required_level: 1, preview_color: '#FDE047', svg_key: 'outfit_boy_prince', is_starter: true },
  { id: 'o14', code: 'outfit_pajama_bear', name: 'รวม: ชุดนอนหมีพาสเทลนุ่มนิ่ม', slot: 'outfit', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FDE68A', svg_key: 'outfit_pajama_bear', is_starter: true },

  // ================= 6. HATS & HEADWEAR — BOY & GIRL (14) =================
  { id: 't0', code: 'hat_none', name: 'ไม่ใส่เครื่องหัว (โชว์ทรงผม)', slot: 'hat', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#CBD5E1', svg_key: 'hat_none', is_starter: true },
  { id: 't2', code: 'bow_ribbon', name: 'หูแมวขาวชมพู (Cat Ears)', slot: 'hat', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#F9A8D4', svg_key: 'hat_bow_ribbon', is_starter: true },
  { id: 't6', code: 'hat_bunny_ears', name: 'หูกระต่ายขาวนุ่ม (Bunny Ears)', slot: 'hat', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FBCFE8', svg_key: 'hat_bunny_ears', is_starter: true },
  { id: 't7', code: 'hat_bear_ears', name: 'หูหมีสีน้ำตาล (Bear Ears)', slot: 'hat', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#B45309', svg_key: 'hat_bear_ears', is_starter: true },
  { id: 't8', code: 'hat_panda_ears', name: 'หูแพนด้าสุดคิวท์ (Panda Ears)', slot: 'hat', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#1E293B', svg_key: 'hat_panda_ears', is_starter: true },
  { id: 't1', code: 'cap_red', name: 'โบว์ริบบิ้นสีชมพู (Pink Bow)', slot: 'hat', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FB7185', svg_key: 'hat_cap_red', is_starter: true },
  { id: 't9', code: 'hat_street_cap', name: 'ชาย: หมวกแก๊ปสตรีทสีดำ', slot: 'hat', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#0F172A', svg_key: 'hat_street_cap', is_starter: true },
  { id: 't10', code: 'hat_beanie_blue', name: 'ชาย/รวม: หมวกไหมพรมสีฟ้า', slot: 'hat', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#38BDF8', svg_key: 'hat_beanie_blue', is_starter: true },
  { id: 't11', code: 'hat_headphones', name: 'ชาย/รวม: หูฟังเกมเมอร์นีออน', slot: 'hat', rarity: 'rare', price_coins: 0, required_level: 1, preview_color: '#22D3EE', svg_key: 'hat_headphones', is_starter: true },
  { id: 't12', code: 'hat_halo', name: 'วงแหวนนางฟ้าสีทอง (Angel Halo)', slot: 'hat', rarity: 'rare', price_coins: 0, required_level: 1, preview_color: '#FEF08A', svg_key: 'hat_halo', is_starter: true },
  { id: 't13', code: 'hat_devil_horns', name: 'เขาปีศาจน้อยสีแดง (Mini Horns)', slot: 'hat', rarity: 'rare', price_coins: 0, required_level: 1, preview_color: '#DC2626', svg_key: 'hat_devil_horns', is_starter: true },
  { id: 't3', code: 'mushroom_beret', name: 'หมวกเบเรต์พาสเทล (Pastel Beret)', slot: 'hat', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FDBA74', svg_key: 'hat_mushroom_beret', is_starter: true },
  { id: 't4', code: 'wizard_cone', name: 'หมวกปาร์ตี้ดวงดาว (Party Hat)', slot: 'hat', rarity: 'rare', price_coins: 0, required_level: 1, preview_color: '#A78BFA', svg_key: 'hat_wizard_cone', is_starter: true },
  { id: 't5', code: 'crown_golden', name: 'มงกุฎเจ้าหญิง/เจ้าชาย (Crown)', slot: 'hat', rarity: 'legendary', price_coins: 0, required_level: 1, preview_color: '#FDE047', svg_key: 'hat_crown_golden', is_starter: true },

  // ================= 7. ACCESSORIES — BOY & GIRL (12) =================
  { id: 'a0', code: 'acc_none', name: 'ไม่ใส่ของตกแต่ง', slot: 'accessory', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#CBD5E1', svg_key: 'acc_none', is_starter: true },
  { id: 'a1', code: 'star_badge', name: 'ออร่าดาว-หัวใจ-พระจันทร์', slot: 'accessory', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FDE047', svg_key: 'acc_star_badge', is_starter: true },
  { id: 'a2', code: 'glasses_round', name: 'แว่นตากลมพิกเซล (Round Glasses)', slot: 'accessory', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#64748B', svg_key: 'acc_glasses_round', is_starter: true },
  { id: 'a6', code: 'acc_sunglasses', name: 'ชาย/รวม: แว่นกันแดดสุดคูล', slot: 'accessory', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#0F172A', svg_key: 'acc_sunglasses', is_starter: true },
  { id: 'a7', code: 'acc_scarf_red', name: 'ผ้าพันคอไหมพรมสีแดง', slot: 'accessory', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#EF4444', svg_key: 'acc_scarf_red', is_starter: true },
  { id: 'a8', code: 'acc_bowtie', name: 'หูกระต่ายโบว์แดงสุดเนี้ยบ', slot: 'accessory', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#E11D48', svg_key: 'acc_bowtie', is_starter: true },
  { id: 'a9', code: 'acc_bandaid', name: 'พลาสเตอร์แปะแก้มสุดเท่', slot: 'accessory', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#FDE68A', svg_key: 'acc_bandaid', is_starter: true },
  { id: 'a10', code: 'acc_sparkles', name: 'ออร่าประกายเพชรวิ้งๆ', slot: 'accessory', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#7DD3FC', svg_key: 'acc_sparkles', is_starter: true },
  { id: 'a11', code: 'acc_cat_tail', name: 'หางแมวเหมียว + หัวใจพาสเทล', slot: 'accessory', rarity: 'common', price_coins: 0, required_level: 1, preview_color: '#F472B6', svg_key: 'acc_cat_tail', is_starter: true },
  { id: 'a3', code: 'goggles_sky', name: 'ปีกนางฟ้าสีขาว (Angel Wings)', slot: 'accessory', rarity: 'rare', price_coins: 0, required_level: 1, preview_color: '#E0F2FE', svg_key: 'acc_goggles_sky', is_starter: true },
  { id: 'a4', code: 'cape_hero', name: 'ผ้าคลุมพาสเทล (Hero Cape)', slot: 'accessory', rarity: 'epic', price_coins: 0, required_level: 1, preview_color: '#FDA4AF', svg_key: 'acc_cape_hero', is_starter: true },
  { id: 'a5', code: 'wings_rainbow', name: 'ปีกนางฟ้า + ออร่าดาวครบชุด', slot: 'accessory', rarity: 'legendary', price_coins: 0, required_level: 1, preview_color: '#FDE68A', svg_key: 'acc_wings_rainbow', is_starter: true },
];

interface AvatarRendererProps {
  config: AvatarConfig;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animate?: boolean;
  shieldActive?: boolean;
  combatAction?: 'idle' | 'attack_dash' | 'hit_shake' | 'victory_jump';
}

type HairStyleKind = 'wavy' | 'spiky' | 'bob' | 'pigtails' | 'braids' | 'buns' | 'boy_parted' | 'boy_fluffy';

const HAIR_PALETTES: Record<
  string,
  { main: string; shade: string; light: string; outline: string; style: HairStyleKind }
> = {
  // Girl / Long
  wavy_crimson: { main: '#B91C1C', shade: '#881337', light: '#EF4444', outline: '#581C1C', style: 'wavy' },
  twin_gold: { main: '#FEF3C7', shade: '#FDE68A', light: '#FFFBEB', outline: '#C4A484', style: 'wavy' },
  ponytail_sport: { main: '#F9A8D4', shade: '#EC4899', light: '#FCE7F3', outline: '#9D174D', style: 'pigtails' },
  bob_cute: { main: '#475569', shade: '#334155', light: '#94A3B8', outline: '#1E293B', style: 'bob' },
  hair_twin_braids: { main: '#92400E', shade: '#78350F', light: '#D97706', outline: '#451A03', style: 'braids' },
  hair_buns_pink: { main: '#FB7185', shade: '#E11D48', light: '#FFE4E6', outline: '#881337', style: 'buns' },
  cyber_blue: { main: '#93C5FD', shade: '#60A5FA', light: '#DBEAFE', outline: '#3B82F6', style: 'wavy' },
  flame_orange: { main: '#D8B4FE', shade: '#A855F7', light: '#F3E8FF', outline: '#6B21A8', style: 'wavy' },
  // Boy / Short
  spiky_brown: { main: '#7C4D3A', shade: '#5C3526', light: '#A6725B', outline: '#4A2B1F', style: 'spiky' },
  hair_boy_black: { main: '#334155', shade: '#1E293B', light: '#64748B', outline: '#0F172A', style: 'boy_parted' },
  hair_boy_silver: { main: '#E2E8F0', shade: '#CBD5E1', light: '#F8FAFC', outline: '#64748B', style: 'spiky' },
  hair_boy_mint: { main: '#6EE7B7', shade: '#34D399', light: '#D1FAE5', outline: '#059669', style: 'boy_fluffy' },
  hair_boy_blonde: { main: '#FDE047', shade: '#EAB308', light: '#FEF9C3', outline: '#A16207', style: 'spiky' },
  hair_boy_navy: { main: '#1E3A8A', shade: '#172554', light: '#3B82F6', outline: '#0F172A', style: 'boy_parted' },
};

const SKIN_PALETTES: Record<string, { fill: string; shade: string; outline: string; blush: string }> = {
  explorer_red: { fill: '#FFF0EC', shade: '#FBD9D0', outline: '#B88B85', blush: '#FCA5A5' },
  explorer_blue: { fill: '#FDE4CF', shade: '#F5C7A5', outline: '#AD8066', blush: '#FB923C' },
  explorer_green: { fill: '#ECC4A0', shade: '#D9A57C', outline: '#8F6447', blush: '#F48A8A' },
  skin_milk: { fill: '#FFF8F6', shade: '#F5E4E0', outline: '#BDA3A0', blush: '#F9A8D4' },
  skin_tan: { fill: '#D9A780', shade: '#BF8A63', outline: '#7A5238', blush: '#E8837C' },
  explorer_gold: { fill: '#FFF7E0', shade: '#FDE8B8', outline: '#BFA06A', blush: '#F9A8D4' },
};

export const AvatarRenderer: React.FC<AvatarRendererProps> = ({
  config,
  size = 'md',
  animate = true,
  shieldActive = false,
  combatAction = 'idle',
}) => {
  const sizeClass =
    size === 'sm'
      ? 'w-14 h-14'
      : size === 'lg'
        ? 'w-28 h-28'
        : size === 'xl'
          ? 'w-44 h-44'
          : 'w-20 h-20';

  const isFemale = config.gender === 'female';
  const faceType = config.face || 'face_happy';
  const skin = SKIN_PALETTES[config.base] || SKIN_PALETTES.explorer_red;
  const hair = HAIR_PALETTES[config.hair] || HAIR_PALETTES.spiky_brown;
  const isShortHair =
    hair.style === 'spiky' || hair.style === 'boy_parted' || hair.style === 'boy_fluffy';

  // Eye iris color adapts harmoniously to hair/gender/face
  const eyeIris =
    faceType === 'face_sparkle_blue'
      ? '#0EA5E9'
      : faceType === 'face_kawaii'
        ? '#9333EA'
        : faceType === 'face_cat'
          ? '#F59E0B'
          : faceType === 'face_hero'
            ? '#6366F1'
            : config.hair === 'twin_gold'
              ? '#38BDF8'
              : config.hair === 'wavy_crimson'
                ? '#6366F1'
                : isFemale
                  ? '#60A5FA'
                  : '#334155';

  const motionProps =
    combatAction === 'attack_dash'
      ? { x: [0, 60, -8, 0], scale: [1, 1.18, 1] }
      : combatAction === 'hit_shake'
        ? { x: [0, -10, 10, -6, 6, 0], scale: [1, 0.92, 1] }
        : combatAction === 'victory_jump'
          ? { y: [0, -14, 0, -10, 0] }
          : animate
            ? { y: [0, -3, 0] }
            : undefined;

  const hasWings = config.accessory === 'goggles_sky' || config.accessory === 'wings_rainbow';
  const hasStarAura = config.accessory === 'star_badge' || config.accessory === 'wings_rainbow';

  return (
    <motion.div
      whileHover={{ scale: 1.07 }}
      animate={motionProps}
      transition={
        combatAction !== 'idle'
          ? { duration: 0.48, ease: 'easeInOut' }
          : { repeat: Infinity, duration: 2.4, ease: 'easeInOut' }
      }
      className={`relative inline-flex items-center justify-center select-none ${sizeClass}`}
    >
      {/* Shield Aura */}
      {shieldActive && (
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.9, 0.55] }}
          transition={{ repeat: Infinity, duration: 1.6 }}
          className="absolute inset-0 rounded-full border-4 border-sky-300 bg-sky-200/25 shadow-[0_0_16px_rgba(56,189,248,0.65)]"
        />
      )}

      {/* Kawaii Pastel Pixel-Art Chibi Doll (36x42 Crisp Pixel Grid) */}
      <svg
        viewBox="0 0 36 42"
        className="w-full h-full drop-shadow-[0_3px_4px_rgba(148,110,120,0.22)]"
        shapeRendering="crispEdges"
        style={{ imageRendering: 'pixelated' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ================= LAYER 0: FLOATING PIXEL STICKERS / AURAS ================= */}
        {hasStarAura && (
          <g>
            <rect x="16" y="1" width="1" height="1" fill="#FDA4AF" />
            <rect x="19" y="1" width="1" height="1" fill="#FDA4AF" />
            <rect x="15" y="2" width="6" height="1" fill="#F472B6" />
            <rect x="16" y="3" width="4" height="1" fill="#F472B6" />
            <rect x="17" y="4" width="2" height="1" fill="#EC4899" />

            <rect x="3" y="18" width="1" height="3" fill="#FDE047" />
            <rect x="2" y="19" width="3" height="1" fill="#FDE047" />
            <rect x="3" y="19" width="1" height="1" fill="#FEF9C3" />

            <rect x="2" y="26" width="3" height="3" fill="#E9D5FF" />
            <rect x="1" y="27" width="5" height="1" fill="#C084FC" />

            <rect x="31" y="19" width="1" height="1" fill="#D8B4FE" />
            <rect x="33" y="19" width="1" height="1" fill="#D8B4FE" />
            <rect x="31" y="20" width="3" height="1" fill="#C084FC" />
            <rect x="32" y="21" width="1" height="1" fill="#A855F7" />

            <rect x="32" y="25" width="2" height="1" fill="#FDE047" />
            <rect x="31" y="26" width="1" height="2" fill="#FDE047" />
            <rect x="32" y="28" width="2" height="1" fill="#FDE047" />
          </g>
        )}

        {config.accessory === 'acc_sparkles' && (
          <g>
            <rect x="4" y="12" width="1" height="3" fill="#38BDF8" />
            <rect x="3" y="13" width="3" height="1" fill="#38BDF8" />
            <rect x="31" y="11" width="1" height="3" fill="#FDE047" />
            <rect x="30" y="12" width="3" height="1" fill="#FDE047" />
            <rect x="5" y="28" width="1" height="3" fill="#C084FC" />
            <rect x="4" y="29" width="3" height="1" fill="#C084FC" />
            <rect x="30" y="27" width="1" height="3" fill="#38BDF8" />
            <rect x="29" y="28" width="3" height="1" fill="#38BDF8" />
          </g>
        )}

        {config.accessory === 'acc_cat_tail' && (
          <g>
            {/* Cute curled pixel cat tail behind right side */}
            <rect x="24" y="30" width="4" height="2" fill="#F472B6" />
            <rect x="27" y="27" width="2" height="4" fill="#F472B6" />
            <rect x="28" y="25" width="2" height="3" fill="#FBCFE8" />
            {/* Floating pink hearts */}
            <rect x="3" y="21" width="3" height="1" fill="#F472B6" />
            <rect x="4" y="22" width="1" height="1" fill="#EC4899" />
            <rect x="31" y="17" width="3" height="1" fill="#F472B6" />
            <rect x="32" y="18" width="1" height="1" fill="#EC4899" />
          </g>
        )}

        {/* ================= LAYER 1: BACK PIXEL WINGS / CAPE ================= */}
        {hasWings && (
          <g>
            <rect x="3" y="20" width="6" height="2" fill="#FFFFFF" />
            <rect x="2" y="22" width="8" height="3" fill="#FFFFFF" />
            <rect x="4" y="25" width="6" height="2" fill="#E0F2FE" />
            <rect x="6" y="27" width="4" height="2" fill="#BAE6FD" />
            <rect x="3" y="19" width="6" height="1" fill="#CBD5E1" />
            <rect x="2" y="21" width="1" height="4" fill="#CBD5E1" />

            <rect x="27" y="20" width="6" height="2" fill="#FFFFFF" />
            <rect x="26" y="22" width="8" height="3" fill="#FFFFFF" />
            <rect x="26" y="25" width="6" height="2" fill="#E0F2FE" />
            <rect x="26" y="27" width="4" height="2" fill="#BAE6FD" />
            <rect x="27" y="19" width="6" height="1" fill="#CBD5E1" />
            <rect x="33" y="21" width="1" height="4" fill="#CBD5E1" />
          </g>
        )}

        {config.accessory === 'cape_hero' && (
          <g>
            <rect x="10" y="23" width="16" height="10" fill="#FDA4AF" />
            <rect x="9" y="25" width="1" height="8" fill="#FB7185" />
            <rect x="26" y="25" width="1" height="8" fill="#FB7185" />
            <rect x="10" y="33" width="16" height="1" fill="#E11D48" />
          </g>
        )}

        {/* ================= LAYER 2: BACK HAIR ================= */}
        {hair.style === 'wavy' && (
          <g>
            <rect x="9" y="10" width="18" height="14" fill={hair.outline} />
            <rect x="8" y="15" width="20" height="13" fill={hair.outline} />
            <rect x="7" y="22" width="22" height="9" fill={hair.outline} />
            <rect x="8" y="31" width="20" height="4" fill={hair.outline} />

            <rect x="10" y="11" width="16" height="22" fill={hair.main} />
            <rect x="9" y="16" width="18" height="17" fill={hair.main} />
            <rect x="8" y="23" width="20" height="8" fill={hair.main} />
            <rect x="9" y="31" width="5" height="3" fill={hair.shade} />
            <rect x="22" y="31" width="5" height="3" fill={hair.shade} />
            <rect x="9" y="24" width="2" height="4" fill={hair.light} />
            <rect x="25" y="24" width="2" height="4" fill={hair.light} />
          </g>
        )}

        {hair.style === 'bob' && (
          <g>
            <rect x="9" y="10" width="18" height="14" fill={hair.outline} />
            <rect x="10" y="11" width="16" height="12" fill={hair.main} />
            <rect x="10" y="21" width="16" height="2" fill={hair.shade} />
          </g>
        )}

        {hair.style === 'pigtails' && (
          <g>
            <rect x="5" y="14" width="5" height="12" fill={hair.outline} />
            <rect x="6" y="15" width="3" height="10" fill={hair.main} />
            <rect x="6" y="23" width="3" height="2" fill={hair.shade} />
            <rect x="8" y="14" width="2" height="2" fill="#FDE047" />

            <rect x="26" y="14" width="5" height="12" fill={hair.outline} />
            <rect x="27" y="15" width="3" height="10" fill={hair.main} />
            <rect x="27" y="23" width="3" height="2" fill={hair.shade} />
            <rect x="26" y="14" width="2" height="2" fill="#FDE047" />
          </g>
        )}

        {hair.style === 'braids' && (
          <g>
            {/* Left Braid */}
            <rect x="8" y="18" width="3" height="13" fill={hair.outline} />
            <rect x="9" y="19" width="2" height="11" fill={hair.main} />
            <rect x="9" y="21" width="1" height="1" fill={hair.light} />
            <rect x="9" y="25" width="1" height="1" fill={hair.light} />
            <rect x="8" y="29" width="3" height="1" fill="#F472B6" />
            {/* Right Braid */}
            <rect x="25" y="18" width="3" height="13" fill={hair.outline} />
            <rect x="25" y="19" width="2" height="11" fill={hair.main} />
            <rect x="26" y="21" width="1" height="1" fill={hair.light} />
            <rect x="26" y="25" width="1" height="1" fill={hair.light} />
            <rect x="25" y="29" width="3" height="1" fill="#F472B6" />
          </g>
        )}

        {hair.style === 'buns' && (
          <g>
            {/* Left Bun */}
            <rect x="7" y="7" width="4" height="4" fill={hair.outline} />
            <rect x="8" y="8" width="3" height="3" fill={hair.main} />
            <rect x="8" y="8" width="1" height="1" fill={hair.light} />
            {/* Right Bun */}
            <rect x="25" y="7" width="4" height="4" fill={hair.outline} />
            <rect x="25" y="8" width="3" height="3" fill={hair.main} />
            <rect x="27" y="8" width="1" height="1" fill={hair.light} />
          </g>
        )}

        {/* ================= LAYER 3: CHIBI DOLL BODY, ARMS, LEGS & SHOES ================= */}
        <rect x="12" y="39" width="12" height="2" fill="#E2E8F0" opacity="0.7" />

        {/* Neck */}
        <rect x="16" y="21" width="4" height="2" fill={skin.shade} />
        <rect x="15" y="21" width="1" height="2" fill={skin.outline} />
        <rect x="20" y="21" width="1" height="2" fill={skin.outline} />

        {/* Arms */}
        <rect x="11" y="24" width="2" height="7" fill={skin.fill} />
        <rect x="10" y="24" width="1" height="6" fill={skin.outline} />
        <rect x="11" y="31" width="2" height="1" fill={skin.outline} />

        <rect x="23" y="24" width="2" height="7" fill={skin.fill} />
        <rect x="25" y="24" width="1" height="6" fill={skin.outline} />
        <rect x="23" y="31" width="2" height="1" fill={skin.outline} />

        {/* Legs */}
        <rect x="14" y="32" width="3" height="5" fill={skin.fill} />
        <rect x="13" y="32" width="1" height="5" fill={skin.outline} />
        <rect x="17" y="32" width="1" height="5" fill={skin.outline} />

        <rect x="19" y="32" width="3" height="5" fill={skin.fill} />
        <rect x="18" y="32" width="1" height="5" fill={skin.outline} />
        <rect x="22" y="32" width="1" height="5" fill={skin.outline} />

        {/* Cute Pixel Boots / Sneakers */}
        <rect x="13" y="36" width="5" height="3" fill={isFemale ? '#A16207' : '#334155'} />
        <rect x="14" y="36" width="3" height="2" fill={isFemale ? '#CA8A04' : '#475569'} />
        <rect x="14" y="35" width="3" height="1" fill="#FFFFFF" />
        <rect x="13" y="39" width="5" height="1" fill={isFemale ? '#713F12' : '#0F172A'} />

        <rect x="18" y="36" width="5" height="3" fill={isFemale ? '#A16207' : '#334155'} />
        <rect x="19" y="36" width="3" height="2" fill={isFemale ? '#CA8A04' : '#475569'} />
        <rect x="19" y="35" width="3" height="1" fill="#FFFFFF" />
        <rect x="18" y="39" width="5" height="1" fill={isFemale ? '#713F12' : '#0F172A'} />

        {/* ================= LAYER 4: BOY & GIRL PIXEL OUTFITS ================= */}
        {config.outfit === 'dress_princess' && (
          <g>
            <rect x="13" y="23" width="10" height="10" fill="#FEF9C3" />
            <rect x="12" y="29" width="12" height="4" fill="#FEF08A" />
            <rect x="12" y="23" width="1" height="10" fill="#D4B483" />
            <rect x="23" y="23" width="1" height="10" fill="#D4B483" />
            <rect x="12" y="33" width="12" height="1" fill="#D4B483" />
            <rect x="15" y="23" width="6" height="2" fill="#FFFFFF" />
            <rect x="17" y="24" width="2" height="2" fill="#F9A8D4" />
            <rect x="11" y="23" width="2" height="3" fill="#FEF9C3" />
            <rect x="23" y="23" width="2" height="3" fill="#FEF9C3" />
          </g>
        )}

        {config.outfit === 'overalls_blue' && (
          <g>
            <rect x="13" y="23" width="10" height="7" fill="#C7D2FE" />
            <rect x="11" y="23" width="2" height="5" fill="#C7D2FE" />
            <rect x="23" y="23" width="2" height="5" fill="#C7D2FE" />
            <rect x="12" y="23" width="1" height="7" fill="#818CF8" />
            <rect x="23" y="23" width="1" height="7" fill="#818CF8" />
            <rect x="17" y="25" width="2" height="2" fill="#FDE047" />
            <rect x="13" y="30" width="10" height="3" fill="#93C5FD" />
            <rect x="15" y="30" width="1" height="3" fill="#DBEAFE" />
            <rect x="20" y="30" width="1" height="3" fill="#DBEAFE" />
            <rect x="13" y="33" width="10" height="1" fill="#60A5FA" />
          </g>
        )}

        {config.outfit === 'school_uniform' && (
          <g>
            <rect x="13" y="23" width="10" height="6" fill="#FFFFFF" />
            <rect x="11" y="23" width="2" height="4" fill="#FFFFFF" />
            <rect x="23" y="23" width="2" height="4" fill="#FFFFFF" />
            <rect x="12" y="23" width="1" height="6" fill="#94A3B8" />
            <rect x="23" y="23" width="1" height="6" fill="#94A3B8" />
            <rect x="14" y="23" width="8" height="2" fill="#FBCFE8" />
            <rect x="17" y="25" width="2" height="2" fill="#F472B6" />
            <rect x="12" y="29" width="12" height="4" fill="#F472B6" />
            <rect x="14" y="29" width="1" height="4" fill="#F9A8D4" />
            <rect x="18" y="29" width="1" height="4" fill="#F9A8D4" />
            <rect x="21" y="29" width="1" height="4" fill="#F9A8D4" />
            <rect x="12" y="33" width="12" height="1" fill="#BE185D" />
          </g>
        )}

        {config.outfit === 'tunic_green' && (
          <g>
            <rect x="12" y="23" width="12" height="8" fill="#FBCFE8" />
            <rect x="11" y="23" width="2" height="6" fill="#F9A8D4" />
            <rect x="23" y="23" width="2" height="6" fill="#F9A8D4" />
            <rect x="17" y="23" width="2" height="8" fill="#FFFFFF" />
            <rect x="13" y="31" width="10" height="2" fill="#BAE6FD" />
            <rect x="12" y="23" width="1" height="8" fill="#DB2777" />
            <rect x="23" y="23" width="1" height="8" fill="#DB2777" />
          </g>
        )}

        {config.outfit === 'outfit_maid_pastel' && (
          <g>
            <rect x="13" y="23" width="10" height="10" fill="#BAE6FD" />
            <rect x="12" y="29" width="12" height="4" fill="#7DD3FC" />
            <rect x="15" y="26" width="6" height="7" fill="#FFFFFF" />
            <rect x="16" y="23" width="4" height="2" fill="#FFFFFF" />
            <rect x="12" y="33" width="12" height="1" fill="#FFFFFF" />
          </g>
        )}

        {config.outfit === 'outfit_strawberry' && (
          <g>
            <rect x="13" y="23" width="10" height="10" fill="#FDA4AF" />
            <rect x="12" y="29" width="12" height="4" fill="#FB7185" />
            <rect x="14" y="26" width="1" height="1" fill="#FFFFFF" />
            <rect x="20" y="27" width="1" height="1" fill="#FFFFFF" />
            <rect x="17" y="30" width="1" height="1" fill="#FFFFFF" />
            <rect x="15" y="23" width="6" height="2" fill="#FFFFFF" />
            <rect x="12" y="33" width="12" height="1" fill="#BE123C" />
          </g>
        )}

        {config.outfit === 'armor_crimson' && (
          <g>
            <rect x="13" y="23" width="10" height="6" fill="#FFE4E6" />
            <rect x="14" y="23" width="8" height="2" fill="#FB7185" />
            <rect x="17" y="25" width="2" height="2" fill="#E11D48" />
            <rect x="12" y="29" width="12" height="4" fill="#FB7185" />
            <rect x="12" y="32" width="12" height="1" fill="#FFFFFF" />
            <rect x="12" y="33" width="12" height="1" fill="#9F1239" />
          </g>
        )}

        {config.outfit === 'robe_starlight' && (
          <g>
            <rect x="13" y="23" width="10" height="11" fill="#DDD6FE" />
            <rect x="11" y="28" width="14" height="6" fill="#C4B5FD" />
            <rect x="17" y="25" width="2" height="2" fill="#FDE047" />
            <rect x="14" y="30" width="1" height="1" fill="#FEF08A" />
            <rect x="21" y="31" width="1" height="1" fill="#FEF08A" />
            <rect x="11" y="34" width="14" height="1" fill="#8B5CF6" />
          </g>
        )}

        {config.outfit === 'outfit_boy_hoodie' && (
          <g>
            {/* Cool Street Black-Cyan Hoodie */}
            <rect x="12" y="23" width="12" height="7" fill="#1E293B" />
            <rect x="11" y="23" width="2" height="6" fill="#334155" />
            <rect x="23" y="23" width="2" height="6" fill="#334155" />
            <rect x="16" y="24" width="1" height="3" fill="#38BDF8" />
            <rect x="19" y="24" width="1" height="3" fill="#38BDF8" />
            <rect x="13" y="30" width="10" height="3" fill="#475569" />
            <rect x="13" y="33" width="10" height="1" fill="#0F172A" />
          </g>
        )}

        {config.outfit === 'outfit_boy_uniform' && (
          <g>
            {/* Boy School Suit with Navy Tie */}
            <rect x="13" y="23" width="10" height="6" fill="#FFFFFF" />
            <rect x="11" y="23" width="2" height="5" fill="#1E3A8A" />
            <rect x="23" y="23" width="2" height="5" fill="#1E3A8A" />
            <rect x="13" y="23" width="3" height="6" fill="#1E3A8A" />
            <rect x="20" y="23" width="3" height="6" fill="#1E3A8A" />
            <rect x="17" y="24" width="2" height="4" fill="#EF4444" />
            <rect x="13" y="29" width="10" height="4" fill="#1E293B" />
          </g>
        )}

        {config.outfit === 'outfit_boy_jersey' && (
          <g>
            {/* Red-White Sporty Basketball Jersey */}
            <rect x="13" y="23" width="10" height="7" fill="#EF4444" />
            <rect x="14" y="23" width="8" height="1" fill="#FFFFFF" />
            <rect x="16" y="25" width="4" height="3" fill="#FFFFFF" />
            <rect x="17" y="26" width="2" height="1" fill="#EF4444" />
            <rect x="13" y="30" width="10" height="3" fill="#1E293B" />
            <rect x="13" y="30" width="1" height="3" fill="#FFFFFF" />
            <rect x="22" y="30" width="1" height="3" fill="#FFFFFF" />
          </g>
        )}

        {config.outfit === 'outfit_boy_denim' && (
          <g>
            {/* Cool Denim Jacket over White Tee */}
            <rect x="12" y="23" width="12" height="7" fill="#3B82F6" />
            <rect x="11" y="23" width="2" height="6" fill="#2563EB" />
            <rect x="23" y="23" width="2" height="6" fill="#2563EB" />
            <rect x="16" y="23" width="4" height="7" fill="#FFFFFF" />
            <rect x="13" y="30" width="10" height="3" fill="#1E293B" />
          </g>
        )}

        {config.outfit === 'outfit_boy_prince' && (
          <g>
            {/* Royal White & Gold Prince Suit */}
            <rect x="12" y="23" width="12" height="7" fill="#FFFFFF" />
            <rect x="11" y="23" width="2" height="6" fill="#F8FAFC" />
            <rect x="23" y="23" width="2" height="6" fill="#F8FAFC" />
            <rect x="11" y="23" width="3" height="1" fill="#FACC15" />
            <rect x="22" y="23" width="3" height="1" fill="#FACC15" />
            <rect x="17" y="23" width="2" height="7" fill="#FACC15" />
            <rect x="13" y="30" width="10" height="3" fill="#1D4ED8" />
          </g>
        )}

        {config.outfit === 'outfit_pajama_bear' && (
          <g>
            {/* Cozy Pastel Bear Pajamas */}
            <rect x="12" y="23" width="12" height="10" fill="#FEF3C7" />
            <rect x="11" y="23" width="2" height="6" fill="#FDE68A" />
            <rect x="23" y="23" width="2" height="6" fill="#FDE68A" />
            <rect x="16" y="25" width="4" height="3" fill="#D97706" />
            <rect x="17" y="26" width="2" height="1" fill="#FEF3C7" />
            <rect x="12" y="33" width="12" height="1" fill="#D97706" />
          </g>
        )}

        {/* ================= LAYER 5: CHIBI HEAD & EARS ================= */}
        <rect x="12" y="8" width="12" height="1" fill={skin.outline} />
        <rect x="11" y="9" width="14" height="1" fill={skin.outline} />
        <rect x="10" y="10" width="16" height="10" fill={skin.outline} />
        <rect x="11" y="20" width="14" height="1" fill={skin.outline} />
        <rect x="13" y="21" width="10" height="1" fill={skin.outline} />

        {/* Ears */}
        <rect x="9" y="15" width="2" height="3" fill={skin.outline} />
        <rect x="10" y="16" width="1" height="1" fill={skin.fill} />
        <rect x="25" y="15" width="2" height="3" fill={skin.outline} />
        <rect x="25" y="16" width="1" height="1" fill={skin.fill} />

        {/* Head Skin Fill */}
        <rect x="12" y="9" width="12" height="1" fill={skin.fill} />
        <rect x="11" y="10" width="14" height="10" fill={skin.fill} />
        <rect x="13" y="20" width="10" height="1" fill={skin.fill} />
        <rect x="14" y="20" width="8" height="1" fill={skin.shade} opacity="0.6" />

        {/* Rosy Pixel Blush */}
        <rect x="11" y="18" width="2" height="1" fill={skin.blush} opacity={faceType === 'face_shy' ? '0.95' : '0.7'} />
        <rect x="23" y="18" width="2" height="1" fill={skin.blush} opacity={faceType === 'face_shy' ? '0.95' : '0.7'} />

        {/* ================= LAYER 6: KAWAII PIXEL FACIAL EXPRESSIONS ================= */}
        {(faceType === 'face_happy' || faceType === 'face_sparkle_blue') && (
          <g>
            <rect x="12" y="15" width="3" height="1" fill="#473335" />
            <rect x="12" y="16" width="3" height="2" fill={eyeIris} />
            <rect x="13" y="16" width="1" height="1" fill="#1E293B" />
            <rect x="12" y="16" width="1" height="1" fill="#FFFFFF" />
            {faceType === 'face_sparkle_blue' && <rect x="14" y="17" width="1" height="1" fill="#E0F2FE" />}

            <rect x="21" y="15" width="3" height="1" fill="#473335" />
            <rect x="21" y="16" width="3" height="2" fill={eyeIris} />
            <rect x="22" y="16" width="1" height="1" fill="#1E293B" />
            <rect x="21" y="16" width="1" height="1" fill="#FFFFFF" />
            {faceType === 'face_sparkle_blue' && <rect x="23" y="17" width="1" height="1" fill="#E0F2FE" />}

            <rect x="17" y="19" width="2" height="1" fill="#D48484" />
          </g>
        )}

        {faceType === 'face_wink' && (
          <g>
            <rect x="12" y="15" width="3" height="1" fill="#473335" />
            <rect x="12" y="16" width="3" height="2" fill={eyeIris} />
            <rect x="12" y="16" width="1" height="1" fill="#FFFFFF" />
            <rect x="21" y="16" width="3" height="1" fill="#473335" />
            <rect x="23" y="17" width="1" height="1" fill="#473335" />
            <rect x="17" y="19" width="2" height="1" fill="#F472B6" />
          </g>
        )}

        {(faceType === 'face_kawaii' || faceType === 'face_cat') && (
          <g>
            <rect x="12" y="15" width="3" height="1" fill="#473335" />
            <rect x="12" y="16" width="3" height="2" fill={eyeIris} />
            <rect x="13" y="16" width="1" height="1" fill="#FDE047" />
            <rect x="21" y="15" width="3" height="1" fill="#473335" />
            <rect x="21" y="16" width="3" height="2" fill={eyeIris} />
            <rect x="22" y="16" width="1" height="1" fill="#FDE047" />
            <rect x="16" y="19" width="1" height="1" fill="#D48484" />
            <rect x="17" y="18" width="2" height="1" fill="#D48484" />
            <rect x="19" y="19" width="1" height="1" fill="#D48484" />
          </g>
        )}

        {faceType === 'face_hero' && (
          <g>
            <rect x="12" y="15" width="3" height="1" fill="#644545" />
            <rect x="12" y="16" width="3" height="1" fill="#E0E7FF" />
            <rect x="12" y="17" width="3" height="1" fill={eyeIris} />
            <rect x="12" y="17" width="1" height="1" fill="#FFFFFF" />

            <rect x="21" y="15" width="3" height="1" fill="#644545" />
            <rect x="21" y="16" width="3" height="1" fill="#E0E7FF" />
            <rect x="21" y="17" width="3" height="1" fill={eyeIris} />
            <rect x="21" y="17" width="1" height="1" fill="#FFFFFF" />

            <rect x="17" y="19" width="2" height="1" fill="#D48484" />
          </g>
        )}

        {faceType === 'face_joy_laugh' && (
          <g>
            <rect x="13" y="15" width="1" height="1" fill="#473335" />
            <rect x="12" y="16" width="1" height="1" fill="#473335" />
            <rect x="14" y="16" width="1" height="1" fill="#473335" />

            <rect x="22" y="15" width="1" height="1" fill="#473335" />
            <rect x="21" y="16" width="1" height="1" fill="#473335" />
            <rect x="23" y="16" width="1" height="1" fill="#473335" />

            <rect x="17" y="18" width="2" height="2" fill="#FDA4AF" />
          </g>
        )}

        {faceType === 'face_cool_smirk' && (
          <g>
            <rect x="12" y="15" width="3" height="1" fill="#1E293B" />
            <rect x="12" y="16" width="3" height="2" fill={eyeIris} />
            <rect x="14" y="16" width="1" height="1" fill="#FFFFFF" />
            <rect x="21" y="15" width="3" height="1" fill="#1E293B" />
            <rect x="21" y="16" width="3" height="2" fill={eyeIris} />
            <rect x="23" y="16" width="1" height="1" fill="#FFFFFF" />
            <rect x="17" y="19" width="2" height="1" fill="#473335" />
            <rect x="19" y="18" width="1" height="1" fill="#473335" />
          </g>
        )}

        {faceType === 'face_shy' && (
          <g>
            <rect x="12" y="16" width="3" height="2" fill={eyeIris} />
            <rect x="12" y="16" width="1" height="1" fill="#FFFFFF" />
            <rect x="21" y="16" width="3" height="2" fill={eyeIris} />
            <rect x="21" y="16" width="1" height="1" fill="#FFFFFF" />
            <rect x="17" y="19" width="2" height="1" fill="#F472B6" />
          </g>
        )}

        {faceType === 'face_sleepy' && (
          <g>
            <rect x="12" y="16" width="3" height="1" fill="#473335" />
            <rect x="21" y="16" width="3" height="1" fill="#473335" />
            <rect x="17" y="19" width="2" height="1" fill="#FDA4AF" />
          </g>
        )}

        {/* ================= LAYER 7: FRONT HAIR / BANGS ================= */}
        <g>
          <rect x="11" y="7" width="14" height="1" fill={hair.outline} />
          <rect x="10" y="8" width="16" height="2" fill={hair.main} />
          <rect x="11" y="8" width="14" height="1" fill={hair.light} opacity="0.65" />
          <rect x="10" y="10" width="16" height="3" fill={hair.main} />

          {hair.style === 'spiky' ? (
            <>
              <rect x="13" y="6" width="2" height="1" fill={hair.main} />
              <rect x="18" y="6" width="3" height="1" fill={hair.main} />
              <rect x="11" y="13" width="2" height="1" fill={hair.main} />
              <rect x="15" y="13" width="3" height="2" fill={hair.main} />
              <rect x="20" y="13" width="2" height="1" fill={hair.main} />
              <rect x="23" y="13" width="2" height="2" fill={hair.main} />
            </>
          ) : hair.style === 'boy_parted' ? (
            <>
              <rect x="11" y="13" width="5" height="2" fill={hair.main} />
              <rect x="20" y="13" width="5" height="2" fill={hair.main} />
              <rect x="13" y="10" width="3" height="1" fill={hair.light} />
              <rect x="20" y="10" width="3" height="1" fill={hair.light} />
            </>
          ) : hair.style === 'boy_fluffy' ? (
            <>
              <rect x="10" y="7" width="16" height="1" fill={hair.main} />
              <rect x="11" y="13" width="3" height="2" fill={hair.main} />
              <rect x="16" y="13" width="4" height="2" fill={hair.main} />
              <rect x="22" y="13" width="3" height="2" fill={hair.main} />
            </>
          ) : (
            <>
              <rect x="11" y="13" width="4" height="1" fill={hair.main} />
              <rect x="16" y="13" width="4" height="1" fill={hair.main} />
              <rect x="21" y="13" width="4" height="1" fill={hair.main} />
              <rect x="13" y="11" width="3" height="1" fill={hair.light} />
              <rect x="20" y="11" width="3" height="1" fill={hair.light} />
            </>
          )}

          {/* Side Hair Locks */}
          <rect x="10" y="10" width="2" height={isShortHair ? 6 : 11} fill={hair.main} />
          <rect x="9" y="10" width="1" height={isShortHair ? 5 : 10} fill={hair.outline} />
          <rect x="24" y="10" width="2" height={isShortHair ? 6 : 11} fill={hair.main} />
          <rect x="26" y="10" width="1" height={isShortHair ? 5 : 10} fill={hair.outline} />
        </g>

        {/* ================= LAYER 8: HEADWEAR — BOY & GIRL ================= */}
        {config.hat === 'bow_ribbon' && (
          <g>
            {/* White & Pink Cat Ears */}
            <rect x="10" y="5" width="2" height="1" fill="#CBD5E1" />
            <rect x="9" y="6" width="4" height="3" fill="#FFFFFF" />
            <rect x="10" y="7" width="2" height="2" fill="#FBCFE8" />
            <rect x="9" y="6" width="1" height="3" fill="#94A3B8" />
            <rect x="24" y="5" width="2" height="1" fill="#CBD5E1" />
            <rect x="23" y="6" width="4" height="3" fill="#FFFFFF" />
            <rect x="24" y="7" width="2" height="2" fill="#FBCFE8" />
            <rect x="26" y="6" width="1" height="3" fill="#94A3B8" />
          </g>
        )}

        {config.hat === 'hat_bunny_ears' && (
          <g>
            {/* Tall Fluffy Bunny Ears */}
            <rect x="11" y="2" width="3" height="6" fill="#FFFFFF" />
            <rect x="12" y="3" width="1" height="4" fill="#FBCFE8" />
            <rect x="11" y="2" width="3" height="1" fill="#CBD5E1" />
            <rect x="22" y="2" width="3" height="6" fill="#FFFFFF" />
            <rect x="23" y="3" width="1" height="4" fill="#FBCFE8" />
            <rect x="22" y="2" width="3" height="1" fill="#CBD5E1" />
          </g>
        )}

        {config.hat === 'hat_bear_ears' && (
          <g>
            {/* Cute Brown Bear Ears */}
            <rect x="9" y="5" width="4" height="4" fill="#92400E" />
            <rect x="10" y="6" width="2" height="2" fill="#FDE68A" />
            <rect x="23" y="5" width="4" height="4" fill="#92400E" />
            <rect x="24" y="6" width="2" height="2" fill="#FDE68A" />
          </g>
        )}

        {config.hat === 'hat_panda_ears' && (
          <g>
            {/* Cute Panda Ears */}
            <rect x="9" y="5" width="4" height="4" fill="#1E293B" />
            <rect x="10" y="6" width="2" height="2" fill="#475569" />
            <rect x="23" y="5" width="4" height="4" fill="#1E293B" />
            <rect x="24" y="6" width="2" height="2" fill="#475569" />
          </g>
        )}

        {config.hat === 'cap_red' && (
          <g>
            <rect x="13" y="5" width="4" height="3" fill="#F472B6" />
            <rect x="19" y="5" width="4" height="3" fill="#F472B6" />
            <rect x="17" y="6" width="2" height="2" fill="#EC4899" />
            <rect x="14" y="6" width="2" height="1" fill="#FBCFE8" />
            <rect x="20" y="6" width="2" height="1" fill="#FBCFE8" />
          </g>
        )}

        {config.hat === 'hat_street_cap' && (
          <g>
            {/* Cool Black Street Cap */}
            <rect x="11" y="5" width="14" height="4" fill="#1E293B" />
            <rect x="10" y="8" width="19" height="2" fill="#0F172A" />
            <rect x="16" y="6" width="4" height="2" fill="#38BDF8" />
          </g>
        )}

        {config.hat === 'hat_beanie_blue' && (
          <g>
            {/* Cozy Blue Knit Beanie */}
            <rect x="12" y="5" width="12" height="3" fill="#38BDF8" />
            <rect x="10" y="7" width="16" height="3" fill="#0284C7" />
            <rect x="16" y="3" width="4" height="2" fill="#E0F2FE" />
          </g>
        )}

        {config.hat === 'hat_headphones' && (
          <g>
            {/* Neon Gamer Headphones */}
            <rect x="10" y="6" width="16" height="2" fill="#1E293B" />
            <rect x="8" y="13" width="2" height="6" fill="#0F172A" />
            <rect x="8" y="15" width="1" height="2" fill="#22D3EE" />
            <rect x="26" y="13" width="2" height="6" fill="#0F172A" />
            <rect x="27" y="15" width="1" height="2" fill="#22D3EE" />
          </g>
        )}

        {config.hat === 'hat_halo' && (
          <g>
            <rect x="13" y="3" width="10" height="1" fill="#FDE047" />
            <rect x="12" y="4" width="1" height="1" fill="#FACC15" />
            <rect x="23" y="4" width="1" height="1" fill="#FACC15" />
            <rect x="13" y="5" width="10" height="1" fill="#FEF08A" />
          </g>
        )}

        {config.hat === 'hat_devil_horns' && (
          <g>
            <rect x="10" y="4" width="2" height="3" fill="#DC2626" />
            <rect x="11" y="6" width="2" height="2" fill="#991B1B" />
            <rect x="24" y="4" width="2" height="3" fill="#DC2626" />
            <rect x="23" y="6" width="2" height="2" fill="#991B1B" />
          </g>
        )}

        {config.hat === 'mushroom_beret' && (
          <g>
            <rect x="12" y="5" width="12" height="3" fill="#FDBA74" />
            <rect x="10" y="7" width="16" height="2" fill="#FB923C" />
            <rect x="17" y="4" width="2" height="1" fill="#EA580C" />
            <rect x="14" y="6" width="2" height="1" fill="#FFEDD5" />
          </g>
        )}

        {config.hat === 'wizard_cone' && (
          <g>
            <rect x="17" y="2" width="2" height="1" fill="#FDE047" />
            <rect x="16" y="3" width="4" height="2" fill="#C4B5FD" />
            <rect x="14" y="5" width="8" height="2" fill="#A78BFA" />
            <rect x="12" y="7" width="12" height="2" fill="#FBCFE8" />
            <rect x="17" y="5" width="2" height="1" fill="#FEF08A" />
          </g>
        )}

        {config.hat === 'crown_golden' && (
          <g>
            <rect x="13" y="4" width="2" height="2" fill="#FDE047" />
            <rect x="17" y="3" width="2" height="3" fill="#FDE047" />
            <rect x="21" y="4" width="2" height="2" fill="#FDE047" />
            <rect x="13" y="6" width="10" height="2" fill="#FACC15" />
            <rect x="17" y="6" width="2" height="1" fill="#F472B6" />
          </g>
        )}

        {/* ================= LAYER 9: FRONT ACCESSORIES ================= */}
        {config.accessory === 'glasses_round' && (
          <g>
            <rect x="11" y="15" width="5" height="1" fill="#475569" />
            <rect x="11" y="18" width="5" height="1" fill="#475569" />
            <rect x="11" y="16" width="1" height="2" fill="#475569" />
            <rect x="15" y="16" width="1" height="2" fill="#475569" />
            <rect x="16" y="16" width="4" height="1" fill="#475569" />
            <rect x="20" y="15" width="5" height="1" fill="#475569" />
            <rect x="20" y="18" width="5" height="1" fill="#475569" />
            <rect x="20" y="16" width="1" height="2" fill="#475569" />
            <rect x="24" y="16" width="1" height="2" fill="#475569" />
          </g>
        )}

        {config.accessory === 'acc_sunglasses' && (
          <g>
            <rect x="11" y="15" width="5" height="3" fill="#0F172A" />
            <rect x="12" y="16" width="1" height="1" fill="#38BDF8" />
            <rect x="16" y="16" width="4" height="1" fill="#0F172A" />
            <rect x="20" y="15" width="5" height="3" fill="#0F172A" />
            <rect x="21" y="16" width="1" height="1" fill="#38BDF8" />
          </g>
        )}

        {config.accessory === 'acc_scarf_red' && (
          <g>
            <rect x="13" y="22" width="10" height="2" fill="#EF4444" />
            <rect x="19" y="24" width="3" height="5" fill="#DC2626" />
            <rect x="19" y="28" width="3" height="1" fill="#FEF08A" />
          </g>
        )}

        {config.accessory === 'acc_bowtie' && (
          <g>
            <rect x="15" y="23" width="2" height="2" fill="#E11D48" />
            <rect x="17" y="23" width="2" height="2" fill="#9F1239" />
            <rect x="19" y="23" width="2" height="2" fill="#E11D48" />
          </g>
        )}

        {config.accessory === 'acc_bandaid' && (
          <g>
            <rect x="22" y="18" width="3" height="1" fill="#FDE68A" />
            <rect x="23" y="18" width="1" height="1" fill="#F59E0B" />
          </g>
        )}
      </svg>
    </motion.div>
  );
};
