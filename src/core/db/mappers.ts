// Vertaling tussen databaserijen (snake_case) en het interne model (camelCase).
import type { Afspraak, Belpoging, Belverbod, Bronactiviteit, Bronstatus, Contact, Contacthook, ContactPand, Contactvoorkeur, Dagplan, DonnaOverzicht, Opvolgactie, Pand, Planningskeuze, Waardehaak } from '../../domain/model';

type Rij = Record<string, unknown>;
const d = (v: unknown): Date | null => (v ? new Date(v as string) : null);
const s = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
/** Datumkolom (Postgres `date`) → "YYYY-MM-DD". Supabase geeft een tekst, sommige drivers een Date (middernacht UTC). */
const dagKolom = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);

function herkomstNaarModel(r: Rij) {
  return {
    bron: r.bron as Contact['bron'],
    externId: s(r.extern_id),
    gebeurdOp: d(r.gebeurd_op),
    gewijzigdInBronOp: d(r.gewijzigd_in_bron_op),
    geimporteerdOp: new Date(r.geimporteerd_op as string),
    isTestdata: Boolean(r.is_testdata),
  };
}
function herkomstNaarRij(x: Contact | Pand | Bronactiviteit | Afspraak) {
  return {
    id: x.id,
    bron: x.bron,
    extern_id: x.externId,
    gebeurd_op: x.gebeurdOp?.toISOString() ?? null,
    gewijzigd_in_bron_op: x.gewijzigdInBronOp?.toISOString() ?? null,
    geimporteerd_op: x.geimporteerdOp.toISOString(),
    is_testdata: x.isTestdata,
  };
}

export const contactNaarModel = (r: Rij): Contact => ({
  ...herkomstNaarModel(r),
  id: r.id as string,
  aanhef: s(r.aanhef),
  voornaam: s(r.voornaam),
  achternaam: r.achternaam as string,
  telefoons: (r.telefoons as Contact['telefoons']) ?? [],
  email: s(r.email),
  straat: s(r.straat),
  postcode: s(r.postcode),
  gemeente: s(r.gemeente),
  statusBron: r.status_bron as Contact['statusBron'],
  statusLabelBron: s(r.status_label_bron) ?? undefined,
  faseBron: (r.fase_bron as Contact['faseBron']) ?? null,
  tijdshorizonBron: s(r.tijdshorizon_bron),
  aanspreekvormBron: (r.aanspreekvorm_bron as Contact['aanspreekvormBron']) ?? null,
  taal: (r.taal as Contact['taal']) ?? undefined,
  taalWhatsapp: (r.taal_whatsapp as Contact['taalWhatsapp']) ?? undefined,
  herkomstContact: s(r.herkomst_contact),
  nietBellenBron: Boolean(r.niet_bellen_bron),
  aangemaaktInBronOp: d(r.aangemaakt_in_bron_op),
  isLokaalTijdelijk: Boolean(r.is_lokaal_tijdelijk),
});
export const contactNaarRij = (c: Contact) => ({
  ...herkomstNaarRij(c),
  aanhef: c.aanhef,
  voornaam: c.voornaam,
  achternaam: c.achternaam,
  telefoons: c.telefoons,
  email: c.email,
  straat: c.straat,
  postcode: c.postcode,
  gemeente: c.gemeente,
  status_bron: c.statusBron,
  status_label_bron: c.statusLabelBron ?? null,
  fase_bron: c.faseBron,
  tijdshorizon_bron: c.tijdshorizonBron,
  aanspreekvorm_bron: c.aanspreekvormBron,
  taal: c.taal ?? null,
  taal_whatsapp: c.taalWhatsapp ?? null,
  herkomst_contact: c.herkomstContact,
  niet_bellen_bron: c.nietBellenBron,
  aangemaakt_in_bron_op: c.aangemaaktInBronOp?.toISOString() ?? null,
  is_lokaal_tijdelijk: c.isLokaalTijdelijk,
});

export const pandNaarModel = (r: Rij): Pand => ({
  ...herkomstNaarModel(r),
  id: r.id as string,
  straat: r.straat as string,
  postcode: r.postcode as string,
  gemeente: r.gemeente as string,
  type: r.type as Pand['type'],
  omschrijving: s(r.omschrijving),
});
export const pandNaarRij = (p: Pand) => ({ ...herkomstNaarRij(p), straat: p.straat, postcode: p.postcode, gemeente: p.gemeente, type: p.type, omschrijving: p.omschrijving });

export const contactPandNaarModel = (r: Rij): ContactPand => ({
  id: r.id as string,
  contactId: r.contact_id as string,
  pandId: r.pand_id as string,
  rol: r.rol as ContactPand['rol'],
  isTestdata: Boolean(r.is_testdata),
});
export const contactPandNaarRij = (cp: ContactPand) => ({ id: cp.id, contact_id: cp.contactId, pand_id: cp.pandId, rol: cp.rol, is_testdata: cp.isTestdata });

export const activiteitNaarModel = (r: Rij): Bronactiviteit => ({
  ...herkomstNaarModel(r),
  id: r.id as string,
  type: r.type as Bronactiviteit['type'],
  contactId: s(r.contact_id),
  pandId: s(r.pand_id),
  taakSoort: (r.taak_soort as Bronactiviteit['taakSoort']) ?? null,
  vervaltOp: dagKolom(r.vervalt_op),
  vervaltUur: r.vervalt_uur ? String(r.vervalt_uur).slice(0, 5) : null,
  taakAfgerond: Boolean(r.taak_afgerond),
  auteur: s(r.auteur),
  tekst: r.tekst as string,
  soortLabel: s(r.soort_label) ?? undefined,
  kanaal: (r.kanaal as Bronactiviteit['kanaal']) ?? undefined,
});
export const activiteitNaarRij = (a: Bronactiviteit) => ({
  ...herkomstNaarRij(a),
  type: a.type,
  contact_id: a.contactId,
  pand_id: a.pandId,
  taak_soort: a.taakSoort,
  vervalt_op: a.vervaltOp,
  vervalt_uur: a.vervaltUur,
  taak_afgerond: a.taakAfgerond,
  auteur: a.auteur,
  tekst: a.tekst,
  soort_label: a.soortLabel ?? null,
  kanaal: a.kanaal ?? null,
});

export const afspraakNaarModel = (r: Rij): Afspraak => ({
  ...herkomstNaarModel(r),
  id: r.id as string,
  titel: r.titel as string,
  start: new Date(r.start_op as string),
  einde: new Date(r.einde_op as string),
  heleDag: Boolean(r.hele_dag),
  locatie: s(r.locatie),
  contactId: s(r.contact_id),
  koppelStatus: r.koppel_status as Afspraak['koppelStatus'],
  omschrijving: s(r.omschrijving),
  belpogingId: s(r.belpoging_id),
  soortLabel: s(r.soort_label) ?? undefined,
});
export const afspraakNaarRij = (a: Afspraak) => ({
  ...herkomstNaarRij(a),
  titel: a.titel,
  start_op: a.start.toISOString(),
  einde_op: a.einde.toISOString(),
  hele_dag: a.heleDag,
  locatie: a.locatie,
  contact_id: a.contactId,
  koppel_status: a.koppelStatus,
  omschrijving: a.omschrijving,
  belpoging_id: a.belpogingId ?? null,
  soort_label: a.soortLabel ?? null,
});

export const belpogingNaarModel = (r: Rij): Belpoging => ({
  id: r.id as string,
  contactId: r.contact_id as string,
  tijdstip: new Date(r.tijdstip as string),
  uitkomst: r.uitkomst as Belpoging['uitkomst'],
  kanaal: (r.kanaal as Belpoging['kanaal']) ?? 'telefoon',
  isInhoudelijk: Boolean(r.is_inhoudelijk),
  notitie: s(r.notitie),
  volgendeStap: s(r.volgende_stap),
  ongedaanOp: d(r.ongedaan_op),
  isTestdata: Boolean(r.is_testdata),
});
export const belpogingNaarRij = (p: Belpoging) => ({
  id: p.id,
  contact_id: p.contactId,
  tijdstip: p.tijdstip.toISOString(),
  uitkomst: p.uitkomst,
  kanaal: p.kanaal ?? 'telefoon',
  is_inhoudelijk: p.isInhoudelijk,
  notitie: p.notitie,
  volgende_stap: p.volgendeStap,
  ongedaan_op: p.ongedaanOp?.toISOString() ?? null,
  is_testdata: p.isTestdata,
});

export const bronNaarModel = (r: Rij): Bronstatus => ({
  id: r.id as string,
  soort: r.soort as Bronstatus['soort'],
  adapter: r.adapter as Bronstatus['adapter'],
  naam: r.naam as string,
  isTestdata: Boolean(r.is_testdata),
  laatstSuccesvolOp: d(r.laatst_succesvol_op),
  laatsteFout: s(r.laatste_fout),
});
export const bronNaarRij = (b: Bronstatus) => ({
  id: b.id,
  soort: b.soort,
  adapter: b.adapter,
  naam: b.naam,
  is_testdata: b.isTestdata,
  laatst_succesvol_op: b.laatstSuccesvolOp?.toISOString() ?? null,
  laatste_fout: b.laatsteFout,
});

// ---------- Fase 3: lokale resultaten ----------

export const opvolgactieNaarModel = (r: Rij): Opvolgactie => ({
  id: r.id as string,
  contactId: r.contact_id as string,
  soort: r.soort as Opvolgactie['soort'],
  dag: dagKolom(r.dag)!,
  uur: r.uur ? String(r.uur).slice(0, 5) : null,
  omschrijving: s(r.omschrijving),
  aangemaaktOp: new Date(r.aangemaakt_op as string),
  status: r.status as Opvolgactie['status'],
  belpogingId: s(r.belpoging_id),
  isTestdata: Boolean(r.is_testdata),
});
export const opvolgactieNaarRij = (o: Opvolgactie) => ({
  id: o.id,
  contact_id: o.contactId,
  soort: o.soort,
  dag: o.dag,
  uur: o.uur,
  omschrijving: o.omschrijving,
  aangemaakt_op: o.aangemaaktOp.toISOString(),
  status: o.status,
  belpoging_id: o.belpogingId ?? null,
  is_testdata: o.isTestdata ?? false,
});

export const keuzeNaarModel = (r: Rij): Planningskeuze => ({
  id: r.id as string,
  contactId: r.contact_id as string,
  soort: r.soort as Planningskeuze['soort'],
  voorDag: dagKolom(r.voor_dag),
  totDag: dagKolom(r.tot_dag),
  aangemaaktOp: new Date(r.aangemaakt_op as string),
  ongedaanOp: d(r.ongedaan_op),
  isTestdata: Boolean(r.is_testdata),
});
export const keuzeNaarRij = (k: Planningskeuze) => ({
  id: k.id,
  contact_id: k.contactId,
  soort: k.soort,
  voor_dag: k.voorDag,
  tot_dag: k.totDag,
  aangemaakt_op: (k.aangemaaktOp ?? new Date()).toISOString(),
  ongedaan_op: k.ongedaanOp?.toISOString() ?? null,
  is_testdata: k.isTestdata ?? false,
});

export const belverbodNaarModel = (r: Rij): Belverbod => ({
  id: r.id as string,
  contactId: r.contact_id as string,
  reden: s(r.reden),
  belpogingId: s(r.belpoging_id),
  aangemaaktOp: new Date(r.aangemaakt_op as string),
  ingetrokkenOp: d(r.ingetrokken_op),
  isTestdata: Boolean(r.is_testdata),
});
export const belverbodNaarRij = (b: Belverbod) => ({
  id: b.id,
  contact_id: b.contactId,
  reden: b.reden ?? null,
  belpoging_id: b.belpogingId ?? null,
  aangemaakt_op: (b.aangemaaktOp ?? new Date()).toISOString(),
  ingetrokken_op: b.ingetrokkenOp?.toISOString() ?? null,
  is_testdata: b.isTestdata ?? false,
});

export const dagplanNaarModel = (r: Rij): Dagplan => ({
  dag: dagKolom(r.dag)!,
  contactIds: (r.contact_ids as string[]) ?? [],
  aangemaaktOp: new Date(r.aangemaakt_op as string),
  isTestdata: Boolean(r.is_testdata),
});
export const dagplanNaarRij = (p: Dagplan) => ({ dag: p.dag, contact_ids: p.contactIds, aangemaakt_op: p.aangemaaktOp.toISOString(), is_testdata: p.isTestdata });

export const donnaNaarModel = (r: Rij): DonnaOverzicht => ({
  dag: dagKolom(r.dag)!,
  tekst: r.tekst as string,
  belpogingIds: (r.belpoging_ids as string[]) ?? [],
  status: r.status as DonnaOverzicht['status'],
  klaargezetOp: new Date(r.klaargezet_op as string),
  doorgegevenOp: d(r.doorgegeven_op),
  isTestdata: Boolean(r.is_testdata),
});
export const donnaNaarRij = (o: DonnaOverzicht) => ({
  dag: o.dag,
  tekst: o.tekst,
  belpoging_ids: o.belpogingIds,
  status: o.status,
  klaargezet_op: o.klaargezetOp.toISOString(),
  doorgegeven_op: o.doorgegevenOp?.toISOString() ?? null,
  is_testdata: o.isTestdata,
});

// ---------- Fase 3b: contactstrategie ----------
export const voorkeurNaarModel = (r: Rij): Contactvoorkeur => ({
  contactId: r.contact_id as string,
  kanaal: r.kanaal as Contactvoorkeur['kanaal'],
  nietVoor: r.niet_voor ? String(r.niet_voor).slice(0, 5) : null,
  nietNa: r.niet_na ? String(r.niet_na).slice(0, 5) : null,
  notitie: s(r.notitie),
  isTestdata: Boolean(r.is_testdata),
});
export const voorkeurNaarRij = (v: Contactvoorkeur) => ({
  contact_id: v.contactId,
  kanaal: v.kanaal,
  niet_voor: v.nietVoor,
  niet_na: v.nietNa,
  notitie: v.notitie,
  bijgewerkt_op: new Date().toISOString(),
  is_testdata: v.isTestdata ?? false,
});

export const haakNaarModel = (r: Rij): Waardehaak => ({
  id: r.id as string,
  contactId: s(r.contact_id),
  pandId: s(r.pand_id),
  straat: s(r.straat),
  gemeente: s(r.gemeente),
  soort: r.soort as Waardehaak['soort'],
  onderwerp: r.onderwerp as string,
  detail: s(r.detail),
  bron: s(r.bron),
  geldigVanaf: dagKolom(r.geldig_vanaf)!,
  geldigTot: dagKolom(r.geldig_tot),
  gevoelig: Boolean(r.gevoelig),
  aangemaaktOp: new Date(r.aangemaakt_op as string),
  isTestdata: Boolean(r.is_testdata),
});
export const haakNaarRij = (h: Waardehaak) => ({
  id: h.id,
  contact_id: h.contactId,
  pand_id: h.pandId,
  straat: h.straat,
  gemeente: h.gemeente,
  soort: h.soort,
  onderwerp: h.onderwerp,
  detail: h.detail,
  bron: h.bron,
  geldig_vanaf: h.geldigVanaf,
  geldig_tot: h.geldigTot,
  gevoelig: h.gevoelig,
  aangemaakt_op: h.aangemaaktOp.toISOString(),
  is_testdata: h.isTestdata ?? false,
});


export const contacthookNaarModel = (r: Rij): Contacthook => ({
  id: r.id as string,
  contactId: r.contact_id as string,
  dag: dagKolom(r.dag)!,
  onderwerp: r.onderwerp as string,
  detail: s(r.detail),
  openingszin: s(r.openingszin),
  kanaal: (r.kanaal as Contacthook['kanaal']) ?? null,
  kanaalReden: s(r.kanaal_reden),
  conceptbericht: s(r.conceptbericht),
  bronlinks: Array.isArray(r.bronlinks) ? (r.bronlinks as Contacthook['bronlinks']) : [],
  aangemaaktOp: new Date(r.aangemaakt_op as string),
});
