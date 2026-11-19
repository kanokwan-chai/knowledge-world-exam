export type UserRole = 'teacher' | 'student' | 'admin';

export type ExamSessionMode = 'serious_exam' | 'activity_game';

export type QuestionType = 'multiple_choice' | 'true_false' | 'image_quiz' | 'text_quiz';

export type GameRoomStatus = 'lobby' | 'question_active' | 'question_reveal' | 'leaderboard' | 'finished';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type AvatarSlot =
  | 'gender'
  | 'face'
  | 'base_character'
  | 'hair'
  | 'outfit'
  | 'hat'
  | 'accessory';

export type PowerType = 'lightning' | 'fire' | 'shield' | 'lucky' | 'star' | 'diamond';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string;
  role: UserRole;
  coins: number;
  exp: number;
  level: number;
  total_games_played: number;
  total_score: number;
  created_at: string;
  updated_at: string;
}

export interface Classroom {
  id: string;
  teacher_id: string;
  name: string;
  grade_level: string;
  class_code: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface ClassroomStudent {
  id: string;
  classroom_id: string;
  student_id: string;
  student_number: string | null;
  joined_at: string;
  profiles?: Profile;
}

export interface Quiz {
  id: string;
  teacher_id: string;
  classroom_id: string | null;
  title: string;
  description: string;
  subject: string;
  game_mode: 'adventure_standard' | 'speed_rush' | 'boss_castle' | 'survival';
  is_published: boolean;
  created_at: string;
  updated_at: string;
  questions?: Question[];
}

export interface Question {
  id: string;
  quiz_id: string;
  question_type: QuestionType;
  prompt: string;
  image_url: string | null;
  explanation: string;
  time_limit_seconds: number;
  base_points: number;
  speed_bonus_max: number;
  sort_order: number;
  answer_choices?: AnswerChoice[];
}

export interface AnswerChoice {
  id: string;
  question_id: string;
  choice_label: string;
  choice_text: string;
  image_url: string | null;
  is_correct?: boolean | null;
  sort_order: number;
}

export interface AvatarConfig {
  gender?: 'male' | 'female';
  face?: string;
  base: string;
  hair: string;
  outfit: string;
  hat: string;
  accessory: string;
}

export interface GameRoom {
  id: string;
  pin_code: string;
  host_teacher_id: string;
  quiz_id: string;
  classroom_id: string | null;
  game_mode: string;
  status: GameRoomStatus;
  current_question_index: number;
  current_question_id: string | null;
  question_started_at: string | null;
  question_ends_at: string | null;
  max_players: number;
  allow_guest: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface GameParticipant {
  id: string;
  room_id: string;
  profile_id: string | null;
  guest_session_token: string | null;
  nickname: string;
  avatar_config: AvatarConfig;
  current_score: number;
  correct_count: number;
  streak_count: number;
  max_streak: number;
  total_response_ms: number;
  active_power: PowerType | null;
  shield_active: boolean;
  is_disqualified?: boolean;
  disqualified_reason?: string | null;
  is_connected: boolean;
  joined_at: string;
  last_seen_at: string;
}

export interface PublicQuestionPayload {
  room_id: string;
  status: GameRoomStatus;
  question_index: number;
  total_questions?: number;
  question_started_at: string;
  question_ends_at: string;
  question: {
    id: string;
    question_type: QuestionType;
    prompt: string;
    image_url: string | null;
    time_limit_seconds: number;
    base_points: number;
    speed_bonus_max: number;
    explanation: string | null;
  };
  choices: AnswerChoice[];
}

export interface SubmitAnswerResult {
  answer_id: string;
  is_correct: boolean;
  response_time_ms: number;
  base_points_awarded: number;
  speed_bonus_awarded: number;
  power_bonus_awarded: number;
  total_points_awarded: number;
  new_streak: number;
  dropped_power: {
    power_type: PowerType;
    name: string;
    rarity: ItemRarity;
    description: string;
  } | null;
}

export interface AvatarItem {
  id: string;
  code: string;
  name: string;
  slot: AvatarSlot;
  rarity: ItemRarity;
  price_coins: number;
  required_level: number;
  preview_color: string;
  svg_key: string;
  is_starter: boolean;
}

export interface PlayerInventoryItem {
  id: string;
  profile_id: string;
  item_id: string;
  acquired_source: string;
  is_equipped: boolean;
  acquired_at: string;
  avatar_items?: AvatarItem;
}

export interface PowerCatalogItem {
  id: string;
  power_type: PowerType;
  name: string;
  description: string;
  rarity: ItemRarity;
  drop_weight: number;
  effect_value: number;
  cooldown_seconds: number;
  is_enabled: boolean;
}

export interface PlayerPowerInstance {
  id: string;
  profile_id: string | null;
  participant_id: string | null;
  room_id: string | null;
  power_id: string;
  power_type: PowerType;
  status: 'in_inventory' | 'activated' | 'expired';
  obtained_at: string;
  used_at: string | null;
  cooldown_until: string | null;
  powers?: PowerCatalogItem;
}

export interface LuckyBlockRollResult {
  reward_id: string;
  name: string;
  reward_type: 'coins' | 'exp' | 'avatar_item' | 'power';
  rarity: ItemRarity;
  coin_amount: number;
  exp_amount: number;
  item_id: string | null;
}

export interface Mission {
  id: string;
  code: string;
  title: string;
  description: string;
  mission_type: string;
  target_value: number;
  reward_coins: number;
  reward_exp: number;
  is_repeatable: boolean;
}

export interface PlayerMission {
  id: string;
  profile_id: string;
  mission_id: string;
  current_progress: number;
  is_completed: boolean;
  reward_claimed: boolean;
  completed_at: string | null;
  missions?: Mission;
}

export interface Achievement {
  id: string;
  code: string;
  title: string;
  description: string;
  icon_name: string;
  condition_type: string;
  condition_target: number;
  reward_coins: number;
  reward_exp: number;
}

export interface ScoreRecord {
  id: string;
  room_id: string;
  participant_id: string;
  profile_id: string | null;
  classroom_id: string | null;
  total_score: number;
  correct_answers: number;
  total_questions: number;
  accuracy_percent: number;
  avg_response_ms: number;
  final_rank: number | null;
  is_disqualified?: boolean;
  disqualified_reason?: string | null;
  coins_earned: number;
  exp_earned: number;
  recorded_at: string;
  game_participants?: {
    nickname: string;
    avatar_config: AvatarConfig;
  };
}

export interface GameHistoryRecord {
  id: string;
  room_id: string;
  quiz_id: string;
  teacher_id: string;
  classroom_id: string | null;
  total_participants: number;
  average_score: number;
  average_accuracy: number;
  top_player_nickname: string | null;
  top_player_score: number;
  started_at: string | null;
  ended_at: string;
  quizzes?: { title: string; subject: string };
}

export type RealtimeBroadcastEvent =
  | { type: 'ROOM_STATUS_CHANGED'; status: GameRoomStatus; question_index: number }
  | { type: 'ANSWER_SUBMITTED'; participant_id: string; nickname: string }
  | { type: 'POWER_USED'; participant_id: string; nickname: string; power_type: PowerType }
  | {
      type: 'BATTLE_ATTACK';
      attacker_id: string;
      attacker_name: string;
      target_id: string;
      target_name: string;
      action: 'fireball' | 'steal' | 'heal';
      amount: number;
    }
  | { type: 'CHEATING_DISQUALIFIED'; participant_id: string; nickname: string; reason: string }
  | { type: 'STUDENT_PARDONED'; participant_id: string; nickname: string }
  | { type: 'LEADERBOARD_UPDATED' }
  | { type: 'GAME_FINISHED' };

export interface DetailedAnswerCell {
  question_id: string;
  question_number: number;
  prompt: string;
  selected_text: string;
  correct_text: string;
  is_correct: boolean;
  unanswered: boolean;
  response_time_ms: number;
}

export interface DetailedStudentReportRow {
  participant: GameParticipant;
  real_exam_score: number;
  total_questions: number;
  game_exp_score: number;
  answered_count: number;
  cells: DetailedAnswerCell[];
}

export interface RoomDetailedReport {
  room: GameRoom;
  quiz_title: string;
  quiz_subject: string;
  questions: Question[];
  rows: DetailedStudentReportRow[];
}

export interface TeacherExamRoomSummary {
  id: string;
  pin_code: string;
  quiz_id: string;
  game_mode: string;
  status: GameRoomStatus;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  participant_count: number;
  quizzes?: { title: string; subject: string } | null;
}
