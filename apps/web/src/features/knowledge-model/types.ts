export interface Skill {
  id: string;
  courseId: string;
  code: string;
  name: string;
  description: string | null;
  pInit: number;
  pLearn: number;
  pGuess: number;
  pSlip: number;
  createdAt: string;
  updatedAt: string;
}

export type SkillInput = Pick<
  Skill,
  'code' | 'name' | 'description' | 'pInit' | 'pLearn' | 'pGuess' | 'pSlip'
>;

export type SkillUpdate = Partial<SkillInput>;
export type SkillPrerequisiteMapping = Skill[];
export type QuestionSkillMapping = Skill[];
export type LessonSkillMapping = Skill[];
