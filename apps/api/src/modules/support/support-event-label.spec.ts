import { supportEventLabel } from './support-event-label';
const rows = [
  [
    'UPDATED',
    'Th\u00c3\u00b4ng tin phi\u00e1\u00ba\u00bfu \u00c4\u2018\u00c3\u00a3 c\u00e1\u00ba\u00adp nh\u00e1\u00ba\u00adt',
    'Th\u00f4ng tin phi\u1ebfu \u0111\u00e3 c\u1eadp nh\u1eadt',
  ],
  [
    'CREATED',
    '\u00c4\u0090\u00c3\u00a3 nh\u00e1\u00ba\u00adn phi\u00e1\u00ba\u00bfu',
    '\u0110\u00e3 nh\u1eadn phi\u1ebfu',
  ],
  [
    'ASSIGN',
    'Phi\u00e1\u00ba\u00bfu \u00c4\u2018\u00c6\u00b0\u00e1\u00bb\u00a3c ph\u00c3\u00a2n c\u00c3\u00b4ng',
    'Phi\u1ebfu \u0111\u01b0\u1ee3c ph\u00e2n c\u00f4ng',
  ],
  [
    'TRANSITION',
    'Tr\u00e1\u00ba\u00a1ng th\u00c3\u00a1i phi\u00e1\u00ba\u00bfu \u00c4\u2018\u00c3\u00a3 c\u00e1\u00ba\u00adp nh\u00e1\u00ba\u00adt',
    'Tr\u1ea1ng th\u00e1i phi\u1ebfu \u0111\u00e3 c\u1eadp nh\u1eadt',
  ],
  [
    'INTERNAL_NOTE',
    'Th\u00c3\u00b4ng tin x\u00e1\u00bb\u00ad l\u00c3\u00bd n\u00e1\u00bb\u2122i b\u00e1\u00bb\u2122',
    'Th\u00f4ng tin x\u1eed l\u00fd n\u1ed9i b\u1ed9',
  ],
  [
    'REPLY',
    'C\u00c3\u00b3 ph\u00e1\u00ba\u00a3n h\u00e1\u00bb\u201ci m\u00e1\u00bb\u203ai',
    'C\u00f3 ph\u1ea3n h\u1ed3i m\u1edbi',
  ],
  [
    'CONSENT',
    'L\u00e1\u00bb\u00b1a ch\u00e1\u00bb\u008dn \u00c4\u2018\u00e1\u00bb\u201cng \u00c3\u00bd \u00c4\u2018\u00c3\u00a3 \u00c4\u2018\u00c6\u00b0\u00e1\u00bb\u00a3c l\u00c6\u00b0u',
    'L\u1ef1a ch\u1ecdn \u0111\u1ed3ng \u00fd \u0111\u00e3 \u0111\u01b0\u1ee3c l\u01b0u',
  ],
  [
    'REFERRAL',
    'Phi\u00e1\u00ba\u00bfu \u00c4\u2018ang \u00c4\u2018\u00c6\u00b0\u00e1\u00bb\u00a3c h\u00e1\u00bb\u2014 tr\u00e1\u00bb\u00a3 chuy\u00c3\u00aan m\u00c3\u00b4n',
    'Phi\u1ebfu \u0111ang \u0111\u01b0\u1ee3c h\u1ed7 tr\u1ee3 chuy\u00ean m\u00f4n',
  ],
  [
    'REFERRAL_RESPONSE',
    '\u00c4\u0090\u00c3\u00a3 c\u00c3\u00b3 \u00c3\u00bd ki\u00e1\u00ba\u00bfn chuy\u00c3\u00aan m\u00c3\u00b4n',
    '\u0110\u00e3 c\u00f3 \u00fd ki\u1ebfn chuy\u00ean m\u00f4n',
  ],
  [
    'APPLICATION_DRAFT',
    'H\u00e1\u00bb\u201c s\u00c6\u00a1 t\u00c6\u00b0 v\u00e1\u00ba\u00a5n \u00c4\u2018ang \u00c4\u2018\u00c6\u00b0\u00e1\u00bb\u00a3c chu\u00e1\u00ba\u00a9n b\u00e1\u00bb\u2039',
    'H\u1ed3 s\u01a1 t\u01b0 v\u1ea5n \u0111ang \u0111\u01b0\u1ee3c chu\u1ea9n b\u1ecb',
  ],
  [
    'APPLICATION_SUBMIT',
    'H\u00e1\u00bb\u201c s\u00c6\u00a1 t\u00c6\u00b0 v\u00e1\u00ba\u00a5n \u00c4\u2018\u00c3\u00a3 \u00c4\u2018\u00c6\u00b0\u00e1\u00bb\u00a3c c\u00e1\u00ba\u00adp nh\u00e1\u00ba\u00adt',
    'H\u1ed3 s\u01a1 t\u01b0 v\u1ea5n \u0111\u00e3 \u0111\u01b0\u1ee3c c\u1eadp nh\u1eadt',
  ],
  [
    'APPLICATION_ACKNOWLEDGE',
    'H\u00e1\u00bb\u201c s\u00c6\u00a1 t\u00c6\u00b0 v\u00e1\u00ba\u00a5n \u00c4\u2018\u00c3\u00a3 \u00c4\u2018\u00c6\u00b0\u00e1\u00bb\u00a3c c\u00e1\u00ba\u00adp nh\u00e1\u00ba\u00adt',
    'H\u1ed3 s\u01a1 t\u01b0 v\u1ea5n \u0111\u00e3 \u0111\u01b0\u1ee3c c\u1eadp nh\u1eadt',
  ],
  [
    'APPLICATION_REQUEST_CORRECTION',
    'H\u00e1\u00bb\u201c s\u00c6\u00a1 t\u00c6\u00b0 v\u00e1\u00ba\u00a5n \u00c4\u2018\u00c3\u00a3 \u00c4\u2018\u00c6\u00b0\u00e1\u00bb\u00a3c c\u00e1\u00ba\u00adp nh\u00e1\u00ba\u00adt',
    'H\u1ed3 s\u01a1 t\u01b0 v\u1ea5n \u0111\u00e3 \u0111\u01b0\u1ee3c c\u1eadp nh\u1eadt',
  ],
];
describe('W05A immutable event label compatibility', () => {
  it.each(rows)('projects exact legacy %s label without rewriting history', (kind, old, label) => {
    expect(supportEventLabel(kind, old)).toBe(label);
    expect(supportEventLabel(kind, label)).toBe(label);
    expect(supportEventLabel('OTHER_KIND', old)).toBe(old);
  });
  it('leaves unknown and authored labels untouched', () => {
    expect(supportEventLabel('CREATED', 'Custom label')).toBe('Custom label');
  });
});
