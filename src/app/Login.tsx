import { useState, type FormEvent } from 'react';
import { supabase } from '../core/db/supabaseStore';
import { MERK } from './merk';

// Enkel aanmelden. Accounts worden aangemaakt in het Supabase-dashboard en zelfregistratie staat uit,
// zodat niemand via het publieke adres een account kan maken.
export function Login() {
  const [email, setEmail] = useState('');
  const [wachtwoord, setWachtwoord] = useState('');
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    const { error } = await supabase().auth.signInWithPassword({ email, password: wachtwoord });
    setBezig(false);
    if (error) setFout(vertaalFout(error.message));
  }

  return (
    <main className="pagina login">
      <img className="login-icoon" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="72" height="72" />
      <div className="login-merk">
        <span className="appnaam">{MERK.naam}</span>
        <span className="appondertitel">{MERK.ondertitel}</span>
      </div>
      <form onSubmit={verstuur} className="formulier">
        <label>
          E-mail
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Wachtwoord
          <input type="password" autoComplete="current-password" required value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} />
        </label>
        {fout && <p className="foutmelding">{fout}</p>}
        <button type="submit" className="knop primair groot" disabled={bezig}>
          {bezig ? 'Even geduld…' : 'Aanmelden'}
        </button>
      </form>
    </main>
  );
}

function vertaalFout(m: string): string {
  if (/invalid login credentials/i.test(m)) return 'E-mail of wachtwoord klopt niet.';
  if (/email not confirmed/i.test(m)) return 'Dit account is nog niet bevestigd in Supabase.';
  if (/fetch|network/i.test(m)) return 'Geen verbinding met de server. Controleer je internet.';
  return `Aanmelden mislukt: ${m}`;
}
