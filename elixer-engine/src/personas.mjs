/** Deterministic laboratory adapters. Advice cannot grant permissions. */
export const PERSONA_IDS = Object.freeze(['HARAM', 'CHINGCHING', 'HANNIE']);
export function createPersonaAdapters({ conflict = false } = {}) {
  return {
    'haram-v0-1': async ({ action, context }) => ({
      recommendation: 'READ_ONLY',
      message: action === 'EXPLAIN' ? 'H∆R∆M licht de toegestane synthetische context toe.' : 'H∆R∆M ordent uitsluitend de beschikbare synthetische informatie.',
      contextKeys: Object.keys(context).filter(key => key !== 'classification'),
    }),
    'chingching-v0-1': async ({ context }) => ({
      recommendation: conflict ? 'PAUSE' : 'READ_ONLY',
      message: conflict ? 'CHINGCHING vraagt om beoordeling; dit afwijkende advies blijft zichtbaar.' : 'CHINGCHING geeft advies binnen de beschikbare toestemming.',
      contextKeys: Object.keys(context).filter(key => key !== 'classification'),
    }),
    'hannie-v0-1': async ({ context }) => ({
      recommendation: 'READ_ONLY',
      message: context.household ? 'HANNIE leest de synthetische agenda; geen afspraak wordt gewijzigd.' : 'HANNIE heeft alleen openbare synthetische context.',
      contextKeys: Object.keys(context).filter(key => key !== 'classification'),
    }),
  };
}
