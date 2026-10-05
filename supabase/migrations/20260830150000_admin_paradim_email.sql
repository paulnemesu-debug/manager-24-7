begin;

-- A doua adresă de administrator pentru același proprietar.
insert into private.admin_emails (email, note)
values ('paul.nemesu@paradim.ro', 'Proprietar PARADIM Operations — adresă de companie')
on conflict (email) do nothing;

-- Acordă accesul imediat dacă adresa are deja cont.
do $$
declare
  existing record;
begin
  for existing in
    select u.id
    from auth.users u
    join private.admin_emails a on lower(a.email) = lower(u.email)
  loop
    perform private.grant_admin_access(existing.id);
  end loop;
end
$$;

commit;
