# What anti-spam laws and Postmark require of Notification emails

Research for [#4](https://github.com/mantadigitalau/cohort-005-project/issues/4), part of the Notifications map ([#2](https://github.com/mantadigitalau/cohort-005-project/issues/2)). Researched 2026-11-23.

> **Not legal advice.** This summarises primary sources so the spec can make sensible engineering choices. Where a classification is a judgement call it is marked as such. Check with a lawyer before relying on it for a specific message.

## Answer in brief

- **Activity Notifications are not marketing.** That covers a new comment on an Instructor's course, a reply to a Student's comment, and a new lesson in a course the Student is enrolled in. They are factual, triggered by an event, and about a service the recipient already uses. The law does not require consent or an unsubscribe for them. Send them on Postmark's **transactional** stream (`outbound`), with no promotional content in them.
- **Engagement nudges ("you haven't watched in a while") count as marketing.** UK regulators treat a message that "encourages people to make use of a particular service" as direct marketing, and under the Australian and US tests the nudge is at best a grey zone. Treat nudges as commercial. They need consent (the existing Enrollment relationship supports inferred consent / soft opt-in), clear sender identification, a working unsubscribe, and (for CAN-SPAM) a physical postal address. Send them on a separate Postmark **broadcast** stream, because Postmark pauses accounts it catches sending promotional mail on a transactional stream.
- **Put RFC 8058 one-click unsubscribe headers on every Notification email anyway.** The law does not require them on activity emails. But we have already decided that every email gets a one-click unsubscribe, and Gmail and Yahoo require them on marketing mail from bulk senders. The unsubscribe must work without a login, take effect within 2 days (Gmail and Yahoo set the strictest deadline), and turn off only that notification type's email channel.

## How each Notification email is classified

| Notification email | Spam Act 2003 (AU) | CAN-SPAM (US) | PECR / ePrivacy (UK/EU) | Verdict |
| --- | --- | --- | --- | --- |
| Instructor: new comment on their course | Not a "commercial electronic message": no purpose of offering or promoting goods or services (s 6(1)) | Not commercial. Primary purpose is not advertising (15 USC 7702(2)). | Service message: "administrative or customer services purposes" (ICO) | **Transactional** |
| Student: reply to their comment | Same as above | Same as above | Same as above | **Transactional** |
| Student: new lesson in an enrolled course | Factual information about a service they have. At most a "designated" message (Sch 1 cl 2), which is exempt from consent and unsubscribe rules. | Fits "deliver goods or services, including product updates or upgrades, that the recipient is entitled to receive" (7702(17)(A)(v)) | Factual update about something they bought. A service message unless it promotes. | **Transactional** (judgement: keep it factual) |
| Student: engagement nudge ("you haven't watched in a while") | Grey zone. It promotes use of a service, and s 6 looks at content, presentation and linked content. Treat as commercial. | Grey zone. Primary purpose is arguably promotional. It does not fit any 7702(17) category neatly. | ICO: messages that "actively promote or encourage people to make use of a particular service… [are] likely to be direct marketing" | **Commercial / marketing** |

Two rules decide whether an activity email stays transactional:

- **No promotional content.** The ICO says any marketing element turns the message into direct marketing: "If your service message has elements that are direct marketing, even if that is not the main purpose of your message, then it will count as direct marketing." Branding and logos do not count ([ICO, Identify direct marketing][ico-identify]). The FTC applies the same idea through the "primary purpose" test. A message is commercial if the subject line suggests it is, or if the transactional content "does not appear mainly at the beginning" ([FTC CAN-SPAM guide][ftc]). The Spam Act also counts "the content that can be located using the links" in the message (s 6(1)(c)). So: no "check out these other courses" blocks and no course upsells in comment, reply or new-lesson emails.
- **New lesson must be a factual notice.** Use "A new lesson, *X*, was added to *Course Y*", not a sales pitch. If it ever announces content the Student has *not* bought (e.g. a new paid course), it becomes marketing.

## Requirements by regime

### Australia: Spam Act 2003 (ACMA)

Applies to commercial electronic messages with an "Australian link" (e.g. the recipient is in Australia) ([Spam Act s 7][spam-act]).

- **Definition (s 6(1)).** A message is commercial if, "having regard to (a) the content of the message; (b) the way in which the message is presented; and (c) the content that can be located using the links… set out in the message", one of its purposes is to offer, advertise or promote goods or services, or a supplier of them ([Spam Act][spam-act]).
- **Factual-information carve-out (Sch 1 cl 2).** A message that "consists of no more than factual information (with or without directly-related comment)", plus sender name, logo and contact details, is a *designated* commercial electronic message. That exempts it from the consent rule (s 16) and the unsubscribe rule (s 18) ([Spam Act][spam-act]).
- **Consent.** Consent is either express or "can reasonably be inferred from the conduct and the business and other relationships" ([Spam Act Sch 2 cl 2][spam-act]). The ACMA says inferred consent covers someone who "has subscribed to a service, has an account or is a member, and the marketing is directly relevant to the relationship", but not someone who has "just bought something". Express consent is best practice, and "it's up to you to prove that you have a person's consent" ([ACMA, Avoid sending spam][acma]).
- **Identify the sender.** The message must "accurately identify your name or business name" (legal name, or name plus ABN) with contact details that stay correct for 30 days ([ACMA][acma]).
- **Unsubscribe (s 18 and ACMA guidance).** The unsubscribe must:
  - present the instructions clearly
  - be honoured "within 5 working days"
  - be free
  - work "for at least 30 days after you sent the message"
  - "not require the person to give extra personal information or log in to, or create, an account"

  Sources: [ACMA][acma], [Spam Act s 18][spam-act].

### United States: CAN-SPAM Act (FTC)

- **Definition.** A commercial email is one "the primary purpose of which is the commercial advertisement or promotion of a commercial product or service". Transactional or relationship messages are excluded ([15 USC 7702(2)][usc7702]).
- **Transactional or relationship categories ([15 USC 7702(17)(A)][usc7702]).** These include:
  - notification of "a change in the recipient's standing or status" in a subscription or account
  - messages that "deliver goods or services, including product updates or upgrades, that the recipient is entitled to receive under the terms of a transaction"

  The FTC says it reads these categories "narrowly" ([FTC][ftc]).
- **Requirements for commercial messages ([FTC][ftc]):**
  - accurate header and sender identification
  - a non-deceptive subject line
  - identification as an advertisement
  - a "valid physical postal address"
  - an opt-out that works "for at least 30 days after you send your message" and is honoured "within 10 business days"
  - no fee, and nothing asked for "beyond an email address"
- **No consent requirement.** CAN-SPAM is opt-out. Transactional messages still must not contain false or misleading routing information ([FTC][ftc]).

### UK (PECR + UK GDPR) and EU (ePrivacy Directive + GDPR)

- **Consent or soft opt-in.** Marketing email needs prior consent, or the existing-customer exception. The exception covers a contact obtained "in the context of the sale of a product or a service", used for the sender's "own similar products or services". The recipient must have been given "the opportunity to object, free of charge and in an easy manner" at collection *and* "on the occasion of each message" ([Directive 2002/58/EC Art 13(1)–(2)][eprivacy]; [ICO, Electronic mail marketing][ico-email]). A Student who enrolled in a course fits this for nudges about that course, provided they were offered an opt-out at sign-up.
- **Identity and a valid address.** Marketing must not disguise "the identity of the sender" and must include "a valid address to which the recipient may send a request that such communications cease" ([Art 13(4)][eprivacy]). The ICO also says to keep a "do not contact" list and screen sends against it ([ICO][ico-email]).
- **Service messages.** These are messages "that aren't promotional but are for administrative or customer services purposes". They fall outside the marketing rules. But "simply using a neutral tone doesn't necessarily avoid messages being direct marketing", and a message that "actively promotes or encourages people to make use of a particular service" is "likely to be direct marketing" ([ICO, Identify direct marketing][ico-identify]). This is the strongest primary source for treating nudges as marketing.

### Gmail and Yahoo sender requirements

- **All senders:** SPF or DKIM, and a spam rate below 0.3% ([Google][google-guidelines]; [Yahoo][yahoo]).
- **Bulk senders** (Gmail defines these as "close to 5,000 messages or more to personal Gmail accounts within a 24-hour period"; the status is permanent once reached) ([Google FAQ][google-faq]):
  - SPF **and** DKIM, plus DMARC (`p=none` is enough), with the From domain aligned to SPF or DKIM
  - "Marketing messages and subscribed messages must support one-click unsubscribe" using `List-Unsubscribe-Post: List-Unsubscribe=One-Click` ([Google][google-guidelines])
  - unsubscribes honoured within 48 hours (Google) or "within 2 days" (Yahoo) ([Google FAQ][google-faq]; [Yahoo][yahoo])
  - spam rate kept below 0.10%, never reaching 0.30% ([Google][google-guidelines])
- **Transactional mail is excluded from the one-click rule.** "One-click unsubscribe is required only for marketing and promotional messages." With the headers in place, the link in the body may go to a preferences page and need not be one-click ([Google FAQ][google-faq]).

Cadence is far below 5,000 a day today, but bulk status never goes away once reached. Building to the bulk rules now costs little.

### RFC 8058: one-click unsubscribe

- `List-Unsubscribe` "MUST contain one HTTPS URI". `List-Unsubscribe-Post` must contain exactly `List-Unsubscribe=One-Click` ([RFC 8058][rfc8058]).
- The mail client POSTs `List-Unsubscribe=One-Click` to that URI. The POST "MUST NOT include cookies, HTTP authorization, or any other context information". The sender must not answer with a redirect.
- The URI "MUST contain enough information to identify the mail recipient and the list" and "SHOULD include an opaque identifier or another hard-to-forge component".
- Both headers "MUST be covered by" a valid DKIM signature.

### Postmark

- **Streams.** Transactional streams are "for one-to-one emails triggered by a user action". Broadcast streams are for one-to-many mail such as announcements and newsletters, and run on separate infrastructure. Pick the stream per message with the `MessageStream` API field. Without it, mail goes to the server's default transactional stream ([Postmark, Message streams][pm-streams]). "Transactional and broadcast messages do not mix in Postmark, including IP ranges" ([Postmark, Bulk email][pm-bulk]).
- **Promotional mail on a transactional stream gets sending paused.** "If… we detect promotional email being sent through a Transactional Stream, your sending will be paused." Broadcast recipients must have "explicitly opted-in" ([Postmark blog][pm-promo]).
- **Broadcast unsubscribe.** "Every message sent through a Broadcast Message Stream… is required to have an unsubscribe link." Postmark adds one (or uses the `{{{ pm:unsubscribe }}}` placeholder) and suppresses the address on that stream only ([Postmark, Unsubscribe link][pm-unsub-link]). By default it "will also automatically add the one-click List-Unsubscribe-Post and List-Unsubscribe headers" to broadcast messages, and you cannot edit them. Managing unsubscribes yourself needs Postmark support's approval, and then you supply your own headers and link ([Postmark, List-Unsubscribe header][pm-lu-header]).
- **Transactional unsubscribe.** Not required, but you can add `List-Unsubscribe` and `List-Unsubscribe-Post` through the API's `Headers` array, and Postmark passes them through. The URL must accept POST ([Postmark, List-Unsubscribe header][pm-lu-header]).

## What this means for the spec

1. **Two streams.** Send comment, reply and new-lesson Notifications on the existing transactional stream (`outbound`). Send engagement nudges on a new broadcast stream (e.g. `nudges`). `app/lib/mailer.server.ts` hard-codes `MessageStream: "outbound"`, so the `Email` type needs a stream (or a notification category that maps to one). Postmark's broadcast stream is designed for one-to-many sends. Per-user automated nudges are promotional in content, though, and promotional content is what Postmark polices, so they belong on broadcast. Confirm this with Postmark support before launch.
2. **Our own one-click unsubscribe on every Notification email.** Set `List-Unsubscribe: <https://…/unsubscribe/<token>>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` through `Headers`, plus a visible link in the body. The endpoint must:
   - accept a cookie-less, auth-less `POST` and return 2xx, with no redirect
   - identify the user and notification type from an opaque, unguessable token, not from a session (the Spam Act and RFC 8058 both rule out requiring a login)
   - switch off **that notification type's email channel** in the preferences the map already decided on, immediately (well inside Gmail and Yahoo's 2 days, the Spam Act's 5 working days and CAN-SPAM's 10 business days)
   - keep working for at least 30 days after the email was sent, so tokens must not expire sooner
   - on `GET` (a person clicking the body link), show a confirmation or preferences page rather than unsubscribing on a link prefetch. RFC 8058 relies on the POST for exactly this reason.
3. **Broadcast-stream unsubscribe needs a decision.** Postmark's default adds its own headers and suppresses the address on the whole stream, which would bypass our per-type preferences. Either ask Postmark support to approve self-managed unsubscribes for the `nudges` stream so our endpoint handles them, or have only one nudge type, so that stream-level suppression equals type-level opt-out, and sync Postmark's suppressions back through webhooks.
4. **Nudge content and consent.** Nudges should only go to Students with an Enrollment (inferred consent / soft opt-in), only about that course, and only while the Student has not opted out. Offer the opt-out at sign-up and in every nudge (PECR / ePrivacy). Record when and how consent arose, since the burden of proof is on us under the Spam Act.
5. **Sender identification and footer.** Every nudge needs the legal business name (or name + ABN), contact details and a valid physical postal address (CAN-SPAM). Putting the same footer on every Notification email is simplest. The From address must use a domain aligned with SPF/DKIM, and DMARC needs at least `p=none` on `cadence.dev`.
6. **Keep activity emails clean.** No upsells, recommendations or promotional blocks in comment, reply or new-lesson emails. Subject lines should describe the event. Adding any of these would make them marketing and could get the transactional stream paused.

## Open questions

- Does Postmark accept automated one-to-one nudges on a broadcast stream, and will it approve self-managed unsubscribe? Ask Postmark support.
- The Spam Act text quoted is from the 2016 compilation on legislation.gov.au (the latest compilation would not render for scraping). The ACMA guidance (last updated 29 Nov 2024) agrees with it.
- UK PECR was amended by the Data (Use and Access) Act 2025. Not checked here, and unlikely to change the soft opt-in position for a commercial course platform.

## Sources

- [spam-act]: Spam Act 2003 (Cth), compilation 2016-03-10, ss 6, 7, 18, Sch 1, Sch 2: https://www.legislation.gov.au/C2004A01214/2016-03-10/2016-03-10/text/original/epub/OEBPS/document_1/document_1.html
- [acma]: ACMA, "Avoid sending spam" (updated 29 Nov 2024): https://www.acma.gov.au/avoid-sending-spam
- [usc7702]: 15 U.S.C. § 7702 (CAN-SPAM definitions): https://www.law.cornell.edu/uscode/text/15/7702
- [ftc]: FTC, "CAN-SPAM Act: A Compliance Guide for Business": https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- [eprivacy]: Directive 2002/58/EC, Art 13: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058
- [ico-email]: ICO, "Electronic mail marketing" (Guide to PECR): https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
- [ico-identify]: ICO, "Identify direct marketing": https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/identify-direct-marketing/
- [google-guidelines]: Google, "Email sender guidelines": https://support.google.com/a/answer/81126
- [google-faq]: Google, "Email sender guidelines FAQ": https://support.google.com/a/answer/14229414
- [yahoo]: Yahoo, "Sender Best Practices": https://senders.yahooinc.com/best-practices/
- [rfc8058]: RFC 8058, "Signaling One-Click Functionality for List Email Headers": https://www.rfc-editor.org/rfc/rfc8058.html
- [pm-streams]: Postmark, "How to create and send through message streams": https://postmarkapp.com/support/article/1207-how-to-create-and-send-through-message-streams
- [pm-bulk]: Postmark, "Can I send bulk emails?": https://postmarkapp.com/support/article/can-i-send-bulk-emails
- [pm-promo]: Postmark blog, "Sending your holiday promotional email with Postmark": https://postmarkapp.com/blog/send-promotional-email-with-postmark-message-streams
- [pm-unsub-link]: Postmark, "How to add an unsubscribe link": https://postmarkapp.com/support/article/1208-how-to-add-an-unsubscribe-link
- [pm-lu-header]: Postmark, "How to include a List-Unsubscribe header": https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header

[spam-act]: https://www.legislation.gov.au/C2004A01214/2016-03-10/2016-03-10/text/original/epub/OEBPS/document_1/document_1.html
[acma]: https://www.acma.gov.au/avoid-sending-spam
[usc7702]: https://www.law.cornell.edu/uscode/text/15/7702
[ftc]: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
[eprivacy]: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058
[ico-email]: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
[ico-identify]: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/identify-direct-marketing/
[google-guidelines]: https://support.google.com/a/answer/81126
[google-faq]: https://support.google.com/a/answer/14229414
[yahoo]: https://senders.yahooinc.com/best-practices/
[rfc8058]: https://www.rfc-editor.org/rfc/rfc8058.html
[pm-streams]: https://postmarkapp.com/support/article/1207-how-to-create-and-send-through-message-streams
[pm-bulk]: https://postmarkapp.com/support/article/can-i-send-bulk-emails
[pm-promo]: https://postmarkapp.com/blog/send-promotional-email-with-postmark-message-streams
[pm-unsub-link]: https://postmarkapp.com/support/article/1208-how-to-add-an-unsubscribe-link
[pm-lu-header]: https://postmarkapp.com/support/article/1299-how-to-include-a-list-unsubscribe-header
