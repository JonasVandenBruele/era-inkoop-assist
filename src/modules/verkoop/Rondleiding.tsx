// Korte demonstratieroute met de belangrijkste scenario's. Elke stap opent het juiste scherm.
import { Link } from 'react-router-dom';
import { SCENARIO as S } from '../../../fixtures/verkoop';
import { useVerkoop } from './context';

const STAPPEN: { titel: string; tekst: string; naar: string; wie?: string }[] = [
  {
    titel: 'Vandaag bellen',
    wie: 'Nicolas',
    tekst: 'Bovenaan staat Elke: een afgesproken terugbelmoment gaat altijd voor, ook zonder pand. Daaronder Pieter (koopklaar, sterke match) en Katrien (koopklaar, maar bevestiging verouderd).',
    naar: '/',
  },
  {
    titel: 'Gesprek simuleren en bezoek plannen',
    wie: 'Nicolas',
    tekst: 'Tik bij Pieter op “Bel (simulatie)”. Er wordt niet echt gebeld. Kies “Bezoek afgesproken”, tik Zaterdag en 10:00 en bewaar. Probeer een notitie zoals “Goede ligging, maar de tuin is te klein.”',
    naar: '/',
  },
  {
    titel: 'Voortgang bij het pand',
    tekst: 'Open de woning in Bertem: Pieter staat nu op “Bezoek gepland”. Het is hetzelfde record als in Vandaag bellen. Bekijk ook “Niet voorgesteld”: Nathalie (gepauzeerd) en Dirk (boven budget).',
    naar: `/pand/${S.pandLancering}`,
  },
  {
    titel: 'Prijsdaling opvolgen',
    tekst: 'Woning Herent: de prijs zakte van €425.000 naar €389.000. Tik “Volg prijsdaling op”. Sarah (prijsbezwaar) en Tom (nu binnen budget) verschijnen; Marc niet, want zijn bezwaar was de ligging.',
    naar: `/pand/${S.pandPrijsdaling}`,
  },
  {
    titel: 'Toewijzen aan Nicolas',
    wie: 'Jonas',
    tekst: 'Woning Heverlee: tik “Bereid lancering voor”. Bram krijgt een alternatief met aantoonbaar meer tuin (±210 m² tegenover ±45 m²). Neem hem op en wijs toe aan Nicolas met een bericht. Op de gsm van Nicolas verschijnt hij in Vandaag bellen.',
    naar: `/pand/${S.pandGroteTuin}`,
  },
  {
    titel: 'Eerst intern, dan vrijgeven',
    tekst: 'Appartement Kortenberg: Griet past, maar er is enkel interne vrijgave. Er is geen openingszin met pandgegevens. Registreer via “Pand & vrijgave” de vrijgave voor contact en bezoeken: de aanbevolen stap verandert.',
    naar: `/pand/${S.pandEnkelIntern}`,
  },
  {
    titel: 'Ontbrekende pandinformatie',
    tekst: 'Woning Tervuren: slaapkamers en bruikbare tuin zijn onbekend, dus geen enkele sterke match. Een groot perceel telt niet als grote tuin. Vul de slaapkamers aan en zie de matches veranderen.',
    naar: `/pand/${S.pandOnvolledig}`,
  },
  {
    titel: 'Koperspool',
    tekst: 'Voorgestelde kandidaten (Lotte na een tweede bezoek, Sanne na een bod) worden pas koopklaar na controle. Dirk heeft twee aparte zoekscenario’s. Bij Hilde zette “Geen tuin nodig” een oud vermoeden opzij.',
    naar: '/pool',
  },
  {
    titel: 'Kantoor en reset',
    tekst: 'Open acties, interesse en geplande bezoeken per pand, met filters. Onderaan: demo opnieuw instellen (met bevestiging).',
    naar: '/kantoor',
  },
];

export function Rondleiding() {
  const { ik, wisselProfiel } = useVerkoop();
  return (
    <>
      <div className="paginakop">
        <h1>Demonstratieroute</h1>
        <p className="zacht">Alles is fictief. Bellen, berichten en bezoeken worden gesimuleerd. Je bent nu {ik.voornaam}.</p>
        <button className="knop" onClick={wisselProfiel}>
          Profiel wisselen
        </button>
      </div>
      <ol className="vk-route">
        {STAPPEN.map((s, i) => (
          <li key={s.titel} className="kaart">
            <strong>
              {i + 1}. {s.titel}
            </strong>
            {s.wie && <span className="label">als {s.wie}</span>}
            <p>{s.tekst}</p>
            <Link className="knop" to={s.naar}>
              Openen
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
