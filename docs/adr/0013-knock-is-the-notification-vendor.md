# Knock is the Notification vendor

Cadence sends Notifications through Knock, a hosted vendor, and never self-hosts. Knock was the only candidate whose free plan has everything we need: 10K messages a month, mandatory RS256 signed user tokens for the Notification Feed, a headless feed API, and vendor-stored preferences by category × channel. It is hard to swap out, because the Notification Feed, the preferences and user sync are all built on it.

## Considered Options

- **MagicBell**: has native web push, but its free tier is only 1K deliveries a month and the next tier is $249/mo. Native push mattered less once web push became an extra channel people opt into, with email as the default.
- **SuprSend**: has native web push, but vendor-stored preferences aren't on its free plan, and category preferences need the $250/mo plan.
- **Novu Cloud**: is cheapest to pay for, but its feed auth is a static HMAC that never expires, and its preferences have no categories.
- **Courier**: has scoped expiring JWTs and pay-as-you-go pricing. It is the **fallback** if Knock's cost or limits start to hurt.

## Consequences

- **Web push needs Firebase.** Knock only delivers web push through Firebase Cloud Messaging. If web push ships, we also need a Firebase project, the Firebase SDK and a service worker.
- **Email needs a provider in production.** In development, Knock runs in sandbox mode: workflows run and appear in Knock's logs, but no email is delivered. Knock's built-in test email channel only reaches Knock account members, so it can't email the seeded users.
- **There is a steep jump to paid.** After 10K messages a month, the next plan is $250/mo. The narrow v1 catalogue should stay well under that limit.
