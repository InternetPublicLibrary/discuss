# Notice

`discuss` is a hard fork of [giscus](https://github.com/giscus/giscus) by Sage M. Abdullah and contributors
(itself based on utterances by Jeremy Danyow), released under the MIT License. The full upstream history is
preserved in this repository and the original copyright notices are kept in [LICENSE](LICENSE); changes made by
the Internet Public Library are released under the same license.

The fork is independent: upstream changes are ported manually when relevant (see
[ADR 0001](docs/adr/0001-hard-fork-of-giscus.md)).

## Ported upstream fixes

Unmerged fixes from the upstream giscus repository re-implemented here, with credit to their authors:
`giscus#1651` (category emoji extraction for GitHub's new HTML), `giscus#1712` (progressive-disclosure line image, now
self-hosted) and `giscus#1641` (invalid CSS selector lists).
