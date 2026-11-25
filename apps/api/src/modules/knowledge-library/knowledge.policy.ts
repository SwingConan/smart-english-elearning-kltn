import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';
import type { KnowledgeDraftDto } from './knowledge.dto';
export function knowledgeText(s: string) {
  if (/<[^>]*>|!\[|(?:javascript|data|vbscript|file|https?):\s*|(?:^|\s)www\./i.test(s))
    throw new BadRequestException(
      'Knowledge text cannot contain HTML, embeds, remote images or raw URLs',
    );
  return s;
}
export function knowledgeReference(url: string) {
  try {
    const u = new URL(url);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      isIP(u.hostname) ||
      !u.hostname.includes('.') ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(u.hostname)
    )
      throw Error();
    return u.href;
  } catch {
    throw new BadRequestException(
      'Citation requires a public HTTPS URL without credentials or tracking parameters',
    );
  }
}
export function validateKnowledge(b: KnowledgeDraftDto, complete = false) {
  for (const v of [
    b.title,
    b.bodyMarkdown,
    ...b.objectives,
    ...b.synonyms,
    ...b.examples.flatMap((x) => [x.english, x.explanation]),
    ...b.practice.flatMap((x) => [x.prompt, x.feedback, ...x.options]),
  ])
    knowledgeText(v);
  for (const ref of b.references) knowledgeReference(ref.url);
  if (
    !b.title.trim() ||
    b.practice.some((x) => x.answer >= x.options.length) ||
    (complete &&
      (new Set(b.practice.map((p) => p.prompt.trim().toLowerCase())).size !== b.practice.length ||
        b.practice.some(
          (x) =>
            !x.prompt.trim() ||
            !x.feedback.trim() ||
            x.options.some((v) => !v.trim()) ||
            new Set(x.options.map((v) => v.trim().toLowerCase())).size !== x.options.length,
        ) ||
        b.examples.some((x) => !x.english.trim() || !x.explanation.trim())))
  )
    throw new BadRequestException('Complete independent practice and valid options required');
  if (b.kind === 'TAG') {
    if (!b.tagCode || b.tagRevisionIds.length || b.examples.length || b.practice.length)
      throw new BadRequestException(
        'Typed canonical tag requires its own code, not article/quiz content',
      );
    if (
      complete &&
      (!b.skills.length ||
        !b.part ||
        b.skills.some(
          (s) =>
            !['READING', 'LISTENING'].includes(s) ||
            (s === 'READING' && b.part! >= 1 && b.part! <= 4) ||
            (s === 'LISTENING' && b.part! >= 5),
        ))
    )
      throw new BadRequestException('Explicit compatible TOEIC skill/part required');
  } else {
    if (b.tagCode) throw new BadRequestException('Only canonical TAG has a code');
    if (
      complete &&
      (!b.objectives.length ||
        b.bodyMarkdown.trim().length < 100 ||
        !b.examples.length ||
        b.practice.length < 3 ||
        !b.tagRevisionIds.length ||
        !b.rights ||
        b.rights.owner.trim().length < 3 ||
        b.rights.proof.trim().length < 20 ||
        (b.rights.kind === 'ORIGINAL' && b.rights.license !== 'ORIGINAL_TEXT') ||
        (b.rights.kind === 'LICENSED' && b.rights.license === 'ORIGINAL_TEXT'))
    )
      throw new BadRequestException(
        'Objectives, substantive text, examples,3 practice items, reviewed tags and explicit rights evidence required',
      );
  }
}
