-- WhatsApp (zakelijk nummer op de Mac, 6/10/2026): per contact en per dag enkel DAT er contact was en wie wat stuurde.
-- Geen inhoud van berichten. De importrol mag die rijen (bron 'whatsapp') schrijven, enkel bij contacten uit de mirror.
create policy "import: whatsapp-activiteiten" on public.bronactiviteiten for all to oxpecker_import
  using (bron = 'whatsapp' and not is_testdata
         and exists (select 1 from public.contacten c where c.id = contact_id and c.eigenaar_id = bronactiviteiten.eigenaar_id and c.bron = 'eraforce_mirror'))
  with check (bron = 'whatsapp' and not is_testdata
         and exists (select 1 from public.contacten c where c.id = contact_id and c.eigenaar_id = bronactiviteiten.eigenaar_id and c.bron = 'eraforce_mirror'));
