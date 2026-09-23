# One-off SQL

Scripts you paste into the Supabase SQL editor by hand. Unlike
`../migrations/`, nothing here is part of the schema — these are jobs: look
something up, fix one row, reset one learner.

The SQL editor runs as the database owner, not as your signed-in admin
account. That is why these write rows directly instead of calling the
`admin_*` functions, which deliberately refuse anyone who is not an admin.

| Script | What it does |
| --- | --- |
| `list-lms-accounts.sql` | Read-only. Every LMS account with the signals that tell a real learner from a junk signup, a summary row, and a list of accounts that are empty in every sense. Deletes nothing. |
| `assign-deepak-posh.sql` | Enrols `deep.deepak30@gmail.com` in PoSH TTT, October 2026, with no payment. Re-runnable. |
| `reset-deepak-posh-progress.sql` | Clears that account's PoSH progress so the course can be walked again. Keeps the seat. |

The last two are examples as much as jobs: change the email and the slug at
the top of either one to point it at someone else.
