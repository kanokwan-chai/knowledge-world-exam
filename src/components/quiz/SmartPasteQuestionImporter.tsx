import React, { useState } from 'react';
import {
  Wand2,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  Trash2,
  Save,
  Sparkles,
  Loader2,
  X,
  AlertCircle,
} from 'lucide-react';
import { ParsedDraftQuestion, parseRawQuizText } from '../../lib/smartQuizParser';
import { uploadQuestionImage } from '../../services/gameEngineService';
import { soundEngine } from '../../lib/soundEngine';

interface SmartPasteQuestionImporterProps {
  quizTitle?: string;
  isLoggedIn?: boolean;
  onRequestTeacherLogin?: () => void;
  onSaveBulkQuestions: (questions: ParsedDraftQuestion[]) => Promise<void>;
}

const SAMPLE_PASTE_TEXT = `1. ดาวเคราะห์ดวงใดในระบบสุริยะที่มีขนาดใหญ่ที่สุด?
ก. โลก
ข. ดาวอังคาร
*ค. ดาวพฤหัสบดี
ง. ดาวเสาร์
เฉลย: ค เพราะดาวพฤหัสบดีเป็นดาวเคราะห์แก๊สยักษ์ที่ใหญ่ที่สุด

2. พืชใช้แก๊สใดเป็นวัตถุดิบหลักในกระบวนการสังเคราะห์ด้วยแสง?
ก. แก๊สออกซิเจน
ข. แก๊สคาร์บอนไดออกไซด์ (ถูก)
ค. แก๊สไนโตรเจน
ง. แก๊สฮีเลียม

3. หน่วยพื้นฐานที่เล็กที่สุดของสิ่งมีชีวิตคืออะไร?
A) เนื้อเยื่อ
B) เซลล์
C) อวัยวะ
D) อะตอม
ตอบ: B`;

export const SmartPasteQuestionImporter: React.FC<SmartPasteQuestionImporterProps> = ({
  quizTitle,
  isLoggedIn,
  onRequestTeacherLogin,
  onSaveBulkQuestions,
}) => {
  const [rawText, setRawText] = useState('');
  const [defaultTimer, setDefaultTimer] = useState(20);
  const [drafts, setDrafts] = useState<ParsedDraftQuestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const handleAutoParse = (textToParse: string, timerSec: number = defaultTimer) => {
    soundEngine.playCoinSound();
    const parsed = parseRawQuizText(textToParse, timerSec);
    setDrafts(parsed);
  };

  const handleUpdateDraftPrompt = (tempId: string, prompt: string) => {
    setDrafts((prev) =>
      prev.map((d) => (d.temp_id === tempId ? { ...d, prompt } : d))
    );
  };

  const handleUpdateDraftTimer = (tempId: string, seconds: number) => {
    setDrafts((prev) =>
      prev.map((d) => (d.temp_id === tempId ? { ...d, time_limit_seconds: seconds } : d))
    );
  };

  const handleSelectCorrectChoice = (tempId: string, choiceIdx: number) => {
    soundEngine.playClickSound();
    setDrafts((prev) =>
      prev.map((d) =>
        d.temp_id === tempId
          ? {
              ...d,
              choices: d.choices.map((c, idx) => ({
                ...c,
                is_correct: idx === choiceIdx,
              })),
            }
          : d
      )
    );
  };

  const handleUpdateChoiceText = (tempId: string, choiceIdx: number, text: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.temp_id === tempId
          ? {
              ...d,
              choices: d.choices.map((c, idx) =>
                idx === choiceIdx ? { ...c, choice_text: text } : c
              ),
            }
          : d
      )
    );
  };

  const handleAttachImageFile = async (tempId: string, file: File) => {
    setUploadingId(tempId);
    setSaveError(null);
    try {
      const url = await uploadQuestionImage(file);
      soundEngine.playPowerUpSound();
      setDrafts((prev) =>
        prev.map((d) =>
          d.temp_id === tempId
            ? { ...d, image_url: url, question_type: 'image_quiz' }
            : d
        )
      );
    } catch (err) {
      soundEngine.playWrongSound();
      setSaveError(err instanceof Error ? err.message : 'เพิ่มรูปภาพไม่สำเร็จ');
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemoveDraft = (tempId: string) => {
    setDrafts((prev) => prev.filter((d) => d.temp_id !== tempId));
  };

  const handleSaveAll = async () => {
    if (drafts.length === 0 || saving) return;
    setSaveError(null);
    setSaveSuccess(null);
    setSaving(true);
    try {
      const savedCount = drafts.length;
      await onSaveBulkQuestions(drafts);
      soundEngine.playPowerUpSound();
      setSaveSuccess(`✅ บันทึกโจทย์ทั้ง ${savedCount} ข้อลงฐานข้อมูลเรียบร้อยแล้ว!`);
      setDrafts([]);
      setRawText('');
    } catch (err) {
      soundEngine.playWrongSound();
      setSaveError(err instanceof Error ? err.message : 'บันทึกข้อสอบไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card-game p-6 bg-gradient-to-br from-amber-50 via-kw-cream to-sky-50 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-200 pb-3">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-kw-yellow text-slate-900 border-2 border-slate-900 font-game text-xs font-extrabold">
            <Wand2 className="w-3.5 h-3.5 text-kw-red" /> SMART AUTO-FORMAT QUESTION PASTE
          </span>
          <h3 className="font-game text-2xl font-extrabold text-slate-900 mt-1">
            ช่องวางโจทย์อัตโนมัติ (วางปุ๊บ แยกข้อ+ตัวเลือกให้ทันที — ค่อยกดเพิ่มรูปทีหลังรายข้อได้!)
          </h3>
          <p className="text-xs font-semibold text-slate-600">
            ก๊อปปี้ข้อสอบจาก Word, PDF, Google Docs หรือ AI มาวางในช่องว่างด้านล่างได้เลย รองรับทั้ง{' '}
            <code>ก. ข. ค. ง.</code> และ <code>A. B. C. D.</code> พร้อมตรวจจับเฉลยอัตโนมัติ (เช่น{' '}
            <code>*</code>, <code>(ถูก)</code>, หรือบรรทัด <code>เฉลย: ก</code>)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRawText(SAMPLE_PASTE_TEXT);
              handleAutoParse(SAMPLE_PASTE_TEXT, defaultTimer);
            }}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border-2 border-slate-900 text-xs font-bold flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5 text-kw-orange" /> ดูตัวอย่างการวางโจทย์
          </button>
          {rawText && (
            <button
              type="button"
              onClick={() => {
                setRawText('');
                setDrafts([]);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 border-2 border-slate-900 text-xs font-bold"
            >
              ล้างช่องวาง
            </button>
          )}
        </div>
      </div>

      {/* Paste Box */}
      <div className="space-y-3">
        <textarea
          rows={7}
          value={rawText}
          onChange={(e) => {
            const val = e.target.value;
            setRawText(val);
            if (val.trim().length > 10) {
              setDrafts(parseRawQuizText(val, defaultTimer));
            }
          }}
          placeholder={`วางโจทย์ทั้งหมดของคุณที่นี่ได้เลย (วางได้หลายสิบข้อพร้อมกัน!) ตัวอย่างเช่น:\n1. ดาวเคราะห์ดวงใดใหญ่ที่สุด?\nก. โลก\nข. ดาวอังคาร\n*ค. ดาวพฤหัสบดี\nง. ดาวเสาร์\n\n2. น้ำมีจุดเดือดกี่องศาเซลเซียส?\nก. 50   ข. 80   ค. 100 (ถูก)   ง. 120`}
          className="w-full rounded-2xl border-3 border-slate-900 p-4 font-semibold text-sm bg-white focus:outline-none focus:ring-4 focus:ring-kw-yellow"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1">
              <Clock className="w-4 h-4 text-kw-blue" /> ตั้งเวลาเริ่มต้นทุกข้อ:
            </span>
            {[15, 20, 30, 45, 60, 90].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => {
                  setDefaultTimer(sec);
                  setDrafts((prev) => prev.map((d) => ({ ...d, time_limit_seconds: sec })));
                }}
                className={`px-2.5 py-1 rounded-lg border-2 border-slate-900 text-xs font-bold ${
                  defaultTimer === sec ? 'bg-kw-yellow text-slate-900' : 'bg-white text-slate-700'
                }`}
              >
                {sec} วิ
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleAutoParse(rawText, defaultTimer)}
            disabled={!rawText.trim()}
            className="btn-game-blue text-sm py-2.5 px-5 flex items-center gap-2"
          >
            <Wand2 className="w-4 h-4" />
            <span>จัดระเบียบแยกข้ออัตโนมัติ ({drafts.length} ข้อ)</span>
          </button>
        </div>
      </div>

      {/* Inline Login Warning / Error / Success Feedback */}
      {isLoggedIn === false && (
        <div className="p-3.5 rounded-2xl bg-amber-100 border-3 border-amber-600 text-amber-950 text-xs font-bold flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>⚠️ กรุณาเข้าสู่ระบบบัญชีคุณครูก่อนจึงจะบันทึกข้อสอบลง Supabase ได้</span>
          </div>
          {onRequestTeacherLogin && (
            <button
              type="button"
              onClick={onRequestTeacherLogin}
              className="px-3 py-1.5 rounded-xl bg-kw-blue text-white border-2 border-slate-900 font-bold text-xs"
            >
              🔑 ไปที่กล่องเข้าสู่ระบบ / สมัครคุณครู
            </button>
          )}
        </div>
      )}

      {saveError && (
        <div className="p-3.5 rounded-2xl bg-red-100 border-3 border-red-600 text-red-900 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-100 border-3 border-emerald-600 text-emerald-950 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Parsed Questions Preview List — Add Image Later Per Question! */}
      {drafts.length > 0 && (
        <div className="space-y-4 pt-2 border-t-3 border-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-game text-xl font-extrabold text-slate-900">
                ✅ จัดระเบียบเสร็จแล้ว {drafts.length} ข้อ (ข้อละ 1 คะแนนสอบจริง)
              </h4>
              <p className="text-xs font-bold text-slate-600">
                ข้อไหนต้องการใส่รูป กดปุ่ม <strong>"🖼️ + เพิ่มรูปภาพข้อนี้"</strong> ที่ข้อนั้นได้เลย หรือบันทึกก่อนแล้วค่อยมาใส่รูปทีหลังก็ได้!
              </p>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={handleSaveAll}
              className="btn-game-green text-base py-3 px-6 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>กำลังบันทึก {drafts.length} ข้อ...</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>
                    บันทึกทั้ง {drafts.length} ข้อลงใน {quizTitle ? `"${quizTitle}"` : 'ชุดข้อสอบ'}
                  </span>
                </>
              )}
            </button>
          </div>

          <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1">
            {drafts.map((d, qIdx) => (
              <div
                key={d.temp_id}
                className="p-4 rounded-2xl bg-white border-3 border-slate-900 shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-xl bg-slate-900 text-kw-yellow font-game font-extrabold text-xs">
                      ข้อที่ {qIdx + 1} (1 คะแนน)
                    </span>

                    {/* Per-question timer */}
                    <div className="flex items-center gap-1">
                      {[15, 20, 30, 45, 60].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => handleUpdateDraftTimer(d.temp_id, sec)}
                          className={`px-2 py-0.5 rounded-lg border border-slate-900 text-[11px] font-bold ${
                            d.time_limit_seconds === sec
                              ? 'bg-kw-yellow text-slate-900'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {sec}วิ
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Add Image to this specific question */}
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-100 hover:bg-sky-200 border-2 border-slate-900 text-xs font-extrabold text-slate-900">
                      <ImageIcon className="w-4 h-4 text-kw-blue" />
                      <span>
                        {uploadingId === d.temp_id
                          ? 'กำลังใส่รูป...'
                          : d.image_url
                            ? 'เปลี่ยนรูปข้อนี้'
                            : '+ เพิ่มรูปภาพข้อนี้'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleAttachImageFile(d.temp_id, file);
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => handleRemoveDraft(d.temp_id)}
                      className="p-1.5 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 border-2 border-slate-900"
                      title="ลบข้อนี้"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Editable Question Prompt */}
                <input
                  type="text"
                  value={d.prompt}
                  onChange={(e) => handleUpdateDraftPrompt(d.temp_id, e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-900 px-3 py-2 font-bold text-sm bg-amber-50/40"
                />

                {/* Attached Image Preview if added */}
                {d.image_url && (
                  <div className="relative inline-block">
                    <img
                      src={d.image_url}
                      alt="Question visual"
                      className="max-h-36 rounded-xl border-2 border-slate-900 object-contain bg-slate-50"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDrafts((prev) =>
                          prev.map((item) =>
                            item.temp_id === d.temp_id ? { ...item, image_url: null } : item
                          )
                        )
                      }
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-kw-red text-white border-2 border-slate-900 flex items-center justify-center text-xs font-bold"
                      title="ลบรูปภาพนี้"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Editable Choices Grid (Click letter to mark correct answer) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {d.choices.map((ch, cIdx) => (
                    <div
                      key={cIdx}
                      className={`p-2 rounded-xl border-2 border-slate-900 flex items-center gap-2 ${
                        ch.is_correct ? 'bg-emerald-100' : 'bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectCorrectChoice(d.temp_id, cIdx)}
                        className={`w-7 h-7 rounded-lg border-2 border-slate-900 font-game font-extrabold text-xs flex items-center justify-center shrink-0 ${
                          ch.is_correct ? 'bg-kw-green text-white' : 'bg-white text-slate-700'
                        }`}
                        title="คลิกเพื่อตั้งเป็นคำตอบที่ถูกต้อง"
                      >
                        {ch.choice_label}
                      </button>
                      <input
                        type="text"
                        value={ch.choice_text}
                        onChange={(e) => handleUpdateChoiceText(d.temp_id, cIdx, e.target.value)}
                        className="w-full bg-transparent text-xs font-bold focus:outline-none"
                      />
                      {ch.is_correct && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
