import React, { useState, useEffect } from 'react';
import { X, Clock, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TimePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialValue: string; // "HH:mm"
  onSelect: (timeStr: string) => void;
  title?: string;
}

export default function TimePickerModal({
  isOpen,
  onClose,
  initialValue,
  onSelect,
  title = "시간 정밀 선택"
}: TimePickerModalProps) {
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
  const [selectedHour, setSelectedHour] = useState<number>(0);
  const [selectedMinute, setSelectedMinute] = useState<number>(0);

  // Initialize state based on initialValue
  useEffect(() => {
    if (isOpen) {
      const cleanVal = initialValue || '';
      let defaultH = 0;
      let defaultM = 0;
      let defaultAp: 'AM' | 'PM' = 'AM';

      if (cleanVal && cleanVal.includes(':')) {
        const [hStr, mStr] = cleanVal.split(':');
        const h24 = parseInt(hStr, 10) || 0;
        const m = parseInt(mStr, 10) || 0;

        defaultAp = h24 >= 12 ? 'PM' : 'AM';
        
        let h12 = h24 % 12;
        defaultH = h12;

        // round to nearest 5 minutes
        defaultM = Math.round(m / 5) * 5;
        if (defaultM >= 60) {
          defaultM = 55;
        }
      } else {
        // Fallback to active current time rounded to 5 minutes
        const now = new Date();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();

        defaultAp = currentHour >= 12 ? 'PM' : 'AM';
        let h12 = currentHour % 12;
        defaultH = h12;

        defaultM = Math.round(currentMin / 5) * 5;
        if (defaultM >= 60) {
          defaultM = 55;
        }
      }

      setAmpm(defaultAp);
      setSelectedHour(defaultH);
      setSelectedMinute(defaultM);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    // Convert 12-hour format back to 24-hour HH:mm
    let h24 = selectedHour;
    if (ampm === 'PM') {
      h24 += 12;
    }
    const hStr = h24.toString().padStart(2, '0');
    const mStr = selectedMinute.toString().padStart(2, '0');
    
    onSelect(`${hStr}:${mStr}`);
    onClose();
  };

  const hours = Array.from({ length: 12 }, (_, i) => i); // [0, 1, ..., 11]
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-sm bg-[#121212] rounded-2xl border border-neutral-800/90 overflow-hidden shadow-2xl flex flex-col relative font-sans"
        >
          {/* Modal Header */}
          <div className="p-4 border-b border-neutral-800/50 flex items-center justify-between bg-[#121212]">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-amber-500" />
              <div>
                <h3 className="text-[13px] font-black text-white">{title}</h3>
                <p className="text-[10px] text-zinc-400 font-bold tracking-tight uppercase">TIME SELECTION CENTER</p>
              </div>
            </div>
            <button 
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-neutral-800 rounded-xl text-zinc-450 text-zinc-300 hover:text-white transition-all border border-neutral-800/45"
            >
              <X size={14} />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-4.5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* AM/PM Switcher */}
            <div className="flex bg-[#141416] p-1 rounded-xl border border-neutral-850">
              <button
                type="button"
                onClick={() => setAmpm('AM')}
                className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                  ampm === 'AM' 
                    ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/10' 
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                오전 (AM)
              </button>
              <button
                type="button"
                onClick={() => setAmpm('PM')}
                className={`flex-1 py-2 text-xs font-black rounded-xl transition-all ${
                  ampm === 'PM' 
                    ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/10' 
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                오후 (PM)
              </button>
            </div>

            {/* Hours Selector Grid */}
            <div>
              <span className="text-[11px] text-[#FFFFFF] font-extrabold block mb-2">시간 선택 (Hour)</span>
              <div className="grid grid-cols-4 gap-1.5">
                {hours.map((hr) => {
                  const isSelected = selectedHour === hr;
                  return (
                    <button
                      key={hr}
                      type="button"
                      onClick={() => setSelectedHour(hr)}
                      className={`py-2 text-[12px] font-bold rounded-xl transition-all border ${
                        isSelected 
                          ? 'bg-amber-500 text-zinc-950 font-black' 
                          : 'bg-[#141416]/50 border-neutral-850 text-white hover:text-zinc-200 hover:border-neutral-700'
                      }`}
                    >
                      {hr.toString().padStart(2, '0')}시
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Minutes Selector Grid */}
            <div>
              <span className="text-[11px] text-[#FFFFFF] font-extrabold block mb-2">분 선택 (Minute - 5분 단위)</span>
              <div className="grid grid-cols-4 gap-1.5">
                {minutes.map((min) => {
                  const isSelected = selectedMinute === min;
                  return (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setSelectedMinute(min)}
                      className={`py-2 text-[12px] font-bold rounded-xl transition-all border ${
                        isSelected 
                          ? 'bg-amber-500 text-zinc-950 font-black' 
                          : 'bg-[#141416]/50 border-neutral-850 text-white hover:text-zinc-200 hover:border-neutral-700'
                      }`}
                    >
                      {min.toString().padStart(2, '0')}분
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Currently Selected Preview block */}
            <div className="p-3 bg-[#141416] border border-neutral-850 rounded-xl flex items-center justify-between">
              <span className="text-[11px] text-zinc-300 font-black">선택한 시간</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xs text-amber-500 font-bold">{ampm === 'AM' ? '오전' : '오후'}</span>
                <span className="text-base text-white font-black font-mono">
                  {selectedHour.toString().padStart(2, '0')}:{selectedMinute.toString().padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>

          {/* Modal Footer with OK Confirm Button */}
          <div className="p-4 bg-[#141416]/50 border-t border-neutral-800/50 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 text-xs bg-[#2C2C2E] hover:bg-[#3C3C3E] text-zinc-200 hover:text-white rounded-xl font-bold transition-all border border-neutral-800"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-[2] py-3 text-xs bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-zinc-950 rounded-xl font-black transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/10"
            >
              <Check size={14} className="stroke-[2.5]" />
              확인
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
