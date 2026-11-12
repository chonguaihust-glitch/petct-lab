# PET/CT Lab

Vietnamese team dashboard for lesion segmentation research. Static interface with Supabase authentication, membership-based access and shared progress.

## Publish

GitHub Settings → Pages → Deploy from a branch → main → /(root) → Save.

## Supabase authentication

Set Authentication → URL Configuration → Site URL and Redirect URLs to the published website URL. Register an application account with an email already listed in `public.petct_members`; confirm the email and sign in. Membership does not itself create an Auth account.

## Shared data

Requires the previously installed `petct_members`, `petct_workspace` (id=1), row-level policies and `petct_stamp_update` trigger. The browser reads updates every five seconds when visible and not editing. Updates include the loaded revision; conflicting writes are rejected without overwriting the latest data. Unsaved drafts can be exported. Notes save on leaving the text field.

Only the Supabase publishable key is in this code. Do not add secret/service-role keys, team email lists, passwords or clinical patient records to this public repository.

Existing offline data is imported explicitly using a JSON backup; importing replaces the team's shared state after confirmation. Export current shared data first.

Testing: mocked two-client revision-conflict, membership denial, network error, authentication and refresh tests passed before publication. Live sign-in and collaboration still require testing with actual member accounts.
