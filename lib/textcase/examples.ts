import type { CaseId } from './cases';
import type { TitleStyle } from './prose';

export interface TextCaseExamplePreset {
  readonly id: string;
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly text: string;
  readonly caseId: CaseId;
  readonly titleStyle?: TitleStyle;
  readonly ascii?: boolean;
}

export const TEXT_CASE_EXAMPLES: readonly TextCaseExamplePreset[] = [
  {
    id: 'shout-to-sentence',
    tagKey: 'ex.textcase.sentence.tag',
    code: 'ALL CAPS → Sentence',
    titleKey: 'ex.textcase.sentence.title',
    descKey: 'ex.textcase.sentence.desc',
    text: 'RELEASE NOTES FOR V2.4: UPDATED THE USB-C FIRMWARE AND FIXED HTTPS TIMEOUTS ON MACOS. SEE HTTPS://EXAMPLE.COM/DOCS FOR DETAILS.',
    caseId: 'sentence',
  },
  {
    id: 'chicago-title',
    tagKey: 'ex.textcase.title.tag',
    code: 'Title Case · Chicago',
    titleKey: 'ex.textcase.title.title',
    descKey: 'ex.textcase.title.desc',
    text: 'a practical guide to impedance matching in high-speed pcb design and rf circuits',
    caseId: 'title',
    titleStyle: 'chicago',
  },
  {
    id: 'json-to-camel',
    tagKey: 'ex.textcase.camel.tag',
    code: 'snake_case → camelCase',
    titleKey: 'ex.textcase.camel.title',
    descKey: 'ex.textcase.camel.desc',
    text: 'user_account_id\nmax_retry_count\nhttp_status_code\nlast_synced_at',
    caseId: 'camel',
  },
  {
    id: 'env-constants',
    tagKey: 'ex.textcase.constant.tag',
    code: 'Prose → CONSTANT_CASE',
    titleKey: 'ex.textcase.constant.title',
    descKey: 'ex.textcase.constant.desc',
    text: 'api base url\nmax upload size mb\ndefault request timeout ms\nenable audit log',
    caseId: 'constant',
  },
  {
    id: 'url-slug-ascii',
    tagKey: 'ex.textcase.kebab.tag',
    code: 'Nordic → kebab-case',
    titleKey: 'ex.textcase.kebab.title',
    descKey: 'ex.textcase.kebab.desc',
    text: 'Årsrapport 2026: Løsninger for Grønn Energi & Bærekraft\nCafé Crème Brûlée Recipe',
    caseId: 'kebab',
    ascii: true,
  },
  {
    id: 'class-pascal',
    tagKey: 'ex.textcase.pascal.tag',
    code: 'kebab → PascalCase',
    titleKey: 'ex.textcase.pascal.title',
    descKey: 'ex.textcase.pascal.desc',
    text: 'signal-spectrum-analyzer\npcb-layer-stackup-panel\nqr-payload-decoder',
    caseId: 'pascal',
  },
];
