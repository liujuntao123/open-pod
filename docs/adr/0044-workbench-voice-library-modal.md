# Voice library lives in a workbench modal; favorites are local

Voice discovery/selection is a global modal opened from the workbench (role binding / library button), not from Studio Settings. Tabs are Explore and Favorites only—no create-collection flow.

Fish public OpenAPI exposes list/get model endpoints and read-only `liked`/`marked` flags, but no documented favorite write API. Favorites are therefore stored in Open Pod’s local `voice_favorites` table and can be used offline for the Favorites tab.

Pagination uses Fish `page_number`/`page_size` and derives `hasMore` from both `has_more` and `total` to avoid stuck paging when the upstream flag is incomplete.
