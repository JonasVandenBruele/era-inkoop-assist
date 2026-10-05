// Fictieve ERAForce-rijen (geen echte klantgegevens).
import { describe, expect, it } from 'vitest';
import { afspraakAlsGesprek, contactNaarContact, eventNaarAfspraak, isBeltaak, leadNaarContact, leadStatus, taakNaarActiviteit, telefoons } from './eraforce';

const naam = (id: string | null) => (id === '005A' ? 'Jonas' : null);
const lead = (extra: Record<string, unknown> = {}) => ({
  Id: '00QAAA0000000001AA', FirstName: 'Els', LastName: 'Testmans', Salutation: 'Mrs.', MobilePhone: '0470 12 34 56', Phone: '+32 470 12 34 56',
  Email: 'els@voorbeeld.be', Street: 'Kerkstraat 1', PostalCode: '1930', City: 'Zaventem', Status: 'In Opvolging', LeadSource: 'Realo.be',
  ERA_Lead_subbron__c: null, ERA_Long_term_lead__c: 0, IsConverted: 0, DoNotCall: 0, CreatedDate: '2026-09-01T08:00:00.000Z',
  LastModifiedDate: '2026-10-01T08:00:00.000Z', ...extra,
});
const taak = (extra: Record<string, unknown> = {}) => ({
  Id: '00TAAA0000000001AA', WhoId: '00QAAA0000000001AA', OwnerId: '005A', Subject: 'Uitgaande Oproep', Type: 'Uitgaande Oproep', IsClosed: 1,
  Description: 'Wil binnen 6 maanden verkopen, terugbellen in januari.', ActivityDate: '2026-10-02', CompletedDateTime: '2026-10-02T09:15:00.000Z',
  CreatedDate: '2026-10-02T09:00:00.000Z', LastModifiedDate: '2026-10-02T09:15:00.000Z', IsReminderSet: 0, ...extra,
});
const event = (extra: Record<string, unknown> = {}) => ({
  Id: '00UAAA0000000001AA', WhoId: '00QAAA0000000001AA', OwnerId: '005A', Subject: 'Schatting', Type: 'Afspraak prospect schatting op locatie',
  StartDateTime: '2026-10-13T08:00:00.000Z', EndDateTime: '2026-10-13T09:00:00.000Z', IsAllDayEvent: 0, Location: 'Kerkstraat 1, Zaventem',
  Description: 'Woning 3 slpk.', LastModifiedDate: '2026-10-01T08:00:00.000Z', ...extra,
});

describe('ERAForce → Oxpecker', () => {
  it('lead wordt een contact met bron, status en nummers', () => {
    const c = leadNaarContact(lead())!;
    expect(c).toMatchObject({ bron: 'eraforce_mirror', externId: '00QAAA0000000001AA', aanhef: 'Mevr.', achternaam: 'Testmans', statusBron: 'prospect', statusLabelBron: 'In Opvolging', herkomstContact: 'Realo.be', isTestdata: false });
    // Hetzelfde gsm-nummer in twee notaties: maar één keer.
    expect(c.telefoons).toEqual([{ nummer: '0470 12 34 56', label: 'gsm' }]);
    expect(c.aangemaaktInBronOp?.toISOString()).toBe('2026-09-01T08:00:00.000Z');
  });

  it('leadstatussen', () => {
    expect(leadStatus(lead({ Status: 'Ingave' }))).toBe('nieuwe_lead');
    expect(leadStatus(lead({ Status: 'Beëindigd' }))).toBe('beeindigd');
    expect(leadStatus(lead({ ERA_Long_term_lead__c: 1 }))).toBe('langetermijn');
    expect(leadStatus(lead({ Status: 'Kwalificatie' }))).toBe('prospect');
  });

  it('geconverteerde lead wordt overgeslagen; een contact wordt een relatie', () => {
    expect(leadNaarContact(lead({ IsConverted: 1 }))).toBeNull();
    const c = contactNaarContact({ Id: '003AAA0000000001AA', FirstName: 'Piet', LastName: 'Voorbeeld', Phone: '02 123 45 67', MailingCity: 'Kortenberg' });
    expect(c).toMatchObject({ statusBron: 'relatie', gemeente: 'Kortenberg', telefoons: [{ nummer: '02 123 45 67', label: 'vast' }] });
  });

  it('vaste nummers en gsm-nummers', () => {
    expect(telefoons({ a: '02 720 00 00', b: '0032 475 11 22 33' }, [['a', 'vast'], ['b', 'vast']]).map((t) => t.label)).toEqual(['gsm', 'vast']);
    expect(telefoons({ a: '123' }, [['a', 'gsm']])).toEqual([]);
  });

  it('afgesloten oproep = gesprek, met de evaluatie als tekst', () => {
    const a = taakNaarActiviteit(taak(), naam)!;
    expect(a).toMatchObject({ type: 'gesprek', contactExternId: '00QAAA0000000001AA', auteur: 'Jonas', soortLabel: 'Uitgaande Oproep', taakAfgerond: true });
    expect(a.gebeurdOp?.toISOString()).toBe('2026-10-02T09:15:00.000Z');
    expect(a.tekst).toContain('Wil binnen 6 maanden verkopen');
  });

  it('oproep zonder gehoor is geen inhoudelijk contact', () => {
    expect(taakNaarActiviteit(taak({ Description: 'Geen gehoor, voicemail ingesproken' }), naam)!.type).toBe('notitie');
  });

  it('open beltaak = terugbelafspraak; uur enkel uit een herinnering op dezelfde dag', () => {
    const a = taakNaarActiviteit(taak({ IsClosed: 0, Type: 'Bellen', Subject: 'terugbellen', ActivityDate: '2026-10-20', IsReminderSet: 1, ReminderDateTime: '2026-10-20T08:30:00.000Z' }), naam)!;
    expect(a).toMatchObject({ type: 'taak', taakSoort: 'terugbellen', vervaltOp: '2026-10-20', vervaltUur: '10:30', taakAfgerond: false });
    expect(a.gebeurdOp?.toISOString()).toBe('2026-10-02T09:00:00.000Z'); // aanmaakmoment
    const zonderUur = taakNaarActiviteit(taak({ IsClosed: 0, Type: 'Bellen', ActivityDate: '2026-10-20', IsReminderSet: 1, ReminderDateTime: '2026-10-19T08:30:00.000Z' }), naam)!;
    expect(zonderUur.vervaltUur).toBeNull();
  });

  it('andere open taak = algemene volgende stap', () => {
    expect(taakNaarActiviteit(taak({ IsClosed: 0, Type: 'Administratieve taak', Subject: 'Dossier vervolledigen' }), naam)!.taakSoort).toBe('algemeen');
    expect(isBeltaak({ Type: 'Commerciële taak', Subject: 'ZO bellen' })).toBe(true);
  });

  it('taak zonder lead of contact wordt overgeslagen', () => {
    expect(taakNaarActiviteit(taak({ WhoId: null }), naam)).toBeNull();
    expect(taakNaarActiviteit(taak({ WhoId: '001AAA0000000001AA' }), naam)).toBeNull();
  });

  it('event wordt een afspraak, gekoppeld aan de lead', () => {
    const a = eventNaarAfspraak(event())!;
    expect(a).toMatchObject({ titel: 'Schatting', heleDag: false, contactExternId: '00QAAA0000000001AA', koppelStatus: 'bevestigd', soortLabel: 'Afspraak prospect schatting op locatie' });
  });

  it('hele-dagafspraak loopt over de Brusselse dag', () => {
    const a = eventNaarAfspraak(event({ IsAllDayEvent: 1, ActivityDate: '2026-10-13', EndDate: '2026-10-13', WhoId: null }))!;
    expect(a.start.toISOString()).toBe('2026-10-12T22:00:00.000Z');
    expect(a.koppelStatus).toBe('geen');
  });

  it('voorbije afspraak met een contact telt als gesprek; "Bezet" of toekomstig niet', () => {
    const nu = new Date('2026-10-14T00:00:00Z');
    expect(afspraakAlsGesprek(event(), nu, naam)).toMatchObject({ type: 'gesprek', externId: '00UAAA0000000001AA:gesprek', contactExternId: '00QAAA0000000001AA' });
    expect(afspraakAlsGesprek(event({ Type: 'Bezet' }), nu, naam)).toBeNull();
    expect(afspraakAlsGesprek(event(), new Date('2026-10-13T08:30:00Z'), naam)).toBeNull();
  });
});
