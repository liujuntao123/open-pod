# Jobs can be cancelled; in-flight results must not write slots

Users may cancel queued line-synthesis/export jobs immediately (`cancelled`). Running jobs should abort the in-flight provider HTTP call when possible, mark `cancelled`, and must not write the line audio slot even if a late response arrives.

`cancelled` is distinct from `failed`. Cancellation never deletes existing line audio. v1 may offer cancel-all-queued for the current batch/chapter. Pause/resume is out of scope.
