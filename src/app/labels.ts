import type { ActiviteitType, BelUitkomst, ContactStatus, Fase, PandRol } from '../domain/model';

export const STATUS_LABEL: Record<ContactStatus, string> = {
  nieuwe_lead: 'Nieuwe lead',
  prospect: 'Prospect',
  langetermijn: 'Langetermijn',
};
export const FASE_LABEL: Record<Fase, string> = { warm: 'Warm', lauw: 'Lauw', koud: 'Koud' };
export const ROL_LABEL: Record<PandRol, string> = {
  eigenaar: 'eigenaar',
  mede_eigenaar: 'mede-eigenaar',
  beslisser: 'beslisser',
  erfgenaam: 'erfgenaam',
  huurder: 'huurder',
  ander: 'ander',
};
export const ACTIVITEIT_LABEL: Record<ActiviteitType, string> = {
  taak: 'Taak',
  notitie: 'Notitie',
  evaluatie: 'Evaluatie',
  gesprek: 'Gesprek',
};
export const UITKOMST_LABEL: Record<BelUitkomst, string> = {
  gesproken: 'Gesproken',
  geen_antwoord: 'Geen antwoord',
  terugbellen: 'Terugbellen op datum',
  afspraak: 'Afspraak gemaakt',
  niet_meer_bellen: 'Niet meer bellen',
  bericht_verstuurd: 'Bericht verstuurd',
  reactie: 'Reactie ontvangen',
};
export const KANAAL_LABEL: Record<'telefoon' | 'sms' | 'whatsapp' | 'mail', string> = {
  telefoon: 'telefoon',
  sms: 'sms',
  whatsapp: 'WhatsApp',
  mail: 'mail',
};
