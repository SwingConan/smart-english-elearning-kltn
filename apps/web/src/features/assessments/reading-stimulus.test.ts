import { describe, expect, it } from 'vitest';
import { parseReadingStimulus } from './reading-stimulus';

const realCaseShapes = [
  {
    group: 'P6 Q135–138',
    text: 'As an employee, you are entitled to sick absences for health ------- [135]. Your supervisor will then forward the documentation. ------- [138].',
    types: ['GENERIC_DOCUMENT'],
  },
  {
    group: 'P6 Q139–142',
    text: 'To: fcontini@attmail.com\nFrom: btakemoto@arolischems.co.uk\nDate: 15 July\nSubject: Your first day at Arolis\n\nDear Mr. Contini,\n\nThank you for ------- [139] the position. ------- [142].',
    types: ['EMAIL'],
  },
  {
    group: 'P7 Q164–167',
    text: "Oliver Koh (10:15 A.M.): Has a package arrived for me?\nAaron Koskinen (10:17 A.M.): There's nothing here.\nDenise Matova (10:18 A.M.): There is a package in the mail room.",
    types: ['CHAT'],
  },
  {
    group: 'P7 Q168–171',
    text: 'From: Won Ho Kim\nTo: Management Team\nDate: 12 August\nSubject: Improving employee satisfaction\n\n— [1] —. Please complete the telecommuting survey. — [4] —.',
    types: ['EMAIL'],
  },
  {
    group: 'P7 Q176–180',
    text: 'WEB PAGE\nMountain and Forest Company\n\nOur shipping rates:\nOrder cost | Overnight | Standard\nUnder $25 | $8 | $3\nOver $100 | $18 | FREE\n\nE-MAIL\nTo: service@example.ca\nFrom: customer@example.ca\nDate: 10 January\nSubject: Order B75022\n\nPlease refund the shipping cost.',
    types: ['WEB_PAGE', 'EMAIL'],
  },
  {
    group: 'P7 Q186–190',
    text: 'E-MAIL\nFrom: clinic@example.com\nTo: patient@example.com\nDate: March 20\nSubject: Health Awareness Day\n\nPlease join us.\n\nTASKS AND RESPONSIBILITIES\nCommunications: Martin Stoch\nPresentations: Jillian Opala (Nutrition)\n\nARTICLE — Health Day at Hesidion Clinic\nby Shai Herzog on April 14\n\nThe clinic hosted a successful event.',
    types: ['EMAIL', 'RESPONSIBILITY_LIST', 'ARTICLE'],
  },
] as const;

describe('parseReadingStimulus', () => {
  it.each(realCaseShapes)(
    'classifies the real $group document shape without losing text',
    ({ text, types }) => {
      const parsed = parseReadingStimulus(text);

      expect(parsed.documents.map((document) => document.type)).toEqual(types);
      expect(parsed.documents.map((document) => document.rawText).join('')).toBe(text);
    },
  );

  it('extracts email metadata while keeping the complete source section', () => {
    const text = realCaseShapes[1].text;
    const [email] = parseReadingStimulus(text).documents;

    expect(email.emailMetadata).toEqual([
      { label: 'To', value: 'fcontini@attmail.com' },
      { label: 'From', value: 'btakemoto@arolischems.co.uk' },
      { label: 'Date', value: '15 July' },
      { label: 'Subject', value: 'Your first day at Arolis' },
    ]);
    expect(email.rawText).toContain('------- [142]');
  });

  it('extracts chat messages, a pipe table, responsibilities, and an article byline', () => {
    const chat = parseReadingStimulus(realCaseShapes[2].text).documents[0];
    const webAndEmail = parseReadingStimulus(realCaseShapes[4].text).documents;
    const compound = parseReadingStimulus(realCaseShapes[5].text).documents;

    expect(chat.chatMessages).toHaveLength(3);
    expect(chat.chatMessages?.[0]).toMatchObject({
      speaker: 'Oliver Koh',
      timestamp: '10:15 A.M.',
    });
    expect(webAndEmail[0].table?.rows).toHaveLength(3);
    expect(compound[1].responsibilityItems).toHaveLength(2);
    expect(compound[2].articleByline).toBe('by Shai Herzog on April 14');
  });

  it('falls back safely for an unknown or malformed document', () => {
    const text = 'NOTICE\nA deliberately unfamiliar format.\nReference: [9]';
    const parsed = parseReadingStimulus(text);

    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0]).toMatchObject({ type: 'GENERIC_DOCUMENT', rawText: text });
  });
});
