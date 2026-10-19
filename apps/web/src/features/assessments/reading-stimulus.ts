export type ReadingDocumentType =
  'GENERIC_DOCUMENT' | 'EMAIL' | 'WEB_PAGE' | 'ARTICLE' | 'RESPONSIBILITY_LIST' | 'CHAT';

export interface EmailMetadataLine {
  label: 'To' | 'From' | 'Date' | 'Subject';
  value: string;
}

export interface ChatMessage {
  speaker: string;
  timestamp: string;
  message: string;
}

export interface ReadingTable {
  startLine: number;
  endLine: number;
  rows: string[][];
}

export interface ResponsibilityItem {
  label: string;
  value: string;
}

export interface ReadingDocument {
  type: ReadingDocumentType;
  rawText: string;
  heading: string | null;
  contentStartLine: number;
  emailMetadata?: EmailMetadataLine[];
  emailBodyStartLine?: number;
  chatMessages?: ChatMessage[];
  table?: ReadingTable;
  responsibilityItems?: ResponsibilityItem[];
  articleByline?: string | null;
  articleBodyStartLine?: number;
}

export interface ParsedReadingStimulus {
  sourceText: string;
  documents: ReadingDocument[];
}

const structuredReadingTaskCodes = new Set(['R6_TEXT_COMPLETION', 'R7_READING_COMPREHENSION']);

export function isStructuredReadingTask(skill: string, taskCode: string | null): boolean {
  return skill === 'READING' && taskCode !== null && structuredReadingTaskCodes.has(taskCode);
}

const documentMarker = /^(?:E-MAIL|WEB PAGE|TASKS AND RESPONSIBILITIES|ARTICLE[^\n]*)$/gm;
const emailMetadata = /^(To|From|Date|Subject):\s?(.*)$/;
const chatLine = /^(.+?) \(([^()]+)\):\s?(.*)$/;

export function parseReadingStimulus(rawText: string): ParsedReadingStimulus {
  const sourceText = rawText.replace(/\r\n?/g, '\n');
  if (!sourceText) return { sourceText, documents: [] };

  const starts = [...sourceText.matchAll(documentMarker)].map((match) => match.index ?? 0);
  const sections: string[] = [];
  if (starts.length === 0) {
    sections.push(sourceText);
  } else {
    if (starts[0] > 0) sections.push(sourceText.slice(0, starts[0]));
    for (const [index, start] of starts.entries()) {
      sections.push(sourceText.slice(start, starts[index + 1] ?? sourceText.length));
    }
  }

  return {
    sourceText,
    documents: sections.filter((section) => section.length > 0).map(parseDocument),
  };
}

function parseDocument(rawText: string): ReadingDocument {
  const lines = rawText.split('\n');
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);
  const firstLine = firstContentLine >= 0 ? lines[firstContentLine].trim() : '';
  const heading = isDocumentHeading(firstLine) ? firstLine : null;
  const contentStartLine = heading ? firstContentLine + 1 : Math.max(0, firstContentLine);

  if (heading === 'E-MAIL' || (!heading && looksLikeEmail(lines, contentStartLine))) {
    return parseEmail(rawText, lines, heading, contentStartLine);
  }
  if (heading === 'WEB PAGE') {
    return {
      type: 'WEB_PAGE',
      rawText,
      heading,
      contentStartLine,
      table: findPipeTable(lines, contentStartLine),
    };
  }
  if (heading === 'TASKS AND RESPONSIBILITIES') {
    const responsibilityItems = lines
      .slice(contentStartLine)
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const separator = line.indexOf(':');
        return separator > 0
          ? { label: line.slice(0, separator), value: line.slice(separator + 1).trimStart() }
          : { label: '', value: line };
      });
    return {
      type: 'RESPONSIBILITY_LIST',
      rawText,
      heading,
      contentStartLine,
      responsibilityItems,
    };
  }
  if (heading?.startsWith('ARTICLE')) {
    const bylineIndex = lines.findIndex(
      (line, index) => index >= contentStartLine && /^by\s+/i.test(line.trim()),
    );
    return {
      type: 'ARTICLE',
      rawText,
      heading,
      contentStartLine,
      articleByline: bylineIndex >= 0 ? lines[bylineIndex].trim() : null,
      articleBodyStartLine: bylineIndex >= 0 ? bylineIndex + 1 : contentStartLine,
    };
  }

  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const messages = nonEmptyLines.map((line) => line.match(chatLine));
  if (messages.length > 0 && messages.every(Boolean)) {
    return {
      type: 'CHAT',
      rawText,
      heading: null,
      contentStartLine: 0,
      chatMessages: messages.map((match) => ({
        speaker: match?.[1] ?? '',
        timestamp: match?.[2] ?? '',
        message: match?.[3] ?? '',
      })),
    };
  }

  return { type: 'GENERIC_DOCUMENT', rawText, heading, contentStartLine };
}

function parseEmail(
  rawText: string,
  lines: string[],
  heading: string | null,
  contentStartLine: number,
): ReadingDocument {
  const metadata: EmailMetadataLine[] = [];
  let bodyStart = contentStartLine;
  while (bodyStart < lines.length) {
    if (!lines[bodyStart].trim()) {
      bodyStart += 1;
      continue;
    }
    const match = lines[bodyStart].match(emailMetadata);
    if (!match) break;
    metadata.push({ label: match[1] as EmailMetadataLine['label'], value: match[2] });
    bodyStart += 1;
  }
  return {
    type: 'EMAIL',
    rawText,
    heading,
    contentStartLine,
    emailMetadata: metadata,
    emailBodyStartLine: bodyStart,
  };
}

function looksLikeEmail(lines: string[], start: number): boolean {
  const labels = new Set<string>();
  for (const line of lines.slice(start, start + 8)) {
    const match = line.match(emailMetadata);
    if (match) labels.add(match[1]);
    else if (line.trim()) break;
  }
  return labels.has('To') && labels.has('From') && labels.has('Subject');
}

function findPipeTable(lines: string[], start: number): ReadingTable | undefined {
  const first = lines.findIndex((line, index) => index >= start && line.includes('|'));
  if (first < 0) return undefined;
  let end = first;
  while (end + 1 < lines.length && lines[end + 1].includes('|')) end += 1;
  const rows = lines
    .slice(first, end + 1)
    .map((line) => line.split('|').map((cell) => cell.trim()));
  return rows.length >= 2 ? { startLine: first, endLine: end, rows } : undefined;
}

function isDocumentHeading(line: string): boolean {
  return (
    line === 'E-MAIL' ||
    line === 'WEB PAGE' ||
    line === 'TASKS AND RESPONSIBILITIES' ||
    line.startsWith('ARTICLE')
  );
}
