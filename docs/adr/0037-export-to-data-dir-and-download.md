# Chapter export writes the studio data dir and offers download

Successful chapter export produces a WAV under the studio data directory export area and the UI can download it. Re-exporting the same chapter overwrites that chapter’s export file; v1 keeps no export version history.

Stale-line warnings stay in the UI confirmation flow—do not encode staleness in the filename. Sanitize titles for filesystem safety. Book-level multi-file export can follow the same pattern later; the Fish MVP cut may ship chapter export only.
