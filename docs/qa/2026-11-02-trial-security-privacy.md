# Trial security and privacy verification — 2 November 2026

App base: 80e3f60befb0828fe2a6b5363dd3a981d468eb46 (v1.6.6/build67). No new native binary was built or uploaded.

## Production read-only review

Project mnaaibsmijziutxuluvv was reviewed through the authorised Supabase connection. No production records, credentials, OTPs or restaurant data were read; no production fixtures, migrations or database mutations were made.

Both private trial tables have RLS and no anon/authenticated table privileges. Public trial RPC wrappers use SECURITY INVOKER; private implementations derive the caller from auth.uid(), verify Auth email, and fix search_path. The admin roster requires verified Auth plus the trusted profiles admin role. Notification queue claim/ack is service-only. All 30 trial access gates are RESTRICTIVE with USING/WITH CHECK and retain ownership policies. No Critical/Important issue was found in examined trial paths.

## Behavioural validation

- check-individual-trials.mjs: 22/22 passed.
- prepare-trial-staging.mjs --check: complete 52-migration local PostgreSQL schema, 91 bilateral isolation checks passed.
- Both fictional accounts had active trials and positive own-row controls. Foreign reads, updates, deletes, owner reassignment and cross-owner recipe/catalog/subrecipe links were denied across recipes, recipe ingredients, catalog, locations, HR employees and HACCP equipment. Private tables and nonadmin roster denied. One expired trial did not expire the other. Explicit viewer sharing and paid/admin cases still passed.
- Three focused frontend files (trial-registration helper, screen and context): 14/14 passed.

All 13 tested function bodies below match fresh production md5(prosrc) results. These are code fingerprints, not credential or personal data.

```json
[
  {
    "schema": "private",
    "name": "admin_list_trial_users",
    "md5": "cc009e78ae0b023166ca5408fcb677c4"
  },
  {
    "schema": "private",
    "name": "capture_individual_trial_sign_in",
    "md5": "9f2e4cb6ba13167fc8b3a073d73d37d0"
  },
  {
    "schema": "private",
    "name": "complete_my_trial_registration",
    "md5": "835eebc3992958998a8e5020335f5469"
  },
  {
    "schema": "private",
    "name": "get_my_trial_registration",
    "md5": "1f1315a5f5913f1dce8f50289fbd3600"
  },
  {
    "schema": "private",
    "name": "observe_individual_trial",
    "md5": "fcdb4b6ec1e8b57a8c59acb3eabe0c28"
  },
  {
    "schema": "private",
    "name": "user_has_nontrial_entitlement",
    "md5": "0a6f4c0ce8f43f220f712372717ba4c2"
  },
  {
    "schema": "public",
    "name": "admin_list_trial_users",
    "md5": "c085b15b147807bb012e91e2ca2b92c4"
  },
  {
    "schema": "public",
    "name": "claim_trial_owner_notifications",
    "md5": "d14051725ab0fe049449b909dd302c29"
  },
  {
    "schema": "public",
    "name": "complete_my_trial_registration",
    "md5": "2c441b4b7e56cbdc1ceda6943cc436d0"
  },
  {
    "schema": "public",
    "name": "finish_trial_owner_notification",
    "md5": "0b0ac310a9af0d4550037ae96b2b841a"
  },
  {
    "schema": "public",
    "name": "get_my_trial_registration",
    "md5": "483dc41473e8f282971aa044b560bcfd"
  },
  {
    "schema": "public",
    "name": "has_professional_access",
    "md5": "dcc52197a3cade3f1abe5c49a5b14155"
  },
  {
    "schema": "public",
    "name": "is_active_viewer_of",
    "md5": "00d7245a7380d2ec70fd58109e3a34d4"
  }
]
```

These checks exercise local PostgreSQL with simulated authenticated claims and actual source triggers/RLS. They do NOT prove real OTP delivery, HTTP JWT validation, hosted two-account browser behaviour or native-device behaviour. Production schema/body inspection is distinct from local behavioural checks.

## Public documents

Existing Sites project appgprj_6a6c1274d95c819180fde9177174c827, source 6f6ff9f80e8631580edfe260dc56ebdfebdec154, version69, deployment appgdep_6ae8483ba1508191ab526bc70eb089e4 succeeded.

RO/EN privacy and terms explicitly distinguish the free local calculator from /aplicatie account/cloud data, describe Supabase cloud plus local copies by module, fictional-only evaluation, necessary technical access and private ChatGPT/OpenAI administrative reporting. Email notifications await separate setup. The2November editorial clarification preserves the recorded trial agreement version2026-11-01, consistent with client/server; no user acceptance was rewritten.

The public privacy page was reloaded and visually inspected on https://www.paradim.ro/politica-de-confidentialitate#trial-manager. It displays the2November clarification and cloud/account wording. Search retrieval displayed an older indexed page and was not used as proof of current deployed contents.

Site production build passed; 22 rendered-HTML/routing checks passed, including2new legal consistency checks and public navigation coverage.

The trial remains for fictional data. Real third-party personal data requires separately established contract/data responsibilities and any applicable data-processing agreement. Provider contract/DPA completion was not verified by this task.

Official background: GDPR Articles13/28 (RegulationEU2016/679), Supabase RLS and database function documentation.

