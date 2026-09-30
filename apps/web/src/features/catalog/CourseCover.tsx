import {
  BookOpenText,
  FilePenLine,
  Headphones,
  MessageCircle,
  Mic2,
  type LucideIcon,
} from 'lucide-react';
import type { PublicCourse } from './types';

const coverStyles: Record<PublicCourse['skillScope'], string> = {
  LISTENING: 'from-indigo-700 via-blue-600 to-sky-400',
  READING: 'from-indigo-800 via-violet-600 to-blue-400',
  WRITING: 'from-blue-800 via-indigo-600 to-violet-400',
  SPEAKING: 'from-sky-700 via-blue-600 to-indigo-500',
  LR: 'from-indigo-800 via-blue-600 to-cyan-400',
  FOUR_SKILLS: 'from-indigo-900 via-violet-600 to-sky-400',
};

export function CourseCover({
  skillScope,
  className = '',
}: {
  skillScope: PublicCourse['skillScope'];
  className?: string;
}) {
  const icons: Record<PublicCourse['skillScope'], LucideIcon[]> = {
    LISTENING: [Headphones],
    READING: [BookOpenText],
    WRITING: [FilePenLine],
    SPEAKING: [Mic2],
    LR: [Headphones, BookOpenText],
    FOUR_SKILLS: [Headphones, BookOpenText, Mic2, MessageCircle],
  };
  return (
    <div
      aria-hidden="true"
      className={`relative grid overflow-hidden bg-gradient-to-br ${coverStyles[skillScope]} ${className}`}
    >
      <div className="absolute -right-10 -top-12 size-40 rounded-full border border-white/15 bg-white/10" />
      <div className="absolute -bottom-16 -left-8 size-44 rounded-full border border-white/10 bg-indigo-950/15" />
      <div
        className={`relative z-10 grid place-items-center gap-3 text-white/95 ${icons[skillScope].length > 2 ? 'grid-cols-2' : 'grid-flow-col'}`}
      >
        {icons[skillScope].map((Icon, index) => (
          <span
            className="grid size-16 place-items-center rounded-2xl border border-white/20 bg-white/10 backdrop-blur"
            key={`${skillScope}-${index}`}
          >
            <Icon size={32} strokeWidth={1.8} />
          </span>
        ))}
      </div>
    </div>
  );
}
